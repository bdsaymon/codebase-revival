/**
 * SMFTA AI Pro — ZIP project engine 🗂️ (v18.6.0)
 *
 * The user asked for real power over zip files:
 *   "সে যেন জিপ ফাইল আপডেট করতে পারে এবং জিপ ফাইল রান করাতে পারে"
 *
 * This module reads a .zip into a tiny in-memory project, lets the assistant
 * replace/add files at **exact paths**, repacks a fresh .zip for download, and
 * builds a runnable preview (relative CSS/JS inlined) for the Live Preview.
 *
 * Pure functions around `fflate` — browser and node safe, fully testable.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export interface ProjectFile {
  /** Normalised, forward-slash relative path (e.g. `src/index.html`). */
  path: string;
  /** Text content for text files. */
  text?: string;
  /** Raw bytes for binary assets (images, fonts…). */
  bytes?: Uint8Array;
  binary?: boolean;
  size: number;
}

export interface Project {
  name: string;
  files: ProjectFile[];
  /** Path of the HTML entry file that `Run` previews, if any. */
  entry: string | null;
  createdAt: number;
}

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 25_000_000; // 25 MB per file
const MAX_TOTAL_BYTES = 120_000_000; // 120 MB per project

const SKIP_DIR_RX =
  /^(?:__MACOSX|node_modules|\.git|dist|build|\.next|coverage|\.cache)(?:\/|$)/i;

const TEXT_RX =
  /\.(?:html?|xhtml|css|scss|sass|less|js|mjs|cjs|jsx|ts|tsx|json|json5|md|markdown|txt|csv|tsv|svg|xml|ya?ml|toml|ini|env|gitignore|py|rb|php|java|kt|kts|c|h|cc|cpp|hpp|cs|go|rs|swift|sh|bash|zsh|sql|vue|svelte|astro|graphql|gql|lock)$/i;

export function isTextPath(path: string): boolean {
  return TEXT_RX.test(path) || /(?:^|\/)(?:README|LICENSE|Dockerfile|Makefile)$/i.test(path);
}

export function normalizePath(path: string): string {
  return (path || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

/** Size caps so a huge archive can never freeze the tab. */
export function shouldSkipEntry(path: string, size: number): boolean {
  const p = normalizePath(path);
  if (!p || p.endsWith('/')) return true;
  if (SKIP_DIR_RX.test(p)) return true;
  if (size > MAX_FILE_BYTES) return true;
  return false;
}

/** Reads a .zip buffer into a project. Throws a readable error on bad input. */
export function readZipProject(
  data: Uint8Array | ArrayBuffer,
  name = 'project.zip'
): Project {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 4) throw new Error('ZIP ফাইলটি খালি বা ক্ষতিগ্রস্ত।');
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes);
  } catch {
    throw new Error('ZIP ফাইলটি পড়া যায়নি — ফাইলটি কি সত্যিই .zip?');
  }

  const files: ProjectFile[] = [];
  let total = 0;
  for (const [rawPath, content] of Object.entries(raw)) {
    const path = normalizePath(rawPath);
    const size = content?.length || 0;
    if (shouldSkipEntry(path, size)) continue;
    if (total + size > MAX_TOTAL_BYTES) break;
    total += size;
    if (files.length >= MAX_FILES) break;
    if (isTextPath(path)) {
      let text = '';
      try {
        text = strFromU8(content);
      } catch {
        files.push({ path, bytes: content, binary: true, size });
        continue;
      }
      files.push({ path, text, size });
    } else {
      files.push({ path, bytes: content, binary: true, size });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    name,
    files,
    entry: findEntryFile(files.map((f) => f.path)),
    createdAt: Date.now(),
  };
}

/** Picks the most likely runnable HTML entry (root index.html first). */
export function findEntryFile(paths: string[]): string | null {
  const html = paths.filter((p) => /\.html?$/i.test(p));
  if (html.length === 0) return null;
  const score = (p: string) => {
    const depth = p.split('/').length - 1;
    const base = p.split('/').pop() || '';
    let s = depth * 10;
    if (/^index\.html?$/i.test(base)) s -= 5;
    if (/^(main|app|home)\.html?$/i.test(base)) s -= 2;
    return s;
  };
  return [...html].sort((a, b) => score(a) - score(b))[0];
}

export function getFile(project: Project, path: string): ProjectFile | undefined {
  const p = normalizePath(path);
  return project.files.find((f) => f.path === p);
}

/**
 * Applies path-exact edits to the project. New paths are created, existing ones
 * replaced. Returns the new project plus a human summary of what changed.
 */
