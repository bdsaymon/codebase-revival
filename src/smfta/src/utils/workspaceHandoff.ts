import { WORKSPACE_RUNTIME_CAPABILITIES } from './capabilityRegistry';

export interface WorkspaceCodeBlockItem {
  id: string;
  language: string;
  code: string;
  originalCode: string;
  filename: string;
}

export interface WorkspaceHandoffPayload {
  blocks: WorkspaceCodeBlockItem[];
  activeBlockIndex: number;
  conversationId: number | null;
  messageId: string | null;
  conversationTitle?: string;
  createdAt: number;
}

export const WORKSPACE_HANDOFF_STORAGE_KEY = 'smfta_workspace_handoff_v19';

export function normalizeLanguageId(raw?: string): string {
  const s = String(raw || 'text')
    .trim()
    .toLowerCase()
    .replace(/^language-/, '');
  if (!s) return 'text';
  const aliasMap: Record<string, string> = {
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    py: 'python',
    htm: 'html',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    md: 'markdown',
    c: 'c',
    'c++': 'cpp',
    rs: 'rust',
    golang: 'go',
  };
  return aliasMap[s] || s;
}

export function defaultFilenameForLanguage(lang: string, index = 0): string {
  const norm = normalizeLanguageId(lang);
  const suffix = index > 0 ? `-${index + 1}` : '';
  const extMap: Record<string, string> = {
    html: 'index.html',
    css: `styles${suffix}.css`,
    javascript: `script${suffix}.js`,
    jsx: `Component${suffix}.jsx`,
    typescript: `script${suffix}.ts`,
    tsx: `Component${suffix}.tsx`,
    python: `main${suffix}.py`,
    json: `data${suffix}.json`,
    sql: `query${suffix}.sql`,
    bash: `script${suffix}.sh`,
    svg: `graphic${suffix}.svg`,
    markdown: `README${suffix}.md`,
    c: `main${suffix}.c`,
    cpp: `main${suffix}.cpp`,
    rust: `main${suffix}.rs`,
    go: `main${suffix}.go`,
    java: `Main${suffix}.java`,
  };
  return extMap[norm] || `snippet${suffix || '-1'}.txt`;
}

export interface LanguageRuntimeSupport {
  normalizedLanguage: string;
  mode: 'html-preview' | 'js-sandbox' | 'json-validator' | 'unsupported-runtime';
  executable: boolean;
  badgeLabel: string;
  notice: string;
}

export function classifyWorkspaceLanguage(rawLang?: string): LanguageRuntimeSupport {
  const norm = normalizeLanguageId(rawLang);
  for (const cap of WORKSPACE_RUNTIME_CAPABILITIES) {
    if (cap.language === norm || cap.aliases.includes(norm)) {
      return {
        normalizedLanguage: norm,
        mode: cap.mode,
        executable: cap.executableInBrowser,
        badgeLabel:
          cap.mode === 'html-preview'
            ? 'Sandboxed HTML/CSS Preview'
            : cap.mode === 'js-sandbox'
            ? 'Isolated JS Sandbox'
            : cap.mode === 'json-validator'
            ? 'JSON Validator & Formatter'
            : 'Editor Only (No Server Container)',
        notice: cap.description,
      };
    }
  }
  return {
    normalizedLanguage: norm,
    mode: 'unsupported-runtime',
    executable: false,
    badgeLabel: 'Editor Only (No Runtime)',
    notice:
      'No isolated browser or backend execution container is configured for this language. You can edit, copy, or download the source file safely.',
  };
}

export function createWorkspaceHandoffPayload(params: {
  rawBlocks: Array<{ lang: string; code: string }>;
  selectedIndex?: number;
  conversationId?: number | null;
  messageId?: string | null;
  conversationTitle?: string;
}): WorkspaceHandoffPayload {
  const safeBlocks =
    params.rawBlocks && params.rawBlocks.length > 0
      ? params.rawBlocks
      : [{ lang: 'html', code: '<!-- Empty workspace -->\n<h1>Hello Workspace</h1>' }];

  const blocks: WorkspaceCodeBlockItem[] = safeBlocks.map((b, idx) => {
    const language = normalizeLanguageId(b.lang);
    return {
      id: `block-${idx + 1}`,
      language,
      code: String(b.code ?? ''),
      originalCode: String(b.code ?? ''),
      filename: defaultFilenameForLanguage(language, idx),
    };
  });

  const activeBlockIndex = Math.max(
    0,
    Math.min(blocks.length - 1, params.selectedIndex ?? 0)
  );

  return {
    blocks,
    activeBlockIndex,
    conversationId: params.conversationId ?? null,
    messageId: params.messageId ?? null,
    conversationTitle: params.conversationTitle,
    createdAt: Date.now(),
  };
}

