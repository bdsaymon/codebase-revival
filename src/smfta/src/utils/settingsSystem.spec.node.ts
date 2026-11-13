import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_KNOWLEDGE_SETTINGS,
  DEFAULT_TOOL_PERMISSIONS,
  SETTINGS_SCHEMA_VERSION,
  migrateSettings,
  sanitizeSettings,
} from './settings';
import {
  buildKnowledgeChunks,
  buildKnowledgePromptContext,
  chunkDocumentText,
  searchKnowledgeChunks,
} from './knowledgeBase';
import { classifyDbTransport, mapBridgeRecord } from './dbBridge';
import { buildMcpPromptContext, classifyMcpTransport } from './mcpClient';
import { aggregateTelemetryStats, redactSecretStrings } from './telemetryLog';
import {
  resolveFallbackProfileChain,
  resolveModelForSlot,
  sortProvidersByPriority,
} from './providers';
import { parseSettingsUpdateResponse } from './settingsUpdate';
import { stripWorkspaceSecrets } from './cloudSync';
import type { KnowledgeDocument, SavedProviderProfile } from '../types';

test('settings schema v20 sanitizes and migrates all 10-category fields cleanly', () => {
  const migrated = migrateSettings({
    settingsVersion: 17,
    theme: 'light',
    dir: 'rtl',
    topK: 900,
    concurrentRequests: 99,
    weightTemp: 2.5,
    stopSequences: ['END', '  ', 'STOP'],
    toolPermissions: { delete_note: 'deny', web_search: 'allow' },
    modelSlots: { fastModel: 'prof-1::gpt-4o-mini', visionModel: 'gemini-2.5-flash' },
    knowledgeSettings: { enabled: true, topK: 8, minScore: 0.25 },
  });

  assert.equal(migrated.settingsVersion, SETTINGS_SCHEMA_VERSION);
  assert.equal(migrated.dir, 'rtl');
  assert.equal(migrated.topK, 200);
  assert.equal(migrated.concurrentRequests, 6);
  assert.equal(migrated.weightTemp, 1.2);
  assert.deepEqual(migrated.stopSequences, ['END', 'STOP']);
  assert.equal(migrated.toolPermissions?.delete_note, 'deny');
  assert.equal(
    migrated.toolPermissions?.send_webhook,
    DEFAULT_TOOL_PERMISSIONS.send_webhook
  );
  assert.equal(migrated.modelSlots?.fastModel, 'prof-1::gpt-4o-mini');
  assert.equal(migrated.knowledgeSettings?.topK, 8);
  assert.equal(
    migrated.knowledgeSettings?.chunkSize,
    DEFAULT_KNOWLEDGE_SETTINGS.chunkSize
  );

  const def = sanitizeSettings(undefined);
  assert.equal(def.settingsVersion, SETTINGS_SCHEMA_VERSION);
});