export function updateProjectFiles(
  project: Project,
  edits: Array<{ path: string; content: string }>
): { project: Project; changed: string[]; created: string[] } {
  const changed: string[] = [];
  const created: string[] = [];
  const next = new Map(project.files.map((f) => [f.path, { ...f }]));

  for (const edit of edits) {
    const path = normalizePath(edit.path);
    if (!path) continue;
    const content = edit.content ?? '';
    const existing = next.get(path);
    next.set(path, {
      path,
      text: content,
      binary: false,
      size: strToU8(content).length,
    });
    if (existing) changed.push(path);
    else created.push(path);
  }

  const files = [...next.values()].sort((a, b) => a.path.localeCompare(b.path));
  return {
    project: {
      ...project,
      files,
      entry: findEntryFile(files.map((f) => f.path)),
    },
    changed,
    created,
  };
}

/** Repacks the project into a downloadable .zip. */
export function writeZipProject(project: Project): Uint8Array {
  const payload: Record<string, Uint8Array> = {};
  for (const file of project.files) {
    payload[file.path] = file.bytes ?? strToU8(file.text ?? '');
  }
  return zipSync(payload, { level: 6 });
}

export function downloadZipProject(project: Project): void {
  if (typeof document === 'undefined') return;
  const bytes = writeZipProject(project);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = (project.name || 'project').replace(/\.zip$/i, '').replace(/[^\w\u0980-\u09FF.-]+/g, '-');
  a.href = url;
  a.download = `${safe}-updated.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function resolveRelative(fromPath: string, href: string): string {
  const clean = href.split('#')[0].split('?')[0].trim();
  if (!clean || /^(?:[a-z]+:)?\/\//i.test(clean) || clean.startsWith('data:')) return '';
  const base = clean.startsWith('/') ? '' : dirOf(fromPath);
  const parts = (base ? `${base}/${clean.replace(/^\.?\//, '')}` : clean.replace(/^\.?\//, '')).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

export interface ProjectPreview {
  html: string;
  inlined: string[];
  missing: string[];
}

/**
 * Builds a self-contained HTML document for the Live Preview by inlining the
 * project's local CSS/JS (a sandboxed iframe has no access to the zip).
 */
export function buildProjectPreview(project: Project): ProjectPreview {
  const entry = project.entry || findEntryFile(project.files.map((f) => f.path));
  if (!entry) throw new Error('এই ZIP-এ কোনো HTML ফাইল নেই — Run করার মতো পেজ পাওয়া গেল না।');
  const entryFile = getFile(project, entry);
  if (!entryFile || entryFile.text === undefined) {
    throw new Error('এন্ট্রি HTML ফাইলটি পড়া যায়নি।');
  }

  let html = entryFile.text;
  const inlined: string[] = [];
  const missing: string[] = [];

  html = html.replace(
    /<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi,
    (tag, href: string) => {
      if (!/stylesheet/i.test(tag)) return tag;
      const target = resolveRelative(entry, href);
      if (!target) return tag;
      const file = getFile(project, target);
      if (file?.text === undefined) {
        missing.push(target);
        return tag;
      }
      inlined.push(target);
      return `<style data-from="${target}">\n${file.text}\n</style>`;
    }
  );

  html = html.replace(
    /<script\b([^>]*)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (tag, pre: string, src: string) => {
      const target = resolveRelative(entry, src);
      if (!target) return tag;
      const file = getFile(project, target);
      if (file?.text === undefined) {
        missing.push(target);
        return tag;
      }
      inlined.push(target);
      const isModule = /type=["']module["']/i.test(pre);
      return `<script${isModule ? ' type="module"' : ''} data-from="${target}">\n${file.text}\n</script>`;
    }
  );

  // Resolve a few common image references to data URLs so the preview looks right.
  html = html.replace(
    /(<img\b[^>]*src=["'])([^"']+)(["'])/gi,
    (tag, pre: string, src: string, post: string) => {
      const target = resolveRelative(entry, src);
      const file = target ? getFile(project, target) : undefined;
      if (!file?.bytes) return tag;
      const mime = /\.png$/i.test(target) ? 'image/png'
        : /\.jpe?g$/i.test(target) ? 'image/jpeg'
        : /\.gif$/i.test(target) ? 'image/gif'
        : /\.svg$/i.test(target) ? 'image/svg+xml'
        : /\.webp$/i.test(target) ? 'image/webp'
        : 'application/octet-stream';
      const b64 = base64(file.bytes);
      inlined.push(target);
      return `${pre}data:${mime};base64,${b64}${post}`;
    }
  );

  return { html, inlined: [...new Set(inlined)], missing: [...new Set(missing)] };
}

function base64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // eslint-disable-next-line no-undef
  return typeof btoa === 'function'
    ? btoa(bin)
    : Buffer.from(bytes).toString('base64');
}

/** One-line summary used in the UI and in the prompt sent to the model. */
export function projectSummary(project: Project | null): string {
  if (!project) return 'কোনো ZIP প্রজেক্ট লোড নেই।';
  const names = project.files.slice(0, 8).map((f) => f.path);
  const more = project.files.length > names.length ? ` … +${project.files.length - names.length}` : '';
  return `${project.name} · ${project.files.length} ফাইল${project.entry ? ` · এন্ট্রি: ${project.entry}` : ''}\n${names.join(', ')}${more}`;
}

/**
 * Files the model is allowed to see in the prompt. Contents are trimmed so a
 * large project never blows the token budget, with explicit [full] vs [truncated]
 * coverage reporting and optional query-aware file prioritization.
 */
export function projectPromptBlock(
  project: Project | null,
  maxFiles = 80,
  maxChars = 18000,
  userQuery = ''
): string {
  if (!project) return '';
  const queryLower = (userQuery || '').toLowerCase().trim();
  const queryTokens = queryLower
    .replace(/[^\p{L}\p{N}._/-]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const orderedFiles = [...project.files];
  if (queryTokens.length > 0) {
    orderedFiles.sort((a, b) => {
      const scoreFile = (f: ProjectFile) => {
        let s = 0;
        const pLower = f.path.toLowerCase();
        for (const qt of queryTokens) {
          if (pLower.includes(qt)) s += 30;
          else if (f.text && f.text.toLowerCase().includes(qt)) s += 10;
        }
        if (project.entry && f.path === project.entry) s += 5;
        return s;
      };
      return scoreFile(b) - scoreFile(a) || a.path.localeCompare(b.path);
    });
  }

  const lines: string[] = [
    `PROJECT (zip): ${project.name} (${project.files.length} total files)`,
    `ENTRY: ${project.entry || 'none'}`,
    'FILES:',
  ];
  let used = 0;
  let shownFiles = 0;
  for (const file of orderedFiles.slice(0, maxFiles)) {
    shownFiles += 1;
    const totalTextChars = file.text ? file.text.length : 0;
    const maxFileAllowance = queryTokens.some((qt) =>
      file.path.toLowerCase().includes(qt)
    )
      ? 4000
      : 1400;
    const availForSnippet =
      file.text && used < maxChars
        ? Math.max(0, Math.min(maxFileAllowance, maxChars - used))
        : 0;
    const snippet = file.text ? file.text.slice(0, availForSnippet) : '';
    const omitted = Math.max(0, totalTextChars - snippet.length);
    const coverageLabel = file.binary
      ? 'binary'
      : omitted === 0
        ? `full: ${totalTextChars} chars`
        : `truncated: ${snippet.length}/${totalTextChars} chars, ${omitted} omitted`;

    const head = `- ${file.path} (${file.size}B, ${coverageLabel})`;
    lines.push(head);
    used += head.length;
    if (snippet) {
      lines.push(snippet);
      used += snippet.length;
    }
    if (used >= maxChars) break;
  }
  if (project.files.length > shownFiles) {
    lines.push(
      `... (${project.files.length - shownFiles} additional files in archive not expanded in this window)`
    );
  }
  lines.push(
    'EDIT PROTOCOL: to change a file, output a block ⟦FILE:exact/path⟧ complete new file content ⟦/FILE⟧. Never use partial diffs; always write the whole file. Create new files by using a new path.'
  );
  return lines.join('\n');
}

/** Reads `⟦FILE:path⟧…⟦/FILE⟧` blocks produced by the model. */
export function parseFileEdits(
  text: string
): { edits: Array<{ path: string; content: string }>; cleanText: string } {
  const edits: Array<{ path: string; content: string }> = [];
  const cleanText = (text || '').replace(
    /⟦FILE:([^\n⟧]+)⟧\r?\n?([\s\S]*?)⟦\/FILE⟧/g,
    (_m, rawPath: string, content: string) => {
      const path = normalizePath(rawPath);
      if (path) edits.push({ path, content: String(content || '').replace(/\s+$/, '') });
      return '';
    }
  );
  return { edits, cleanText: cleanText.trim() };
}