export function saveWorkspaceHandoff(payload: WorkspaceHandoffPayload): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    sessionStorage.setItem(WORKSPACE_HANDOFF_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadWorkspaceHandoff(): WorkspaceHandoffPayload | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(WORKSPACE_HANDOFF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceHandoffPayload;
    if (!parsed || !Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
      return null;
    }
    return {
      blocks: parsed.blocks.map((b, idx) => ({
        id: typeof b.id === 'string' ? b.id : `block-${idx + 1}`,
        language: normalizeLanguageId(b.language),
        code: typeof b.code === 'string' ? b.code : '',
        originalCode:
          typeof b.originalCode === 'string'
            ? b.originalCode
            : typeof b.code === 'string'
            ? b.code
            : '',
        filename:
          typeof b.filename === 'string' && b.filename.trim()
            ? b.filename
            : defaultFilenameForLanguage(b.language, idx),
      })),
      activeBlockIndex:
        typeof parsed.activeBlockIndex === 'number'
          ? Math.max(0, Math.min(parsed.blocks.length - 1, parsed.activeBlockIndex))
          : 0,
      conversationId:
        typeof parsed.conversationId === 'number' ? parsed.conversationId : null,
      messageId: typeof parsed.messageId === 'string' ? parsed.messageId : null,
      conversationTitle:
        typeof parsed.conversationTitle === 'string'
          ? parsed.conversationTitle
          : undefined,
      createdAt:
        typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function clearWorkspaceHandoff(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(WORKSPACE_HANDOFF_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Strips minimal TypeScript type annotations for browser sandbox execution
 * when the user runs a TypeScript snippet inside the isolated JS sandbox.
 */
export function transpileMinimalTsForSandbox(source: string): string {
  return source
    .replace(/^\s*interface\s+\w+[\s\S]*?^\}/gm, '')
    .replace(/^\s*type\s+\w+\s*=[^;]+;/gm, '')
    .replace(/:\s*(?:string|number|boolean|any|unknown|void|never|Record<[^>]+>|Array<[^>]+>|\w+\[\])(?=\s*[=,);\n])/g, '');
}

/**
 * Builds an isolated HTML document for `<iframe sandbox="allow-scripts">`.
 * Never uses `eval()` or `new Function()`. Captures console logs, warnings,
 * uncaught errors, and line numbers via `parent.postMessage`.
 */
export function buildIsolatedSandboxSrcDoc(params: {
  code: string;
  language: string;
  runId: number;
  companionBlocks?: WorkspaceCodeBlockItem[];
}): string {
  const { code, language, runId, companionBlocks = [] } = params;
  const norm = normalizeLanguageId(language);

  const telemetryBootstrap = `<script>
(function() {
  var RUN_ID = ${Number(runId) || 1};
  function send(kind, payload) {
    try {
      parent.postMessage(Object.assign({ __smftaWorkspace: true, runId: RUN_ID, kind: kind }, payload), '*');
    } catch (_) {}
  }
  function fmt(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.name + ': ' + v.message;
    try { return JSON.stringify(v, null, 2); } catch (_) { return String(v); }
  }
  ['log', 'info', 'warn', 'error'].forEach(function(level) {
    var orig = console[level];
    console[level] = function() {
      var args = Array.prototype.slice.call(arguments);
      send('console', { level: level, text: args.map(fmt).join(' ') });
      if (orig) orig.apply(console, arguments);
    };
  });
  window.addEventListener('error', function(ev) {
    send('error', {
      message: ev.message || 'Runtime Error',
      line: typeof ev.lineno === 'number' ? ev.lineno : null,
      column: typeof ev.colno === 'number' ? ev.colno : null
    });
  });
  window.addEventListener('unhandledrejection', function(ev) {
    var reason = ev && ev.reason ? (ev.reason.message || String(ev.reason)) : 'Unhandled Promise rejection';
    send('error', { message: reason, line: null, column: null });
  });
  window.addEventListener('load', function() {
    send('complete', { status: 'done' });
  });
})();
</script>`;

  const strictCsp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none';">`;

  if (norm === 'javascript' || norm === 'typescript' || norm === 'jsx' || norm === 'tsx') {
    const executableJs =
      norm === 'typescript' || norm === 'tsx'
        ? transpileMinimalTsForSandbox(code)
        : code;
    const escapedForScript = executableJs.replace(/<\/script>/gi, '<\\/script>');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
${strictCsp}
<style>
  body {
    margin: 0;
    padding: 16px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    background: #0f172a;
    color: #e2e8f0;
  }
  #app, #root { min-height: 24px; }
</style>
${telemetryBootstrap}
</head>
<body>
<div id="app"></div>
<div id="root"></div>
<script>
try {
${escapedForScript}
} catch (err) {
  console.error(err instanceof Error ? err.name + ': ' + err.message : String(err));
}
</script>
</body>
</html>`;
  }

  if (norm === 'css') {
    const htmlCompanion = companionBlocks.find(
      (b) => normalizeLanguageId(b.language) === 'html'
    );
    const bodyHtml =
      htmlCompanion?.code ||
      `<div class="demo-box"><h2>CSS Sandbox Preview</h2><p>Stylesheet applied inside isolated sandbox.</p><button>Sample Button</button></div>`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
${strictCsp}
<style>${code}</style>
${telemetryBootstrap}
</head>
<body>
${bodyHtml}
</body>
</html>`;
  }

  if (norm === 'svg') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
${strictCsp}
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;}</style>
${telemetryBootstrap}
</head>
<body>
${code}
</body>
</html>`;
  }

  // Default HTML preview (injects companion CSS/JS blocks if present and not already inline)
  const extraCss = companionBlocks
    .filter((b) => normalizeLanguageId(b.language) === 'css')
    .map((b) => b.code)
    .join('\n');
  const extraJs = companionBlocks
    .filter((b) => normalizeLanguageId(b.language) === 'javascript')
    .map((b) => b.code.replace(/<\/script>/gi, '<\\/script>'))
    .join('\n');

  const headInjection = `${strictCsp}\n${telemetryBootstrap}${
    extraCss ? `\n<style>${extraCss}</style>` : ''
  }`;

  if (/<head[\s>]/i.test(code)) {
    let doc = code.replace(/<head([^>]*)>/i, `<head$1>\n${headInjection}\n`);
    if (extraJs && !/<script[\s>]/i.test(code)) {
      doc = doc.replace(/<\/body>/i, `<script>\n${extraJs}\n</script>\n</body>`);
    }
    return doc;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${headInjection}
</head>
<body>
${code}
${extraJs ? `<script>\n${extraJs}\n</script>` : ''}
</body>
</html>`;
}
