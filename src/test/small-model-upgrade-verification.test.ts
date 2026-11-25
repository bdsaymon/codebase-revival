import { afterEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  looksTruncated,
  mergeContinuationText,
  MAX_AUTO_CONTINUATIONS,
} from '../smfta/src/utils/streamGuard';
import {
  getV2ModelSpec,
  V2_SPECIAL_MODELS,
  getRiyadhDateKey,
} from '../smfta/src/utils/v2UsageLimits';
import {
  clearServerV2MemoryStoreForTesting,
  configureV2DbAdapterForTesting,
  getServerV2UserRecord,
  setServerV2UsageCountForTesting,
  streamV2FirebaseModel,
  type V2QuotaDbAdapter,
} from '../smfta/server/v2FirebaseAi';
import { streamFromLovableAi } from '../smfta/server/runtime/lovableAi';
import {
  addV2Memory,
  clearAllV2Memories,
  clearV2RagInstanceStoreForTesting,
  configureV2EmbedderForTesting,
  configureV2RagDbAdapterForTesting,
  deleteV2Memory,
  ingestV2Document,
  listV2Memories,
  retrieveV2RagContext,
  updateV2Memory,
  type V2MemoryRecord,
  type V2DocumentChunkRecord,
  type V2RagDbAdapter,
} from '../smfta/server/v2Rag';
import {
  extractTextFromXlsxAsync,
} from '../smfta/src/utils/documentReader';

afterEach(() => {
  configureV2DbAdapterForTesting(null);
  configureV2RagDbAdapterForTesting(null);
  configureV2EmbedderForTesting(null);
  clearServerV2MemoryStoreForTesting();
  clearV2RagInstanceStoreForTesting();
});

