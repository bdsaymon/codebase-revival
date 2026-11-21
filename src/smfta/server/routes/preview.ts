import { Router, Request, Response } from '../runtime/express';

export interface HostedWebsitePreview {
  projectId: string;
  title: string;
  html: string;
  files: Array<{ path: string; language: string; content: string }>;
  updatedAt: number;
}

const MAX_PREVIEW_HTML_CHARS = 3_000_000;

interface StoredPreviewEntry extends HostedWebsitePreview {
  ownerKey: string;
}

const memoryPreviews = new Map<string, StoredPreviewEntry>();

function isSupabasePreviewConfigured(): boolean {
  return Boolean(
    process.env['SUPABASE_URL'] && process.env['SUPABASE_SERVICE_ROLE_KEY']
  );
}

async function getAdmin() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

async function ownerKeyFor(req: Request): Promise<string> {
  const raw = String(req.userId || req.ip || 'anonymous');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

async function loadPreview(projectId: string): Promise<HostedWebsitePreview | null> {
  if (!projectId) return null;
  if (!isSupabasePreviewConfigured()) {
    const entry = memoryPreviews.get(projectId);
    if (!entry) return null;
    return {
      projectId: entry.projectId,
      title: entry.title,
      html: entry.html,
      files: entry.files,
      updatedAt: entry.updatedAt,
    };
  }
  const admin = await getAdmin();
  const { data } = await admin
    .from('smfta_published_previews')
    .select('id,title,html,files,updated_at')
    .eq('id', projectId)
    .maybeSingle();
  if (!data) return null;
  return {
    projectId: data.id,
    title: data.title,
    html: data.html,
    files: Array.isArray(data.files) ? (data.files as HostedWebsitePreview['files']) : [],
    updatedAt: new Date(data.updated_at).getTime(),
  };
}

export const previewRouter = Router();

/**
 * POST /api/preview/publish
 * Registers or updates a compiled website project on the backend so it has a
 * real, shareable and navigable Preview URL (/preview/:projectId).
 */
previewRouter.post('/api/preview/publish', async (req: Request, res: Response) => {
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

  if (html.length > MAX_PREVIEW_HTML_CHARS) {
    res.status(413).json({ ok: false, error: 'Website is too large to publish' });
    return;
  }

  const ownerKey = await ownerKeyFor(req);
  let storedId = projectId;
  const now = Date.now();

  if (!isSupabasePreviewConfigured()) {
    const existing = memoryPreviews.get(projectId);
    if (existing && existing.ownerKey !== ownerKey) {
      storedId = `${projectId}-${ownerKey.slice(0, 8)}`.slice(0, 80);
    }
    memoryPreviews.set(storedId, {
      projectId: storedId,
      ownerKey,
      title,
      html,
      files,
      updatedAt: now,
    });
    res.json({
      ok: true,
      projectId: storedId,
      previewUrl: `/preview/${storedId}`,
      previewPath: `/preview/${storedId}`,
      updatedAt: now,
    });
    return;
  }

  const admin = await getAdmin();
  const { data: existing } = await admin
    .from('smfta_published_previews')
    .select('owner_key')
    .eq('id', projectId)
    .maybeSingle();
  if (existing && existing.owner_key !== ownerKey) {
    // Someone else already owns this link: give this visitor their own link.
    storedId = `${projectId}-${ownerKey.slice(0, 8)}`.slice(0, 80);
  }

  const { error } = await admin.from('smfta_published_previews').upsert({
    id: storedId,
    owner_key: ownerKey,
    title,
    html,
    files,
  });
  if (error) {
    res.status(500).json({ ok: false, error: 'Could not publish the website preview' });
    return;
  }

  res.json({
    ok: true,
    projectId: storedId,
    previewUrl: `/preview/${storedId}`,
    previewPath: `/preview/${storedId}`,
    updatedAt: now,
  });
});

/**
 * GET /api/preview/:projectId/meta
 * Returns metadata for a published website preview project.
 */
previewRouter.get('/api/preview/:projectId/meta', async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId || '').replace(/[^\w-]/g, '').slice(0, 80);
  const entry = await loadPreview(projectId);
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
previewRouter.get('/preview/:projectId', async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId || '').replace(/[^\w-]/g, '').slice(0, 80);
  const entry = await loadPreview(projectId);

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
