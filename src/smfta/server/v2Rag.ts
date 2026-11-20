/**
 * V2-only RAG Ingestion, Vector Retrieval, and Persistent Memory Store.
 * Strictly isolated from V1 chat/memory routing.
 */
import type { Database, Json } from '../../integrations/supabase/types';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from '../../integrations/supabase/client.server';
import { isSupabaseV2Configured } from './v2FirebaseAi';
import {
  extractTextFromDocxAsync,
  extractTextFromPdfAsync,
  extractTextFromXlsxAsync,
} from '../src/utils/documentReader';

export const V2_EMBEDDING_MODEL = 'gemini-embedding-001';
export const V2_EMBEDDING_DIMS = 768;

export interface V2DocumentChunkRecord {
  id: string;
  userId: string;
  docId: string;
  fileName: string;
  mimeType: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  metadata: Record<string, Json>;
  createdAt: string;
}

export interface V2MemoryRecord {
  id: string;
  userId: string;
  content: string;
  embedding: number[];
  pinned: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface V2RagCitation {
  docId: string;
  fileName: string;
  chunkIndex: number;
  score: number;
  excerpt: string;
}

export interface V2RagDbAdapter {
  insertDocumentChunks(chunks: V2DocumentChunkRecord[]): Promise<void>;
  listDocumentChunks(userId: string): Promise<V2DocumentChunkRecord[]>;
  deleteDocumentChunks(userId: string, docId: string): Promise<number>;
  listMemories(userId: string): Promise<V2MemoryRecord[]>;
  insertMemory(record: V2MemoryRecord): Promise<V2MemoryRecord>;
  updateMemory(userId: string, id: string, patch: { content?: string; embedding?: number[]; pinned?: boolean }): Promise<V2MemoryRecord | null>;
  deleteMemory(userId: string, id: string): Promise<boolean>;
  clearAllMemories(userId: string): Promise<number>;
}

const instanceChunksStore = new Map<string, V2DocumentChunkRecord[]>();
const instanceMemoriesStore = new Map<string, V2MemoryRecord[]>();
let customRagAdapter: V2RagDbAdapter | null = null;
let customEmbedder: ((text: string) => Promise<number[]>) | null = null;

export function configureV2RagDbAdapterForTesting(adapter: V2RagDbAdapter | null): void {
  customRagAdapter = adapter;
}

export function configureV2EmbedderForTesting(fn: ((text: string) => Promise<number[]>) | null): void {
  customEmbedder = fn;
}

export function clearV2RagInstanceStoreForTesting(): void {
  instanceChunksStore.clear();
  instanceMemoriesStore.clear();
}

function normalizeUserKey(userId?: string | null): string {
  const clean = String(userId || 'default-user')
    .trim()
    .replace(/[^a-zA-Z0-9_@.-]/g, '_')
    .slice(0, 128);
  return clean || 'default-user';
}

function toPgVectorLiteral(vec: number[]): string {
  return `[${vec.map((n) => (Number.isFinite(n) ? Number(n).toFixed(6) : '0')).join(',')}]`;
}

function parsePgVector(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => Number(v) || 0);
  }
  if (typeof raw === 'string' && raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((s) => Number(s.trim()) || 0);
  }
  return [];
}

