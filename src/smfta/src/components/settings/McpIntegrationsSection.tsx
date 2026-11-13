import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plug,
  Plus,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import type {
  AppSettings,
  McpServerConfig,
  McpTransport,
  NotebookNote,
  ToolPermissionMode,
} from '../../types';
import { TOOL_CAPABILITY_REGISTRY } from '../../utils/capabilityRegistry';
import {
  classifyMcpTransport,
  maskMcpAuthSecret,
  testMcpServerConnection,
} from '../../utils/mcpClient';
import type { VaultConnections } from '../../utils/cloudVault';
import { VaultConnectionsPanel } from '../VaultConnectionsPanel';
import { SettingsCard, SettingsGrid, SettingSelect, SettingText } from '../SettingsControls';

export interface McpIntegrationsSectionProps {
  draft: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
  mcpServers: McpServerConfig[];
  onUpdateMcpServers: (next: McpServerConfig[]) => void;
  connections?: VaultConnections;
  onUpdateConnections?: (next: VaultConnections) => void;
  notes?: NotebookNote[];
  notify?: (msg: string) => void;
}

export const McpIntegrationsSection: React.FC<McpIntegrationsSectionProps> = ({
  draft,
  patch,
  mcpServers,
  onUpdateMcpServers,
  connections,
  onUpdateConnections,
  notes = [],
  notify,
}) => {
  const [name, setName] = useState('');
  const [urlOrCommand, setUrlOrCommand] = useState('');
  const [transport, setTransport] = useState<McpTransport>('http');
  const [authType, setAuthType] = useState<'none' | 'bearer' | 'header'>('none');
  const [authHeaderName, setAuthHeaderName] = useState('X-API-Key');
  const [authSecret, setAuthSecret] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

  const formAnalysis = classifyMcpTransport(urlOrCommand, transport);

  const handleAddServer = () => {
    const cleanUrl = urlOrCommand.trim();
    if (!cleanUrl) {
      notify?.('Server URL or command is required.');
      return;
    }
    const analysis = classifyMcpTransport(cleanUrl, transport);
    const created: McpServerConfig = {
      id: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || 'MCP Server',
      urlOrCommand: cleanUrl,
      transport: analysis.transport,
      authType,
      authHeaderName: authType === 'header' ? authHeaderName.trim() || 'X-API-Key' : undefined,
      authSecret: authType === 'none' ? '' : authSecret.trim(),
      enabled: true,
      edgeLimited: !analysis.edgeSupported,
      status: analysis.edgeSupported ? 'untested' : 'edge_blocked',
      statusMessage: analysis.reason,
      tools: [],
    };
    onUpdateMcpServers([...mcpServers, created]);
    setName('');
    setUrlOrCommand('');
    setAuthSecret('');
    notify?.(
      analysis.edgeSupported
        ? `Added MCP server "${created.name}". Click Test to probe JSON-RPC tools.`
        : `Saved "${created.name}" with Cloudflare Edge stdio limit notice.`
    );
  };

  const handleTestServer = async (srv: McpServerConfig) => {
    setTestingId(srv.id);
    try {
      const result = await testMcpServerConnection(srv);
      const next = mcpServers.map((item) =>
        item.id === srv.id
          ? {
              ...item,
              lastTestedAt: Date.now(),
              latencyMs: result.latencyMs,
              status: result.ok
                ? ('connected' as const)
                : result.errorCode === 'EDGE_STDIO_UNSUPPORTED'
                ? ('edge_blocked' as const)
                : ('error' as const),
              statusMessage: result.message,
              tools: result.tools || [],
              edgeLimited: result.errorCode === 'EDGE_STDIO_UNSUPPORTED',
            }
          : item
      );
      onUpdateMcpServers(next);
      notify?.(result.message);
    } finally {
      setTestingId(null);
    }
  };

  const discoveredMcpTools = mcpServers.flatMap((s) =>
    (s.tools || []).map((t) => ({ serverName: s.name, ...t }))
  );

  const permissions = draft.toolPermissions || {};
  const setToolPermission = (toolId: string, mode: ToolPermissionMode) => {
    patch({
      toolPermissions: {
        ...permissions,
        [toolId]: mode,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* 1. MCP Servers */}
      <SettingsCard
        title="MCP Servers"
        description="Connect Model Context Protocol servers over HTTP / SSE JSON-RPC 2.0. Auth tokens stay AES-256-GCM encrypted locally."
        icon={<Plug className="w-4 h-4" />}
      >
        <div className="space-y-3">
          <SettingsGrid>
            <SettingText
              label="Server Name"
              value={name}
              placeholder="e.g. GitHub MCP Bridge"
              onChange={setName}
            />
            <SettingSelect
              label="Transport"
              value={transport}
              options={[
                { value: 'http', label: 'Streamable HTTP (Edge Supported)' },
                { value: 'sse', label: 'SSE Bridge (Edge Supported)' },
                { value: 'stdio', label: 'Local stdio Command (Desktop/Proxy Only)' },
              ]}
              onChange={(v) => setTransport(v as McpTransport)}
            />
          </SettingsGrid>

          <SettingText
            label={transport === 'stdio' ? 'Command' : 'Server Endpoint URL'}
            value={urlOrCommand}
            mono
            testId="mcp-endpoint-input"
            placeholder={
              transport === 'stdio'
                ? 'npx -y @modelcontextprotocol/server-filesystem'
                : 'https://your-mcp-server.example.com/mcp'
            }
            onChange={setUrlOrCommand}
          />

          {urlOrCommand.trim() && !formAnalysis.edgeSupported && (
            <div
              data-testid="mcp-stdio-edge-warning"
              className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-[var(--accent-amber)]"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Cloudflare Edge Runtime Limit (stdio)</div>
                <p className="mt-0.5 opacity-90">{formAnalysis.reason}</p>
              </div>
            </div>
          )}

          <SettingsGrid>
            <SettingSelect
              label="Authentication"
              value={authType}
              options={[
                { value: 'none', label: 'No Auth Header' },
                { value: 'bearer', label: 'Bearer Token' },
                { value: 'header', label: 'Custom Header Key' },
              ]}
              onChange={(v) => setAuthType(v as 'none' | 'bearer' | 'header')}
            />
            {authType !== 'none' && (
              <SettingText
                label={authType === 'header' ? 'Header Name' : 'Bearer Token'}
                type={authType === 'header' ? 'text' : 'password'}
                mono
                value={authType === 'header' ? authHeaderName : authSecret}
                onChange={authType === 'header' ? setAuthHeaderName : setAuthSecret}
              />
            )}
          </SettingsGrid>

          {authType === 'header' && (
            <SettingText
              label="Header Secret"
              type="password"
              mono
              value={authSecret}
              onChange={setAuthSecret}
            />
          )}

          <div className="flex justify-end">
            <button
              type="button"
              data-testid="mcp-add-btn"
              onClick={handleAddServer}
              className="px-3.5 py-2 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add MCP Server
            </button>
          </div>

          {/* Connected Servers List */}
          <div className="pt-2 border-t border-[var(--border)] space-y-2">
            {mcpServers.length === 0 ? (
              <div className="text-xs text-[var(--text-3)] py-4 text-center rounded-lg border border-dashed border-[var(--border)]">
                No MCP servers configured yet. Add an HTTPS Streamable MCP endpoint above.
              </div>
            ) : (
              mcpServers.map((srv) => (
                <div
                  key={srv.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text)]">
                        <span>{srv.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--surface-2)] border border-[var(--border)]">
                          {srv.transport.toUpperCase()}
                        </span>
                        {srv.status === 'connected' && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--accent-emerald)]">
                            <CheckCircle2 className="w-3 h-3" />
                            Connected ({srv.latencyMs}ms)
                          </span>
                        )}
                        {srv.status === 'edge_blocked' && (
                          <span className="text-[10px] text-[var(--accent-amber)]">
                            Edge stdio blocked
                          </span>
                        )}
                        {srv.status === 'error' && (
                          <span className="text-[10px] text-[var(--settings-danger)]">
                            Error
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-3)] truncate mt-0.5">
                        {srv.urlOrCommand} · Auth: {maskMcpAuthSecret(srv.authSecret)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleTestServer(srv)}
                        disabled={testingId === srv.id}
                        className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--text)] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {testingId === srv.id && <Loader2 className="w-3 h-3 animate-spin" />}
                        Test Connection
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateMcpServers(
                            mcpServers.map((item) =>
                              item.id === srv.id ? { ...item, enabled: !item.enabled } : item
                            )
                          )
                        }
                        className={`px-2 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                          srv.enabled
                            ? 'border-[var(--primary-border)] bg-[var(--primary-soft)] text-[var(--primary)]'
                            : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)]'
                        }`}
                      >
                        {srv.enabled ? 'Enabled' : 'Paused'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateMcpServers(mcpServers.filter((item) => item.id !== srv.id))
                        }
                        className="p-1.5 rounded text-[var(--text-3)] hover:text-[var(--settings-danger)] cursor-pointer"
                        title="Remove MCP server"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {srv.statusMessage && (
                    <div className="text-[11px] text-[var(--text-3)]">{srv.statusMessage}</div>
                  )}
                  {srv.tools && srv.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {srv.tools.map((t) => (
                        <span
                          key={t.name}
                          className="px-2 py-0.5 rounded text-[10px] font-mono border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </SettingsCard>

      {/* 2. Available Tools Inventory */}
      <SettingsCard
        title="Available Tools"
        description="Built-in File, Database, Web, and External MCP tools ready in this runtime."
        icon={<Wrench className="w-4 h-4" />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {TOOL_CAPABILITY_REGISTRY.slice(0, 8).map((tool) => (
            <div
              key={tool.id}
              className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[var(--text)]">{tool.name}</span>
                <span className="font-mono text-[10px] uppercase text-[var(--text-3)]">
                  {tool.category}
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-3)] mt-0.5">{tool.statusNote}</div>
            </div>
          ))}
        </div>
        {discoveredMcpTools.length > 0 && (
          <div className="pt-2 border-t border-[var(--border)] text-xs">
            <span className="font-semibold text-[var(--text)]">
              Discovered External MCP Tools ({discoveredMcpTools.length}):
            </span>{' '}
            <span className="font-mono text-[var(--text-3)]">
              {discoveredMcpTools.map((t) => `${t.serverName}:${t.name}`).join(', ')}
            </span>
          </div>
        )}
      </SettingsCard>

      {/* 3. Tool Permissions */}
      <SettingsCard
        title="Tool Permissions & Approval Policy"
        description="Enforce Allow, Ask for Confirmation, or Deny per tool on /api/execute-tool."
        icon={<ShieldCheck className="w-4 h-4" />}
      >
        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] overflow-hidden">
          {[
            { id: 'web_search', label: 'Web Search & Fetch' },
            { id: 'generate_image', label: 'Image Generation' },
            { id: 'calculate', label: 'Math & AST Calculator' },
            { id: 'create_note', label: 'Create / Edit Notebook Note' },
            { id: 'delete_note', label: 'Delete Notebook Note' },
            { id: 'send_webhook', label: 'Outgoing Webhook Dispatch' },
            { id: 'github_integration', label: 'GitHub Read & Commit Actions' },
            { id: 'supabase_integration', label: 'Supabase Schema & SQL Actions' },
            { id: 'google_workspace_integration', label: 'Google Drive / Docs / Sheets' },
          ].map((item) => {
            const current: ToolPermissionMode =
              permissions[item.id] ||
              (['create_note', 'delete_note', 'send_webhook', 'github_integration', 'supabase_integration', 'google_workspace_integration'].includes(item.id)
                ? 'ask'
                : 'allow');
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-[var(--bg)] text-xs"
              >
                <span className="font-medium text-[var(--text)]">{item.label}</span>
                <div className="cs-seg">
                  {(['allow', 'ask', 'deny'] as ToolPermissionMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      data-testid={`perm-${item.id}-${mode}`}
                      onClick={() => setToolPermission(item.id, mode)}
                      className={`cs-seg-btn capitalize ${current === mode ? 'is-active' : ''}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </SettingsCard>

      {/* 4. Connected Apps & OAuth Integrations */}
      {connections && onUpdateConnections && (
        <SettingsCard
          title="Connected Accounts & Integrations"
          description="GitHub, Google Workspace, Vercel, and Supabase OAuth / Token Vault connectors."
          icon={<Plug className="w-4 h-4" />}
        >
          <VaultConnectionsPanel
            connections={connections}
            onChange={onUpdateConnections}
            notes={notes}
            notify={(msg) => notify?.(msg)}
            compact
          />
        </SettingsCard>
      )}
    </div>
  );
};
