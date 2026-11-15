import { Router, Request, Response } from '../runtime/express';
import { listLiveGeminiModels } from '../v2FirebaseAi';
import {
  addV2Memory,
  clearAllV2Memories,
  deleteV2Document,
  deleteV2Memory,
  ingestV2Document,
  listV2DocumentSummaries,
  listV2Memories,
  retrieveV2RagContext,
  updateV2Memory,
} from '../v2Rag';

export const v2Router = Router();

function resolveV2RequestUserId(req: Request): string {
  const headerUid = String(req.headers['x-firebase-uid'] || '').trim();
  const bodyUid = String((req.body as Record<string, unknown> | undefined)?.firebaseUid || '').trim();
  const queryUid = String((req.query as Record<string, unknown> | undefined)?.firebaseUid || '').trim();
  return headerUid || bodyUid || queryUid || req.userId || 'default-user';
}

v2Router.get('/v2/models-check', async (_req: Request, res: Response) => {
  const report = await listLiveGeminiModels();
  return res.json(report);
});

// ----------------------------------------------------------------------------
// V2 Knowledge Base (RAG) Endpoints
// ----------------------------------------------------------------------------

v2Router.get('/v2/rag/documents', async (req: Request, res: Response) => {
  try {
    const userId = resolveV2RequestUserId(req);
    const documents = await listV2DocumentSummaries(userId);
    return res.json({ ok: true, documents });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to list V2 documents',
    });
  }
});

v2Router.post('/v2/rag/ingest', async (req: Request, res: Response) => {
  try {
    const userId = resolveV2RequestUserId(req);
    const { docId, fileName, mimeType, rawText, bytesBase64 } = (req.body || {}) as {
      docId?: string;
      fileName?: string;
      mimeType?: string;
      rawText?: string;
      bytesBase64?: string;
    };
    if (!fileName || (!rawText && !bytesBase64)) {
      return res.status(400).json({
        ok: false,
        error: 'fileName and either rawText or bytesBase64 are required.',
      });
    }
    const result = await ingestV2Document({
      userId,
      docId,
      fileName: String(fileName),
      mimeType: mimeType ? String(mimeType) : undefined,
      rawText,
      bytesBase64,
    });
    return res.status(result.ok ? 200 : 422).json(result);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'V2 RAG ingestion failed',
    });
  }
});

v2Router.post('/v2/rag/retrieve', async (req: Request, res: Response) => {
  try {
    const userId = resolveV2RequestUserId(req);
    const { query, topK } = (req.body || {}) as { query?: string; topK?: number };
    if (!query || !String(query).trim()) {
      return res.status(400).json({ ok: false, error: 'query is required' });
    }
    const result = await retrieveV2RagContext({
      userId,
      query: String(query),
      topK: typeof topK === 'number' ? topK : 5,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'V2 RAG retrieve failed',
    });
  }
});

v2Router.delete('/v2/rag/documents/:docId', async (req: Request, res: Response) => {
  try {
    const userId = resolveV2RequestUserId(req);
    const docId = String(req.params.docId || '').trim();
    if (!docId) {
      return res.status(400).json({ ok: false, error: 'docId is required' });
    }
    const deletedChunks = await deleteV2Document(userId, docId);
    return res.json({ ok: true, docId, deletedChunks });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to delete V2 document',
    });
  }
});

// ----------------------------------------------------------------------------
// V2 Persistent Memory CRUD (Deletes both row + vector embedding)
// ----------------------------------------------------------------------------

v2Router.get('/v2/memory', async (req: Request, res: Response) => {
  try {
    const userId = resolveV2RequestUserId(req);
    const memories = await listV2Memories(userId);
    return res.json({
      ok: true,
      memories: memories.map((m) => ({
        id: m.id,
        content: m.content,
        pinned: m.pinned,
        updatedAt: m.updatedAt,
        createdAt: m.createdAt,
        hasVector: Array.isArray(m.embedding) && m.embedding.length > 0,
      })),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to list V2 memories',
    });
  }
});

v2Router.post('/v2/memory', async (req: Request, res: Response) => {
  try {
    const userId = resolveV2RequestUserId(req);
    const { content, pinned } = (req.body || {}) as { content?: string; pinned?: boolean };
    if (!content || !String(content).trim()) {
      return res.status(400).json({ ok: false, error: 'content is required' });
    }
    const created = await addV2Memory({ userId, content: String(content), pinned: Boolean(pinned) });
    return res.json({
      ok: true,
      memory: {
        id: created.id,
        content: created.content,
        pinned: created.pinned,
        updatedAt: created.updatedAt,
        createdAt: created.createdAt,
        hasVector: created.embedding.length > 0,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to create V2 memory',
    });
  }
});

v2Router.patch('/v2/memory/:id', async (req: Request, res: Response) => {
  try {
    const userId = resolveV2RequestUserId(req);
    const id = String(req.params.id || '').trim();
    const { content, pinned } = (req.body || {}) as { content?: string; pinned?: boolean };
    if (!id) {
      return res.status(400).json({ ok: false, error: 'memory id is required' });
    }
    const updated = await updateV2Memory({ userId, id, content, pinned });
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Memory item not found' });
    }
    return res.json({
      ok: true,
      memory: {
        id: updated.id,
        content: updated.content,
        pinned: updated.pinned,
        updatedAt: updated.updatedAt,
        createdAt: updated.createdAt,
        hasVector: updated.embedding.length > 0,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to update V2 memory',
    });
  }
});

v2Router.delete('/v2/memory/:id', async (req: Request, res: Response) => {
  try {
    const userId = resolveV2RequestUserId(req);
    const id = String(req.params.id || '').trim();
    const deleted = await deleteV2Memory(userId, id);
    return res.json({ ok: true, id, deleted });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to delete V2 memory',
    });
  }
});

v2Router.delete('/v2/memory', async (req: Request, res: Response) => {
  try {
    const userId = resolveV2RequestUserId(req);
    const { deletedCount } = await clearAllV2Memories(userId);
    return res.json({ ok: true, deletedCount });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to clear V2 memories',
    });
  }
});
