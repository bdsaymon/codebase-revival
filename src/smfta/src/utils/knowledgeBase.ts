import type { KnowledgeChunk, KnowledgeDocument, KnowledgeSettings } from '../types';

const KB_DB_NAME = 'smfta-knowledge-base';
const KB_STORE = 'documents';
const KB_LS_KEY = 'smfta_knowledge_docs';

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/**
 * Deterministic overlapping text chunker for RAG & Vector Search.
 */
export function chunkDocumentText(
  text: string,
  chunkSize = 600,
  chunkOverlap = 80
): string[] {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const safeSize = Math.max(120, Math.min(4000, Math.round(chunkSize)));
  const safeOverlap = Math.max(0, Math.min(Math.floor(safeSize / 2), Math.round(chunkOverlap)));
  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(clean.length, start + safeSize);
    if (end < clean.length) {
      const boundary = Math.max(
        clean.lastIndexOf('\n\n', end),
        clean.lastIndexOf('. ', end),
        clean.lastIndexOf(' ', end)
      );
      if (boundary > start + safeSize * 0.45) {
        end = boundary + 1;
      }
    }
    const slice = clean.slice(start, end).trim();
    if (slice) chunks.push(slice);
    if (end >= clean.length) break;
    start = Math.max(start + 1, end - safeOverlap);
  }
  return chunks;
}

export function buildKnowledgeChunks(
  docs: KnowledgeDocument[],
  chunkSize = 600,
  chunkOverlap = 80
): KnowledgeChunk[] {
  const all: KnowledgeChunk[] = [];
  for (const doc of docs) {
    const parts = chunkDocumentText(doc.content, chunkSize, chunkOverlap);
    parts.forEach((text, index) => {
      all.push({
        id: `${doc.id}::${index}`,
        docId: doc.id,
        docTitle: doc.title,
        index,
        text,
        tokens: tokenize(text).length,
      });
    });
  }
  return all;
}

export interface KnowledgeSearchHit {
  chunk: KnowledgeChunk;
  score: number;
  matchedTerms: string[];
}

/**
 * Pure hybrid TF-IDF Cosine Similarity + Exact Substring Boost ranker.
 * Runs fast on-device in browser and in Node.js unit tests without any external API.
 */
