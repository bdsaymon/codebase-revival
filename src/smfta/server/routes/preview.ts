import { Router, Request, Response } from '../runtime/express';

export interface HostedWebsitePreview {
  projectId: string;
  title: string;
  html: string;
  files: Array<{ path: string; language: string; content: string }>;
  updatedAt: number;
}

const PREVIEW_STORE_LIMIT = 100;
const previewStore = new Map<string, HostedWebsitePreview>();

function prunePreviewStore() {
  if (previewStore.size <= PREVIEW_STORE_LIMIT) return;
  const oldest = Array.from(previewStore.entries()).sort(
    (a, b) => a[1].updatedAt - b[1].updatedAt
  )[0];
  if (oldest) {
    previewStore.delete(oldest[0]);
  }
}

export const previewRouter = Router();

/**
 * POST /api/preview/publish
 * Registers or updates a compiled website project on the backend so it has a
 * real, shareable and navigable Preview URL (/preview/:projectId).
 */
previewRouter.post('/api/preview/publish', (req: Request, res: Response) => {
  const body = req.body || {};
  const rawId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
  const projectId =
    rawId.replace(/[^\w-]/g, '').slice(0, 64) ||
    `proj_${Date.now().toString(36)}`;
  const title =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 120)
      : 'SMFTA Live Website';
  const html = typeof body.html === 'string' ? body.html : '';

  if (!html.trim()) {
    res.status(400).json({
      ok: false,
      error: 'Preview HTML content is required',
    });
    return;
  }

  const files = Array.isArray(body.files)
    ? body.files
        .filter((f: unknown) => f && typeof f === 'object')
        .slice(0, 50)
        .map((f: Record<string, unknown>) => ({
          path: String(f.path || 'index.html').slice(0, 120),
          language: String(f.language || 'html').slice(0, 32),
          content: String(f.content || ''),
        }))
    : [];

  prunePreviewStore();
  previewStore.set(projectId, {
    projectId,
    title,
    html,
    files,
    updatedAt: Date.now(),
  });

  res.json({
    ok: true,
    projectId,
    previewUrl: `/preview/${projectId}`,
    updatedAt: Date.now(),
  });
});

/**
 * GET /api/preview/:projectId/meta
 * Returns metadata for a published website preview project.
 */
previewRouter.get('/api/preview/:projectId/meta', (req: Request, res: Response) => {
  const projectId = String(req.params.projectId || '').replace(/[^\w-]/g, '');
  const entry = previewStore.get(projectId);
  if (!entry) {
    res.status(404).json({ ok: false, error: 'Preview project not found' });
    return;
  }
  res.json({
    ok: true,
    projectId: entry.projectId,
    title: entry.title,
    fileCount: entry.files.length,
    files: entry.files.map((f) => ({ path: f.path, language: f.language })),
    updatedAt: entry.updatedAt,
    previewUrl: `/preview/${entry.projectId}`,
  });
});

/**
 * GET /preview/:projectId
 * Serves the live interactive website directly in the browser.
 */
previewRouter.get('/preview/:projectId', (req: Request, res: Response) => {
  const projectId = String(req.params.projectId || '').replace(/[^\w-]/g, '');
  const entry = previewStore.get(projectId);

  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' data: blob: https:; frame-ancestors 'self';"
  );
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!entry) {
    res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview Not Found — SMFTA Live Preview</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; padding: 24px; }
    .card { max-width: 460px; padding: 28px; border-radius: 16px; background: #1e293b; border: 1px solid #334155; text-align: center; }
    h1 { font-size: 20px; margin: 0 0 10px; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Live Preview Session Expired or Not Published</h1>
    <p>Open the SMFTA AI Pro Live Preview Workspace and click Refresh or Open in New Tab to publish the active website project.</p>
  </div>
</body>
</html>`);
    return;
  }

  res.status(200).send(entry.html);
});
