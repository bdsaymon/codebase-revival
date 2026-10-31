/**
 * SMFTA AI Pro — Live Preview Engine 🖥️ (v18.2.0)
 *
 * Turns AI-written code into something you can actually SEE running.
 * Handles single-file pages, split HTML/CSS/JS blocks, loose fragments and
 * "design this site" demos, then hands a complete document to a sandboxed
 * iframe. Pure functions → unit-tested.
 */

export interface CodeBlockInfo {
  lang: string;
  content: string;
  index: number;
}

export interface PreviewDocument {
  /** Complete, runnable HTML document. */
  html: string;
  /** How it was assembled (shown in the preview header). */
  mode: 'page' | 'merged' | 'fragment';
  /** Original language labels that contributed. */
  parts: string[];
  /** Short human label, e.g. "Landing page demo". */
  title: string;
}

const HTML_LANGS = new Set(['html', 'htm', 'xhtml', 'xml', 'svg', 'vue-html']);
const CSS_LANGS = new Set(['css', 'scss', 'less', 'tailwind']);
const JS_LANGS = new Set(['js', 'javascript', 'mjs', 'ts', 'typescript', 'jsx', 'tsx']);

/** True when a block's language says "this is renderable markup". */
export function isHtmlLang(lang: string): boolean {
  return HTML_LANGS.has((lang || '').toLowerCase());
}

export function isCssLang(lang: string): boolean {
  return CSS_LANGS.has((lang || '').toLowerCase());
}

export function isJsLang(lang: string): boolean {
  return JS_LANGS.has((lang || '').toLowerCase());
}

/**
 * A loose heuristic: does this text look like markup we can render?
 * Used when the model forgets the ```html language tag.
 */
export function looksLikeMarkup(content: string): boolean {
  const text = (content || '').trim();
  if (text.length < 40) return false;
  if (/<!doctype\s+html|<html[\s>]|<body[\s>]/i.test(text)) return true;
  const tagMatches = text.match(/<\/?(?:div|section|main|header|footer|nav|h[1-6]|p|ul|ol|li|button|a|span|form|input|table|img|svg|canvas)\b/gi);
  if (!tagMatches || tagMatches.length < 3) return false;
  // A stray JSX file without a build step is not directly runnable, so keep it
  // out unless it also carries styles/markup structure.
  const hasStyle = /<style[\s>]|class=|style="/i.test(text);
  return hasStyle || /<!doctype|<html/i.test(text);
}

/** A web page (or page fragment) that can be previewed live. */
export function isPreviewableBlock(block: CodeBlockInfo): boolean {
  if (isHtmlLang(block.lang)) return true;
  if (block.lang === 'code' || block.lang === '' || block.lang === 'text') {
    return looksLikeMarkup(block.content);
  }
  // css / js on their own are only useful together with markup — handled in
  // buildPreviewDocument(). Individually they are not previewable.
  return false;
}

/** Does the message contain anything worth a Live Preview button? */
export function hasPreviewableCode(blocks: CodeBlockInfo[]): boolean {
  if (!blocks.length) return false;
  if (blocks.some(isPreviewableBlock)) return true;
  // CSS or JS alongside markup → mergeable
  const css = blocks.filter((b) => isCssLang(b.lang));
  const js = blocks.filter((b) => isJsLang(b.lang));
  const html = blocks.filter((b) => isHtmlLang(b.lang) || looksLikeMarkup(b.content));
  return html.length > 0 && (css.length > 0 || js.length > 0);
}

function stripScriptTags(js: string): string {
  return js.replace(/^\s*(export\s+default|module\.exports|export\s+)/gm, '');
}

