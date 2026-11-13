import type {
  DataBridgeConfig,
  DbConnectionConfig,
  DbFieldMapping,
  DbProviderKind,
} from '../types';
import { decryptSecret, encryptSecret, isEncrypted } from './secureKeystore';

export const DB_CONNECTIONS_STORAGE_KEY = 'smfta_db_connections';
export const DB_BRIDGE_CONFIG_STORAGE_KEY = 'smfta_db_bridge_config';

export interface DbTransportAnalysis {
  transportMode: 'http_rest' | 'direct_tcp';
  edgeSupported: boolean;
  reason?: string;
}

/**
 * Classifies a database endpoint or connection URI for Cloudflare edge runtime
 * compatibility. HTTP/HTTPS REST endpoints (PostgREST, Supabase REST, Neon HTTP,
 * Firestore REST, custom REST bridges) work cleanly; raw TCP protocols
 * (`postgres://`, `mysql://`, `mongodb://`) require a gateway on Workers.
 */
export function classifyDbTransport(
  endpointOrUri: string,
  kind?: DbProviderKind
): DbTransportAnalysis {
  const raw = String(endpointOrUri || '').trim();
  if (/^https?:\/\//i.test(raw)) {
    return { transportMode: 'http_rest', edgeSupported: true };
  }
  if (/^(postgres(ql)?|mysql|mariadb|mongodb(\+srv)?|redis):\/\//i.test(raw)) {
    return {
      transportMode: 'direct_tcp',
      edgeSupported: false,
      reason: `Direct TCP connections (${kind || 'SQL/NoSQL'} URI) are blocked on Cloudflare Workers edge runtime. Provide an HTTPS REST / PostgREST / Data API gateway URL instead.`,
    };
  }
  return {
    transportMode: 'http_rest',
    edgeSupported: Boolean(raw),
    reason: raw ? undefined : 'Endpoint URL is required.',
  };
}

/**
 * Pure deterministic field mapper & transformer for Data Bridge record synchronization.
 */
export function mapBridgeRecord(
  sourceRecord: Record<string, unknown>,
  mappings: DbFieldMapping[]
): Record<string, unknown> {
  if (!mappings || mappings.length === 0) return { ...sourceRecord };
  const result: Record<string, unknown> = {};
  for (const mapping of mappings) {
    const src = mapping.sourceField.trim();
    const dst = mapping.targetField.trim();
    if (!src || !dst) continue;
    let val = sourceRecord[src];
    switch (mapping.transform) {
      case 'trim':
        if (typeof val === 'string') val = val.trim();
        break;
      case 'lowercase':
        if (typeof val === 'string') val = val.trim().toLowerCase();
        break;
      case 'uppercase':
        if (typeof val === 'string') val = val.trim().toUpperCase();
        break;
      case 'string':
        val = val === undefined || val === null ? '' : String(val);
        break;
      case 'number':
        val = typeof val === 'number' ? val : Number(val ?? 0);
        if (!Number.isFinite(val)) val = 0;
        break;
      default:
        break;
    }
    result[dst] = val;
  }
  return result;
}

export async function loadDbConnections(): Promise<DbConnectionConfig[]> {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DB_CONNECTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list: DbConnectionConfig[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const conn = item as Partial<DbConnectionConfig>;
      let secret = typeof conn.secret === 'string' ? conn.secret : '';
      if (secret && isEncrypted(secret)) {
        try {
          secret = await decryptSecret(secret);
        } catch {
          secret = '';
        }
      }
      const endpointOrUri = String(conn.endpointOrUri || '').trim();
      const analysis = classifyDbTransport(endpointOrUri, conn.kind);
      list.push({
        id: String(conn.id || `db-${Date.now()}`),
        name: String(conn.name || 'Database').slice(0, 120),
        kind: conn.kind || 'supabase',
        endpointOrUri,
        authHeaderOrKeyName: conn.authHeaderOrKeyName || undefined,
        secret,
        enabled: conn.enabled !== false,
        transportMode: analysis.transportMode,
        status: conn.status || (analysis.edgeSupported ? 'untested' : 'edge_blocked'),
        statusMessage: conn.statusMessage || analysis.reason,
        lastTestedAt: typeof conn.lastTestedAt === 'number' ? conn.lastTestedAt : undefined,
        latencyMs: typeof conn.latencyMs === 'number' ? conn.latencyMs : undefined,
        tables: Array.isArray(conn.tables) ? conn.tables : [],
      });
    }
    return list;
  } catch {
    return [];
  }
}

export async function saveDbConnections(connections: DbConnectionConfig[]): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const sealed = await Promise.all(
    connections.map(async (conn) => ({
      ...conn,
      secret: conn.secret ? await encryptSecret(conn.secret) : '',
    }))
  );
  localStorage.setItem(DB_CONNECTIONS_STORAGE_KEY, JSON.stringify(sealed));
}

export function stripDbSecrets(connections: DbConnectionConfig[]): DbConnectionConfig[] {
  return connections.map((c) => ({ ...c, secret: '' }));
}

