import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  FileArchive,
  FolderTree,
  Maximize2,
  Minimize2,
  Monitor,
  RotateCw,
  Smartphone,
  Sparkles,
  Tablet,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import {
  FileArtifactItem,
  downloadArtifactsAsZip,
  downloadSingleArtifactFile,
} from '../utils/fileArtifacts';
import type {
  ArtifactVersion,
  WorkspaceArtifactFile,
} from '../services/artifactManager';
import { ArtifactFileTree } from './artifacts/ArtifactFileTree';
import { ArtifactCodeEditor } from './artifacts/ArtifactCodeEditor';
import { ArtifactDiffViewer } from './artifacts/ArtifactDiffViewer';
import { CsvTablePreview } from './artifacts/CsvTablePreview';
import { JsonTreePreview } from './artifacts/JsonTreePreview';
import { PyodideConsole } from './artifacts/PyodideConsole';

export interface ArtifactPayload {
  title: string;
  filename?: string;
  lang: string;
  code: string;
  isStreaming?: boolean;
  bundleFiles?: FileArtifactItem[];
}

export interface PreviewConsoleEntry {
  id: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  ts: number;
}

interface ClaudeArtifactPanelProps {
  artifact: ArtifactPayload | null;
  workspaceFiles?: WorkspaceArtifactFile[];
  artifactHistory?: Record<string, ArtifactVersion[]>;
  isDarkTheme?: boolean;
  onClose: () => void;
  onSelectBundleFile?: (file: FileArtifactItem) => void;
  onSelectWorkspacePath?: (path: string) => void;
  onSaveFile?: (path: string, content: string, note?: string) => void;
  onCreateFile?: (path: string, initialContent?: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
  onDeleteFile?: (path: string) => void;
  onFixWithAi?: (payload: { filename: string; code: string; error: string }) => void;
  onToast?: (msg: string) => void;
}

const PREVIEWABLE_LANGS = new Set([
  'html',
  'htm',
  'svg',
  'xml',
  'css',
  'scss',
  'tailwind',
  'js',
  'javascript',
  'mjs',
  'ts',
  'typescript',
  'jsx',
  'tsx',
  'react',
  'vue-html',
  'md',
  'markdown',
  'csv',
  'json',
  'py',
  'python',
]);

export function normalizePreviewLang(rawLang?: string): string {
  const raw = String(rawLang || '')
    .trim()
    .toLowerCase();
  if (!raw) return '';
  const firstToken = raw.split(/[\s:;,/]+/)[0] || '';
  if (PREVIEWABLE_LANGS.has(firstToken)) return firstToken;
  if (/\.tsx$/i.test(raw)) return 'tsx';
  if (/\.jsx$/i.test(raw)) return 'jsx';
  if (/\.html?$/i.test(raw)) return 'html';
  if (/\.css$/i.test(raw)) return 'css';
  if (/\.svg$/i.test(raw)) return 'svg';
  if (/\.md$/i.test(raw)) return 'markdown';
  if (/\.csv$/i.test(raw)) return 'csv';
  if (/\.json$/i.test(raw)) return 'json';
  if (/\.py$/i.test(raw)) return 'python';
  if (/\.[cm]?[jt]s$/i.test(raw)) return 'javascript';
  return firstToken;
}

export function looksLikeReactOrJsxCode(code?: string, lang?: string): boolean {
  const norm = normalizePreviewLang(lang);
  if (norm === 'jsx' || norm === 'tsx' || norm === 'react') return true;
  const trimmed = String(code || '').trim();
  if (!trimmed) return false;
  if (
    /import\s+.*from\s+['"]react['"]/i.test(trimmed) ||
    /export\s+default\s+function\s+[A-Z]/m.test(trimmed) ||
    /useState\s*\(|useEffect\s*\(|className=/m.test(trimmed)
  ) {
    return true;
  }
  return false;
}

export function isPreviewableLanguage(lang?: string, code?: string): boolean {
  const normalized = normalizePreviewLang(lang);
  if (PREVIEWABLE_LANGS.has(normalized)) return true;
  const trimmed = (code || '').trim();
  if (
    trimmed.startsWith('<!DOCTYPE html') ||
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<svg') ||
    (trimmed.startsWith('<') &&
      trimmed.includes('</') &&
      /<\/?(?:div|section|main|header|footer|nav|h[1-6]|p|button|form|table|svg|canvas|style)\b/i.test(
        trimmed
      )) ||
    looksLikeReactOrJsxCode(trimmed, normalized)
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
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
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

    if (/^(?:---+|\*\*\*+|___+)$/.test(trimmed)) {
      closeLists();
      closeTable();
      html.push('<hr />');
      continue;
    }

    const hMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (hMatch) {
      closeLists();
      closeTable();
      const lvl = hMatch[1].length;
      html.push(`<h${lvl}>${formatInlineMd(hMatch[2])}</h${lvl}>`);
      continue;
    }

    if (trimmed.startsWith('>')) {
      closeLists();
      closeTable();
      html.push(
        `<blockquote>${formatInlineMd(trimmed.replace(/^>\s?/, ''))}</blockquote>`
      );
      continue;
    }

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

const PREVIEW_TELEMETRY_SCRIPT = `<script>
(function(){
  if (window.__SMFTA_TELEMETRY_INSTALLED__) return;
  window.__SMFTA_TELEMETRY_INSTALLED__ = true;
  function send(level, args) {
    try {
      var msg = Array.prototype.slice.call(args).map(function(a){
        if (a instanceof Error) return a.stack || a.message || String(a);
        if (typeof a === 'object') { try { return JSON.stringify(a); } catch(_) { return String(a); } }
        return String(a);
      }).join(' ');
      window.parent.postMessage({ source: 'smfta-preview', level: level, message: msg }, '*');
    } catch (_) {}
  }
  ['log', 'info', 'warn', 'error'].forEach(function(lvl) {
    var orig = console[lvl];
    console[lvl] = function() {
      send(lvl, arguments);
      if (orig) try { orig.apply(console, arguments); } catch(_) {}
    };
  });
  window.addEventListener('error', function(e) {
    send('error', [e.message || (e.error && e.error.message) || 'Runtime error']);
  });
  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason;
    send('error', ['Unhandled Promise Rejection: ' + (reason && reason.message ? reason.message : String(reason))]);
  });
})();
</script>`;

function injectPreviewTelemetry(htmlDoc: string): string {
  if (/<head[^>]*>/i.test(htmlDoc)) {
    return htmlDoc.replace(/<head[^>]*>/i, (m) => `${m}\n${PREVIEW_TELEMETRY_SCRIPT}`);
  }
  return `${PREVIEW_TELEMETRY_SCRIPT}\n${htmlDoc}`;
}

const BUILTIN_UTILITY_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Bengali', sans-serif; color: #18181b; background: #ffffff; }
  button, input, select, textarea { font: inherit; }
  .min-h-screen { min-height: 100vh; }
  .h-full { height: 100%; }
  .w-full { width: 100%; }
  .max-w-md { max-width: 28rem; }
  .max-w-lg { max-width: 32rem; }
  .max-w-xl { max-width: 36rem; }
  .max-w-2xl { max-width: 42rem; }
  .max-w-4xl { max-width: 56rem; }
  .max-w-6xl { max-width: 72rem; }
  .mx-auto { margin-left: auto; margin-right: auto; }
  .flex { display: flex; }
  .inline-flex { display: inline-flex; }
  .grid { display: grid; }
  .flex-col { flex-direction: column; }
  .flex-wrap { flex-wrap: wrap; }
  .flex-1 { flex: 1 1 0%; }
  .items-center { align-items: center; }
  .items-start { align-items: flex-start; }
  .justify-between { justify-content: space-between; }
  .justify-center { justify-content: center; }
  .gap-1 { gap: 0.25rem; }
  .gap-2 { gap: 0.5rem; }
  .gap-3 { gap: 0.75rem; }
  .gap-4 { gap: 1rem; }
  .gap-6 { gap: 1.5rem; }
  .space-y-2 > * + * { margin-top: 0.5rem; }
  .space-y-3 > * + * { margin-top: 0.75rem; }
  .space-y-4 > * + * { margin-top: 1rem; }
  .space-y-6 > * + * { margin-top: 1.5rem; }
  .p-2 { padding: 0.5rem; }
  .p-3 { padding: 0.75rem; }
  .p-4 { padding: 1rem; }
  .p-6 { padding: 1.5rem; }
  .p-8 { padding: 2rem; }
  .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
  .px-4 { padding-left: 1rem; padding-right: 1rem; }
  .px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
  .py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
  .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
  .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
  .mt-1 { margin-top: 0.25rem; }
  .mt-2 { margin-top: 0.5rem; }
  .mt-4 { margin-top: 1rem; }
  .mt-6 { margin-top: 1.5rem; }
  .mb-2 { margin-bottom: 0.5rem; }
  .mb-4 { margin-bottom: 1rem; }
  .mb-6 { margin-bottom: 1.5rem; }
  .rounded { border-radius: 0.25rem; }
  .rounded-lg { border-radius: 0.5rem; }
  .rounded-xl { border-radius: 0.75rem; }
  .rounded-2xl { border-radius: 1rem; }
  .rounded-full { border-radius: 9999px; }
  .border { border: 1px solid #e4e4e7; }
  .border-b { border-bottom: 1px solid #e4e4e7; }
  .border-t { border-top: 1px solid #e4e4e7; }
  .bg-white { background-color: #ffffff; }
  .bg-gray-50, .bg-slate-50, .bg-zinc-50 { background-color: #f8fafc; }
  .bg-gray-100, .bg-slate-100, .bg-zinc-100 { background-color: #f1f5f9; }
  .bg-gray-900, .bg-slate-900, .bg-zinc-900 { background-color: #0f172a; color: #f8fafc; }
  .bg-indigo-600, .bg-blue-600 { background-color: #4f46e5; color: #ffffff; }
  .bg-emerald-600, .bg-green-600 { background-color: #059669; color: #ffffff; }
  .bg-rose-600, .bg-red-600 { background-color: #e11d48; color: #ffffff; }
  .text-white { color: #ffffff; }
  .text-gray-500, .text-slate-500, .text-zinc-500 { color: #64748b; }
  .text-gray-600, .text-slate-600, .text-zinc-600 { color: #475569; }
  .text-gray-900, .text-slate-900, .text-zinc-900 { color: #0f172a; }
  .text-xs { font-size: 0.75rem; }
  .text-sm { font-size: 0.875rem; }
  .text-base { font-size: 1rem; }
  .text-lg { font-size: 1.125rem; }
  .text-xl { font-size: 1.25rem; }
  .text-2xl { font-size: 1.5rem; }
  .text-3xl { font-size: 1.875rem; }
  .font-medium { font-weight: 500; }
  .font-semibold { font-weight: 600; }
  .font-bold { font-weight: 700; }
  .text-center { text-align: center; }
  .shadow-sm { box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
  .shadow, .shadow-md { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
  .shadow-lg, .shadow-xl { box-shadow: 0 12px 32px rgba(0,0,0,0.12); }
  .cursor-pointer { cursor: pointer; }
  .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;

export function transpileReactArtifactCode(rawCode: string): {
  executableJs: string;
  componentName: string;
} {
  let src = String(rawCode || '').replace(/\r\n/g, '\n');

  const stubbedIcons = new Set<string>();
  src = src.replace(
    /^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?/gm,
    (_full, clause: string, modName: string) => {
      if (!/^react(?:-dom)?$/i.test(modName)) {
        const namedMatch = clause.match(/\{([\s\S]*?)\}/);
        if (namedMatch) {
          namedMatch[1]
            .split(',')
            .map((s) => s.trim().split(/\s+as\s+/).pop()?.trim() || '')
            .filter((s) => /^[A-Z][A-Za-z0-9_]*$/.test(s))
            .forEach((icon) => stubbedIcons.add(icon));
        }
      }
      return '';
    }
  );
  src = src.replace(/^\s*import\s+['"][^'"]+['"]\s*;?/gm, '');

  src = src.replace(/^\s*(?:export\s+)?interface\s+[A-Za-z0-9_]+[\s\S]*?^\s*\}/gm, '');
  src = src.replace(/^\s*(?:export\s+)?type\s+[A-Za-z0-9_]+\s*=[^;]+;/gm, '');
  // Strip balanced generic arguments on hooks (e.g. useState<Record<string, number>>(...))
  src = src.replace(/\b(useState|useRef|useMemo|useCallback)<(?:[^<>]|<[^<>]*>)+>\s*\(/g, '$1(');
  src = src.replace(/:\s*React\.FC(?:<(?:[^<>]|<[^<>]*>)+>)?/g, '');
  src = src.replace(
    /\(\s*([a-zA-Z0-9_{},\s]+)\s*:\s*[A-Za-z0-9_<>{}[\]\s|&]+\s*\)/g,
    '($1)'
  );

  let componentName = '';
  const exportDefaultFn = /export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/.exec(src);
  if (exportDefaultFn) {
    componentName = exportDefaultFn[1];
    src = src.replace(
      /export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/,
      'function $1'
    );
  } else if (/export\s+default\s+function\s*\(/.test(src)) {
    componentName = '__DefaultExportApp';
    src = src.replace(
      /export\s+default\s+function\s*\(/,
      'function __DefaultExportApp('
    );
  } else {
    const exportDefaultIdent = /export\s+default\s+([A-Z][A-Za-z0-9_]*)\s*;?/.exec(
      src
    );
    if (exportDefaultIdent) {
      componentName = exportDefaultIdent[1];
      src = src.replace(/export\s+default\s+([A-Z][A-Za-z0-9_]*)\s*;?/, '');
    }
  }

  src = src.replace(/^\s*export\s+(?=(?:const|let|var|function|class)\b)/gm, '');

  if (!componentName) {
    const candidates = Array.from(
      src.matchAll(
        /(?:function\s+([A-Z][A-Za-z0-9_]*)\s*\(|const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>)/g
      )
    ).map((m) => m[1] || m[2]);
    if (candidates.length > 0) {
      componentName =
        candidates.find((c) => /^(?:App|Main|Dashboard|Page|Demo|Preview)$/i.test(c)) ||
        candidates[candidates.length - 1];
    }
  }

  const iconDecls =
    stubbedIcons.size > 0
      ? `const { ${Array.from(stubbedIcons).join(', ')} } = window.__SMFTA_ICONS__;\n`
      : '';

  return {
    executableJs: `${iconDecls}${src}`,
    componentName: componentName || 'App',
  };
}

function buildReactSandboxHtml(
  code: string,
  extraCss = '',
  title = 'React Live Preview'
): string {
  const { executableJs, componentName } = transpileReactArtifactCode(code);
  const safeJsonCode = JSON.stringify(executableJs);
  const safeCompName = JSON.stringify(componentName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${PREVIEW_TELEMETRY_SCRIPT}
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    ${BUILTIN_UTILITY_CSS}
    body { padding: 20px; }
    #__smfta_error {
      display: none;
      margin: 12px 0;
      padding: 14px 16px;
      border-radius: 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12.5px;
      white-space: pre-wrap;
    }
    ${extraCss}
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="__smfta_error" data-testid="sandbox-error-banner"></div>
  <script>
    (function() {
      const rootEl = document.getElementById('root');
      const errEl = document.getElementById('__smfta_error');
      function showError(msg) {
        if (!errEl) return;
        errEl.style.display = 'block';
        errEl.textContent = 'Preview Error: ' + msg;
        try { console.error(msg); } catch(_) {}
      }
      window.addEventListener('error', function(e) {
        showError(e.message || String(e.error || 'Runtime error'));
      });

      let hooks = [];
      let hookIdx = 0;
      let renderScheduled = false;
      let mountFn = null;

      function scheduleRerender() {
        if (renderScheduled) return;
        renderScheduled = true;
        Promise.resolve().then(function() {
          renderScheduled = false;
          if (mountFn) mountFn();
        });
      }

      function useState(initial) {
        const idx = hookIdx++;
        if (hooks[idx] === undefined) {
          hooks[idx] = typeof initial === 'function' ? initial() : initial;
        }
        const setState = function(next) {
          const prev = hooks[idx];
          const val = typeof next === 'function' ? next(prev) : next;
          if (val !== prev) {
            hooks[idx] = val;
            scheduleRerender();
          }
        };
        return [hooks[idx], setState];
      }

      function useEffect(cb, deps) {
        const idx = hookIdx++;
        const prev = hooks[idx];
        const changed = !prev || !deps || deps.some(function(d, i) { return d !== prev.deps[i]; });
        if (changed) {
          hooks[idx] = { deps: deps };
          setTimeout(function() {
            try { cb(); } catch (e) { showError(e && e.message ? e.message : String(e)); }
          }, 0);
        }
      }

      function useRef(initial) {
        const idx = hookIdx++;
        if (!hooks[idx]) hooks[idx] = { current: initial };
        return hooks[idx];
      }

      function useMemo(fn) { return fn(); }
      function useCallback(fn) { return fn; }
      function createContext(def) { return { Provider: function(p) { return p.children; }, _default: def }; }
      function useContext(ctx) { return ctx && ctx._default; }
      const Fragment = Symbol('Fragment');

      function createElement(type, props) {
        const children = [];
        for (let i = 2; i < arguments.length; i++) {
          children.push(arguments[i]);
        }
        return { type: type, props: Object.assign({}, props || {}, { children: children }) };
      }

      window.React = {
        createElement: createElement,
        Fragment: Fragment,
        useState: useState,
        useEffect: useEffect,
        useRef: useRef,
        useMemo: useMemo,
        useCallback: useCallback,
        createContext: createContext,
        useContext: useContext,
      };

      window.__SMFTA_ICONS__ = new Proxy({}, {
        get: function(_, prop) {
          return function IconStub(props) {
            return createElement('span', {
              className: (props && props.className) || 'inline-block',
              style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
              'data-icon': String(prop)
            }, '✦');
          };
        }
      });

      function renderVNode(vnode) {
        if (vnode === null || vnode === undefined || typeof vnode === 'boolean') {
          return document.createTextNode('');
        }
        if (typeof vnode === 'string' || typeof vnode === 'number') {
          return document.createTextNode(String(vnode));
        }
        if (Array.isArray(vnode)) {
          const frag = document.createDocumentFragment();
          vnode.forEach(function(child) { frag.appendChild(renderVNode(child)); });
          return frag;
        }
        if (vnode.type === Fragment) {
          const frag = document.createDocumentFragment();
          (vnode.props.children || []).forEach(function(c) { frag.appendChild(renderVNode(c)); });
          return frag;
        }
        if (typeof vnode.type === 'function') {
          const sub = vnode.type(vnode.props || {});
          return renderVNode(sub);
        }
        const tag = String(vnode.type || 'div');
        const el = document.createElement(tag);
        const props = vnode.props || {};
        Object.keys(props).forEach(function(k) {
          if (k === 'children' || k === 'key') return;
          const val = props[k];
          if (k === 'className' || k === 'class') {
            el.setAttribute('class', String(val || ''));
          } else if (k === 'style' && val && typeof val === 'object') {
            Object.assign(el.style, val);
          } else if (k === 'ref' && val && typeof val === 'object') {
            val.current = el;
          } else if (/^on[A-Z]/.test(k) && typeof val === 'function') {
            const evt = k.slice(2).toLowerCase();
            el.addEventListener(evt === 'change' && (tag === 'input' || tag === 'textarea') ? 'input' : evt, val);
          } else if (k === 'dangerouslySetInnerHTML' && val && val.__html != null) {
            el.innerHTML = String(val.__html);
          } else if (typeof val === 'boolean') {
            if (val) el.setAttribute(k, '');
            if (k in el) { try { el[k] = val; } catch (_) {} }
          } else if (val !== undefined && val !== null) {
            el.setAttribute(k, String(val));
            if (k === 'value' && k in el) { try { el.value = String(val); } catch (_) {} }
          }
        });
        (props.children || []).forEach(function(c) {
          el.appendChild(renderVNode(c));
        });
        return el;
      }

      function compileSimpleJsx(input) {
        let out = input;
        out = out.replace(/<>([\\s\\S]*?)<\\/>/g, '<div>$1</div>');
        let guard = 0;
        const selfClosingRx = /<([A-Za-z][A-Za-z0-9.]*)((?:\\s+[a-zA-Z0-9_:-]+(?:=(?:"[^"]*"|'[^']*'|\\{[^}]*\\}))?)*)\\s*\\/>/g;
        const pairedRx = /<([A-Za-z][A-Za-z0-9.]*)((?:\\s+[a-zA-Z0-9_:-]+(?:=(?:"[^"]*"|'[^']*'|\\{[^}]*\\}))?)*)\\s*>((?:(?!<[A-Za-z])[\\s\\S])*?)<\\/\\1\\s*>/g;

        function attrsToObj(attrStr) {
          const trimmed = (attrStr || '').trim();
          if (!trimmed) return 'null';
          const pairs = [];
          const attrRx = /([a-zA-Z0-9_:-]+)(?:=(?:"([^"]*)"|'([^']*)'|\\{([^}]*)\\}))?/g;
          let m;
          while ((m = attrRx.exec(trimmed)) !== null) {
            const key = JSON.stringify(m[1]);
            const val = m[2] !== undefined ? JSON.stringify(m[2]) : m[3] !== undefined ? JSON.stringify(m[3]) : m[4] !== undefined ? '(' + m[4] + ')' : 'true';
            pairs.push(key + ': ' + val);
          }
          return '{ ' + pairs.join(', ') + ' }';
        }

        function tagExpr(tag) {
          return /^[A-Z]/.test(tag) ? tag : JSON.stringify(tag);
        }

        function childrenToArgs(inner) {
          const t = (inner || '').trim();
          if (!t) return '';
          const parts = [];
          let tokens = t.split(/(\\{[^{}]*\\})/g);
          tokens.forEach(function(tok) {
            if (!tok) return;
            if (tok.startsWith('{') && tok.endsWith('}')) {
              const expr = tok.slice(1, -1).trim();
              if (expr) parts.push('(' + expr + ')');
            } else {
              const cleanTxt = tok.replace(/\\s+/g, ' ');
              if (cleanTxt.trim()) parts.push(JSON.stringify(cleanTxt));
            }
          });
          return parts.length ? ', ' + parts.join(', ') : '';
        }

        while (guard++ < 40) {
          const prev = out;
          out = out.replace(selfClosingRx, function(_, tag, attrs) {
            return '{React.createElement(' + tagExpr(tag) + ', ' + attrsToObj(attrs) + ')}';
          });
          out = out.replace(pairedRx, function(_, tag, attrs, inner) {
            return '{React.createElement(' + tagExpr(tag) + ', ' + attrsToObj(attrs) + childrenToArgs(inner) + ')}';
          });
          if (out === prev) break;
        }
        out = out.replace(/(return\\s*\\(?\\s*|=>\\s*\\(?\\s*|=\\s*)\\{(React\\.createElement\\([\\s\\S]*?\\))\\}/g, '$1$2');
        return out;
      }

      const rawSource = ${safeJsonCode};
      const targetName = ${safeCompName};

      try {
        const compiled = compileSimpleJsx(rawSource);
        const factory = new Function(
          'React',
          'useState',
          'useEffect',
          'useRef',
          'useMemo',
          'useCallback',
          'createContext',
          'useContext',
          'Fragment',
          compiled + '\\n; return typeof ' + targetName + ' !== "undefined" ? ' + targetName + ' : null;'
        );
        const RootComp = factory(
          window.React,
          useState,
          useEffect,
          useRef,
          useMemo,
          useCallback,
          createContext,
          useContext,
          Fragment
        );
        if (typeof RootComp === 'function') {
          mountFn = function() {
            hookIdx = 0;
            const tree = RootComp({});
            rootEl.innerHTML = '';
            rootEl.appendChild(renderVNode(tree));
          };
          mountFn();
        } else {
          showError('Could not locate a React component to mount.');
        }
      } catch (err) {
        showError(err && err.message ? err.message : String(err));
      }
    })();
  </script>
</body>
</html>`;
}

export function buildArtifactSrcDoc(
  code: string,
  lang: string,
  bundleFiles?: FileArtifactItem[]
): string {
  const normalized = normalizePreviewLang(lang || 'html');
  const trimmed = (code || '').trim();

  const cssSiblings = (bundleFiles || []).filter(
    (f) =>
      normalizePreviewLang(f.lang) === 'css' ||
      /\.css$/i.test(f.filename)
  );
  const jsSiblings = (bundleFiles || []).filter(
    (f) =>
      (normalizePreviewLang(f.lang) === 'javascript' ||
        normalizePreviewLang(f.lang) === 'js' ||
        /\.m?js$/i.test(f.filename)) &&
      f.content !== code
  );
  const htmlSiblings = (bundleFiles || []).filter(
    (f) =>
      normalizePreviewLang(f.lang) === 'html' ||
      /\.html?$/i.test(f.filename)
  );
  const combinedSiblingCss = cssSiblings
    .map((c) => `/* ${c.filename} */\n${c.content}`)
    .join('\n\n');

  if (looksLikeReactOrJsxCode(trimmed, normalized)) {
    return buildReactSandboxHtml(code, combinedSiblingCss, 'React Component Preview');
  }

  if (
    normalized === 'html' ||
    normalized === 'htm' ||
    normalized === 'vue-html' ||
    trimmed.startsWith('<!DOCTYPE html') ||
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<html') ||
    (trimmed.startsWith('<') &&
      trimmed.includes('</') &&
      normalized !== 'svg' &&
      !trimmed.startsWith('<svg'))
  ) {
    const isFullDoc = /<!doctype\s+html|<html[\s>]/i.test(trimmed);
    let enrichedHtml = isFullDoc
      ? code
      : `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    ${BUILTIN_UTILITY_CSS}
    body { padding: 20px; }
  </style>
</head>
<body>
${code}
</body>
</html>`;

    if (cssSiblings.length > 0) {
      if (/<\/head>/i.test(enrichedHtml)) {
        enrichedHtml = enrichedHtml.replace(
          /<\/head>/i,
          `<style>\n${combinedSiblingCss}\n</style>\n</head>`
        );
      } else {
        enrichedHtml = `<style>\n${combinedSiblingCss}\n</style>\n${enrichedHtml}`;
      }
    }
    if (jsSiblings.length > 0) {
      const combinedJs = jsSiblings
        .map((j) => `// ${j.filename}\n${j.content}`)
        .join('\n\n');
      if (/<\/body>/i.test(enrichedHtml)) {
        enrichedHtml = enrichedHtml.replace(
          /<\/body>/i,
          `<script>\n${combinedJs}\n</script>\n</body>`
        );
      } else {
        enrichedHtml = `${enrichedHtml}\n<script>\n${combinedJs}\n</script>`;
      }
    }
    return injectPreviewTelemetry(enrichedHtml);
  }

  if (
    (normalized === 'css' ||
      normalized === 'js' ||
      normalized === 'javascript') &&
    htmlSiblings.length > 0
  ) {
    return buildArtifactSrcDoc(htmlSiblings[0].content, 'html', bundleFiles);
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

  if (normalized === 'css' || normalized === 'scss' || normalized === 'tailwind') {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${BUILTIN_UTILITY_CSS}\n${code}</style>
</head>
<body style="font-family: system-ui, sans-serif; padding: 24px;">
  <div class="preview-card card container app main">
    <h2>CSS Preview</h2>
    <p>Your custom stylesheet is loaded in this preview frame.</p>
    <button class="btn button primary">Sample Button</button>
  </div>
</body>
</html>`;
  }

  if (
    normalized === 'js' ||
    normalized === 'javascript' ||
    normalized === 'mjs' ||
    normalized === 'ts' ||
    normalized === 'typescript'
  ) {
    const looksLikeHtmlInside =
      trimmed.startsWith('<') && trimmed.includes('</');
    if (looksLikeHtmlInside) {
      return injectPreviewTelemetry(code);
    }
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  ${PREVIEW_TELEMETRY_SCRIPT}
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #faf8f5;
      color: #1f1e1d;
    }
    #app, #root { font-family: system-ui, sans-serif; margin-bottom: 16px; }
    #console {
      background: #18181b;
      color: #e4e4e7;
      padding: 14px;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    ${combinedSiblingCss}
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="app"></div>
  <div id="console"></div>
  <script>
    const out = document.getElementById('console');
    const origLog = console.log;
    const origError = console.error;
    const write = (prefix, args) => {
      out.textContent += prefix + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\\n';
    };
    console.log = (...args) => { origLog(...args); write('', args); };
    console.info = (...args) => { origLog(...args); write('', args); };
    console.warn = (...args) => { origLog(...args); write('[warn] ', args); };
    console.error = (...args) => { origError(...args); write('[error] ', args); };
    try {
      ${code.replace(/<\/script>/gi, '<\\/script>')}
    } catch (err) {
      console.error(err && err.message ? err.message : String(err));
    }
  </script>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
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
${
  trimmed.startsWith('<')
    ? code
    : `<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px;line-height:1.6;">${escapeHtml(
        code
      )}</pre>`
}
</body>
</html>`;
}

export const ClaudeArtifactPanel: React.FC<ClaudeArtifactPanelProps> = ({
  artifact,
  workspaceFiles = [],
  artifactHistory = {},
  isDarkTheme = true,
  onClose,
  onSelectBundleFile,
  onSelectWorkspacePath,
  onSaveFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onFixWithAi,
  onToast,
}) => {
  const activeFilename = artifact?.filename || artifact?.title || 'untitled.txt';
  const normalizedLang = normalizePreviewLang(artifact?.lang || activeFilename);
  const canPreview = useMemo(
    () => isPreviewableLanguage(artifact?.lang, artifact?.code),
    [artifact?.lang, artifact?.code]
  );

  const [tab, setTab] = useState<'preview' | 'code' | 'files'>(
    canPreview ? 'preview' : 'code'
  );
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [showDiffHistory, setShowDiffHistory] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<PreviewConsoleEntry[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(true);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [splitPct, setSplitPct] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('smfta_artifact_split_pct'));
      if (Number.isFinite(saved) && saved >= 28 && saved <= 72) return saved;
    } catch {}
    return 48;
  });
  const [isResizing, setIsResizing] = useState(false);
  const asideRef = React.useRef<HTMLElement | null>(null);

  const lastFileKeyRef = React.useRef<string>('');
  const lastCodeRef = React.useRef<string>('');
  const tabRef = React.useRef<'preview' | 'code' | 'files'>(tab);
  tabRef.current = tab;

  useEffect(() => {
    if (!artifact) {
      lastFileKeyRef.current = '';
      lastCodeRef.current = '';
      return;
    }
    const name = artifact.filename || artifact.title || '';
    if (name && name !== lastFileKeyRef.current) {
      lastFileKeyRef.current = name;
      lastCodeRef.current = artifact.code;
      if (tabRef.current !== 'files' || artifact.isStreaming) {
        setTab(isPreviewableLanguage(artifact.lang, artifact.code) ? 'preview' : 'code');
      }
      setShowDiffHistory(false);
      setConsoleLogs([]);
      setConsoleOpen(false);
      setOpenTabs((prev) => (prev.includes(name) ? prev : [...prev, name].slice(-8)));
    } else if (artifact.code !== lastCodeRef.current) {
      lastCodeRef.current = artifact.code;
      // Clear stale errors whenever code is updated (e.g. after AI fix or manual edit)
      setConsoleLogs([]);
      setIframeKey((k) => k + 1);
    }
  }, [artifact?.filename, artifact?.title, artifact?.lang, artifact?.code, artifact?.isStreaming]);

  useEffect(() => {
    if (!artifact) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [artifact, onClose]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        source?: string;
        level?: PreviewConsoleEntry['level'];
        message?: string;
      } | null;
      if (!data || data.source !== 'smfta-preview' || !data.message) return;
      const lvl = data.level || 'log';
      setConsoleLogs((prev) => [
        ...prev.slice(-99),
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          level: lvl,
          message: String(data.message),
          ts: Date.now(),
        },
      ]);
      if (lvl === 'error') {
        setConsoleOpen(true);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Merge bundle files with project workspace files so sibling CSS/JS files always resolve
  const mergedBundleFiles: FileArtifactItem[] = useMemo(() => {
    const byName = new Map<string, FileArtifactItem>();
    for (const wf of workspaceFiles) {
      byName.set(wf.path, {
        id: `ws-${wf.path}`,
        filename: wf.path,
        lang: wf.lang,
        title: wf.path,
        content: wf.content,
        isStreaming: false,
      });
    }
    for (const bf of artifact?.bundleFiles || []) {
      byName.set(bf.filename, bf);
    }
    return Array.from(byName.values());
  }, [workspaceFiles, artifact?.bundleFiles]);

  const effectiveWorkspaceList: WorkspaceArtifactFile[] = useMemo(() => {
    if (workspaceFiles.length > 0) return workspaceFiles;
    if (mergedBundleFiles.length > 0) {
      return mergedBundleFiles.map((f) => ({
        path: f.filename,
        lang: f.lang,
        content: f.content,
        updatedAt: Date.now(),
      }));
    }
    return [
      {
        path: activeFilename,
        lang: normalizedLang || 'txt',
        content: artifact?.code || '',
        updatedAt: Date.now(),
      },
    ];
  }, [workspaceFiles, mergedBundleFiles, activeFilename, normalizedLang, artifact?.code]);

  const isCsv = normalizedLang === 'csv' || activeFilename.toLowerCase().endsWith('.csv');
  const isJson = normalizedLang === 'json' || activeFilename.toLowerCase().endsWith('.json');
  const isPython =
    normalizedLang === 'py' ||
    normalizedLang === 'python' ||
    activeFilename.toLowerCase().endsWith('.py');

  const rawSrcDoc = useMemo(() => {
    if (!artifact || isCsv || isJson || isPython) return '';
    return buildArtifactSrcDoc(artifact.code, artifact.lang, mergedBundleFiles);
  }, [artifact, mergedBundleFiles, isCsv, isJson, isPython]);

  const [srcDoc, setSrcDoc] = useState<string>(rawSrcDoc);
  useEffect(() => {
    if (!rawSrcDoc) {
      setSrcDoc('');
      return;
    }
    if (!artifact?.isStreaming || !srcDoc) {
      setSrcDoc(rawSrcDoc);
      return;
    }
    const timer = window.setTimeout(() => {
      setSrcDoc(rawSrcDoc);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [rawSrcDoc, artifact?.isStreaming]);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: PointerEvent) => {
      const parentRect = asideRef.current?.parentElement?.getBoundingClientRect();
      const totalWidth = parentRect?.width || window.innerWidth;
      const rightEdge = parentRect?.right || window.innerWidth;
      if (totalWidth <= 0) return;
      const rawPct = ((rightEdge - e.clientX) / totalWidth) * 100;
      const clamped = Math.min(72, Math.max(28, Math.round(rawPct * 10) / 10));
      setSplitPct(clamped);
    };
    const onUp = () => {
      setIsResizing(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isResizing]);

  useEffect(() => {
    try {
      localStorage.setItem('smfta_artifact_split_pct', String(splitPct));
    } catch {}
  }, [splitPct]);

  if (!artifact && workspaceFiles.length === 0) return null;
  if (!artifact) return null;

  const versionsForActive = artifactHistory[activeFilename] || [];
  const runtimeErrors = consoleLogs.filter((c) => c.level === 'error');
  const latestRuntimeError = runtimeErrors[runtimeErrors.length - 1]?.message || '';

  const handleCopy = () => {
    navigator.clipboard?.writeText(artifact.code);
    setCopied(true);
    onToast?.('Copied to clipboard');
    setTimeout(() => setCopied(false), 1600);
  };

  const handleDownload = () => {
    downloadSingleArtifactFile({
      filename: activeFilename,
      lang: artifact.lang,
      content: artifact.code,
    });
    onToast?.(`Downloaded ${activeFilename}`);
  };

  const handleDownloadZip = async () => {
    const filesToZip = effectiveWorkspaceList.map((f) => ({
      filename: f.path,
      content: f.content,
    }));
    if (filesToZip.length === 0) return;
    try {
      await downloadArtifactsAsZip(filesToZip, 'project-files.zip');
      onToast?.(`ZIP download started (${filesToZip.length} files)`);
    } catch {
      onToast?.('ZIP export failed');
    }
  };

  const handleSelectFileByPath = (path: string) => {
    setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path].slice(-8)));
    if (onSelectWorkspacePath && workspaceFiles.some((w) => w.path === path)) {
      onSelectWorkspacePath(path);
      return;
    }
    const found = mergedBundleFiles.find((bf) => bf.filename === path);
    if (found && onSelectBundleFile) {
      onSelectBundleFile(found);
    }
  };

  const iframeWidthClass =
    viewport === 'mobile'
      ? 'w-[390px] max-w-full mx-auto border-x border-[var(--border)] shadow-lg'
      : viewport === 'tablet'
        ? 'w-[768px] max-w-full mx-auto border-x border-[var(--border)] shadow-lg'
        : 'w-full';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        ref={asideRef}
        data-testid="claude-artifact-panel"
        className={`w-full sm:max-w-5xl rounded-t-2xl sm:rounded-2xl border border-[var(--border)] bg-[var(--surface)] flex flex-col shrink-0 shadow-2xl overflow-hidden ${
          mobileExpanded ? 'h-[94dvh] sm:h-[88dvh]' : 'h-[66dvh] sm:h-[88dvh]'
        } transition-[height] duration-200`}
      >
        {/* Mobile Bottom Sheet Drag Indicator */}
        <div className="sm:hidden flex justify-center pt-2 pb-0.5 bg-[var(--bg)] rounded-t-2xl shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
        </div>

      {/* Top Bar */}
      <header className="min-h-12 px-2.5 sm:px-3 py-1.5 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 bg-[var(--bg)] shrink-0">
        <div className="flex items-center justify-between gap-1.5 min-w-0 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[12.5px] sm:text-[13px] font-medium text-[var(--ink)] truncate max-w-[180px] sm:max-w-[220px]">
              {activeFilename}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[10px] font-mono uppercase text-[var(--ink-dim)] shrink-0">
              {normalizedLang || 'text'}
            </span>
          </div>

          <button
            type="button"
            aria-label={mobileExpanded ? 'Compact sheet' : 'Expand sheet'}
            onClick={() => setMobileExpanded((v) => !v)}
            className="sm:hidden w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer shrink-0"
            title={mobileExpanded ? 'Compact sheet' : 'Expand sheet'}
          >
            {mobileExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1 w-full sm:w-auto sm:ml-auto">
          <div className="inline-flex items-center p-0.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
            <button
              type="button"
              data-testid="artifact-tab-preview"
              disabled={!canPreview}
              onClick={() => setTab('preview')}
              className={`px-2 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 ${
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
              className={`px-2 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
                tab === 'code'
                  ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
                  : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Code</span>
            </button>
            <button
              type="button"
              data-testid="artifact-tab-files"
              onClick={() => setTab('files')}
              className={`px-2 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
                tab === 'files'
                  ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
                  : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Files ({effectiveWorkspaceList.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            {tab === 'preview' && canPreview && !isCsv && !isJson && !isPython && (
              <div className="hidden sm:inline-flex items-center p-0.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                <button
                  type="button"
                  data-testid="artifact-viewport-desktop"
                  aria-label="Desktop view"
                  onClick={() => setViewport('desktop')}
                  className={`w-6 h-6 rounded inline-flex items-center justify-center cursor-pointer ${
                    viewport === 'desktop'
                      ? 'bg-[var(--surface)] text-[var(--ink)]'
                      : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                  }`}
                  title="Desktop view"
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  data-testid="artifact-viewport-tablet"
                  aria-label="Tablet view"
                  onClick={() => setViewport('tablet')}
                  className={`w-6 h-6 rounded inline-flex items-center justify-center cursor-pointer ${
                    viewport === 'tablet'
                      ? 'bg-[var(--surface)] text-[var(--ink)]'
                      : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                  }`}
                  title="Tablet view"
                >
                  <Tablet className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  data-testid="artifact-viewport-mobile"
                  aria-label="Mobile view"
                  onClick={() => setViewport('mobile')}
                  className={`w-6 h-6 rounded inline-flex items-center justify-center cursor-pointer ${
                    viewport === 'mobile'
                      ? 'bg-[var(--surface)] text-[var(--ink)]'
                      : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                  }`}
                  title="Mobile view"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {tab === 'preview' && canPreview && !isCsv && !isJson && !isPython && (
              <button
                type="button"
                data-testid="artifact-refresh-btn"
                aria-label="Refresh preview"
                onClick={() => {
                  setConsoleLogs([]);
                  setIframeKey((k) => k + 1);
                }}
                className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer"
                title="Refresh preview"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              data-testid="artifact-copy-btn"
              aria-label="Copy active file"
              onClick={handleCopy}
              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer"
              title="Copy active file"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              data-testid="artifact-download-btn"
              aria-label={`Download ${activeFilename}`}
              onClick={handleDownload}
              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer"
              title={`Download ${activeFilename}`}
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              data-testid="artifact-download-zip-btn"
              onClick={handleDownloadZip}
              className="px-2 h-7 rounded-lg inline-flex items-center gap-1 text-xs font-medium bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-3)] cursor-pointer"
              title="Download all files as ZIP"
            >
              <FileArchive className="w-3.5 h-3.5 text-[var(--primary)]" />
              <span className="hidden sm:inline">ZIP</span>
            </button>

            <button
              type="button"
              aria-label={mobileExpanded ? 'Compact sheet' : 'Expand sheet'}
              onClick={() => setMobileExpanded((v) => !v)}
              className="hidden sm:inline-flex lg:hidden w-7 h-7 rounded-lg items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer"
              title={mobileExpanded ? 'Compact sheet' : 'Expand sheet'}
            >
              {mobileExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              data-testid="artifact-close-btn"
              aria-label="Close Artifact Panel"
              onClick={onClose}
              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] cursor-pointer"
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Open File Tabs Bar */}
      {(openTabs.length > 1 || effectiveWorkspaceList.length > 1) && (
        <div
          data-testid="artifact-open-tabs"
          className="px-2.5 py-1.5 border-b border-[var(--border)] bg-[var(--surface)] flex items-center gap-1 overflow-x-auto shrink-0"
        >
          {(openTabs.length > 1
            ? openTabs
            : effectiveWorkspaceList.map((f) => f.path)
          ).map((tabPath) => {
            const isActive = tabPath === activeFilename;
            return (
              <div
                key={tabPath}
                className={`group inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono whitespace-nowrap cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-[var(--ink)] text-[var(--bg)] font-semibold'
                    : 'bg-[var(--surface-2)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
                }`}
                onClick={() => handleSelectFileByPath(tabPath)}
              >
                <span>{tabPath}</span>
                {openTabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenTabs((prev) => prev.filter((p) => p !== tabPath));
                    }}
                    className="opacity-60 hover:opacity-100 ml-0.5 cursor-pointer"
                    aria-label={`Close tab ${tabPath}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden bg-white dark:bg-[#141416] flex flex-col">
        {tab === 'files' ? (
          <ArtifactFileTree
            files={effectiveWorkspaceList}
            activePath={activeFilename}
            onSelectFile={(path) => {
              handleSelectFileByPath(path);
              setTab(
                isPreviewableLanguage(path) ? 'preview' : 'code'
              );
            }}
            onCreateFile={onCreateFile}
            onRenameFile={
              onRenameFile
                ? (oldPath, newPath) => {
                    onRenameFile(oldPath, newPath);
                    setOpenTabs((prev) =>
                      prev.map((p) => (p === oldPath ? newPath : p))
                    );
                  }
                : undefined
            }
            onDeleteFile={onDeleteFile}
          />
        ) : tab === 'code' || !canPreview ? (
          showDiffHistory ? (
            <div className="flex flex-col h-full min-h-0">
              <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)]/70 flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--ink)]">
                  Version History & Diff · {activeFilename}
                </span>
                <button
                  type="button"
                  onClick={() => setShowDiffHistory(false)}
                  className="px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] cursor-pointer"
                >
                  Back to Editor
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <ArtifactDiffViewer
                  filename={activeFilename}
                  versions={versionsForActive}
                  currentContent={artifact.code}
                  onRestoreVersion={(ver) => {
                    onSaveFile?.(
                      activeFilename,
                      ver.content,
                      `Restored snapshot (${ver.id})`
                    );
                    setShowDiffHistory(false);
                    onToast?.(`Restored ${activeFilename} snapshot`);
                  }}
                />
              </div>
            </div>
          ) : (
            <ArtifactCodeEditor
              filename={activeFilename}
              lang={artifact.lang}
              code={artifact.code}
              isDarkTheme={isDarkTheme}
              versionCount={versionsForActive.length}
              showHistory={showDiffHistory}
              onToggleHistory={() => setShowDiffHistory((v) => !v)}
              onSaveCode={(nextCode) =>
                onSaveFile?.(activeFilename, nextCode, 'Manual editor save')
              }
              onToast={onToast}
            />
          )
        ) : isCsv ? (
          <CsvTablePreview content={artifact.code} />
        ) : isJson ? (
          <JsonTreePreview content={artifact.code} />
        ) : isPython ? (
          <PyodideConsole
            filename={activeFilename}
            code={artifact.code}
            onFixWithAi={onFixWithAi}
          />
        ) : (
          <div className="flex-1 min-h-0 flex justify-center overflow-hidden">
            <iframe
              key={iframeKey}
              data-testid="artifact-preview-iframe"
              title={artifact.title || activeFilename}
              srcDoc={srcDoc}
              sandbox="allow-scripts"
              className={`${iframeWidthClass} h-full border-0 bg-white block ${
                isResizing ? 'pointer-events-none' : ''
              }`}
            />
          </div>
        )}

        {/* Sandboxed Iframe Console & Runtime Errors Bar */}
        {tab === 'preview' && !isCsv && !isJson && !isPython && (
          <div
            data-testid="preview-console-drawer"
            className="border-t border-[var(--border)] bg-[var(--bg)] shrink-0"
          >
            <div className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                onClick={() => setConsoleOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] font-mono cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Console ({consoleLogs.length})</span>
                {runtimeErrors.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500 font-semibold">
                    <AlertTriangle className="w-3 h-3" />
                    {runtimeErrors.length} error{runtimeErrors.length === 1 ? '' : 's'}
                  </span>
                )}
              </button>

              <div className="flex items-center gap-1.5">
                {latestRuntimeError && onFixWithAi && (
                  <button
                    type="button"
                    data-testid="preview-fix-with-ai-btn"
                    onClick={() =>
                      onFixWithAi({
                        filename: activeFilename,
                        code: artifact.code,
                        error: latestRuntimeError,
                      })
                    }
                    className="px-2.5 py-1 rounded-md bg-rose-500/15 border border-rose-500/35 text-rose-500 hover:bg-rose-500/25 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Fix with AI</span>
                  </button>
                )}
                {consoleLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConsoleLogs([])}
                    className="p-1 rounded text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer"
                    title="Clear console"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {consoleOpen && (
              <div className="max-h-36 overflow-y-auto px-3 pb-2.5 space-y-1 font-mono text-[11.5px]">
                {consoleLogs.length === 0 ? (
                  <div className="text-[var(--ink-dim)] py-1">
                    No console output captured yet.
                  </div>
                ) : (
                  consoleLogs.map((entry) => (
                    <div
                      key={entry.id}
                      className={`px-2 py-1 rounded whitespace-pre-wrap break-words ${
                        entry.level === 'error'
                          ? 'bg-rose-500/10 text-rose-500 border border-rose-500/25'
                          : entry.level === 'warn'
                            ? 'bg-amber-500/10 text-amber-500'
                            : 'text-[var(--ink-muted)]'
                      }`}
                    >
                      [{entry.level}] {entry.message}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
    </div>
  );
};
