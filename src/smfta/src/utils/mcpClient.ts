import type { McpServerConfig, McpToolInfo, McpTransport } from '../types';
import { decryptSecret, encryptSecret, isEncrypted } from './secureKeystore';

export const MCP_STORAGE_KEY = 'smfta_mcp_servers';

export interface McpTransportAnalysis {
  transport: McpTransport;
  edgeSupported: boolean;
  reason?: string;
}

/**
 * Classifies an MCP server transport and target endpoint for Cloudflare edge
 * runtime compatibility. `stdio` spawns OS subprocesses, which are unsupported
 * on stateless Web/Worker edge runtimes.
 */
export function classifyMcpTransport(
  urlOrCommand: string,
  declaredTransport?: McpTransport
): McpTransportAnalysis {
  const raw = String(urlOrCommand || '').trim();
  const isHttpUrl = /^https?:\/\//i.test(raw);
  if (declaredTransport === 'stdio' || (!isHttpUrl && raw.length > 0)) {
    return {
      transport: 'stdio',
      edgeSupported: false,
      reason:
        'Local stdio commands (e.g. npx / python / binary) cannot spawn OS subprocesses on the Cloudflare edge runtime. Wrap it with an HTTP/SSE bridge URL instead.',
    };
  }
  const effectiveTransport: McpTransport =
    declaredTransport === 'sse' || /\/sse(\?|$)/i.test(raw) ? 'sse' : 'http';
  return {
    transport: effectiveTransport,
    edgeSupported: true,
  };
}

export function maskMcpAuthSecret(secret?: string): string {
  const s = String(secret || '');
  if (!s) return 'None';
  if (isEncrypted(s)) return 'Encrypted (AES-256-GCM)';
  if (s.length <= 6) return '••••••';
  return `${s.slice(0, 2)}••••${s.slice(-4)}`;
}

export async function loadMcpServers(): Promise<McpServerConfig[]> {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MCP_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: McpServerConfig[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const s = item as Partial<McpServerConfig>;
      let authSecret = typeof s.authSecret === 'string' ? s.authSecret : '';
      if (authSecret && isEncrypted(authSecret)) {
        try {
          authSecret = await decryptSecret(authSecret);
        } catch {
          // Leave encrypted string empty if key rotated unexpectedly
          authSecret = '';
        }
      }
      const urlOrCommand = String(s.urlOrCommand || '').trim();
      const analysis = classifyMcpTransport(urlOrCommand, s.transport);
      out.push({
        id: String(s.id || `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
        name: String(s.name || 'Unnamed MCP Server').slice(0, 120),
        urlOrCommand,
        transport: s.transport || analysis.transport,
        authType: s.authType === 'bearer' || s.authType === 'header' ? s.authType : 'none',
        authHeaderName: typeof s.authHeaderName === 'string' ? s.authHeaderName.slice(0, 80) : undefined,
        authSecret,
        enabled: s.enabled !== false,
        lastTestedAt: typeof s.lastTestedAt === 'number' ? s.lastTestedAt : undefined,
        status: s.status || (analysis.edgeSupported ? 'untested' : 'edge_blocked'),
        statusMessage: s.statusMessage,
        latencyMs: typeof s.latencyMs === 'number' ? s.latencyMs : undefined,
        tools: Array.isArray(s.tools) ? s.tools : [],
        edgeLimited: !analysis.edgeSupported,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function saveMcpServers(servers: McpServerConfig[]): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const sealed: McpServerConfig[] = await Promise.all(
    servers.map(async (srv) => ({
      ...srv,
      authSecret: srv.authSecret ? await encryptSecret(srv.authSecret) : '',
    }))
  );
  localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(sealed));
}

export function stripMcpSecrets(servers: McpServerConfig[]): McpServerConfig[] {
  return servers.map((srv) => ({
    ...srv,
    authSecret: '',
  }));
}

export function buildMcpPromptContext(servers: McpServerConfig[]): string {
  const active = servers.filter((s) => s.enabled && !s.edgeLimited && s.tools && s.tools.length > 0);
  if (active.length === 0) return '';
  const lines = active.map((srv) => {
    const toolsList = (srv.tools || [])
      .slice(0, 12)
      .map((t) => `${t.name}${t.description ? `: ${t.description.slice(0, 90)}` : ''}`)
      .join('; ');
    return `- MCP Server "${srv.name}" (${srv.transport}): ${toolsList}`;
  });
  return `[CONNECTED MCP TOOLS]\n${lines.join('\n')}`;
}

export interface McpTestResponse {
  ok: boolean;
  errorCode?: string;
  message: string;
  latencyMs?: number;
  serverInfo?: { name?: string; version?: string };
  tools?: McpToolInfo[];
}

export async function testMcpServerConnection(
  server: McpServerConfig
): Promise<McpTestResponse> {
  const res = await fetch('/api/mcp/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: server.name,
      urlOrCommand: server.urlOrCommand,
      transport: server.transport,
      authType: server.authType,
      authHeaderName: server.authHeaderName,
      authSecret: server.authSecret,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<McpTestResponse>;
  return {
    ok: Boolean(data.ok),
    errorCode: data.errorCode,
    message:
      data.message ||
      (res.ok ? 'Connection check completed.' : `HTTP ${res.status} while testing MCP server`),
    latencyMs: data.latencyMs,
    serverInfo: data.serverInfo,
    tools: Array.isArray(data.tools) ? data.tools : [],
  };
}
