import JSZip from 'jszip';

export interface FileArtifactItem {
  id: string;
  filename: string;
  title: string;
  lang: string;
  content: string;
  isStreaming?: boolean;
}

export const FILE_ARTIFACT_SYSTEM_DIRECTIVE = `FILE ARTIFACT & AGENT WORKSPACE PROTOCOL (CLAUDE-STYLE):
When producing code, apps, documents, data tables, charts, or multi-file projects:
1. For creating or overwriting a complete file, wrap the ENTIRE file in:
<file path="index.html" type="html">
...complete file content...
</file>
(Supported types/extensions: .md, .html, .css, .js, .ts, .tsx, .py, .json, .csv, .svg, .txt.)
2. For targeted edits to an EXISTING workspace file, prefer emitting ONLY the changed parts using:
<patch path="index.html">
<find>
exact existing lines
</find>
<replace>
updated lines
</replace>
</patch>
(You may include multiple <find>...</find><replace>...</replace> pairs inside one <patch>, and use <file_delete path="old-file.ts" /> to delete a file.)
3. AGENT PLANNING MODE: Before non-trivial multi-file or large coding tasks, emit a concise checklist right at the start of your reply inside:
<plan>
- [ ] Inspect requirements and structure
- [ ] Implement core modules
- [ ] Wire UI & verify edge cases
</plan>
Keep explanations concise outside tags and NEVER truncate or leave '// ... existing code' placeholders inside <file>.`;

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

  // 1a. Closed <file path="..." type="...">...</file>
  working = working.replace(
    /<file\b([^>]*)>([\s\S]*?)<\/file>/gi,
    (_full, attrStr: string, inner: string) => {
      const attrs = parseAttributes(attrStr);
      const rawType = attrs.type || attrs.lang || 'txt';
      const fallbackExt = defaultExtForLang(rawType);
      const filename = sanitizeArtifactFilename(
        attrs.path || attrs.filename || attrs.name || `file.${fallbackExt}`,
        fallbackExt
      );
      const lang = inferLanguageFromFilenameOrType(filename, rawType);
      const title = attrs.title || filename;
      const content = String(inner || '').replace(/^\r?\n/, '').replace(/\r?\n$/, '');
      return pushArtifact({ filename, title, lang, content, isStreaming: false });
    }
  );

  // 1b. Closed <smfta_artifact ...>...</smfta_artifact>
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

  // 2a. Unclosed streaming <file ...>...
  working = working.replace(
    /<file\b([^>]*)>([\s\S]*)$/i,
    (_full, attrStr: string, inner: string) => {
      const attrs = parseAttributes(attrStr);
      const rawType = attrs.type || attrs.lang || 'txt';
      const fallbackExt = defaultExtForLang(rawType);
      const filename = sanitizeArtifactFilename(
        attrs.path || attrs.filename || attrs.name || `file.${fallbackExt}`,
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

  // 2b. Unclosed streaming <smfta_artifact ...>...
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
  //    or in a first-line filename comment (e.g. // filename: app.js, /* styles.css */, <!-- index.html -->, # main.py)
  working = working.replace(
    /```([^\n`]*)\r?\n([\s\S]*?)```/g,
    (full, header: string, body: string) => {
      const parts = header.trim().split(/\s+/).filter(Boolean);
      const langHint = parts[0] || 'txt';
      let fileToken =
        parts.length >= 2
          ? parts.slice(1).find((p) => /^[\w./-]+\.[a-z0-9]{1,8}$/i.test(p))
          : undefined;
      let cleanBody = String(body || '').replace(/\n$/, '');

      if (!fileToken) {
        const firstLineMatch = cleanBody.match(
          /^\s*(?:\/\/|#|<!--|\/\*)\s*(?:file(?:name)?\s*[:=]\s*)?([\w./-]+\.(?:md|markdown|html|htm|svg|css|scss|js|mjs|ts|tsx|jsx|json|py|csv|sql|sh|yaml|yml|xml|txt))\s*(?:-->|\*\/)?\s*\r?\n/i
        );
        if (firstLineMatch?.[1]) {
          fileToken = firstLineMatch[1];
          cleanBody = cleanBody.slice(firstLineMatch[0].length);
        }
      }

      if (!fileToken) return full;
      const filename = sanitizeArtifactFilename(
        fileToken,
        defaultExtForLang(langHint)
      );
      const lang = inferLanguageFromFilenameOrType(filename, langHint);
      return pushArtifact({
        filename,
        title: filename,
        lang,
        content: cleanBody,
        isStreaming: false,
      });
    }
  );

  // 5. Strip partial/incomplete opening tags at the tail of an active stream so raw tags never flash
  if (options?.isStreaming) {
    working = working.replace(/<(?:file|smfta_artifact)\b[^>]*$/i, '');
  }

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

export async function downloadArtifactsAsZip(
  files: Array<{ filename: string; content: string }>,
  zipName = 'smfta-files.zip'
): Promise<void> {
  if (!files || files.length === 0) return;
  const zip = new JSZip();
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
    zip.file(name, f.content ?? '');
  }
  const blob = await zip.generateAsync({ type: 'blob' });
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
