import { Router, Request, Response } from '../runtime/express';
import { verifyConnectionTargetSafe } from '../engine/config';
import { classifyDbTransport, mapBridgeRecord } from '../../src/utils/dbBridge';
import type { DbConnectionConfig, DbFieldMapping, DbProviderKind } from '../../src/types';
import { sanitizeErrorMsg } from '../aiClient';

export const dbBridgeRouter = Router();

function buildDbHeaders(conn: {
  kind?: DbProviderKind;
  authHeaderOrKeyName?: string;
  secret?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const secret = String(conn.secret || '').trim();
  if (!secret) return headers;

  const customHeader = String(conn.authHeaderOrKeyName || '').trim();
  if (customHeader && /^[A-Za-z0-9-]+$/.test(customHeader)) {
    headers[customHeader] = secret;
    if (customHeader.toLowerCase() === 'apikey') {
      headers['Authorization'] = `Bearer ${secret}`;
    }
    return headers;
  }

  if (conn.kind === 'supabase') {
    headers['apikey'] = secret;
    headers['Authorization'] = `Bearer ${secret}`;
  } else {
    headers['Authorization'] = secret.startsWith('Bearer ') ? secret : `Bearer ${secret}`;
  }
  return headers;
}

function buildProbeUrl(endpoint: string, kind?: DbProviderKind): string {
  const clean = endpoint.replace(/\/+$/, '');
  if (kind === 'supabase' && !/\/rest\/v1$/i.test(clean)) {
    return `${clean}/rest/v1/`;
  }
  return clean;
}

function buildTableUrl(endpoint: string, table: string, kind?: DbProviderKind): string {
  const clean = endpoint.replace(/\/+$/, '');
  const cleanTable = table.replace(/^\/+/, '');
  if (!cleanTable) return buildProbeUrl(clean, kind);
  if (kind === 'supabase' && !/\/rest\/v1/i.test(clean)) {
    return `${clean}/rest/v1/${encodeURIComponent(cleanTable)}`;
  }
  return `${clean}/${encodeURIComponent(cleanTable)}`;
}

/**
 * POST /api/db-bridge/test
 * Probes HTTP/REST database gateways (Supabase PostgREST, Firestore REST, Neon HTTP,
 * custom REST gateways). Rejects raw TCP URIs cleanly with EDGE_TCP_UNSUPPORTED.
 */
dbBridgeRouter.post('/db-bridge/test', async (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    kind?: DbProviderKind;
    endpointOrUri?: string;
    authHeaderOrKeyName?: string;
    secret?: string;
  };
  const endpoint = String(body.endpointOrUri || '').trim();
  if (!endpoint) {
    return res.status(400).json({
      ok: false,
      errorCode: 'MISSING_ENDPOINT',
      message: 'Database endpoint or REST gateway URL is required.',
    });
  }

  const analysis = classifyDbTransport(endpoint, body.kind);
  if (!analysis.edgeSupported) {
    return res.status(400).json({
      ok: false,
      errorCode: 'EDGE_TCP_UNSUPPORTED',
      message: analysis.reason || 'Direct TCP connections are not supported on Cloudflare Workers edge runtime.',
    });
  }

  const probeUrl = buildProbeUrl(endpoint, body.kind);
  const ssrf = await verifyConnectionTargetSafe(probeUrl, {
    isCustomProvider: true,
    allowInsecureLocalhost: process.env.ALLOW_INSECURE_LOCALHOST === 'true',
  });
  if (!ssrf.safe) {
    return res.status(400).json({
      ok: false,
      errorCode: 'SSRF_BLOCKED',
      message: `Blocked database URL: ${ssrf.reason || 'unsafe target'}`,
    });
  }

  const startedAt = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const resp = await fetch(probeUrl, {
      method: 'GET',
      headers: buildDbHeaders(body),
      signal: ctrl.signal,
    });
    const latencyMs = Math.max(1, Date.now() - startedAt);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return res.status(502).json({
        ok: false,
        errorCode: `HTTP_${resp.status}`,
        latencyMs,
        message: `HTTP ${resp.status} from database endpoint: ${errText.slice(0, 140) || resp.statusText}`,
      });
    }

    let tables: string[] = [];
    const data = await resp.json().catch(() => null);
    if (data && typeof data === 'object' && 'definitions' in data && data.definitions && typeof data.definitions === 'object') {
      // Supabase PostgREST OpenAPI root lists tables under `definitions`
      tables = Object.keys(data.definitions as Record<string, unknown>).slice(0, 50);
    } else if (data && typeof data === 'object' && 'paths' in data && data.paths && typeof data.paths === 'object') {
      tables = Object.keys(data.paths as Record<string, unknown>)
        .map((p) => p.replace(/^\//, ''))
        .filter((p) => p && !p.startsWith('rpc/'))
        .slice(0, 50);
    }

    return res.json({
      ok: true,
      latencyMs,
      tables,
      message: `Connected (${latencyMs}ms)${tables.length > 0 ? ` · ${tables.length} table(s) detected` : ''}.`,
    });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      errorCode: 'DB_CONNECTION_ERROR',
      latencyMs: Math.max(1, Date.now() - startedAt),
      message: sanitizeErrorMsg(err),
    });
  } finally {
    clearTimeout(timer);
  }
});

