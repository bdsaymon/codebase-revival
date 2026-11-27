import { isPreviewableLanguage } from '../components/ClaudeArtifactPanel';

export const USER_PROMPT_COLLAPSE_CHAR_LIMIT = 800;
export const USER_PROMPT_COLLAPSE_LINE_LIMIT = 12;

export const LONG_PASTE_CHAR_THRESHOLD = 1500;
export const LONG_PASTE_LINE_THRESHOLD = 25;

export const MAX_PENDING_FILES = 15;
export const MAX_PENDING_IMAGES = 3;

export const CODE_BLOCK_COLLAPSE_LINE_LIMIT = 12;
export const CODE_BLOCK_COLLAPSE_CHAR_LIMIT = 500;

export function shouldCollapseUserPrompt(
  text: string,
  hasAttachments = false
): boolean {
  if (hasAttachments) return false;
  const clean = String(text || '').trim();
  if (!clean) return false;
  if (clean.length > USER_PROMPT_COLLAPSE_CHAR_LIMIT) return true;
  const lineCount = clean.split(/\r?\n/).length;
  return lineCount > USER_PROMPT_COLLAPSE_LINE_LIMIT;
}

export interface LongPasteDecision {
  convertToFile: boolean;
  charCount: number;
  lineCount: number;
  filename: string;
}

export function evaluateLongPasteToFile(
  pastedText: string,
  hasClipboardFiles = false,
  nextPasteIndex = 1
): LongPasteDecision {
  const raw = String(pastedText ?? '');
  const charCount = raw.length;
  const lineCount = raw.length > 0 ? raw.split(/\r?\n/).length : 0;
  const safeIndex = Math.max(1, Math.floor(nextPasteIndex) || 1);
  const filename = `Pasted text ${safeIndex}.txt`;

  if (hasClipboardFiles || charCount === 0) {
    return {
      convertToFile: false,
      charCount,
      lineCount,
      filename,
    };
  }

  const convertToFile =
    charCount > LONG_PASTE_CHAR_THRESHOLD ||
    lineCount > LONG_PASTE_LINE_THRESHOLD;

  return {
    convertToFile,
    charCount,
    lineCount,
    filename,
  };
}

export interface AttachmentCardMeta {
  name: string;
  content: string;
  typeBadge: string;
  title: string;
  lineCount: number;
  byteCount: number;
  sizeKbLabel: string;
  metaLabel: string;
}

export function formatAttachmentKilobytes(byteCount: number): string {
  const safeBytes = Math.max(0, Number(byteCount) || 0);
  const kb = safeBytes / 1024;
  if (kb === 0) return '0.0 KB';
  if (kb < 0.1) return '0.1 KB';
  if (kb >= 100) return `${Math.round(kb)} KB`;
  return `${kb.toFixed(1)} KB`;
}

export function inferAttachmentTypeBadge(filename: string): string {
  const raw = String(filename || '').trim();
  const dotIdx = raw.lastIndexOf('.');
  if (dotIdx > 0 && dotIdx < raw.length - 1) {
    const ext = raw.slice(dotIdx + 1).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (ext) return ext.slice(0, 5);
  }
  return 'TXT';
}

export function inferAttachmentCardTitle(
  content: string,
  fallback = 'Pasted text'
): string {
  const raw = String(content ?? '');
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed.length > 40 ? trimmed.slice(0, 40) : trimmed;
    }
  }
  const cleanFallback = String(fallback || 'Pasted text').trim() || 'Pasted text';
  return cleanFallback.length > 40 ? cleanFallback.slice(0, 40) : cleanFallback;
}

export function buildAttachmentCardMeta(input: {
  name: string;
  content: string;
  sizeBytes?: number;
}): AttachmentCardMeta {
  const name = String(input.name || 'Pasted text 1.txt').trim() || 'Pasted text 1.txt';
  const content = String(input.content ?? '');
  const lineCount = content.length > 0 ? content.split(/\r?\n/).length : 1;
  const computedBytes = new TextEncoder().encode(content).length;
  const byteCount =
    typeof input.sizeBytes === 'number' && input.sizeBytes > 0
      ? input.sizeBytes
      : computedBytes;
  const sizeKbLabel = formatAttachmentKilobytes(byteCount);
  const typeBadge = inferAttachmentTypeBadge(name);
  const title = inferAttachmentCardTitle(content, 'Pasted text');
  const lineWord = lineCount === 1 ? '1 line' : `${lineCount} lines`;
  const metaLabel = `${lineWord} · ${sizeKbLabel}`;

  return {
    name,
    content,
    typeBadge,
    title,
    lineCount,
    byteCount,
    sizeKbLabel,
    metaLabel,
  };
}