/** Deterministic 768-dim local projection fallback when offline or embed API unavailable. */
export function buildLocalFallbackEmbedding(text: string): number[] {
  const vec = new Array<number>(V2_EMBEDDING_DIMS).fill(0);
  const tokens = String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (tokens.length === 0) return vec;
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i += 1) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const bucket = Math.abs(h) % V2_EMBEDDING_DIMS;
    vec[bucket] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export async function embedV2Text(text: string): Promise<{
  embedding: number[];
  mode: 'gemini-embedding-001' | 'lexical_fallback';
}> {
  const clean = String(text || '').trim().slice(0, 8000);
  if (!clean) {
    return { embedding: new Array<number>(V2_EMBEDDING_DIMS).fill(0), mode: 'lexical_fallback' };
  }
  if (customEmbedder) {
    return { embedding: await customEmbedder(clean), mode: 'gemini-embedding-001' };
  }
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY ||
    ''
  ).trim();
  if (!apiKey) {
    return { embedding: buildLocalFallbackEmbedding(clean), mode: 'lexical_fallback' };
  }
  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.embedContent({
      model: V2_EMBEDDING_MODEL,
      contents: clean,
      config: { outputDimensionality: V2_EMBEDDING_DIMS },
    });
    const values = res.embeddings?.[0]?.values;
    if (Array.isArray(values) && values.length > 0) {
      return {
        embedding: values.slice(0, V2_EMBEDDING_DIMS),
        mode: 'gemini-embedding-001',
      };
    }
  } catch (err) {
    console.warn('[v2Rag] gemini-embedding-001 fallback to lexical:', err instanceof Error ? err.message : err);
  }
  return { embedding: buildLocalFallbackEmbedding(clean), mode: 'lexical_fallback' };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    const va = a[i] || 0;
    const vb = b[i] || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function chunkV2DocumentText(text: string, chunkSize = 1000, overlap = 150): string[] {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length && chunks.length < 250) {
    let end = Math.min(clean.length, start + chunkSize);
    if (end < clean.length) {
      const nl = clean.lastIndexOf('\n', end);
      if (nl > start + Math.floor(chunkSize * 0.5)) {
        end = nl + 1;
      }
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

/** Parses raw uploaded bytes or pre-extracted text across TXT, CSV, JSON, PDF, DOCX, XLSX. */
export async function parseV2IngestPayload(params: {
  fileName: string;
  mimeType?: string;
  rawText?: string;
  bytesBase64?: string;
}): Promise<{ text: string; format: string; edgeLimitationNote?: string }> {
  const fileName = String(params.fileName || 'document.txt').trim();
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const preExtracted = String(params.rawText || '').trim();

  if (preExtracted) {
    if (ext === 'json') {
      try {
        return { text: JSON.stringify(JSON.parse(preExtracted), null, 2), format: 'json' };
      } catch {
        return { text: preExtracted, format: 'json' };
      }
    }
    return { text: preExtracted, format: ext || 'text' };
  }

  const base64 = String(params.bytesBase64 || '').trim();
  if (!base64) {
    return { text: '', format: ext || 'unknown' };
  }

  const binStr = Buffer.from(base64, 'base64');
  const bytes = new Uint8Array(binStr.buffer, binStr.byteOffset, binStr.byteLength);

  if (ext === 'docx') {
    const text = await extractTextFromDocxAsync(bytes);
    return { text, format: 'docx' };
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const text = await extractTextFromXlsxAsync(bytes);
    return { text, format: 'xlsx' };
  }
  if (ext === 'pdf') {
    const text = await extractTextFromPdfAsync(bytes);
    const note = !text.trim()
      ? 'Scanned or complex PDF without DOM Canvas/worker in server edge runtime yielded no selectable text; upload text-extracted PDF from the browser.'
      : undefined;
    return { text, format: 'pdf', ...(note ? { edgeLimitationNote: note } : {}) };
  }

  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (ext === 'json') {
    try {
      return { text: JSON.stringify(JSON.parse(decoded), null, 2), format: 'json' };
    } catch {
      return { text: decoded, format: 'json' };
    }
  }
  if (ext === 'csv' || ext === 'tsv') {
    return { text: decoded, format: ext };
  }
  return { text: decoded, format: ext || 'txt' };
}

export async function ingestV2Document(params: {
  userId?: string | null;
  docId?: string;
  fileName: string;
  mimeType?: string;
  rawText?: string;
  bytesBase64?: string;
}): Promise<{
  ok: boolean;
  docId: string;
  fileName: string;
  format: string;
  chunkCount: number;
  embeddingMode: 'gemini-embedding-001' | 'lexical_fallback';
  edgeLimitationNote?: string;
  error?: string;
}> {
  const userId = normalizeUserKey(params.userId);
  const parsed = await parseV2IngestPayload(params);
  if (!parsed.text.trim()) {
    return {
      ok: false,
      docId: params.docId || '',
      fileName: params.fileName,
      format: parsed.format,
      chunkCount: 0,
      embeddingMode: 'lexical_fallback',
      edgeLimitationNote: parsed.edgeLimitationNote,
      error: parsed.edgeLimitationNote || 'No readable text could be extracted from the uploaded file.',
    };
  }

  const docId =
    (params.docId || '').trim() ||
    `doc_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const rawChunks = chunkV2DocumentText(parsed.text, 1000, 150);
  const nowIso = new Date().toISOString();
  let embeddingMode: 'gemini-embedding-001' | 'lexical_fallback' = 'lexical_fallback';

  const records: V2DocumentChunkRecord[] = [];
  for (let i = 0; i < rawChunks.length; i += 1) {
    const content = rawChunks[i]!;
    const emb = await embedV2Text(content);
    if (emb.mode === 'gemini-embedding-001') embeddingMode = 'gemini-embedding-001';
    records.push({
      id: crypto.randomUUID(),
      userId,
      docId,
      fileName: params.fileName,
      mimeType: params.mimeType || parsed.format,
      chunkIndex: i,
      content,
      embedding: emb.embedding,
      metadata: {
        format: parsed.format,
        totalChunks: rawChunks.length,
        embeddingMode: emb.mode,
      },
      createdAt: nowIso,
    });
  }

  if (customRagAdapter) {
    await customRagAdapter.insertDocumentChunks(records);
  } else if (isSupabaseV2Configured()) {
    const rows = records.map((r) => ({
      id: r.id,
      user_id: r.userId,
      doc_id: r.docId,
      file_name: r.fileName,
      mime_type: r.mimeType,
      chunk_index: r.chunkIndex,
      content: r.content,
      embedding: toPgVectorLiteral(r.embedding),
      metadata: r.metadata,
      created_at: r.createdAt,
    }));
    const { error } = await supabaseAdmin.from('smfta_v2_document_chunks').insert(rows);
    if (error) {
      throw new Error(`Supabase V2 RAG insert failed: ${error.message}`);
    }
  } else {
    const list = instanceChunksStore.get(userId) || [];
    list.push(...records);
    instanceChunksStore.set(userId, list);
  }

  return {
    ok: true,
    docId,
    fileName: params.fileName,
    format: parsed.format,
    chunkCount: records.length,
    embeddingMode,
    ...(parsed.edgeLimitationNote ? { edgeLimitationNote: parsed.edgeLimitationNote } : {}),
  };
}

export async function listV2DocumentSummaries(userId?: string | null): Promise<
  Array<{ docId: string; fileName: string; format: string; chunkCount: number; createdAt: string }>
> {
  const key = normalizeUserKey(userId);
  let chunks: V2DocumentChunkRecord[] = [];
  if (customRagAdapter) {
    chunks = await customRagAdapter.listDocumentChunks(key);
  } else if (isSupabaseV2Configured()) {
    const { data, error } = await supabaseAdmin
      .from('smfta_v2_document_chunks')
      .select('id,user_id,doc_id,file_name,mime_type,chunk_index,content,metadata,created_at')
      .eq('user_id', key)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (!error && Array.isArray(data)) {
      chunks = data.map((row) => ({
        id: String(row.id),
        userId: String(row.user_id),
        docId: String(row.doc_id),
        fileName: String(row.file_name),
        mimeType: String(row.mime_type || 'text/plain'),
        chunkIndex: Number(row.chunk_index) || 0,
        content: String(row.content || ''),
        embedding: [],
        metadata: (row.metadata as Record<string, Json>) || {},
        createdAt: String(row.created_at || ''),
      }));
    }
  } else {
    chunks = instanceChunksStore.get(key) || [];
  }

  const grouped = new Map<
    string,
    { docId: string; fileName: string; format: string; chunkCount: number; createdAt: string }
  >();
  for (const c of chunks) {
    const existing = grouped.get(c.docId);
    if (existing) {
      existing.chunkCount += 1;
    } else {
      grouped.set(c.docId, {
        docId: c.docId,
        fileName: c.fileName,
        format: String(c.metadata?.format || c.mimeType || 'doc'),
        chunkCount: 1,
        createdAt: c.createdAt,
      });
    }
  }
  return Array.from(grouped.values());
}

export async function deleteV2Document(userId: string | null | undefined, docId: string): Promise<number> {
  const key = normalizeUserKey(userId);
  if (customRagAdapter) {
    return customRagAdapter.deleteDocumentChunks(key, docId);
  }
  if (isSupabaseV2Configured()) {
    const { data, error } = await supabaseAdmin
      .from('smfta_v2_document_chunks')
      .delete()
      .eq('user_id', key)
      .eq('doc_id', docId)
      .select('id');
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data.length : 0;
  }
  const existing = instanceChunksStore.get(key) || [];
  const next = existing.filter((c) => c.docId !== docId);
  instanceChunksStore.set(key, next);
  return existing.length - next.length;
}

function lexicalOverlapScore(query: string, text: string): number {
  const qTokens = String(query || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (qTokens.length === 0) return 0;
  const hay = String(text || '').toLowerCase();
  let hits = 0;
  for (const tok of qTokens) {
    if (hay.includes(tok)) hits += 1;
  }
  return hits / qTokens.length;
}

export async function retrieveV2RagContext(params: {
  userId?: string | null;
  query: string;
  topK?: number;
}): Promise<{
  hasDocuments: boolean;
  matched: boolean;
  citations: V2RagCitation[];
  contextBlock: string;
  emptyNotice: string | null;
}> {
  const userId = normalizeUserKey(params.userId);
  const topK = Math.max(1, Math.min(params.topK ?? 5, 10));
  const query = String(params.query || '').trim();
  if (!query) {
    return {
      hasDocuments: false,
      matched: false,
      citations: [],
      contextBlock: '',
      emptyNotice: null,
    };
  }

  let allChunks: V2DocumentChunkRecord[] = [];
  if (customRagAdapter) {
    allChunks = await customRagAdapter.listDocumentChunks(userId);
  } else if (isSupabaseV2Configured()) {
    const qEmb = await embedV2Text(query);
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc(
      'match_v2_document_chunks',
      {
        query_embedding: toPgVectorLiteral(qEmb.embedding),
        match_user_id: userId,
        match_count: topK,
      }
    );
    if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
      const citations: V2RagCitation[] = rpcData
        .map((r: Record<string, unknown>) => ({
          docId: String(r.doc_id || ''),
          fileName: String(r.file_name || 'document'),
          chunkIndex: Number(r.chunk_index) || 0,
          score: Number(r.similarity) || 0,
          excerpt: String(r.content || '').slice(0, 600),
        }))
        .filter((c) => c.score >= 0.15 || lexicalOverlapScore(query, c.excerpt) > 0);
      if (citations.length > 0) {
        const contextBlock = [
          '=== V2 KNOWLEDGE BASE SOURCES ===',
          ...citations.map(
            (c, i) => `[Source ${i + 1}: ${c.fileName} #${c.chunkIndex + 1}]\n${c.excerpt}`
          ),
        ].join('\n\n');
        return {
          hasDocuments: true,
          matched: true,
          citations,
          contextBlock,
          emptyNotice: null,
        };
      }
    }
    const { data: rows } = await supabaseAdmin
      .from('smfta_v2_document_chunks')
      .select('id,user_id,doc_id,file_name,mime_type,chunk_index,content,embedding,metadata,created_at')
      .eq('user_id', userId)
      .limit(500);
    if (Array.isArray(rows)) {
      allChunks = rows.map((r) => ({
        id: String(r.id),
        userId: String(r.user_id),
        docId: String(r.doc_id),
        fileName: String(r.file_name),
        mimeType: String(r.mime_type || 'text/plain'),
        chunkIndex: Number(r.chunk_index) || 0,
        content: String(r.content || ''),
        embedding: parsePgVector(r.embedding),
        metadata: (r.metadata as Record<string, Json>) || {},
        createdAt: String(r.created_at || ''),
      }));
    }
  } else {
    allChunks = instanceChunksStore.get(userId) || [];
  }

  if (allChunks.length === 0) {
    return {
      hasDocuments: false,
      matched: false,
      citations: [],
      contextBlock: '',
      emptyNotice: null,
    };
  }

  const qEmb = await embedV2Text(query);
  const scored = allChunks
    .map((chunk) => {
      const vecScore = cosineSimilarity(qEmb.embedding, chunk.embedding || []);
      const lexScore = lexicalOverlapScore(query, chunk.content);
      const score = vecScore * 0.65 + lexScore * 0.35;
      return { chunk, score, lexScore };
    })
    .filter((item) => item.lexScore > 0 || item.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (scored.length === 0) {
    return {
      hasDocuments: true,
      matched: false,
      citations: [],
      contextBlock: '',
      emptyNotice:
        'আপলোড করা V2 ডকুমেন্টগুলোতে এই প্রশ্নের সরাসরি প্রাসঙ্গিক কোনো তথ্য পাওয়া যায়নি।',
    };
  }

  const citations: V2RagCitation[] = scored.map((s) => ({
    docId: s.chunk.docId,
    fileName: s.chunk.fileName,
    chunkIndex: s.chunk.chunkIndex,
    score: Number(s.score.toFixed(4)),
    excerpt: s.chunk.content.slice(0, 800),
  }));

  const contextBlock = [
    '=== V2 KNOWLEDGE BASE SOURCES (Cite exact filename & chunk when used) ===',
    ...citations.map(
      (c, idx) => `[Source ${idx + 1}: ${c.fileName} #${c.chunkIndex + 1}]\n${c.excerpt}`
    ),
  ].join('\n\n');

  return {
    hasDocuments: true,
    matched: true,
    citations,
    contextBlock,
    emptyNotice: null,
  };
}

