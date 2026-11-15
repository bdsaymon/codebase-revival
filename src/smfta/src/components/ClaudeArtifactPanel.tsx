import React, { useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  FileArchive,
  Monitor,
  RotateCw,
  Smartphone,
  Tablet,
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

/**
 * Lightweight JSX/TSX -> JavaScript (__h / React.createElement) transpiler
 * so React components run immediately inside the sandboxed iframe even without
 * external CDN access.
 */
export function transpileReactArtifactCode(rawCode: string): {
  executableJs: string;
  componentName: string;
} {
  let src = String(rawCode || '').replace(/\r\n/g, '\n');

  // 1. Collect imported icon/helper names from third-party libraries (e.g. lucide-react)
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

  // 2. Strip TypeScript interface / type declarations and basic type annotations
  src = src.replace(/^\s*(?:export\s+)?interface\s+[A-Za-z0-9_]+[\s\S]*?^\s*\}/gm, '');
  src = src.replace(/^\s*(?:export\s+)?type\s+[A-Za-z0-9_]+\s*=[^;]+;/gm, '');
  src = src.replace(/useState<[^>]+>\s*\(/g, 'useState(');
  src = src.replace(/useRef<[^>]+>\s*\(/g, 'useRef(');
  src = src.replace(/:\s*React\.FC(?:<[^>]+>)?/g, '');
  src = src.replace(
    /\(\s*([a-zA-Z0-9_{},\s]+)\s*:\s*[A-Za-z0-9_<>{}[\]\s|&]+\s*\)/g,
    '($1)'
  );

  // 3. Detect root component name and strip `export default` / `export`
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
      }
      window.addEventListener('error', function(e) {
        showError(e.message || String(e.error || 'Runtime error'));
      });

      // Built-in lightweight reactive JSX runtime (zero external CDN required)
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
            try { cb(); } catch (e) {}
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

      // Simple in-browser JSX-to-createElement compiler for offline execution
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
          let last = 0;
          const exprRx = /\\{([\\s\\S]*?)\\}|React\\.createElement\\([\\s\\S]*?\\)/g;
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
        // Unwrap top-level {React.createElement(...)} after return / => / =
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

  // 1. React / JSX / TSX live component preview
  if (looksLikeReactOrJsxCode(trimmed, normalized)) {
    return buildReactSandboxHtml(code, combinedSiblingCss, 'React Component Preview');
  }

  // 2. Full HTML document or HTML fragment
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
<html lang="bn">
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
    return enrichedHtml;
  }

  // 3. If user clicked Preview on a CSS or JS block that has an HTML sibling in bundleFiles, render the merged HTML!
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

  // Fallback for HTML fragments / plain text
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    ${BUILTIN_UTILITY_CSS}
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
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>(
    'desktop'
  );
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  React.useEffect(() => {
    if (!artifact) return;
    setTab(isPreviewableLanguage(artifact.lang, artifact.code) ? 'preview' : 'code');
  }, [artifact]);

  if (!artifact) return null;

  const bundleFiles = artifact.bundleFiles || [];
  const srcDoc = buildArtifactSrcDoc(artifact.code, artifact.lang, bundleFiles);

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

  const iframeWidthClass =
    viewport === 'mobile'
      ? 'w-[390px] max-w-full mx-auto border-x border-[var(--border)] shadow-lg'
      : viewport === 'tablet'
        ? 'w-[768px] max-w-full mx-auto border-x border-[var(--border)] shadow-lg'
        : 'w-full';

  return (
    <aside
      data-testid="claude-artifact-panel"
      className="fixed inset-0 z-40 lg:static lg:z-auto w-full lg:w-[48%] xl:w-[50%] h-full min-h-0 border-l border-[var(--border)] bg-[var(--surface)] flex flex-col shrink-0 shadow-2xl lg:shadow-none"
    >
      {/* Top Bar */}
      <header className="h-13 px-3.5 border-b border-[var(--border)] flex items-center justify-between gap-2 bg-[var(--bg)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13.5px] font-medium text-[var(--ink)] truncate">
            {artifact.filename || artifact.title || 'Live Preview'}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10.5px] font-mono uppercase text-[var(--ink-dim)] shrink-0">
            {normalizePreviewLang(artifact.lang) || 'code'}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
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
                <span>Live</span>
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
            <div className="hidden sm:inline-flex items-center p-0.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
              <button
                type="button"
                data-testid="artifact-viewport-desktop"
                onClick={() => setViewport('desktop')}
                className={`w-6 h-6 rounded inline-flex items-center justify-center cursor-pointer ${
                  viewport === 'desktop'
                    ? 'bg-[var(--surface)] text-[var(--ink)]'
                    : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                }`}
                title="Desktop view"
                aria-label="Desktop view"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-testid="artifact-viewport-tablet"
                onClick={() => setViewport('tablet')}
                className={`w-6 h-6 rounded inline-flex items-center justify-center cursor-pointer ${
                  viewport === 'tablet'
                    ? 'bg-[var(--surface)] text-[var(--ink)]'
                    : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                }`}
                title="Tablet view"
                aria-label="Tablet view"
              >
                <Tablet className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-testid="artifact-viewport-mobile"
                onClick={() => setViewport('mobile')}
                className={`w-6 h-6 rounded inline-flex items-center justify-center cursor-pointer ${
                  viewport === 'mobile'
                    ? 'bg-[var(--surface)] text-[var(--ink)]'
                    : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                }`}
                title="Mobile view"
                aria-label="Mobile view"
              >
                <Smartphone className="w-3.5 h-3.5" />
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
      <div className="flex-1 min-h-0 overflow-hidden bg-white dark:bg-[#141416] flex justify-center">
        {tab === 'preview' && canPreview ? (
          <iframe
            key={iframeKey}
            data-testid="artifact-preview-iframe"
            title={artifact.title || 'Artifact Preview'}
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-modals allow-forms"
            className={`${iframeWidthClass} h-full border-0 bg-white block`}
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