export function extractAttachedFilesFromMessage(
  rawMessageText: string
): AttachmentCardMeta[] {
  const text = String(rawMessageText ?? '');
  if (!text.includes('⟦FILE:')) return [];
  const results: AttachmentCardMeta[] = [];
  const regex = /⟦FILE:([^\n⟦]+)⟧\n?([\s\S]*?)\n?⟦\/FILE⟧/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const name = (match[1] || '').trim() || `Attachment ${results.length + 1}.txt`;
    const body = match[2] ?? '';
    results.push(
      buildAttachmentCardMeta({
        name,
        content: body,
      })
    );
  }
  return results;
}

export interface CodeBlockDisplayMeta {
  collapseByDefault: boolean;
  lineCount: number;
  byteCount: number;
  sizeLabel: string;
  inferredTitle: string;
  canLivePreview: boolean;
}

const LANG_DISPLAY_TITLES: Record<string, string> = {
  html: 'HTML Document',
  htm: 'HTML Document',
  svg: 'SVG Vector Graphic',
  css: 'Stylesheet',
  scss: 'SCSS Stylesheet',
  javascript: 'JavaScript Module',
  js: 'JavaScript Module',
  typescript: 'TypeScript Module',
  ts: 'TypeScript Module',
  tsx: 'React TSX Component',
  jsx: 'React JSX Component',
  react: 'React Component',
  python: 'Python Script',
  py: 'Python Script',
  json: 'JSON Data',
  sql: 'SQL Query',
  bash: 'Shell Commands',
  sh: 'Shell Commands',
  markdown: 'Markdown Document',
  md: 'Markdown Document',
  csv: 'CSV Table',
};

export function inferCodeBlockTitle(content: string, lang?: string): string {
  const normLang = String(lang || 'code').trim().toLowerCase();
  const trimmed = String(content || '').trim();

  // Check if there's an HTML <title> inside
  if (normLang === 'html' || normLang === 'htm') {
    const titleMatch = trimmed.match(/<title>([^<]{2,60})<\/title>/i);
    if (titleMatch?.[1]?.trim()) {
      return titleMatch[1].trim();
    }
  }

  // Check for React component or top function export name
  if (['tsx', 'jsx', 'ts', 'js', 'typescript', 'javascript', 'react'].includes(normLang)) {
    const exportMatch = trimmed.match(
      /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9_]{1,40}|[a-z][A-Za-z0-9_]{2,40})/
    );
    if (exportMatch?.[1]) {
      return `${exportMatch[1]} (${normLang.toUpperCase()})`;
    }
  }

  return LANG_DISPLAY_TITLES[normLang] || `${(normLang || 'CODE').toUpperCase()} Snippet`;
}

export function getCodeBlockDisplayMeta(
  content: string,
  lang?: string
): CodeBlockDisplayMeta {
  const raw = String(content || '');
  const normLang = String(lang || 'code').trim().toLowerCase();
  const lineCount = raw ? raw.split(/\r?\n/).length : 0;
  const byteCount = new TextEncoder().encode(raw).length;
  const sizeLabel =
    byteCount >= 1024 ? `${(byteCount / 1024).toFixed(1)} KB` : `${byteCount} B`;
  const canLivePreview = isPreviewableLanguage(normLang, raw);
  const collapseByDefault =
    lineCount > CODE_BLOCK_COLLAPSE_LINE_LIMIT ||
    raw.length > CODE_BLOCK_COLLAPSE_CHAR_LIMIT ||
    (canLivePreview && lineCount > 6);

  return {
    collapseByDefault,
    lineCount,
    byteCount,
    sizeLabel,
    inferredTitle: inferCodeBlockTitle(raw, normLang),
    canLivePreview,
  };
}