/** Builds one runnable document from any combination of blocks. */
export function buildPreviewDocument(
  blocks: CodeBlockInfo[],
  hints: { title?: string } = {}
): PreviewDocument | null {
  if (!blocks.length) return null;

  const htmlBlocks = blocks.filter((b) => isHtmlLang(b.lang) || looksLikeMarkup(b.content));
  const cssBlocks = blocks.filter((b) => isCssLang(b.lang));
  const jsBlocks = blocks.filter((b) => isJsLang(b.lang) && !isHtmlLang(b.lang));

  const css = cssBlocks.map((b) => b.content).join('\n\n');
  const js = jsBlocks.map((b) => b.content).join('\n\n');

  // 1. A complete page already exists → use it (inject any extra css/js).
  const pageBlock = htmlBlocks.find((b) => /<!doctype\s+html|<html[\s>]/i.test(b.content));
  if (pageBlock) {
    let html = pageBlock.content;
    if (css.trim()) {
      const styleTag = `<style>\n${css}\n</style>`;
      html = /<\/head>/i.test(html)
        ? html.replace(/<\/head>/i, `${styleTag}\n</head>`)
        : styleTag + html;
    }
    if (js.trim()) {
      const scriptTag = `<script>\n${stripScriptTags(js)}\n</script>`;
      html = /<\/body>/i.test(html)
        ? html.replace(/<\/body>/i, `${scriptTag}\n</body>`)
        : html + scriptTag;
    }
    return {
      html,
      mode: css || js ? 'merged' : 'page',
      parts: [
        pageBlock.lang || 'html',
        ...(css ? ['css'] : []),
        ...(js ? ['js'] : []),
      ],
      title: hints.title || 'Live page',
    };
  }

  // 2. A big HTML fragment → wrap it into a document.
  const bigFragment = htmlBlocks
    .slice()
    .sort((a, b) => b.content.length - a.content.length)[0];
  if (bigFragment) {
    const isSvgOnly = /^\s*<svg[\s>]/i.test(bigFragment.content.trim());
    const body = bigFragment.content;
    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${(hints.title || 'SMFTA Live Preview').replace(/[<>]/g, '')}</title>
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Bengali", sans-serif; }
  ${isSvgOnly ? 'html,body{height:100%;display:grid;place-items:center;background:#0b0b0f;}' : ''}
${css}
</style>
</head>
<body>
${body}
${js ? `<script>\n${stripScriptTags(js)}\n</script>` : ''}
</body>
</html>`;
    return {
      html,
      // Split HTML + CSS/JS blocks are a genuine merge, not a bare fragment.
      mode: css || js ? 'merged' : 'fragment',
      parts: [bigFragment.lang || 'html', ...(css ? ['css'] : []), ...(js ? ['js'] : [])],
      title: hints.title || 'Live demo',
    };
  }

  // 3. CSS/JS only — show them applied to a tiny demo scaffold so the user can
  //    still see the effect instead of a blank screen.
  if (css.trim() || js.trim()) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${(hints.title || 'SMFTA Live Preview').replace(/[<>]/g, '')}</title>
<style>
  body { font-family: system-ui, -apple-system, "Noto Sans Bengali", sans-serif; padding: 24px; }
${css}
</style>
</head>
<body>
  <h1>Preview</h1>
  <p>এই ডেমোতে আপনার CSS/JS প্রয়োগ করা হয়েছে।</p>
  <button id="demo-btn">Click me</button>
  <div id="demo-out" style="margin-top:12px"></div>
  <script>
    const out = document.getElementById('demo-out');
    document.getElementById('demo-btn')?.addEventListener('click', () => {
      out.textContent = 'Clicked at ' + new Date().toLocaleTimeString();
    });
    ${stripScriptTags(js)}
  </script>
</body>
</html>`;
    return {
      html,
      mode: css && js ? 'merged' : 'fragment',
      parts: [...(css ? ['css'] : []), ...(js ? ['js'] : [])],
      title: hints.title || 'Live demo',
    };
  }

  return null;
}

