import { isPreviewableLanguage } from '../components/ClaudeArtifactPanel';

export const USER_PROMPT_COLLAPSE_CHAR_LIMIT = 180;
export const USER_PROMPT_COLLAPSE_LINE_LIMIT = 3;

export const CODE_BLOCK_COLLAPSE_LINE_LIMIT = 12;
export const CODE_BLOCK_COLLAPSE_CHAR_LIMIT = 500;

export function shouldCollapseUserPrompt(text: string): boolean {
  const clean = String(text || '').trim();
  if (!clean) return false;
  if (clean.length > USER_PROMPT_COLLAPSE_CHAR_LIMIT) return true;
  const lineCount = clean.split(/\r?\n/).length;
  return lineCount > USER_PROMPT_COLLAPSE_LINE_LIMIT;
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