export function searchKnowledgeChunks(
  query: string,
  chunks: KnowledgeChunk[],
  options?: { topK?: number; minScore?: number; vectorSearchEnabled?: boolean }
): KnowledgeSearchHit[] {
  const qClean = String(query || '').trim();
  if (!qClean || chunks.length === 0) return [];
  const queryTerms = tokenize(qClean);
  if (queryTerms.length === 0) return [];

  const topK = Math.max(1, Math.min(20, options?.topK ?? 4));
  const minScore = options?.minScore ?? 0.08;
  const vectorMode = options?.vectorSearchEnabled !== false;

  const docCount = chunks.length;
  const chunkTokensList = chunks.map((c) => tokenize(`${c.docTitle} ${c.text}`));

  if (!vectorMode) {
    // Pure keyword match mode
    const scored = chunks
      .map((chunk, i) => {
        const terms = new Set(chunkTokensList[i]);
        const matched = queryTerms.filter((t) => terms.has(t));
        const lowerText = chunk.text.toLowerCase();
        const phraseBonus = lowerText.includes(qClean.toLowerCase()) ? 0.35 : 0;
        const score = Number(
          Math.min(1, matched.length / queryTerms.length + phraseBonus).toFixed(4)
        );
        return { chunk, score, matchedTerms: Array.from(new Set(matched)) };
      })
      .filter((hit) => hit.score >= minScore && hit.matchedTerms.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    return scored;
  }

  // Document frequency for TF-IDF weighting
  const df = new Map<string, number>();
  for (const tokens of chunkTokensList) {
    const unique = new Set(tokens);
    for (const term of unique) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }

  const idf = (term: string) => Math.log((docCount + 1) / ((df.get(term) || 0) + 1)) + 1;

  // Build normalized query vector
  const qFreq = new Map<string, number>();
  for (const t of queryTerms) qFreq.set(t, (qFreq.get(t) || 0) + 1);
  const qVec = new Map<string, number>();
  let qNormSq = 0;
  for (const [term, count] of qFreq.entries()) {
    const w = (1 + Math.log(count)) * idf(term);
    qVec.set(term, w);
    qNormSq += w * w;
  }
  const qNorm = Math.sqrt(qNormSq) || 1;

  const hits: KnowledgeSearchHit[] = [];
  const lowerQuery = qClean.toLowerCase();

  for (let i = 0; i < chunks.length; i += 1) {
    const tokens = chunkTokensList[i];
    if (tokens.length === 0) continue;
    const dFreq = new Map<string, number>();
    for (const t of tokens) dFreq.set(t, (dFreq.get(t) || 0) + 1);

    let dot = 0;
    let dNormSq = 0;
    const matchedTerms: string[] = [];

    for (const [term, count] of dFreq.entries()) {
      const w = (1 + Math.log(count)) * idf(term);
      dNormSq += w * w;
      const qw = qVec.get(term);
      if (qw) {
        dot += w * qw;
        matchedTerms.push(term);
      }
    }

    if (matchedTerms.length === 0) continue;
    const dNorm = Math.sqrt(dNormSq) || 1;
    const cosine = dot / (qNorm * dNorm);
    const phraseBonus = chunks[i].text.toLowerCase().includes(lowerQuery) ? 0.18 : 0;
    const titleBonus = chunks[i].docTitle.toLowerCase().includes(lowerQuery) ? 0.12 : 0;
    const score = Number(Math.min(1, cosine + phraseBonus + titleBonus).toFixed(4));

    if (score >= minScore) {
      hits.push({
        chunk: chunks[i],
        score,
        matchedTerms,
      });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, topK);
}

export function buildKnowledgePromptContext(
  query: string,
  docs: KnowledgeDocument[],
  settings?: KnowledgeSettings
): { promptContext: string; hits: KnowledgeSearchHit[] } {
  if (!settings?.enabled || docs.length === 0 || !query.trim()) {
    return { promptContext: '', hits: [] };
  }
  const chunks = buildKnowledgeChunks(
    docs,
    settings.chunkSize || 600,
    settings.chunkOverlap || 80
  );
  const hits = searchKnowledgeChunks(query, chunks, {
    topK: settings.topK ?? 4,
    minScore: settings.minScore ?? 0.12,
    vectorSearchEnabled: settings.vectorSearchEnabled !== false,
  });
  if (hits.length === 0) return { promptContext: '', hits: [] };

  const sections = hits.map(
    (h, idx) =>
      `[${idx + 1}] Document "${h.chunk.docTitle}" (score ${h.score.toFixed(2)}):\n${h.chunk.text}`
  );
  return {
    promptContext: `[KNOWLEDGE BASE CONTEXT]\nUse these verified user documents when relevant:\n${sections.join('\n\n')}`,
    hits,
  };
}

function openKbDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(KB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KB_STORE)) {
        db.createObjectStore(KB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('KB IndexedDB open failed'));
  });
}

export async function loadKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  try {
    const db = await openKbDb();
    const docs = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(KB_STORE, 'readonly');
      const req = tx.objectStore(KB_STORE).get('all_docs');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (Array.isArray(docs)) return docs as KnowledgeDocument[];
  } catch {
    // Fallback to localStorage below
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(KB_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as KnowledgeDocument[];
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export async function saveKnowledgeDocuments(docs: KnowledgeDocument[]): Promise<void> {
  try {
    const db = await openKbDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KB_STORE, 'readwrite');
      const req = tx.objectStore(KB_STORE).put(docs, 'all_docs');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // fallback below
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KB_LS_KEY, JSON.stringify(docs));
    }
  } catch {
    // ignore quota error on very large documents
  }
}

export function createKnowledgeDocument(input: {
  title: string;
  content: string;
  mimeType?: string;
  tags?: string[];
  chunkSize?: number;
  chunkOverlap?: number;
}): KnowledgeDocument {
  const now = Date.now();
  const content = String(input.content || '').trim();
  const chunks = chunkDocumentText(content, input.chunkSize ?? 600, input.chunkOverlap ?? 80);
  const sizeBytes =
    typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(content).byteLength
      : content.length * 2;
  return {
    id: `kb-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: String(input.title || 'Untitled Document').trim().slice(0, 140),
    mimeType: input.mimeType || 'text/plain',
    sizeBytes,
    content,
    chunkCount: chunks.length,
    createdAt: now,
    updatedAt: now,
    tags: input.tags || [],
  };
}