test('knowledgeBase chunks with overlap and ranks TF-IDF cosine matches accurately', () => {
  const longText = `${'Cloudflare edge runtime runs stateless V8 isolates. '.repeat(12)}Knowledge retrieval uses TF-IDF cosine similarity and exact phrase boosts.`;
  const chunks = chunkDocumentText(longText, 220, 40);
  assert.ok(chunks.length >= 3);

  const docs: KnowledgeDocument[] = [
    {
      id: 'doc-1',
      title: 'Edge Runtime Architecture Guide',
      mimeType: 'text/plain',
      sizeBytes: 320,
      content:
        'Cloudflare Workers V8 isolates do not support raw stdio subprocesses or direct PostgreSQL TCP sockets. Use HTTPS PostgREST or HTTP SSE bridges.',
      chunkCount: 1,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'doc-2',
      title: 'Bakery Sourdough Recipe',
      mimeType: 'text/plain',
      sizeBytes: 180,
      content: 'Mix flour, water, sea salt, and active starter for crusty artisan loaves.',
      chunkCount: 1,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  const allChunks = buildKnowledgeChunks(docs, 400, 60);
  const hits = searchKnowledgeChunks('Cloudflare PostgREST HTTP bridge', allChunks, {
    topK: 3,
    minScore: 0.05,
    vectorSearchEnabled: true,
  });

  assert.equal(hits.length, 1);
  assert.equal(hits[0].chunk.docId, 'doc-1');
  assert.ok(hits[0].score > 0.1);

  const promptCtx = buildKnowledgePromptContext('Cloudflare PostgREST', docs, {
    ...DEFAULT_KNOWLEDGE_SETTINGS,
    enabled: true,
    topK: 2,
    minScore: 0.05,
  });
  assert.ok(promptCtx.promptContext.includes('[KNOWLEDGE BASE CONTEXT]'));
  assert.ok(promptCtx.promptContext.includes('Edge Runtime Architecture Guide'));
});

test('dbBridge classifies HTTPS vs TCP URIs and maps fields deterministically', () => {
  const httpRes = classifyDbTransport('https://xyz.supabase.co/rest/v1', 'supabase');
  assert.equal(httpRes.edgeSupported, true);
  assert.equal(httpRes.transportMode, 'http_rest');

  const pgRes = classifyDbTransport('postgresql://user:pass@db.example.com:5432/app', 'postgresql');
  assert.equal(pgRes.edgeSupported, false);
  assert.equal(pgRes.transportMode, 'direct_tcp');

  const mapped = mapBridgeRecord(
    { email: '  User@Example.COM ', amount: '42.5', city: 'Dhaka' },
    [
      { id: 'm1', sourceField: 'email', targetField: 'user_email', transform: 'lowercase' },
      { id: 'm2', sourceField: 'amount', targetField: 'total', transform: 'number' },
      { id: 'm3', sourceField: 'city', targetField: 'CITY_CODE', transform: 'uppercase' },
    ]
  );
  assert.deepEqual(mapped, {
    user_email: 'user@example.com',
    total: 42.5,
    CITY_CODE: 'DHAKA',
  });
});

test('mcpClient flags stdio on edge and builds compact tool context', () => {
  const stdio = classifyMcpTransport('npx -y @modelcontextprotocol/server-filesystem /tmp');
  assert.equal(stdio.transport, 'stdio');
  assert.equal(stdio.edgeSupported, false);

  const sse = classifyMcpTransport('https://mcp.example.com/sse');
  assert.equal(sse.transport, 'sse');
  assert.equal(sse.edgeSupported, true);

  const ctx = buildMcpPromptContext([
    {
      id: 'm1',
      name: 'Docs MCP',
      urlOrCommand: 'https://mcp.example.com/rpc',
      transport: 'http',
      authType: 'none',
      enabled: true,
      status: 'connected',
      tools: [{ name: 'search_docs', description: 'Search docs' }],
    },
    {
      id: 'm2',
      name: 'Disabled MCP',
      urlOrCommand: 'https://disabled.example.com',
      transport: 'http',
      authType: 'none',
      enabled: false,
      status: 'connected',
      tools: [{ name: 'hidden_tool' }],
    },
  ]);
  assert.ok(ctx.includes('Docs MCP'));
  assert.ok(ctx.includes('search_docs'));
  assert.equal(ctx.includes('hidden_tool'), false);
});

test('telemetryLog redacts bearer/API keys and computes accurate latency averages', () => {
  const cleaned = redactSecretStrings(
    'Failed with Authorization: Bearer sk-secrettoken12345 and AIzaSyDExampleKey123456'
  );
  assert.equal(cleaned.includes('sk-secrettoken12345'), false);
  assert.equal(cleaned.includes('AIzaSyDExampleKey123456'), false);

  const stats = aggregateTelemetryStats([
    { id: '1', timestamp: 1, provider: 'openai', model: 'gpt-4o', latencyMs: 400, status: 'success', inputTokens: 100, outputTokens: 200 },
    { id: '2', timestamp: 2, provider: 'openai', model: 'gpt-4o', latencyMs: 800, status: 'error' },
  ]);
  assert.equal(stats.totalRequests, 2);
  assert.equal(stats.successCount, 1);
  assert.equal(stats.errorCount, 1);
  assert.equal(stats.totalInputTokens, 100);
  assert.equal(stats.totalOutputTokens, 200);
  assert.equal(stats.avgLatencyMs, 600);
});

test('providers sort by priority, build fallback chain, and resolve model role slots', () => {
  const profiles: SavedProviderProfile[] = [
    {
      id: 'p-low',
      name: 'Backup',
      provider: 'openai',
      externalKeys: 'sk-1',
      externalModel: 'gpt-4o-mini',
      externalBaseUrl: '',
      availableModels: ['gpt-4o-mini', 'gpt-4o'],
      priority: 3,
      enabled: true,
      verified: true,
    },
    {
      id: 'p-disabled',
      name: 'Disabled',
      provider: 'anthropic',
      externalKeys: 'sk-2',
      externalModel: 'claude-3-7-sonnet',
      externalBaseUrl: '',
      priority: 1,
      enabled: false,
      verified: true,
    },
    {
      id: 'p-top',
      name: 'Primary',
      provider: 'gemini_custom',
      externalKeys: 'AIza1',
      externalModel: 'gemini-2.5-flash',
      externalBaseUrl: '',
      availableModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      priority: 2,
      enabled: true,
      verified: true,
    },
  ];

  const sorted = sortProvidersByPriority(profiles);
  assert.deepEqual(
    sorted.map((p) => p.id),
    ['p-disabled', 'p-top', 'p-low']
  );

  const chain = resolveFallbackProfileChain('p-top', profiles);
  assert.deepEqual(
    chain.map((p) => p.id),
    ['p-low']
  );

  const slot = resolveModelForSlot(
    'fastModel',
    sanitizeSettings({ modelSlots: { fastModel: 'p-low::gpt-4o-mini' } }),
    profiles
  );
  assert.equal(slot?.profile?.id, 'p-low');
  assert.equal(slot?.modelId, 'gpt-4o-mini');
});

test('security guards block AI self-updates to permissions/privacy and strip workspace secrets', () => {
  const aiSelf = parseSettingsUpdateResponse(
    `Updated!\n⟦SELF_UPDATE⟧{"theme":"light","toolPermissions":{"delete_note":"allow"},"conversationPrivacyMode":true}⟦/SELF_UPDATE⟧`,
    sanitizeSettings({})
  );
  assert.equal(aiSelf.settingsPatch?.theme, 'light');
  assert.equal(aiSelf.settingsPatch?.toolPermissions, undefined);
  assert.equal(aiSelf.settingsPatch?.conversationPrivacyMode, undefined);

  const stripped = stripWorkspaceSecrets({
    mcpServers: [{ id: '1', authSecret: 'top-secret-token' }],
    dbConnections: [{ id: 'd1', secret: 'service-role-key' }],
  });
  assert.equal((stripped?.mcpServers as Array<{ authSecret: string }>)[0].authSecret, '');
  assert.equal((stripped?.dbConnections as Array<{ secret: string }>)[0].secret, '');
});