// ============================================================================
// V2 MEMORY CRUD (DB ROW + VECTOR EMBEDDING)
// ============================================================================

export async function listV2Memories(userId?: string | null): Promise<V2MemoryRecord[]> {
  const key = normalizeUserKey(userId);
  if (customRagAdapter) {
    return customRagAdapter.listMemories(key);
  }
  if (isSupabaseV2Configured()) {
    const { data, error } = await supabaseAdmin
      .from('smfta_v2_memories')
      .select('id,user_id,content,embedding,pinned,updated_at,created_at')
      .eq('user_id', key)
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      return data.map((row) => ({
        id: String(row.id),
        userId: String(row.user_id),
        content: String(row.content || ''),
        embedding: parsePgVector(row.embedding),
        pinned: Boolean(row.pinned),
        updatedAt: String(row.updated_at || ''),
        createdAt: String(row.created_at || ''),
      }));
    }
  }
  return [...(instanceMemoriesStore.get(key) || [])];
}

export async function addV2Memory(params: {
  userId?: string | null;
  content: string;
  pinned?: boolean;
}): Promise<V2MemoryRecord> {
  const key = normalizeUserKey(params.userId);
  const content = String(params.content || '').trim();
  if (!content) {
    throw new Error('Memory content cannot be empty.');
  }
  const { embedding } = await embedV2Text(content);
  const nowIso = new Date().toISOString();
  const record: V2MemoryRecord = {
    id: crypto.randomUUID(),
    userId: key,
    content,
    embedding,
    pinned: Boolean(params.pinned),
    updatedAt: nowIso,
    createdAt: nowIso,
  };

  if (customRagAdapter) {
    return customRagAdapter.insertMemory(record);
  }
  if (isSupabaseV2Configured()) {
    const { data, error } = await supabaseAdmin
      .from('smfta_v2_memories')
      .insert({
        id: record.id,
        user_id: key,
        content: record.content,
        embedding: toPgVectorLiteral(record.embedding),
        pinned: record.pinned,
        updated_at: nowIso,
        created_at: nowIso,
      })
      .select('id,user_id,content,embedding,pinned,updated_at,created_at')
      .single();
    if (error) throw new Error(`Supabase V2 memory insert failed: ${error.message}`);
    return {
      id: String(data.id),
      userId: String(data.user_id),
      content: String(data.content),
      embedding: parsePgVector(data.embedding),
      pinned: Boolean(data.pinned),
      updatedAt: String(data.updated_at),
      createdAt: String(data.created_at),
    };
  }
  const existing = instanceMemoriesStore.get(key) || [];
  existing.unshift(record);
  instanceMemoriesStore.set(key, existing);
  return record;
}