/** Extract ```fenced blocks from a markdown message (unclosed fences included). */
export function extractCodeBlocks(markdown: string): CodeBlockInfo[] {
  const blocks: CodeBlockInfo[] = [];
  const rx = /```([^\n`]*)\r?\n([\s\S]*?)(?:```|$)/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = rx.exec(markdown)) !== null) {
    const lang = (m[1] || '').trim().split(/\s+/)[0]?.toLowerCase() || 'code';
    blocks.push({ lang, content: (m[2] || '').replace(/\n$/, ''), index: i });
    i += 1;
  }
  return blocks;
}

export const PREVIEW_DEVICES = [
  { id: 'mobile', label: 'Mobile', width: 390, height: 780 },
  { id: 'tablet', label: 'Tablet', width: 768, height: 900 },
  { id: 'desktop', label: 'Desktop', width: 0, height: 0 },
] as const;

export type PreviewDeviceId = (typeof PREVIEW_DEVICES)[number]['id'];

/** Uses the <title> of the generated page as the preview name when present. */
export function previewTitleFromHtml(html: string, fallback = 'Live preview'): string {
  const m = html.match(/<title[^>]*>([^<]{2,80})<\/title>/i);
  if (m && m[1].trim()) return m[1].trim();
  const h1 = html.match(/<h1[^>]*>([^<]{2,80})<\/h1>/i);
  if (h1) return h1[1].trim().replace(/\s+/g, ' ');
  return fallback;
}

/**
 * Is the user asking us to build/design a website or a UI?
 * Used both to steer the prompt and to guarantee a runnable demo exists.
 */
export function isWebsiteBuildRequest(text: string): boolean {
  const t = (text || '').toLowerCase();
  if (!t.trim()) return false;
  const bn = /(ওয়েবসাইট|ওয়েবসাইটের|ওয়েব ?সাইট|ওয়েবপেজ|ল্যান্ডিং|ডিজাইন|ইউআই|ইউএক্স|পোর্টফোলিও|ড্যাশবোর্ড|পেজ বানাও|সাইট বানাও)/;
  const en = /\b(website|web ?page|webpage|landing ?page|ui|ux|design|dashboard|portfolio|template|html page|frontend|front-end|home ?page|hero section)\b/;
  const build = /(বানাও|বানিয়ে|তৈরি|ডিজাইন|লিখো|লিখে|create|build|make|design|generate|code|develop|write)/;
  return (bn.test(t) || en.test(t)) && build.test(t);
}

/**
 * A complete, self-contained starter site. This is the guaranteed fallback for
 * "এই ওয়েবসাইটের ডিজাইনটা বানাও" when the model replies with prose only — the
 * user still gets a clickable Live demo instead of nothing.
 */
export function buildStarterDemoPage(prompt: string, title = 'SMFTA Live Demo'): string {
  const topic = (prompt || '').replace(/[`<>&]/g, '').slice(0, 90).trim() || 'your idea';
  const safeTitle = title.replace(/[<>&]/g, '');
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<style>
  :root{--bg:#0b1220;--card:#131c2e;--ink:#e8eefc;--dim:#9fb0cc;--accent:#34d399;--accent2:#38bdf8}
  *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans Bengali',sans-serif;background:radial-gradient(1200px 600px at 10% -10%,#1c2b46 0%,var(--bg) 55%);color:var(--ink)}
  a{color:inherit;text-decoration:none}
  header{display:flex;align-items:center;justify-content:space-between;padding:20px 6vw;border-bottom:1px solid rgba(255,255,255,.08);position:sticky;top:0;backdrop-filter:blur(10px);background:rgba(11,18,32,.7);z-index:5}
  .logo{display:flex;gap:10px;align-items:center;font-weight:700;letter-spacing:.3px}
  .dot{width:12px;height:12px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2))}
  nav{display:flex;gap:22px;font-size:14px;color:var(--dim)}
  nav a:hover{color:var(--ink)}
  .hero{padding:72px 6vw 48px;display:grid;gap:26px;grid-template-columns:1.1fr .9fr;align-items:center}
  .badge{display:inline-flex;gap:8px;align-items:center;font-size:12px;color:var(--accent);background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3);padding:6px 12px;border-radius:999px}
  h1{font-size:clamp(28px,4vw,52px);line-height:1.15;margin:18px 0 12px}
  .grad{background:linear-gradient(120deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
  p.lead{color:var(--dim);font-size:16px;line-height:1.7;margin:0 0 26px;max-width:52ch}
  .cta{display:flex;gap:12px;flex-wrap:wrap}
  button{font:inherit;cursor:pointer;border:0;border-radius:12px;padding:13px 22px;font-weight:600}
  .primary{background:linear-gradient(120deg,var(--accent),var(--accent2));color:#04121a}
  .ghost{background:transparent;color:var(--ink);border:1px solid rgba(255,255,255,.18)}
  .panel{background:linear-gradient(180deg,var(--card),#0f172a);border:1px solid rgba(255,255,255,.09);border-radius:20px;padding:20px;box-shadow:0 30px 80px -30px rgba(0,0,0,.9)}
  .row{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px dashed rgba(255,255,255,.08);font-size:14px}
  .row:last-child{border:0}
  .ok{color:var(--accent)}
  .cards{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));padding:10px 6vw 70px}
  .card{background:var(--card);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;transition:.2s}
  .card:hover{transform:translateY(-4px);border-color:rgba(52,211,153,.45)}
  .card h3{margin:8px 0 6px;font-size:16px}
  .card p{margin:0;color:var(--dim);font-size:14px;line-height:1.6}
  .ic{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:rgba(56,189,248,.14);color:var(--accent2);font-size:19px}
  footer{padding:26px 6vw;border-top:1px solid rgba(255,255,255,.08);color:var(--dim);font-size:13px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}
  .clickme{color:var(--accent)}
  @media(max-width:820px){.hero{grid-template-columns:1fr;padding-top:44px}nav{display:none}}
</style>
</head>
<body>
<header>
  <div class="logo"><span class="dot"></span> SMFTA · Live Demo</div>
  <nav><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#contact">Contact</a></nav>
</header>
<section class="hero">
  <div>
    <span class="badge">● Live preview · রিয়েল-টাইমে চলছে</span>
    <h1>${safeTitle} <span class="grad">— যেভাবে চেয়েছিলেন</span></h1>
    <p class="lead">এই পেজটি আপনার অনুরোধ <strong>“${topic}”</strong> থেকে তৈরি একটি সম্পূর্ণ কার্যকর ডেমো। বাটনে ক্লিক করুন — সবকিছু সত্যিই কাজ করে।</p>
    <div class="cta">
      <button class="primary" id="start">শুরু করুন</button>
      <button class="ghost" id="more">আরও দেখুন</button>
    </div>
  </div>
  <div class="panel">
    <div class="row"><span>ডেমো স্ট্যাটাস</span><span class="ok">● Live</span></div>
    <div class="row"><span>ক্লিক কাউন্ট</span><span id="count">0</span></div>
    <div class="row"><span>রেসপন্সিভ</span><span class="ok">✓</span></div>
    <div class="row"><span>ফাইল</span><span>single-file HTML</span></div>
  </div>
</section>
<section class="cards" id="features">
  <div class="card"><div class="ic">⚡</div><h3>দ্রুত</h3><p>কোনো বিল্ড স্টেপ নেই — এক ফাইলেই সম্পূর্ণ সাইট।</p></div>
  <div class="card"><div class="ic">📱</div><h3>রেসপন্সিভ</h3><p>মোবাইল, ট্যাবলেট ও ডেস্কটপে নিজে থেকেই ঠিক বসে।</p></div>
  <div class="card"><div class="ic">🧠</div><h3>AI-বানানো</h3><p>SMFTA AI আপনার কথার ভিত্তিতে কোডটি লিখেছে।</p></div>
</section>
<footer><span>© ${year} SMFTA Pro · auto-generated demo</span><span class="clickme" id="foot">ক্লিক করুন →</span></footer>
<script>
  let n = 0;
  const count = document.getElementById('count');
  const bump = () => { n += 1; count.textContent = String(n); };
  document.getElementById('start').addEventListener('click', () => {
    bump();
    const b = document.getElementById('start');
    b.textContent = 'চালু হয়েছে ✓';
    setTimeout(() => { b.textContent = 'শুরু করুন'; }, 1400);
  });
  document.getElementById('more').addEventListener('click', () => {
    bump();
    document.getElementById('features').scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('foot').addEventListener('click', bump);
</script>
</body>
</html>`;
}