/**
 * POST /api/db-bridge/sync
 * Executes real REST-to-REST Data Bridge transfer with field mapping.
 */
dbBridgeRouter.post('/db-bridge/sync', async (req: Request, res: Response) => {
  const {
    source,
    destination,
    sourceTable = '',
    destinationTable = '',
    syncMode = 'upsert',
    fieldMappings = [],
  } = (req.body || {}) as {
    source?: DbConnectionConfig;
    destination?: DbConnectionConfig;
    sourceTable?: string;
    destinationTable?: string;
    syncMode?: 'append' | 'upsert';
    fieldMappings?: DbFieldMapping[];
  };

  if (!source?.endpointOrUri || !destination?.endpointOrUri || !sourceTable || !destinationTable) {
    return res.status(400).json({
      ok: false,
      errorCode: 'INVALID_BRIDGE_CONFIG',
      message: 'Source & destination endpoints and table names are required.',
    });
  }

  const srcAnalysis = classifyDbTransport(source.endpointOrUri, source.kind);
  const dstAnalysis = classifyDbTransport(destination.endpointOrUri, destination.kind);
  if (!srcAnalysis.edgeSupported || !dstAnalysis.edgeSupported) {
    return res.status(400).json({
      ok: false,
      errorCode: 'EDGE_TCP_UNSUPPORTED',
      message: 'Both Data Bridge endpoints must use HTTPS REST / PostgREST gateways on Cloudflare edge runtime.',
    });
  }

  const readUrl = buildTableUrl(source.endpointOrUri, sourceTable, source.kind);
  const writeUrl = buildTableUrl(destination.endpointOrUri, destinationTable, destination.kind);
  const [srcSafe, dstSafe] = await Promise.all([
    verifyConnectionTargetSafe(readUrl, { isCustomProvider: true }),
    verifyConnectionTargetSafe(writeUrl, { isCustomProvider: true }),
  ]);
  if (!srcSafe.safe || !dstSafe.safe) {
    return res.status(400).json({
      ok: false,
      errorCode: 'SSRF_BLOCKED',
      message: srcSafe.reason || dstSafe.reason || 'Blocked bridge URL',
    });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const srcResp = await fetch(`${readUrl}${readUrl.includes('?') ? '&' : '?'}limit=100`, {
      method: 'GET',
      headers: buildDbHeaders(source),
      signal: ctrl.signal,
    });
    if (!srcResp.ok) {
      return res.status(502).json({
        ok: false,
        errorCode: `SOURCE_HTTP_${srcResp.status}`,
        message: `Failed reading source table (HTTP ${srcResp.status}).`,
      });
    }
    const rawRows = await srcResp.json().catch(() => null);
    const rows: Array<Record<string, unknown>> = Array.isArray(rawRows)
      ? rawRows
      : Array.isArray((rawRows as { rows?: unknown[] } | null)?.rows)
      ? ((rawRows as { rows: Array<Record<string, unknown>> }).rows)
      : Array.isArray((rawRows as { data?: unknown[] } | null)?.data)
      ? ((rawRows as { data: Array<Record<string, unknown>> }).data)
      : [];

    if (rows.length === 0) {
      return res.json({
        ok: true,
        syncedCount: 0,
        message: `Source "${sourceTable}" returned 0 rows — nothing to sync.`,
      });
    }

    const mappedRows = rows.map((row) => mapBridgeRecord(row, fieldMappings));
    const dstHeaders = buildDbHeaders(destination);
    if (syncMode === 'upsert') {
      dstHeaders['Prefer'] = 'resolution=merge-duplicates,return=minimal';
    }

    const dstResp = await fetch(writeUrl, {
      method: 'POST',
      headers: dstHeaders,
      body: JSON.stringify(mappedRows),
      signal: ctrl.signal,
    });
    if (!dstResp.ok) {
      const dstErr = await dstResp.text().catch(() => '');
      return res.status(502).json({
        ok: false,
        errorCode: `DEST_HTTP_${dstResp.status}`,
        message: `Destination write failed (HTTP ${dstResp.status}): ${dstErr.slice(0, 140)}`,
      });
    }

    return res.json({
      ok: true,
      syncedCount: mappedRows.length,
      message: `Synced ${mappedRows.length} row(s) from ${sourceTable} -> ${destinationTable} (${syncMode}).`,
    });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      errorCode: 'BRIDGE_SYNC_FAILED',
      message: sanitizeErrorMsg(err),
    });
  } finally {
    clearTimeout(timer);
  }
});
