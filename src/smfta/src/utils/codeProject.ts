/**
 * SMFTA AI Pro — code workspace (v18.8.0)
 *
 * “সে যেন প্রত্যেক কোড লিখতে পারে প্রত্যেক ল্যাংগুয়েজে … আরেক পাশে রান হয়ে যায়”
 *
 * The assistant writes code in any language. This module turns those code
 * blocks into a real project:
 *
 *   • named files with the right extension (index.html, styles.css, App.tsx,
 *     main.py, Main.java, main.rs …),
 *   • a runnable preview document when the language can run in the browser,
 *   • an honest `runHint` for languages that cannot (python, java, rust …),
 *   • a `.zip` of the whole project for download.
 *
 * Pure functions (no DOM except in the download helper) → unit tested.
 */

import { zipSync, strToU8 } from 'fflate';
import {
  buildPreviewDocument,
  hasPreviewableCode,
  type CodeBlockInfo,
} from './livePreview';

export type CodeProjectKind = 'web' | 'script' | 'markup' | 'other';

export interface CodeFile {
  name: string;
  lang: string;
  /** Human label shown on the tab, e.g. "HTML", "TypeScript". */
  label: string;
  content: string;
}

export interface CodeProject {
  title: string;
  files: CodeFile[];
  /** Can the browser run this right now in the sandboxed preview? */
  runnable: boolean;
  /** Full document for the iframe (only when `runnable`). */
  previewHtml: string | null;
  /** "HTML + CSS + JavaScript" etc. */
  languageLabel: string;
  kind: CodeProjectKind;
  /** How to run it when the browser cannot. */
  runHint: string;
  /** Files that would go into the download (index.html + sources). */
  zipFiles: CodeFile[];
}

/** Fence label → canonical language key. */
const LANG_ALIASES: Record<string, string> = {
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  xml: 'html',
  svg: 'html',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  js: 'js',
  javascript: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  ts: 'ts',
  typescript: 'ts',
  tsx: 'tsx',
  react: 'jsx',
  vue: 'vue',
  svelte: 'svelte',
  py: 'python',
  python: 'python',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  cc: 'cpp',
  cs: 'csharp',
  csharp: 'csharp',
  go: 'go',
  golang: 'go',
  rs: 'rust',
  rust: 'rust',
  rb: 'ruby',
  ruby: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  kotlin: 'kotlin',
  dart: 'dart',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  shell: 'bash',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  text: 'text',
  code: 'text',
};

interface LangSpec {
  label: string;
  ext: string;
  /** Base file names, in order of appearance. */
  names: string[];
  /** Command shown when this language cannot run in the browser. */
  run?: string;
}

const LANG_SPECS: Record<string, LangSpec> = {
  html: { label: 'HTML', ext: 'html', names: ['index'] },
  css: { label: 'CSS', ext: 'css', names: ['styles'] },
  js: { label: 'JavaScript', ext: 'js', names: ['app'] },
  jsx: { label: 'React JSX', ext: 'jsx', names: ['App'] },
  ts: { label: 'TypeScript', ext: 'ts', names: ['main'], run: 'npx tsx main.ts' },
  tsx: { label: 'React TSX', ext: 'tsx', names: ['App'], run: 'npm create vite@latest && npm run dev' },
  vue: { label: 'Vue', ext: 'vue', names: ['App'], run: 'npm run dev (Vite + Vue)' },
  svelte: { label: 'Svelte', ext: 'svelte', names: ['App'], run: 'npm run dev (Vite + Svelte)' },
  python: { label: 'Python', ext: 'py', names: ['main'], run: 'python main.py' },
  java: { label: 'Java', ext: 'java', names: ['Main'], run: 'javac Main.java && java Main' },
  c: { label: 'C', ext: 'c', names: ['main'], run: 'gcc main.c -o main && ./main' },
  cpp: { label: 'C++', ext: 'cpp', names: ['main'], run: 'g++ main.cpp -o main && ./main' },
  csharp: { label: 'C#', ext: 'cs', names: ['Program'], run: 'dotnet run' },
  go: { label: 'Go', ext: 'go', names: ['main'], run: 'go run main.go' },
  rust: { label: 'Rust', ext: 'rs', names: ['main'], run: 'cargo run' },
  ruby: { label: 'Ruby', ext: 'rb', names: ['main'], run: 'ruby main.rb' },
  php: { label: 'PHP', ext: 'php', names: ['index'], run: 'php -S localhost:8000' },
  swift: { label: 'Swift', ext: 'swift', names: ['main'], run: 'swift main.swift' },
  kotlin: { label: 'Kotlin', ext: 'kt', names: ['Main'], run: 'kotlinc Main.kt -include-runtime -d main.jar && java -jar main.jar' },
  dart: { label: 'Dart', ext: 'dart', names: ['main'], run: 'dart run main.dart' },
  bash: { label: 'Shell', ext: 'sh', names: ['run'], run: 'bash run.sh' },
  sql: { label: 'SQL', ext: 'sql', names: ['query'], run: 'run it in your database client' },
  json: { label: 'JSON', ext: 'json', names: ['data'] },
  yaml: { label: 'YAML', ext: 'yml', names: ['config'] },
  toml: { label: 'TOML', ext: 'toml', names: ['config'] },
  markdown: { label: 'Markdown', ext: 'md', names: ['README'] },
  text: { label: 'Code', ext: 'txt', names: ['snippet'] },
};

