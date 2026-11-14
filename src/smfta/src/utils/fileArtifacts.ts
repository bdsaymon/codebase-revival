import { zipSync, strToU8 } from 'fflate';

export interface FileArtifactItem {
  id: string;
  filename: string;
  title: string;
  lang: string;
  content: string;
  isStreaming?: boolean;
}

export const FILE_ARTIFACT_SYSTEM_DIRECTIVE = `FILE & ARTIFACT OUTPUT PROTOCOL (CLAUDE.AI STYLE):
When the user explicitly asks you to create a plan, document, report, website, code, or project AS A FILE (e.g. ".md file", ".html file", ".json", ".csv", ".py", ".zip", or multiple downloadable files):
1. Emit each complete file inside an artifact tag:
<smfta_artifact filename="exact-filename.ext" title="Short Human Title" type="markdown|html|code|json|text">
...complete file content...
</smfta_artifact>
2. For large documents/plans in .md or full HTML/code files, place the ENTIRE content inside <smfta_artifact> and write only a concise 1–3 sentence summary outside the tag.
3. If the user asks for a .zip archive or a multi-file project, emit a separate <smfta_artifact filename="path/file.ext" title="..." type="..."> block for every file in the project so the app packages them into a downloadable .zip automatically.
4. Never truncate file contents or leave placeholders.`;

function sanitizeArtifactFilename(rawName: string, fallbackExt = 'txt'): string {
  const cleaned = String(rawName || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^\/+/, '')
    .replace(/\.\.+/g, '.')
    .replace(/[\\:*?"<>|]/g, '-');
  if (!cleaned) return `artifact.${fallbackExt}`;
  return cleaned;
}

export function inferLanguageFromFilenameOrType(
  filename: string,
  explicitType?: string
): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'svg') return 'svg';
  if (ext === 'css' || ext === 'scss') return 'css';
  if (ext === 'js' || ext === 'mjs') return 'javascript';
  if (ext === 'ts') return 'typescript';
  if (ext === 'tsx') return 'tsx';
  if (ext === 'jsx') return 'jsx';
  if (ext === 'json') return 'json';
  if (ext === 'py') return 'python';
  if (ext === 'csv') return 'csv';
  if (ext === 'txt') return 'text';
  if (explicitType) return explicitType.trim().toLowerCase();
  return 'text';
}

function defaultExtForLang(lang: string): string {
  const l = lang.toLowerCase();
  if (l === 'markdown' || l === 'md') return 'md';
  if (l === 'html' || l === 'htm') return 'html';
  if (l === 'svg') return 'svg';
  if (l === 'css') return 'css';
  if (l === 'javascript' || l === 'js') return 'js';
  if (l === 'typescript' || l === 'ts') return 'ts';
  if (l === 'tsx') return 'tsx';
  if (l === 'jsx') return 'jsx';
  if (l === 'json') return 'json';
  if (l === 'python' || l === 'py') return 'py';
  if (l === 'csv') return 'csv';
  return 'txt';
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRx = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = attrRx.exec(attrString)) !== null) {
    attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? '').trim();
  }
  return attrs;
}

export interface ExtractedArtifactsResult {
  artifacts: FileArtifactItem[];
  processedText: string;
}

/**
 * Parses `<smfta_artifact ...>...</smfta_artifact>` (including active streaming blocks),
 * `⟦FILE:path⟧...⟦/FILE⟧`, and explicitly named fenced file blocks (e.g. ```markdown plan.md)
 * into clean artifact descriptors + placeholder tokens (`[[SMFTA_ARTIFACT_0]]`) for inline Claude-style file cards.
 */