export async function updateV2Memory(params: {
  userId?: string | null;
  id: string;
  content?: string;
  pinned?: boolean;
}): Promise<V2MemoryRecord | null> {
  const key = normalizeUserKey(params.userId);
  const nextContent =
    typeof params.content === 'string' ? params.content.trim() : undefined;
  let nextEmbedding: number[] | undefined;
  if (nextContent !== undefined) {
    if (!nextContent) throw new Error('Updated memory content cannot be empty.');
    nextEmbedding = (await embedV2Text(nextContent)).embedding;
  }

  if (customRagAdapter) {
    return customRagAdapter.updateMemory(key, params.id, {
      ...(nextContent !== undefined ? { content: nextContent, embedding: nextEmbedding } : {}),
      ...(typeof params.pinned === 'boolean' ? { pinned: params.pinned } : {}),
    });
  }

  if (isSupabaseV2Configured()) {
    const patch: Database['public']['Tables']['smfta_v2_memories']['Update'] = { updated_at: new Date().toISOString() };
    if (nextContent !== undefined && nextEmbedding) {
      patch.content = nextContent;
      patch.embedding = toPgVectorLiteral(nextEmbedding);
    }
    if (typeof params.pinned === 'boolean') {
      patch.pinned = params.pinned;
    }
    const { data, error } = await supabaseAdmin
      .from('smfta_v2_memories')
      .update(patch)
      .eq('user_id', key)
      .eq('id', params.id)
      .select('id,user_id,content,embedding,pinned,updated_at,created_at')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      id: String(data.id),
      userId: String(data.user_id),
      content: String(data.content),
      embedding: parsePgVector(data.embedding),
      pinned: Boolean(data.pinned),
      updatedAt: String(data.updated_at),
      createdAt: String(data.created_at),
    };
  }

  const list = instanceMemoriesStore.get(key) || [];
  const target = list.find((m) => m.id === params.id);
  if (!target) return null;
  if (nextContent !== undefined && nextEmbedding) {
    target.content = nextContent;
    target.embedding = nextEmbedding;
  }
  if (typeof params.pinned === 'boolean') {
    target.pinned = params.pinned;
  }
  target.updatedAt = new Date().toISOString();
  return { ...target };
}