/** Fence label → canonical key (accepts `ts`, `TypeScript`, `c++`, …). */
export function normalizeLang(raw: string, content = ''): string {
  const key = (raw || '').trim().toLowerCase().split(/[\s{]/)[0].replace(/^language-/, '');
  if (LANG_ALIASES[key]) return LANG_ALIASES[key];
  if (!key || key === 'plaintext') {
    // No label: guess markup, otherwise treat as plain code.
    if (/<!doctype\s+html|<html[\s>]/i.test(content)) return 'html';
    if (/(?:^|[}\n])\s*(?:[.#][\w-]+|[a-zA-Z][\w-]*)\s*(?:,\s*[^\n{]+)?\{[^}]*[:;][^}]*\}/m.test(content)) return 'css';
    if (/^\s*(?:def |import |from |class )\w+/m.test(content)) return 'python';
    return 'text';
  }
  return LANG_SPECS[key] ? key : 'text';
}

export function labelForLang(lang: string): string {
  return LANG_SPECS[lang]?.label || 'Code';
}

export function fileNameFor(lang: string, index: number): string {
  const spec = LANG_SPECS[lang] || LANG_SPECS.text;
  const base = spec.names[index] || `${spec.names[0] || 'file'}${index + 1}`;
  return `${base}.${spec.ext}`;
}

/** Cleans a fence into a nicely formatted file (tabs → 2 spaces, no stray blank lines). */
export function tidyCode(content: string): string {
  const untabbed = (content || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/[ \t]+$/gm, '')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');

  // Dedent: a fence pasted from an indented block should start at column 0.
  const lines = untabbed.split('\n');
  let min = Infinity;
  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
    if (indent < min) min = indent;
  }
  if (!Number.isFinite(min) || min === 0) return untabbed;
  return lines.map((l) => (l.trim() ? l.slice(min) : l)).join('\n');
}

/**
 * Builds the whole workspace view-model from the code blocks of one answer.
 */
export function buildCodeProject(
  blocks: CodeBlockInfo[],
  title = 'Code workspace'
): CodeProject {
  const usable = (blocks || []).filter((b) => (b.content || '').trim().length > 0);

  const files: CodeFile[] = [];
  const usedNames = new Set<string>();
  const perLangCount: Record<string, number> = {};

  for (const block of usable) {
    const lang = normalizeLang(block.lang, block.content);
    const seen = perLangCount[lang] || 0;
    perLangCount[lang] = seen + 1;
    let name = fileNameFor(lang, seen);
    let n = 2;
    while (usedNames.has(name)) {
      name = name.replace(/(\.[^.]+)$/, `-${n}$1`);
      n += 1;
    }
    usedNames.add(name);
    files.push({ name, lang, label: labelForLang(lang), content: tidyCode(block.content) });
  }

  // Any html/css/js answer can run; other languages are shown and exported but
  // honestly marked as "cannot run in the browser".
  const langs = new Set(usable.map((b) => normalizeLang(b.lang, b.content)));
  const hasHtml = langs.has('html');
  const hasCss = langs.has('css');
  // Markup (or markup + assets) runs for real; a lone stylesheet gets the demo
  // scaffold so its effect is still visible. A lone .js file is usually a Node
  // script, so it is exported instead of pretended to run.
  const webish = hasHtml || hasCss;
  const preview = webish ? buildPreviewDocument(usable, { title }) : null;
  const runnable = Boolean(preview) && (hasHtml || hasCss);

  const labels = Array.from(new Set(files.map((f) => f.label)));
  const languageLabel = labels.length ? labels.join(' + ') : 'Code';

  const kinds = new Set(files.map((f) => f.lang));
  const isWeb = kinds.has('html') || kinds.has('css') || kinds.has('js');
  const kind: CodeProjectKind = isWeb
    ? 'web'
    : files.every((f) => ['json', 'yaml', 'toml', 'markdown', 'text', 'sql'].includes(f.lang))
    ? 'markup'
    : 'script';

  const runnableLang = files.find((f) => LANG_SPECS[f.lang]?.run);
  const runHint =
    runnable && preview
      ? `ব্রাউজারে চলছে — Live Preview বন্ধ করে দিলে ফাইল নিয়ে যেকোনো ব্রাউজারে খুললেই চলবে।`
      : runnableLang
      ? `${runnableLang.label} ব্রাউজারে সরাসরি চলে না — ফাইলগুলো নামিয়ে: ${LANG_SPECS[runnableLang.lang].run}`
      : kind === 'markup'
      ? 'এটি ডেটা/ডকুমেন্ট ফাইল — নামিয়ে নিজের প্রজেক্টে ব্যবহার করুন।'
      : 'ফাইলগুলো নামিয়ে নিজের পরিবেশে চালান।';

  // ── what goes into the download ────────────────────────────────────────────
  const zipFiles: CodeFile[] = [];
  if (runnable && preview) {
    const html = files.filter((f) => f.lang === 'html');
    const css = files.filter((f) => f.lang === 'css');
    const js = files.filter((f) => f.lang === 'js');
    if (html.length > 0) {
      // Keep the author's own markup, but wire the sibling files into it so
      // the downloaded project runs from disk exactly like the preview.
      let doc = html[0].content;
      const linkTags = css
        .map((f) => `  <link rel="stylesheet" href="${f.name}" />`)
        .join('\n');
      const scriptTags = js
        .map((f) => `  <script src="${f.name}"></script>`)
        .join('\n');
      if (linkTags && !/<link[^>]+stylesheet/i.test(doc)) {
        doc = /<\/head>/i.test(doc)
          ? doc.replace(/<\/head>/i, `${linkTags}\n</head>`)
          : `${linkTags}\n${doc}`;
      }
      if (scriptTags && !/<script[^>]+src=/i.test(doc)) {
        doc = /<\/body>/i.test(doc)
          ? doc.replace(/<\/body>/i, `${scriptTags}\n</body>`)
          : `${doc}\n${scriptTags}`;
      }
      zipFiles.push({ ...html[0], content: doc });
      zipFiles.push(...css, ...js, ...html.slice(1));
    } else {
      // css/js only — the preview wrapped it, so ship the wrapper.
      zipFiles.push({
        name: 'index.html',
        lang: 'html',
        label: 'HTML',
        content: preview.html,
      });
      zipFiles.push(...css, ...js);
    }
    const extra = files.filter(
      (f) => !['html', 'css', 'js'].includes(f.lang)
    );
    zipFiles.push(...extra);
  } else {
    zipFiles.push(...files);
  }

  zipFiles.push({
    name: 'README.txt',
    lang: 'text',
    label: 'README',
    content: buildReadme(title, files, runHint),
  });

  return {
    title,
    files,
    runnable: Boolean(runnable && preview),
    previewHtml: preview?.html || null,
    languageLabel,
    kind,
    runHint,
    zipFiles,
  };
}

function buildReadme(title: string, files: CodeFile[], runHint: string): string {
  return [
    title,
    '',
    'SMFTA AI Pro-তে তৈরি।',
    '',
    'ফাইল:',
    ...files.map((f) => `  - ${f.name}  (${f.label})`),
    '',
    'চালানোর নিয়ম:',
    `  ${runHint}`,
  ].join('\n');
}

export function codeProjectZip(project: CodeProject): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of project.zipFiles) entries[f.name] = strToU8(f.content);
  return zipSync(entries);
}

/** Browser trigger — no-op in node so tests can import this module. */
export function downloadCodeProject(project: CodeProject): void {
  if (typeof document === 'undefined') return;
  const bytes = codeProjectZip(project);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe =
    (project.title || 'smfta-code')
      .replace(/[^\w\u0980-\u09FF-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'smfta-code';
  a.href = url;
  a.download = `${safe}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