export function extractFileArtifacts(
  rawText: string,
  options?: { isStreaming?: boolean }
): ExtractedArtifactsResult {
  const source = String(rawText || '');
  const artifacts: FileArtifactItem[] = [];
  let working = source;

  const pushArtifact = (item: Omit<FileArtifactItem, 'id'>): string => {
    const idx = artifacts.length;
    const id = `artifact-${idx}`;
    artifacts.push({ id, ...item });
    return `\n\n[[SMFTA_ARTIFACT_${idx}]]\n\n`;
  };

  // 1. Closed <smfta_artifact ...>...</smfta_artifact>
  working = working.replace(
    /<smfta_artifact\b([^>]*)>([\s\S]*?)<\/smfta_artifact>/gi,
    (_full, attrStr: string, inner: string) => {
      const attrs = parseAttributes(attrStr);
      const rawType = attrs.type || attrs.lang || 'markdown';
      const fallbackExt = defaultExtForLang(rawType);
      const filename = sanitizeArtifactFilename(
        attrs.filename || attrs.name || attrs.path || `document.${fallbackExt}`,
        fallbackExt
      );
      const lang = inferLanguageFromFilenameOrType(filename, rawType);
      const title = attrs.title || filename;
      const content = String(inner || '').replace(/^\r?\n/, '').replace(/\r?\n$/, '');
      return pushArtifact({ filename, title, lang, content, isStreaming: false });
    }
  );

  // 2. Unclosed streaming <smfta_artifact ...>...
  working = working.replace(
    /<smfta_artifact\b([^>]*)>([\s\S]*)$/i,
    (_full, attrStr: string, inner: string) => {
      const attrs = parseAttributes(attrStr);
      const rawType = attrs.type || attrs.lang || 'markdown';
      const fallbackExt = defaultExtForLang(rawType);
      const filename = sanitizeArtifactFilename(
        attrs.filename || attrs.name || attrs.path || `document.${fallbackExt}`,
        fallbackExt
      );
      const lang = inferLanguageFromFilenameOrType(filename, rawType);
      const title = attrs.title || filename;
      const content = String(inner || '').replace(/^\r?\n/, '');
      return pushArtifact({
        filename,
        title,
        lang,
        content,
        isStreaming: Boolean(options?.isStreaming),
      });
    }
  );

  // 3. Closed ⟦FILE:path⟧...⟦/FILE⟧ blocks
  working = working.replace(
    /⟦FILE:([^\n⟧]+)⟧\r?\n?([\s\S]*?)⟦\/FILE⟧/g,
    (_full, rawPath: string, rawContent: string) => {
      const filename = sanitizeArtifactFilename(rawPath, 'txt');
      const content = String(rawContent || '')
        .replace(/^```[^\n]*\r?\n/, '')
        .replace(/\r?\n```\s*$/, '')
        .trim();
      const lang = inferLanguageFromFilenameOrType(filename);
      return pushArtifact({
        filename,
        title: filename,
        lang,
        content,
        isStreaming: false,
      });
    }
  );

  // 4. Fenced blocks that explicitly specify a filename in the fence header (e.g. ```markdown plan.md)
  working = working.replace(
    /```([^\n`]+)\r?\n([\s\S]*?)```/g,
    (full, header: string, body: string) => {
      const parts = header.trim().split(/\s+/);
      if (parts.length < 2) return full;
      const fileToken = parts.slice(1).find((p) => /^[\w./-]+\.[a-z0-9]{1,8}$/i.test(p));
      if (!fileToken) return full;
      const filename = sanitizeArtifactFilename(fileToken, defaultExtForLang(parts[0] || 'txt'));
      const lang = inferLanguageFromFilenameOrType(filename, parts[0]);
      return pushArtifact({
        filename,
        title: filename,
        lang,
        content: String(body || '').replace(/\n$/, ''),
        isStreaming: false,
      });
    }
  );

  return {
    artifacts,
    processedText: working.replace(/\n{3,}/g, '\n\n').trim(),
  };
}

function mimeForFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (ext === 'md' || ext === 'markdown') return 'text/markdown;charset=utf-8';
  if (ext === 'html' || ext === 'htm') return 'text/html;charset=utf-8';
  if (ext === 'svg') return 'image/svg+xml;charset=utf-8';
  if (ext === 'json') return 'application/json;charset=utf-8';
  if (ext === 'csv') return 'text/csv;charset=utf-8';
  if (ext === 'css') return 'text/css;charset=utf-8';
  if (ext === 'js') return 'application/javascript;charset=utf-8';
  return 'text/plain;charset=utf-8';
}

export function downloadSingleArtifactFile(artifact: {
  filename?: string;
  lang?: string;
  content: string;
}): void {
  const ext = defaultExtForLang(artifact.lang || 'text');
  const filename = sanitizeArtifactFilename(
    artifact.filename || `file.${ext}`,
    ext
  );
  const blob = new Blob([artifact.content], { type: mimeForFilename(filename) });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadArtifactsAsZip(
  files: Array<{ filename: string; content: string }>,
  zipName = 'smfta-files.zip'
): void {
  if (!files || files.length === 0) return;
  const entries: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();
  for (const f of files) {
    let name = sanitizeArtifactFilename(f.filename, 'txt');
    if (usedNames.has(name)) {
      const dotIdx = name.lastIndexOf('.');
      const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
      const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
      let counter = 2;
      while (usedNames.has(`${base}-${counter}${ext}`)) counter++;
      name = `${base}-${counter}${ext}`;
    }
    usedNames.add(name);
    entries[name] = strToU8(f.content);
  }
  const zipped = zipSync(entries, { level: 6 });
  const blob = new Blob([new Uint8Array(zipped)], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName.endsWith('.zip') ? zipName : `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatArtifactSize(content: string): string {
  const lines = content ? content.split(/\r?\n/).length : 0;
  const bytes = new Blob([content || '']).size;
  const sizeStr =
    bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
  return `${lines} lines · ${sizeStr}`;
}