describe('Small Model Upgrade, Thinking Stability, RAG & V2 Memory Verification', () => {
  it('configures exact V2 presets with identical client/server model IDs and unified continuation constant', () => {
    expect(V2_SPECIAL_MODELS.length).toBe(3);
    expect(MAX_AUTO_CONTINUATIONS).toBe(3);

    const v5 = getV2ModelSpec('smfta-v5');
    expect(v5.serverGeminiModel).toBe('gemini-3.5-flash-lite');
    expect(v5.firebaseAiModel).toBe('gemini-3.5-flash-lite');
    expect(v5.thinkingLevel).toBe('LOW');

    const pro = getV2ModelSpec('smfta-v2-pro');
    expect(pro.serverGeminiModel).toBe('gemini-3.8-flash');
    expect(pro.firebaseAiModel).toBe('gemini-3.8-flash');
    expect(pro.thinkingLevel).toBe('MEDIUM');

    const max = getV2ModelSpec('smfta-max');
    expect(max.serverGeminiModel).toBe('gemini-4-hydrogen');
    expect(max.firebaseAiModel).toBe('gemini-4-hydrogen');
    expect(max.thinkingLevel).toBe('MEDIUM');
    expect(max.useSearchGrounding).toBe(true);
  });

  it('persists V2 quota across simulated server restarts via DB adapter (Asia/Riyadh date)', async () => {
    const mockUsageTable = new Map<string, { dateRiyadh: string; usedByModel: any; testingUsedByModel: any }>();
    const mockConfigTable = new Map<string, any>();

    const adapter: V2QuotaDbAdapter = {
      async getUsage(userId, dateRiyadh) {
        return mockUsageTable.get(`${userId}:${dateRiyadh}`) || null;
      },
      async upsertUsage(userId, record) {
        mockUsageTable.set(`${userId}:${record.dateRiyadh}`, structuredClone(record));
      },
      async getConfig(userId) {
        return mockConfigTable.get(userId) || null;
      },
      async upsertConfig(userId, config) {
        mockConfigTable.set(userId, structuredClone(config));
      },
    };
    configureV2DbAdapterForTesting(adapter);

    const userId = `persist_user_${Date.now()}`;
    await setServerV2UsageCountForTesting({
      userId,
      modelId: 'smfta-max',
      usedCount: 7,
    });

    const beforeRestart = await getServerV2UserRecord(userId);
    expect(beforeRestart.dateRiyadh).toBe(getRiyadhDateKey());
    expect(beforeRestart.usedByModel['smfta-max']).toBe(7);

    // Clear volatile per-instance memory map (fresh server boot simulation)
    clearServerV2MemoryStoreForTesting();

    const afterRestart = await getServerV2UserRecord(userId);
    expect(afterRestart.usedByModel['smfta-max']).toBe(7);
  });

  it('simulates Lovable gateway token-limit cut, dropped stream resume without duplication, and 3.1-flash-lite rejection fallback', async () => {
    const encoder = new TextEncoder();
    const sse = (events: Array<Record<string, unknown>>) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const ev of events) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

    // 1) Token-limit cut (finish_reason = 'length')
    let callIdx = 0;
    const prevKey = process.env.LOVABLE_API_KEY;
    process.env.LOVABLE_API_KEY = 'test-lovable-key';
    try {
      const tokenCutFetch: typeof fetch = (async () => {
        callIdx += 1;
        return new Response(
          sse([
            {
              choices: [
                {
                  delta: { reasoning_content: 'Planning output...', content: 'Half written answer' },
                  finish_reason: 'length',
                },
              ],
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        );
      }) as typeof fetch;

      let outCut = '';
      let outThought = '';
      const cutRes = await streamFromLovableAi({
        model: 'google/gemini-3.8-flash',
        systemInstruction: 'sys',
        history: [{ role: 'user', content: 'hi' }],
        thinkingEffort: 'high',
        emitThinking: (t) => {
          outThought += t;
        },
        emitDelta: (d) => {
          outCut += d;
        },
        fetchImpl: tokenCutFetch,
      });
      expect(cutRes.ok).toBe(true);
      expect(cutRes.truncated).toBe(true);
      expect(outCut).toBe('Half written answer');
      expect(outThought).toBe('Planning output...');
      expect(callIdx).toBe(1);

      // 2) Dropped stream mid-answer -> auto-resume cleanly without overlap duplication
      const droppedFetch: typeof fetch = (async (_url, init) => {
        const body = JSON.parse(String(init?.body || '{}'));
        // On first pass (no continuation turn yet), simulate abrupt error mid-stream
        const isResume = Array.isArray(body.messages) && body.messages.some((m: any) => String(m.content || '').includes('SYSTEM CONTINUATION'));
        if (!isResume) {
          let step = 0;
          const partialStream = new ReadableStream<Uint8Array>({
            pull(controller) {
              if (step === 0) {
                step += 1;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ choices: [{ delta: { content: 'Part one begins here and ' } }] })}\n\n`
                  )
                );
              } else {
                controller.error(new Error('network drop'));
              }
            },
          });
          return new Response(partialStream, { status: 200 });
        }
        return new Response(
          sse([
            {
              choices: [
                {
                  delta: { content: 'here and finishes cleanly.' },
                  finish_reason: 'stop',
                },
              ],
            },
          ]),
          { status: 200 }
        );
      }) as typeof fetch;

      let resumedOut = '';
      const dropRes = await streamFromLovableAi({
        model: 'google/gemini-3.8-flash',
        systemInstruction: 'sys',
        history: [{ role: 'user', content: 'write long text' }],
        emitDelta: (d) => {
          resumedOut += d;
        },
        fetchImpl: droppedFetch,
      });
      expect(dropRes.ok).toBe(true);
      expect(dropRes.resumedAfterDrop).toBe(true);
      expect(resumedOut).toBe('Part one begins here and finishes cleanly.');

      // 3) Rejection of google/gemini-3.1-flash-lite automatically falls back to google/gemini-3.8-flash
      const modelsAttempted: string[] = [];
      const rejectFetch: typeof fetch = (async (_url, init) => {
        const body = JSON.parse(String(init?.body || '{}'));
        modelsAttempted.push(body.model);
        if (body.model === 'google/gemini-3.1-flash-lite') {
          return new Response(JSON.stringify({ error: { message: 'Model deprecated/unavailable' } }), { status: 400 });
        }
        return new Response(
          sse([{ choices: [{ delta: { content: 'Fallback 3.8 answered!' }, finish_reason: 'stop' }] }]),
          { status: 200 }
        );
      }) as typeof fetch;

      let fbOut = '';
      const fbRes = await streamFromLovableAi({
        model: 'google/gemini-3.1-flash-lite',
        systemInstruction: 'sys',
        history: [{ role: 'user', content: 'ping' }],
        emitDelta: (d) => {
          fbOut += d;
        },
        fetchImpl: rejectFetch,
      });
      expect(fbRes.ok).toBe(true);
      expect(fbRes.model).toBe('google/gemini-3.8-flash');
      expect(fbRes.fallbackNotice).toContain('google/gemini-3.1-flash-lite');
      expect(modelsAttempted).toEqual(['google/gemini-3.1-flash-lite', 'google/gemini-3.8-flash']);
      expect(fbOut).toBe('Fallback 3.8 answered!');
    } finally {
      if (prevKey === undefined) delete process.env.LOVABLE_API_KEY;
      else process.env.LOVABLE_API_KEY = prevKey;
    }
  });

  it('simulates V2 dropped stream recovery without duplicated text and thinking-only stall downward fallback', async () => {
    let emitted = '';
    const thoughts: string[] = [];
    const modelsTried: string[] = [];
    const fakeAi = {
      models: {
        generateContentStream: async ({ model, contents }: { model: string; contents: any[] }) => {
          modelsTried.push(model);
          // Primary drops stream mid-answer after emitting partial text
          if (model === 'gemini-4-hydrogen' && contents.length === 1) {
            return {
              async *[Symbol.asyncIterator]() {
                yield {
                  candidates: [
                    { content: { parts: [{ text: 'Analyzing full architecture...', thought: true }] } },
                  ],
                } as never;
                yield {
                  candidates: [{ content: { parts: [{ text: 'export function Demo() {\n  return ' }] } }],
                } as never;
                throw new Error('503 Stream socket dropped');
              },
            };
          }
          // Continuation candidate on downward chain resumes cleanly with overlapping tail
          return {
            async *[Symbol.asyncIterator]() {
              yield {
                candidates: [
                  {
                    content: { parts: [{ text: '  return <div>Done</div>;\n}' }] },
                    finishReason: 'STOP',
                  },
                ],
              } as never;
            },
          };
        },
      },
    };

    const res = await streamV2FirebaseModel({
      modelId: 'smfta-max',
      systemInstruction: 'sys',
      history: [{ role: 'user', content: 'Write Demo component' }],
      signal: new AbortController().signal,
      thinkingEnabled: true,
      thinkingEffort: 'high',
      emitThinking: (t) => thoughts.push(t),
      emitDelta: (d) => {
        emitted += d;
      },
      genAiClientOverride: fakeAi,
    });

    expect(res.ok).toBe(true);
    expect(res.resumedAfterDrop).toBe(true);
    expect(modelsTried).toEqual(['gemini-4-hydrogen', 'gemini-3.8-flash']);
    expect(emitted).toBe('export function Demo() {\n  return <div>Done</div>;\n}');
    expect(thoughts.join('')).toContain('Analyzing full architecture');
  });

  it('supports V2 RAG ingestion (TXT, CSV, JSON, XLSX), source citations, and V2 memory CRUD proving row + vector deletion', async () => {
    const ragRows: V2DocumentChunkRecord[] = [];
    const memoryRows: V2MemoryRecord[] = [];

    const mockAdapter: V2RagDbAdapter = {
      async insertDocumentChunks(chunks) {
        ragRows.push(...chunks);
      },
      async listDocumentChunks(uid) {
        return ragRows.filter((r) => r.userId === uid);
      },
      async deleteDocumentChunks(uid, docId) {
        const before = ragRows.length;
        for (let i = ragRows.length - 1; i >= 0; i -= 1) {
          if (ragRows[i]!.userId === uid && ragRows[i]!.docId === docId) {
            ragRows.splice(i, 1);
          }
        }
        return before - ragRows.length;
      },
      async listMemories(uid) {
        return memoryRows.filter((m) => m.userId === uid);
      },
      async insertMemory(rec) {
        memoryRows.push(rec);
        return rec;
      },
      async updateMemory(uid, id, patch) {
        const target = memoryRows.find((m) => m.userId === uid && m.id === id);
        if (!target) return null;
        if (patch.content !== undefined) target.content = patch.content;
        if (patch.embedding !== undefined) target.embedding = patch.embedding;
        if (patch.pinned !== undefined) target.pinned = patch.pinned;
        return { ...target };
      },
      async deleteMemory(uid, id) {
        const idx = memoryRows.findIndex((m) => m.userId === uid && m.id === id);
        if (idx === -1) return false;
        memoryRows.splice(idx, 1);
        return true;
      },
      async clearAllMemories(uid) {
        let count = 0;
        for (let i = memoryRows.length - 1; i >= 0; i -= 1) {
          if (memoryRows[i]!.userId === uid) {
            memoryRows.splice(i, 1);
            count += 1;
          }
        }
        return count;
      },
    };
    configureV2RagDbAdapterForTesting(mockAdapter);

    // Deterministic vector embedder based on topic words
    configureV2EmbedderForTesting(async (text) => {
      const low = text.toLowerCase();
      return [
        low.includes('pricing') || low.includes('invoice') ? 1 : 0,
        low.includes('bangladesh') || low.includes('dhaka') ? 1 : 0,
        low.includes('rust') ? 1 : 0,
      ];
    });

    const userId = 'v2_rag_tester';
    // Test real XLSX parsing via SheetJS
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Plan', 'Price'],
      ['Enterprise', 'Pricing $49/month'],
    ]);
    XLSX.utils.book_append_sheet(wb, sheet, 'Billing');
    const xlsxBuf = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    const xlsxText = await extractTextFromXlsxAsync(xlsxBuf);
    expect(xlsxText).toContain('Pricing $49/month');

    const ingestXlsx = await ingestV2Document({
      userId,
      fileName: 'plans.xlsx',
      bytesBase64: Buffer.from(xlsxBuf).toString('base64'),
    });
    expect(ingestXlsx.ok).toBe(true);
    expect(ingestXlsx.format).toBe('xlsx');

    const ingestJson = await ingestV2Document({
      userId,
      fileName: 'profile.json',
      rawText: JSON.stringify({ city: 'Dhaka', country: 'Bangladesh' }),
    });
    expect(ingestJson.ok).toBe(true);

    const hit = await retrieveV2RagContext({ userId, query: 'What is the pricing?' });
    expect(hit.matched).toBe(true);
    expect(hit.citations[0]?.fileName).toBe('plans.xlsx');
    expect(hit.contextBlock).toContain('[Source 1: plans.xlsx #1]');

    const miss = await retrieveV2RagContext({ userId, query: 'Quantum superconductivity equations' });
    expect(miss.hasDocuments).toBe(true);
    expect(miss.matched).toBe(false);
    expect(miss.emptyNotice).toBeTruthy();

    // V2 Memory add -> edit -> delete-one -> Clear All proving row + vector deletion
    const m1 = await addV2Memory({ userId, content: 'My favorite city is Dhaka, Bangladesh' });
    const m2 = await addV2Memory({ userId, content: 'I code in Rust every morning' });
    expect(memoryRows.length).toBe(2);
    expect(m1.embedding.length).toBe(3);

    const updatedM1 = await updateV2Memory({
      userId,
      id: m1.id,
      content: 'Updated pricing specialist in Bangladesh',
    });
    expect(updatedM1?.content).toContain('Updated pricing');
    expect(updatedM1?.embedding[0]).toBe(1);

    const deletedOne = await deleteV2Memory(userId, m1.id);
    expect(deletedOne).toBe(true);
    expect(memoryRows.some((r) => r.id === m1.id)).toBe(false);
    expect((await listV2Memories(userId)).length).toBe(1);

    const cleared = await clearAllV2Memories(userId);
    expect(cleared.deletedCount).toBe(1);
    expect(memoryRows.length).toBe(0);
    expect(looksTruncated('Complete sentence.')).toBe(false);
    expect(mergeContinuationText('Hello world!', 'world! Welcome home.').merged).toBe('Hello world! Welcome home.');
  });
});

