/**
 * SMFTA AI Pro — website → .zip (v18.7.0)
 *
 * “যে ওয়েবসাইটটা তৈরি করছে সেটা যেন লাইভ দেখতে পাওয়া যায় এবং ওখান থেকেই
 * ডাউনলোড করার সিস্টেম থাকে” — the generated page can be taken away as a real
 * project, not just one loose .html file.
 *
 * Pure helpers (text in, zip out) so they are testable in node:
 *   • `htmlToZipEntries()`  — index.html + README
 *   • `siteNameFromPrompt()` — a safe file name from the user's request
 *   • `downloadWebsiteZip()` — browser-only trigger
 */

import { zipSync, strToU8 } from 'fflate';

export interface ZipEntry {
  path: string;
  text: string;
}

/** Turns a full HTML document into a tiny, runnable project. */
export function htmlToZipEntries(html: string, title = 'My website'): ZipEntry[] {
  const doc = ensureDocument(html || '');
  return [
    { path: 'index.html', text: doc },
    {
      path: 'README.txt',
      text: [
        `${title}`,
        '',
        'SMFTA AI Pro-তে তৈরি — একটি ফাইলের সম্পূর্ণ ওয়েবসাইট।',
        '',
        'চালানোর নিয়ম:',
        '  1. ফোল্ডারটা আনজিপ করুন',
        '  2. index.html ব্রাউজারে খুলুন (অথবা `npx serve .`)',
        '',
        'সব CSS ও JS index.html-এর ভেতরেই আছে — কোনো ইনস্টল বা ইন্টারনেট লাগে না।',
      ].join('\n'),
    },
  ];
}

/** A demo page pasted as a fragment still becomes a valid document. */
export function ensureDocument(html: string): string {
  const src = html.trim();
  if (!src) {
    return '<!doctype html><html lang="bn"><head><meta charset="utf-8"><title>Empty</title></head><body></body></html>';
  }
  if (/<html[\s>]/i.test(src)) return src;
  return [
    '<!doctype html>',
    '<html lang="bn">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '  <title>SMFTA demo</title>',
    '</head>',
    '<body>',
    src,
    '</body>',
    '</html>',
  ].join('\n');
}

/** `"আমার দোকানের ল্যান্ডিং পেজ"` → `amar-dokaner-landing-page` style leaf name. */
export function siteNameFromPrompt(prompt: string, fallback = 'smfta-site'): string {
  const raw = (prompt || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join('-');
  const safe = raw
    .replace(/[^\w\u0980-\u09FF-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return safe || fallback;
}

export function buildWebsiteZip(html: string, title?: string): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const e of htmlToZipEntries(html, title)) entries[e.path] = strToU8(e.text);
  return zipSync(entries);
}

/** Browser trigger — no-op in node so tests can import this file. */
export function downloadWebsiteZip(
  html: string,
  name = 'smfta-site',
  title?: string
): void {
  if (typeof document === 'undefined') return;
  const bytes = buildWebsiteZip(html, title);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${siteNameFromPrompt(name)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