export function loadDataBridgeConfig(): DataBridgeConfig {
  const fallback: DataBridgeConfig = {
    sourceConnectionId: '',
    destinationConnectionId: '',
    sourceTable: '',
    destinationTable: '',
    syncMode: 'upsert',
    fieldMappings: [],
  };
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(DB_BRIDGE_CONFIG_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DataBridgeConfig>;
    return {
      sourceConnectionId: String(parsed.sourceConnectionId || ''),
      destinationConnectionId: String(parsed.destinationConnectionId || ''),
      sourceTable: String(parsed.sourceTable || ''),
      destinationTable: String(parsed.destinationTable || ''),
      syncMode: parsed.syncMode === 'append' ? 'append' : 'upsert',
      fieldMappings: Array.isArray(parsed.fieldMappings) ? parsed.fieldMappings : [],
      lastSyncAt: typeof parsed.lastSyncAt === 'number' ? parsed.lastSyncAt : undefined,
      lastSyncStatus: typeof parsed.lastSyncStatus === 'string' ? parsed.lastSyncStatus : undefined,
      lastSyncCount: typeof parsed.lastSyncCount === 'number' ? parsed.lastSyncCount : undefined,
    };
  } catch {
    return fallback;
  }
}

export function saveDataBridgeConfig(config: DataBridgeConfig): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DB_BRIDGE_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage quota errors
  }
}

export interface BrowserStorageBreakdown {
  totalLocalStorageBytes: number;
  chatsBytes: number;
  settingsAndProfilesBytes: number;
  knowledgeAndCacheBytes: number;
  otherBytes: number;
  browserQuotaBytes: number | null;
  browserUsageBytes: number | null;
}

export async function estimateBrowserStorageUsage(): Promise<BrowserStorageBreakdown> {
  let total = 0;
  let chatsBytes = 0;
  let settingsAndProfilesBytes = 0;
  let knowledgeAndCacheBytes = 0;
  let otherBytes = 0;

  if (typeof localStorage !== 'undefined') {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      const val = localStorage.getItem(key) || '';
      const bytes = (key.length + val.length) * 2;
      total += bytes;
      if (key.includes('chat') || key.includes('session')) {
        chatsBytes += bytes;
      } else if (
        key.includes('setting') ||
        key.includes('profile') ||
        key.includes('mcp') ||
        key.includes('db_')
      ) {
        settingsAndProfilesBytes += bytes;
      } else if (
        key.includes('knowledge') ||
        key.includes('memory') ||
        key.includes('log') ||
        key.includes('note')
      ) {
        knowledgeAndCacheBytes += bytes;
      } else {
        otherBytes += bytes;
      }
    }
  }

  let browserQuotaBytes: number | null = null;
  let browserUsageBytes: number | null = null;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      browserQuotaBytes = typeof est.quota === 'number' ? est.quota : null;
      browserUsageBytes = typeof est.usage === 'number' ? est.usage : null;
    }
  } catch {
    // ignore browser quota API errors
  }

  return {
    totalLocalStorageBytes: total,
    chatsBytes,
    settingsAndProfilesBytes,
    knowledgeAndCacheBytes,
    otherBytes,
    browserQuotaBytes,
    browserUsageBytes,
  };
}

export async function testDbConnection(conn: DbConnectionConfig): Promise<{
  ok: boolean;
  errorCode?: string;
  message: string;
  latencyMs?: number;
  tables?: string[];
}> {
  const res = await fetch('/api/db-bridge/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: conn.kind,
      endpointOrUri: conn.endpointOrUri,
      authHeaderOrKeyName: conn.authHeaderOrKeyName,
      secret: conn.secret,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    errorCode?: string;
    message?: string;
    latencyMs?: number;
    tables?: string[];
  };
  return {
    ok: Boolean(data.ok),
    errorCode: data.errorCode,
    message:
      data.message ||
      (res.ok ? 'Database probe complete.' : `HTTP ${res.status} testing DB connection`),
    latencyMs: data.latencyMs,
    tables: Array.isArray(data.tables) ? data.tables : [],
  };
}

export async function runDataBridgeSync(input: {
  source: DbConnectionConfig;
  destination: DbConnectionConfig;
  sourceTable: string;
  destinationTable: string;
  syncMode: 'append' | 'upsert';
  fieldMappings: DbFieldMapping[];
}): Promise<{
  ok: boolean;
  errorCode?: string;
  message: string;
  syncedCount?: number;
}> {
  const res = await fetch('/api/db-bridge/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    errorCode?: string;
    message?: string;
    syncedCount?: number;
  };
  return {
    ok: Boolean(data.ok),
    errorCode: data.errorCode,
    message:
      data.message ||
      (res.ok ? 'Data Bridge sync complete.' : `HTTP ${res.status} during Data Bridge sync`),
    syncedCount: typeof data.syncedCount === 'number' ? data.syncedCount : undefined,
  };
}
