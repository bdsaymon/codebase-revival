import { describe, expect, it } from 'vitest';
import { dispatchToLegacyApp } from '../smfta/server/runtime/dispatch';
import { encryptSecret, decryptSecret, rotateKeystoreMasterKey } from '../smfta/src/utils/secureKeystore';
import { buildExportEnvelope, parseImportPayload } from '../smfta/src/utils/exportData';
import { sanitizeSettings } from '../smfta/src/utils/settings';
import { buildKnowledgePromptContext } from '../smfta/src/utils/knowledgeBase';

async function postJson(path: string, body: Record<string, unknown>) {
  const req = new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await dispatchToLegacyApp(req);
  const data = await res.json();
  return { status: res.status, data };
}

describe('10-Category Settings Backend & Security Integration', () => {
  it('flags stdio MCP commands with EDGE_STDIO_UNSUPPORTED on edge runtime', async () => {
    const { status, data } = await postJson('/api/mcp/test', {
      urlOrCommand: 'npx -y @modelcontextprotocol/server-github',
      transport: 'stdio',
    });
    expect(status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.errorCode).toBe('EDGE_STDIO_UNSUPPORTED');
  });

  it('flags raw TCP DB URIs with EDGE_TCP_UNSUPPORTED on edge runtime', async () => {
    const { status, data } = await postJson('/api/db-bridge/test', {
      kind: 'postgresql',
      endpointOrUri: 'postgresql://user:pass@db.example.com:5432/prod',
    });
    expect(status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.errorCode).toBe('EDGE_TCP_UNSUPPORTED');
  });

  it('enforces toolPermissions (deny -> 403, ask -> confirmationId, allow -> execute)', async () => {
    const denied = await postJson('/api/execute-tool', {
      tool: 'calculate',
      input: '2 + 2',
      toolPermissions: { calculate: 'deny' },
    });
    expect(denied.status).toBe(403);
    expect(denied.data.errorCode).toBe('TOOL_DENIED_BY_POLICY');

    const ask = await postJson('/api/execute-tool', {
      tool: 'calculate',
      input: '6 * 7',
      toolPermissions: { calculate: 'ask' },
    });
    expect(ask.status).toBe(200);
    expect(ask.data.requiresConfirmation).toBe(true);
    expect(typeof ask.data.confirmationId).toBe('string');

    const allowed = await postJson('/api/execute-tool', {
      tool: 'calculate',
      input: '6 * 7',
      toolPermissions: { calculate: 'allow' },
    });
    expect(allowed.status).toBe(200);
    expect(allowed.data.ok).toBe(true);
    expect(allowed.data.result).toBe(42);
  });

  it('rotates AES-256-GCM master key and re-encrypts secrets cleanly', async () => {
    const originalPlain = 'sk-test-rotate-key-98765';
    const sealed = await encryptSecret(originalPlain);
    expect(sealed.startsWith('enc:v1:')).toBe(true);
    expect(await decryptSecret(sealed)).toBe(originalPlain);

    let resealed = '';
    await rotateKeystoreMasterKey(async ({ decryptOld, encryptNew }) => {
      const recovered = await decryptOld(sealed);
      expect(recovered).toBe(originalPlain);
      resealed = await encryptNew(recovered);
      return 1;
    });
    expect(resealed.startsWith('enc:v1:')).toBe(true);
    expect(resealed).not.toBe(sealed);
    expect(await decryptSecret(resealed)).toBe(originalPlain);
  });

  it('exports and imports expanded non-secret workspace configs while stripping secrets', () => {
    const envelope = buildExportEnvelope({
      chats: [],
      settings: sanitizeSettings({ dir: 'rtl', conversationPrivacyMode: true }),
      mcpServers: [
        {
          id: 'mcp-1',
          name: 'Remote Docs',
          urlOrCommand: 'https://mcp.example.com/rpc',
          transport: 'http',
          authType: 'bearer',
          authSecret: 'super-secret-bearer',
          enabled: true,
        },
      ],
      dbConnections: [
        {
          id: 'db-1',
          name: 'Main Supabase',
          kind: 'supabase',
          endpointOrUri: 'https://abc.supabase.co',
          secret: 'service-key-secret',
          enabled: true,
          transportMode: 'http_rest',
        },
      ],
      dataBridgeConfig: {
        sourceConnectionId: 'db-1',
        destinationConnectionId: 'db-2',
        sourceTable: 'src_tbl',
        destinationTable: 'dst_tbl',
        syncMode: 'upsert',
        fieldMappings: [{ id: 'm1', sourceField: 'a', targetField: 'b', transform: 'trim' }],
      },
      knowledgeDocs: [
        {
          id: 'kb-1',
          title: 'FAQ',
          mimeType: 'text/plain',
          sizeBytes: 42,
          content: 'SMFTA AI Pro supports HTTP and SSE MCP servers.',
          chunkCount: 1,
          createdAt: 12345,
          updatedAt: 12345,
        },
      ],
      includeKeys: false,
    });

    expect(envelope.mcpServers?.[0]?.authSecret).toBe('');
    expect(envelope.dbConnections?.[0]?.secret).toBe('');

    const parsed = parseImportPayload(JSON.stringify(envelope));
    expect(parsed.settings?.dir).toBe('rtl');
    expect(parsed.mcpServers?.[0]?.name).toBe('Remote Docs');
    expect(parsed.dbConnections?.[0]?.kind).toBe('supabase');
    expect(parsed.dataBridgeConfig?.fieldMappings?.[0]?.targetField).toBe('b');
    expect(parsed.knowledgeDocs?.[0]?.title).toBe('FAQ');

    const kbCtx = buildKnowledgePromptContext(
      'SSE MCP servers',
      parsed.knowledgeDocs || [],
      sanitizeSettings({ knowledgeSettings: { enabled: true } }).knowledgeSettings
    );
    expect(kbCtx.hits.length).toBe(1);
    expect(kbCtx.promptContext).toContain('SSE MCP servers');
  });
});