export async function deleteV2Memory(
  userId: string | null | undefined,
  id: string
): Promise<boolean> {
  const key = normalizeUserKey(userId);
  if (customRagAdapter) {
    return customRagAdapter.deleteMemory(key, id);
  }
  if (isSupabaseV2Configured()) {
    const { data, error } = await supabaseAdmin
      .from('smfta_v2_memories')
      .delete()
      .eq('user_id', key)
      .eq('id', id)
      .select('id');
    if (error) throw new Error(error.message);
    return Array.isArray(data) && data.length > 0;
  }
  const list = instanceMemoriesStore.get(key) || [];
  const next = list.filter((m) => m.id !== id);
  instanceMemoriesStore.set(key, next);
  return next.length < list.length;
}

export async function clearAllV2Memories(
  userId?: string | null
): Promise<{ deletedCount: number }> {
  const key = normalizeUserKey(userId);
  if (customRagAdapter) {
    const deletedCount = await customRagAdapter.clearAllMemories(key);
    return { deletedCount };
  }
  if (isSupabaseV2Configured()) {
    const { data, error } = await supabaseAdmin
      .from('smfta_v2_memories')
      .delete()
      .eq('user_id', key)
      .select('id');
    if (error) throw new Error(error.message);
    return { deletedCount: Array.isArray(data) ? data.length : 0 };
  }
  const existing = instanceMemoriesStore.get(key) || [];
  instanceMemoriesStore.delete(key);
  return { deletedCount: existing.length };
}

export async function retrieveRelevantV2Memories(params: {
  userId?: string | null;
  query: string;
  topK?: number;
}): Promise<string[]> {
  const memories = await listV2Memories(params.userId);
  if (memories.length === 0) return [];
  const topK = Math.max(1, Math.min(params.topK ?? 6, 12));
  const qEmb = await embedV2Text(params.query);
  const scored = memories.map((m) => {
    const sim = cosineSimilarity(qEmb.embedding, m.embedding || []);
    const lex = lexicalOverlapScore(params.query, m.content);
    const boost = m.pinned ? 0.35 : 0;
    return { m, score: sim * 0.65 + lex * 0.35 + boost };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.m.content);
}
