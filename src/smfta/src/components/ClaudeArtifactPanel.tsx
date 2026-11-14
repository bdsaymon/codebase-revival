import React, { useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  FileArchive,
  RotateCw,
  X,
} from 'lucide-react';
import {
  FileArtifactItem,
  downloadArtifactsAsZip,
  downloadSingleArtifactFile,
} from '../utils/fileArtifacts';

export interface ArtifactPayload {
  title: string;
  filename?: string;
  lang: string;
  code: string;
  bundleFiles?: FileArtifactItem[];
}

interface ClaudeArtifactPanelProps {
  artifact: ArtifactPayload | null;
  onClose: () => void;
  onSelectBundleFile?: (file: FileArtifactItem) => void;
  onToast?: (msg: string) => void;
}

const PREVIEWABLE_LANGS = new Set([
  'html',
  'htm',
  'svg',
  'xml',
  'css',
  'js',
  'javascript',
  'jsx',
  'tsx',
  'react',
  'md',
  'markdown',
]);

export function isPreviewableLanguage(lang?: string, code?: string): boolean {
  const normalized = (lang || '').trim().toLowerCase();
  if (PREVIEWABLE_LANGS.has(normalized)) return true;
  const trimmed = (code || '').trim();
  if (
    trimmed.startsWith('<!DOCTYPE html') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<svg') ||
    (trimmed.startsWith('<div') && trimmed.includes('</'))
  ) {
    return true;
  }
  return false;
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInlineMd(text: string): string {
  let out = escapeHtml(text);
  // Inline code
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  // Links
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return out;
}

function renderMarkdownToHtml(markdown: string): string {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inCode = false;
  let codeLang = '';
  let codeLines: string[] = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableHeaderDone = false;

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  const closeTable = () => {
    if (inTable) {
      html.push('</tbody></table></div>');
      inTable = false;
      tableHeaderDone = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks
    const fenceMatch = /^```([^\n`]*)/.exec(line.trim());
    if (fenceMatch) {
      closeLists();
      closeTable();
      if (!inCode) {
        inCode = true;
        codeLang = fenceMatch[1].trim();
        codeLines = [];
      } else {
        html.push(
          `<pre data-lang="${escapeHtml(codeLang)}"><code>${escapeHtml(
            codeLines.join('\n')
          )}</code></pre>`
        );
        inCode = false;
        codeLang = '';
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeLists();
      closeTable();
      continue;
    }

    // Horizontal rule
    if (/^(?:---+|\*\*\*+|___+)$/.test(trimmed)) {
      closeLists();
      closeTable();
      html.push('<hr />');
      continue;
    }

    // Headings
    const hMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (hMatch) {
      closeLists();
      closeTable();
      const lvl = hMatch[1].length;
      html.push(`<h${lvl}>${formatInlineMd(hMatch[2])}</h${lvl}>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      closeLists();
      closeTable();
      html.push(
        `<blockquote>${formatInlineMd(trimmed.replace(/^>\s?/, ''))}</blockquote>`
      );
      continue;
    }

    // Markdown table
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      closeLists();
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) {
        tableHeaderDone = true;
        continue;
      }
      if (!inTable) {
        inTable = true;
        tableHeaderDone = false;
        html.push('<div class="table-wrap"><table><thead><tr>');
        cells.forEach((c) => html.push(`<th>${formatInlineMd(c)}</th>`));
        html.push('</tr></thead><tbody>');
      } else {
        if (!tableHeaderDone) tableHeaderDone = true;
        html.push('<tr>');
        cells.forEach((c) => html.push(`<td>${formatInlineMd(c)}</td>`));
        html.push('</tr>');
      }
      continue;
    } else {
      closeTable();
    }

    // Unordered / Checklist
    const ulMatch = /^[-*•]\s+(.+)$/.exec(trimmed);
    if (ulMatch) {
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul>');
        inUl = true;
      }
      const itemTxt = ulMatch[1];
      const checkMatch = /^\[([ xX])\]\s+(.+)$/.exec(itemTxt);
      if (checkMatch) {
        const checked = checkMatch[1].toLowerCase() === 'x';
        html.push(
          `<li class="task-item"><input type="checkbox" disabled ${
            checked ? 'checked' : ''
          } /> <span>${formatInlineMd(checkMatch[2])}</span></li>`
        );
      } else {
        html.push(`<li>${formatInlineMd(itemTxt)}</li>`);
      }
      continue;
    }

    // Ordered list
    const olMatch = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    if (olMatch) {
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol>');
        inOl = true;
      }
      html.push(`<li>${formatInlineMd(olMatch[1])}</li>`);
      continue;
    }

    closeLists();
    html.push(`<p>${formatInlineMd(trimmed)}</p>`);
  }

  closeLists();
  closeTable();
  if (inCode && codeLines.length > 0) {
    html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }

  return html.join('\n');
}

export function buildArtifactSrcDoc(code: string, lang: string): string {
  const normalized = (lang || 'html').trim().toLowerCase();
  const trimmed = (code || '').trim();

  if (
    normalized === 'html' ||
    normalized === 'htm' ||
    trimmed.startsWith('<!DOCTYPE html') ||
    trimmed.startsWith('<html')
  ) {
    return code;
  }

  if (normalized === 'md' || normalized === 'markdown') {
    const renderedBody = renderMarkdownToHtml(code);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      padding: 28px 32px 48px;
      background: #ffffff;
      color: #1f1e1d;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Bengali", sans-serif;
      font-size: 15px;
      line-height: 1.72;
      max-width: 780px;
    }
    h1, h2, h3, h4 {
      color: #161514;
      font-weight: 650;
      letter-spacing: -0.015em;
      margin-top: 1.5em;
      margin-bottom: 0.55em;
      line-height: 1.3;
    }
    h1 { font-size: 1.65rem; margin-top: 0; padding-bottom: 0.45em; border-bottom: 1px solid #ebe6de; }
    h2 { font-size: 1.3rem; }
    h3 { font-size: 1.08rem; }
    p { margin: 0 0 0.9em; color: #2b2927; }
    ul, ol { margin: 0 0 1em; padding-left: 1.45em; }
    li { margin: 0.35em 0; }
    li.task-item { list-style: none; margin-left: -1.1em; display: flex; align-items: flex-start; gap: 8px; }
    li.task-item input { margin-top: 5px; accent-color: #c96442; }
    blockquote {
      margin: 1em 0;
      padding: 0.6em 1em;
      border-left: 3px solid #c96442;
      background: #faf8f5;
      color: #57534e;
      border-radius: 0 8px 8px 0;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
      font-size: 0.88em;
      background: #f5f2ec;
      color: #9f4627;
      padding: 2px 6px;
      border-radius: 5px;
    }
    pre {
      background: #18181b;
      color: #f4f4f5;
      padding: 14px 16px;
      border-radius: 10px;
      overflow-x: auto;
      margin: 1em 0;
      font-size: 13px;
      line-height: 1.55;
    }
    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }
    hr { border: 0; border-top: 1px solid #ebe6de; margin: 1.6em 0; }
    .table-wrap { overflow-x: auto; margin: 1em 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border: 1px solid #e7e2da; padding: 8px 12px; text-align: left; }
    th { background: #faf8f5; font-weight: 600; }
    a { color: #c96442; text-decoration: underline; }
  </style>
</head>
<body>${renderedBody}</body>
</html>`;
  }

  if (normalized === 'svg' || trimmed.startsWith('<svg')) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body {
      margin: 0;
      padding: 24px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #faf8f5;
      color: #1f1e1d;
      font-family: system-ui, -apple-system, sans-serif;
      box-sizing: border-box;
    }
    svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>${code}</body>
</html>`;
  }

  if (normalized === 'css') {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${code}</style>
</head>
<body style="font-family: system-ui, sans-serif; padding: 24px;">
  <div class="preview-card card container app main">
    <h2>CSS Preview</h2>
    <p>Your custom stylesheet is loaded in this preview frame.</p>
    <button>Sample Button</button>
  </div>
</body>
</html>`;
  }

  if (normalized === 'js' || normalized === 'javascript') {
    const looksLikeHtmlInside =
      trimmed.startsWith('<') && trimmed.includes('</');
    if (looksLikeHtmlInside) {
      return code;
    }
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #faf8f5;
      color: #1f1e1d;
    }
    #app { font-family: system-ui, sans-serif; margin-bottom: 16px; }
    #console {
      background: #18181b;
      color: #e4e4e7;
      padding: 14px;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <div id="console"></div>
  <script>
    const out = document.getElementById('console');
    const write = (...args) => {
      out.textContent += args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\\n';
    };
    console.log = write;
    console.info = write;
    console.warn = write;
    console.error = write;
    try {
      ${code}
    } catch (err) {
      write('Error:', err && err.message ? err.message : String(err));
    }
  </script>
</body>
</html>`;
  }

  // Fallback for HTML fragments / plain text / JSX preview
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background: #ffffff;
      color: #1f1e1d;
      font-family: system-ui, -apple-system, sans-serif;
    }
  </style>
</head>
<body>
${trimmed.startsWith('<') ? code : `<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px;line-height:1.6;">${escapeHtml(code)}</pre>`}
</body>
</html>`;
}

export const ClaudeArtifactPanel: React.FC<ClaudeArtifactPanelProps> = ({
  artifact,
  onClose,
  onSelectBundleFile,
  onToast,
}) => {
  const canPreview = useMemo(
    () => isPreviewableLanguage(artifact?.lang, artifact?.code),
    [artifact?.lang, artifact?.code]
  );

  const [tab, setTab] = useState<'preview' | 'code'>(
    canPreview ? 'preview' : 'code'
  );
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  React.useEffect(() => {
    if (!artifact) return;
    setTab(isPreviewableLanguage(artifact.lang, artifact.code) ? 'preview' : 'code');
  }, [artifact]);

  if (!artifact) return null;

  const srcDoc = buildArtifactSrcDoc(artifact.code, artifact.lang);
  const bundleFiles = artifact.bundleFiles || [];

  const handleCopy = () => {
    navigator.clipboard?.writeText(artifact.code);
    setCopied(true);
    onToast?.('কপি করা হয়েছে');
    setTimeout(() => setCopied(false), 1600);
  };

  const handleDownload = () => {
    downloadSingleArtifactFile({
      filename: artifact.filename,
      lang: artifact.lang,
      content: artifact.code,
    });
    onToast?.(`ডাউনলোড শুরু হয়েছে: ${artifact.filename || 'file'}`);
  };

  const handleDownloadZip = () => {
    if (bundleFiles.length === 0) return;
    downloadArtifactsAsZip(
      bundleFiles.map((f) => ({ filename: f.filename, content: f.content })),
      'project-files.zip'
    );
    onToast?.('ZIP ডাউনলোড শুরু হয়েছে');
  };

  return (
    <aside
      data-testid="claude-artifact-panel"
      className="fixed inset-0 z-40 lg:static lg:z-auto w-full lg:w-[48%] xl:w-[50%] h-full border-l border-[var(--border)] bg-[var(--surface)] flex flex-col shrink-0 shadow-2xl lg:shadow-none"
    >
      {/* Top Bar */}
      <header className="h-13 px-4 border-b border-[var(--border)] flex items-center justify-between gap-2 bg-[var(--bg)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13.5px] font-medium text-[var(--ink)] truncate">
            {artifact.filename || artifact.title || 'Artifact'}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[11px] font-mono uppercase text-[var(--ink-dim)] shrink-0">
            {artifact.lang || 'code'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canPreview && (
            <div className="inline-flex items-center p-0.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
              <button
                type="button"
                data-testid="artifact-tab-preview"
                onClick={() => setTab('preview')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  tab === 'preview'
                    ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
                    : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
              <button
                type="button"
                data-testid="artifact-tab-code"
                onClick={() => setTab('code')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  tab === 'code'
                    ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
                    : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Code</span>
              </button>
            </div>
          )}

          {tab === 'preview' && canPreview && (
            <button
              type="button"
              data-testid="artifact-refresh-btn"
              onClick={() => setIframeKey((k) => k + 1)}
              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              title="Refresh preview"
              aria-label="Refresh preview"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            data-testid="artifact-copy-btn"
            onClick={handleCopy}
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            title="Copy"
            aria-label="Copy"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            data-testid="artifact-download-btn"
            onClick={handleDownload}
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            title={`Download ${artifact.filename || ''}`}
            aria-label="Download file"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {bundleFiles.length > 1 && (
            <button
              type="button"
              data-testid="artifact-download-zip-btn"
              onClick={handleDownloadZip}
              className="px-2 h-7 rounded-lg inline-flex items-center gap-1 text-xs font-medium bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
              title="Download all files as ZIP"
            >
              <FileArchive className="w-3.5 h-3.5 text-[var(--primary)]" />
              <span>.zip</span>
            </button>
          )}

          <button
            type="button"
            data-testid="artifact-close-btn"
            onClick={onClose}
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            title="Close panel"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Multi-file switcher bar when response contains a project bundle */}
      {bundleFiles.length > 1 && (
        <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface)] flex items-center gap-1.5 overflow-x-auto shrink-0">
          {bundleFiles.map((bf) => {
            const isActive =
              (artifact.filename || artifact.title) === bf.filename;
            return (
              <button
                key={bf.id}
                type="button"
                onClick={() => onSelectBundleFile?.(bf)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono whitespace-nowrap cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-[var(--ink)] text-[var(--bg)] font-medium'
                    : 'bg-[var(--surface-2)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
                }`}
              >
                {bf.filename}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden bg-white dark:bg-[#141416]">
        {tab === 'preview' && canPreview ? (
          <iframe
            key={iframeKey}
            data-testid="artifact-preview-iframe"
            title={artifact.title || 'Artifact Preview'}
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-modals"
            className="w-full h-full border-0 bg-white"
          />
        ) : (
          <pre
            data-testid="artifact-code-view"
            className="w-full h-full m-0 p-4 overflow-auto font-mono text-[13px] leading-relaxed bg-[#18181b] text-slate-100"
          >
            <code>{artifact.code}</code>
          </pre>
        )}
      </div>
    </aside>
  );
};
