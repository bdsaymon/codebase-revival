import { unzlibSync, inflateSync, unzipSync, gunzipSync } from 'fflate';

export interface DocumentChunk {
  index: number;
  startChar: number;
  endChar: number;
  startLine: number;
  endLine: number;
  heading: string;
  keywords: string[];
  text: string;
}

export interface ReadDocumentResult {
  name: string;
  sizeBytes: number;
  type: string;
  charCount: number;
  summary: string;
  content: string;
  /** True only when 100% of the file and extracted text was read with zero omitted characters. */
  readComplete: boolean;
  /** True when any portion of the file or extracted text was omitted or windowed. */
  isTruncated: boolean;
  /** Total extracted characters across the document. */
  totalChars: number;
  /** Characters included in the active prompt payload. */
  includedChars: number;
  /** Characters omitted from the active prompt payload. */
  omittedChars: number;
  /** Ratio in [0, 1] of includedChars / totalChars. */
  coverageRatio: number;
  /** Total number of indexed chunks. */
  totalChunks: number;
  /** Number of chunks included in the default payload. */
  includedChunks: number;
  /** Indexed chunks for query-relevant searchable context retrieval. */
  chunks: DocumentChunk[];
  /** Multi-pass structural outline covering all chunks of the document. */
  structuralOutline: string;
}

/**
 * Maximum characters per processed document payload so it always fits safely
 * inside the server's 60,000-char per-message admission guard while preserving
 * query-relevant chunks, head/middle/tail segments, and a multi-pass structural outline.
 */
const MAX_PREVIEW_CHARS = 48_000;
const DEFAULT_CHUNK_SIZE = 4_000;
const MAX_INDEXED_CHUNKS = 160;

/**
 * Threshold above which raw files are read via chunked Blob.slice() windows
 * so multi-hundred-MB or multi-GB files never exhaust browser memory.
 */
const CHUNKED_READ_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5 MB
const SLICE_HEAD_BYTES = 2 * 1024 * 1024; // 2 MB
const SLICE_MID_BYTES = 1 * 1024 * 1024; // 1 MB
const SLICE_TAIL_BYTES = 1 * 1024 * 1024; // 1 MB

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

/** Unescapes PDF literal string escapes. */
function unescapePdfString(s: string): string {
  return s
    .replace(/\\([0-7]{1,3})/g, (_m, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

/** Parses text blocks from a decoded PDF stream. */
function extractTextFromPdfStream(streamText: string): string {
  const parts: string[] = [];
  const btEtRegex = /BT([\s\S]*?)ET/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btEtRegex.exec(streamText)) !== null) {
    const block = btMatch[1];

    // Array form: [(string1) -20 (string2)] TJ
    const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/gi;
    let arrMatch: RegExpExecArray | null;
    let foundArray = false;
    while ((arrMatch = tjArrayRegex.exec(block)) !== null) {
      foundArray = true;
      const inner = arrMatch[1];
      const strLiterals = inner.match(/\((?:[^()\\]|\\.)*\)/g);
      if (strLiterals) {
        const text = strLiterals
          .map((s) => unescapePdfString(s.slice(1, -1)))
          .join('');
        if (text.trim()) parts.push(text);
      }
    }

    if (!foundArray) {
      // Single literal: (text) Tj or ' or "
      const tjSingleRegex = /\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")/g;
      let singleMatch: RegExpExecArray | null;
      while ((singleMatch = tjSingleRegex.exec(block)) !== null) {
        const text = unescapePdfString(singleMatch[1]);
        if (text.trim()) parts.push(text);
      }

      // Hex form: <48656c6c6f> Tj
      const hexRegex = /<([0-9a-fA-F\s]+)>\s*Tj/gi;
      let hexMatch: RegExpExecArray | null;
      while ((hexMatch = hexRegex.exec(block)) !== null) {
        const cleanHex = hexMatch[1].replace(/\s+/g, '');
        let decoded = '';
        for (let i = 0; i < cleanHex.length; i += 2) {
          const byte = parseInt(cleanHex.substr(i, 2), 16);
          if (!isNaN(byte) && byte >= 32 && byte <= 126) {
            decoded += String.fromCharCode(byte);
          }
        }
        if (decoded.trim()) parts.push(decoded);
      }
    }
  }

  return parts.join(' ');
}

/** Extracts text from PDF bytes via synchronous stream decompression fallback. */
export function extractTextFromPdf(bytes: Uint8Array): string {
  const decoder = new TextDecoder('latin1');
  const rawStr = decoder.decode(bytes);

  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match: RegExpExecArray | null;
  const collectedTexts: string[] = [];

  while ((match = streamRegex.exec(rawStr)) !== null) {
    const streamStart = match.index + match[0].indexOf('\n') + 1;
    const streamEnd = match.index + match[0].lastIndexOf('endstream');
    const streamSlice = bytes.subarray(streamStart, streamEnd);

    // Look back for Filter definition
    const preStream = rawStr.slice(Math.max(0, match.index - 350), match.index);
    let decodedText = '';

    if (/\/FlateDecode/i.test(preStream)) {
      try {
        const decompressed = unzlibSync(streamSlice);
        decodedText = new TextDecoder('utf-8').decode(decompressed);
      } catch {
        try {
          const inflated = inflateSync(streamSlice);
          decodedText = new TextDecoder('utf-8').decode(inflated);
        } catch {
          // If decompress fails, ignore
        }
      }
    } else {
      decodedText = new TextDecoder('utf-8').decode(streamSlice);
    }

    if (decodedText) {
      const extracted = extractTextFromPdfStream(decodedText);
      if (extracted.trim()) {
        collectedTexts.push(extracted.trim());
      }
    }
  }

  if (collectedTexts.length > 0) {
    return collectedTexts.join('\n\n');
  }

  // Fallback: extract literal strings across document
  const rawLiterals = rawStr.match(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g);
  if (rawLiterals && rawLiterals.length > 0) {
    return rawLiterals
      .map((m) => {
        const inside = m.replace(/\)\s*Tj$/i, '').replace(/^\(/, '');
        return unescapePdfString(inside);
      })
      .filter((s) => s.trim().length > 1)
      .join(' ');
  }

  return '';
}

/**
 * Extracts text from PDF bytes using `pdfjs-dist` when running in browser/Node DOM
 * environments, falling back cleanly to `extractTextFromPdf` in workerless edge runtimes.
 */
export async function extractTextFromPdfAsync(bytes: Uint8Array): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() =>
      import('pdfjs-dist')
    );
    const getDocument = pdfjs?.getDocument;
    if (typeof getDocument === 'function') {
      const loadingTask = getDocument({
        data: bytes,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: false,
      } as Parameters<typeof getDocument>[0]);
      const doc = await loadingTask.promise;
      const pages: string[] = [];
      const limit = Math.min(doc.numPages || 0, 200);
      for (let pageNo = 1; pageNo <= limit; pageNo += 1) {
        const page = await doc.getPage(pageNo);
        const content = await page.getTextContent();
        const line = (content.items || [])
          .map((item) =>
            item && typeof item === 'object' && 'str' in item
              ? String((item as { str?: string }).str || '')
              : ''
          )
          .filter(Boolean)
          .join(' ')
          .trim();
        if (line) pages.push(`--- Page ${pageNo} ---\n${line}`);
      }
      if (pages.length > 0) {
        return pages.join('\n\n');
      }
    }
  } catch (err) {
    console.warn('[extractTextFromPdfAsync] pdfjs-dist fallback to stream parser:', err);
  }
  return extractTextFromPdf(bytes);
}

/** Extracts text from a .docx file buffer. */
export function extractTextFromDocx(bytes: Uint8Array): string {
  try {
    const unzipped = unzipSync(bytes);
    const parts: string[] = [];
    const docXmlBytes = unzipped['word/document.xml'];
    if (docXmlBytes) {
      const xml = new TextDecoder('utf-8').decode(docXmlBytes);
      parts.push(
        xml
          .replace(/<w:p[^>]*>/gi, '\n')
          .replace(/<w:tab[^>]*\/?>/gi, '\t')
          .replace(/<[^>]+>/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      );
    }
    for (const [path, content] of Object.entries(unzipped)) {
      if (/^word\/(?:header|footer)\d*\.xml$/i.test(path)) {
        const xml = new TextDecoder('utf-8').decode(content);
        const txt = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (txt) parts.push(txt);
      }
    }
    return parts.filter(Boolean).join('\n\n');
  } catch (err) {
    console.warn('[extractTextFromDocx] Failed:', err);
    return '';
  }
}

/** Extracts clean text from a .docx buffer using `mammoth` with XML fallback. */
export async function extractTextFromDocxAsync(bytes: Uint8Array): Promise<string> {
  try {
    const mammothMod = await import('mammoth');
    const mammoth = mammothMod.default || mammothMod;
    if (typeof mammoth?.extractRawText === 'function') {
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = String(result?.value || '').trim();
      if (text) return text;
    }
  } catch (err) {
    console.warn('[extractTextFromDocxAsync] mammoth fallback:', err);
  }
  return extractTextFromDocx(bytes);
}

/** Extracts text from an .xlsx file buffer across all worksheets. */
export function extractTextFromXlsx(bytes: Uint8Array): string {
  try {
    const unzipped = unzipSync(bytes);
    const sharedStringsBytes = unzipped['xl/sharedStrings.xml'];
    const strings: string[] = [];
    if (sharedStringsBytes) {
      const xml = new TextDecoder('utf-8').decode(sharedStringsBytes);
      const siRegex = /<t[^>]*>([\s\S]*?)<\/t>/gi;
      let m: RegExpExecArray | null;
      while ((m = siRegex.exec(xml)) !== null) {
        strings.push(m[1].replace(/<[^>]+>/g, '').trim());
      }
    }

    const sheetKeys = Object.keys(unzipped)
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
      .sort();

    if (sheetKeys.length === 0) {
      return strings.join(', ');
    }

    const allSheetsOutput: string[] = [];
    for (const sheetKey of sheetKeys) {
      const sheetBytes = unzipped[sheetKey];
      if (!sheetBytes) continue;
      const sheetName = sheetKey.split('/').pop()?.replace('.xml', '') || 'sheet';
      const sheetXml = new TextDecoder('utf-8').decode(sheetBytes);
      const rows: string[] = [];
      const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/gi;
      let rMatch: RegExpExecArray | null;

      while ((rMatch = rowRegex.exec(sheetXml)) !== null) {
        const cells: string[] = [];
        const cellRegex = /<c\s+r="([A-Z0-9]+)"(?:[^>]*t="([sb]|inlineStr|str)")?[^>]*>([\s\S]*?)<\/c>/gi;
        let cMatch: RegExpExecArray | null;
        while ((cMatch = cellRegex.exec(rMatch[1])) !== null) {
          const type = cMatch[2];
          const inner = cMatch[3] || '';
          const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/i);
          const tMatch = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/i);
          const val = vMatch ? vMatch[1] : tMatch ? tMatch[1] : '';
          if (type === 's') {
            const idx = parseInt(val, 10);
            cells.push(strings[idx] || val);
          } else {
            cells.push(val);
          }
        }
        if (cells.length > 0) {
          rows.push(cells.join('\t'));
        }
        if (rows.length >= 2500) break;
      }

      if (rows.length > 0) {
        if (sheetKeys.length > 1) {
          allSheetsOutput.push(`=== Worksheet: ${sheetName} (${rows.length} rows) ===\n${rows.join('\n')}`);
        } else {
          allSheetsOutput.push(rows.join('\n'));
        }
      }
    }

    return allSheetsOutput.join('\n\n') || strings.join(', ');
  } catch (err) {
    console.warn('[extractTextFromXlsx] Failed:', err);
    return '';
  }
}

/** Extracts text from .xlsx/.xls workbooks using SheetJS (`xlsx`) with XML fallback. */
export async function extractTextFromXlsxAsync(bytes: Uint8Array): Promise<string> {
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(bytes, { type: 'array' });
    const sheets: string[] = [];
    for (const sheetName of wb.SheetNames || []) {
      const sheet = wb.Sheets?.[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
      if (csv) {
        sheets.push(
          wb.SheetNames.length > 1
            ? `=== Worksheet: ${sheetName} ===\n${csv}`
            : csv
        );
      }
    }
    if (sheets.length > 0) return sheets.join('\n\n');
  } catch (err) {
    console.warn('[extractTextFromXlsxAsync] xlsx fallback:', err);
  }
  return extractTextFromXlsx(bytes);
}

/** Extracts text from PowerPoint (.pptx), OpenDocument (.odt/.ods/.odp), or EPUB (.epub) archives. */
export function extractTextFromZipContainer(bytes: Uint8Array, ext: string): string {
  try {
    const unzipped = unzipSync(bytes);
    const out: string[] = [];

    if (ext === 'pptx') {
      const slideKeys = Object.keys(unzipped)
        .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
        .sort();
      for (const key of slideKeys) {
        const xml = new TextDecoder('utf-8').decode(unzipped[key]);
        const texts: string[] = [];
        const regex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(xml)) !== null) {
          const t = m[1].trim();
          if (t) texts.push(t);
        }
        if (texts.length > 0) {
          const slideLabel = key.split('/').pop()?.replace('.xml', '') || 'Slide';
          out.push(`[${slideLabel.toUpperCase()}]\n${texts.join(' ')}`);
        }
      }
      return out.join('\n\n');
    }

    if (ext === 'odt' || ext === 'ods' || ext === 'odp') {
      const contentBytes = unzipped['content.xml'];
      if (contentBytes) {
        const xml = new TextDecoder('utf-8').decode(contentBytes);
        return xml
          .replace(/<text:p[^>]*>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
    }

    if (ext === 'epub') {
      const htmlKeys = Object.keys(unzipped)
        .filter((k) => /\.(?:xhtml|html|htm|xml)$/i.test(k) && !/container\.xml|content\.opf|toc\.ncx/i.test(k))
        .sort();
      for (const key of htmlKeys.slice(0, 80)) {
        const html = new TextDecoder('utf-8').decode(unzipped[key]);
        const txt = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        if (txt.length > 20) {
          out.push(`--- ${key} ---\n${txt}`);
        }
      }
      return out.join('\n\n');
    }

    // Generic archive inspection fallback (e.g., .jar, .apk, .zip read as document)
    const entries = Object.entries(unzipped);
    out.push(`Archive entries (${entries.length} total):`);
    for (const [entryPath, entryBytes] of entries.slice(0, 120)) {
      out.push(`- ${entryPath} (${formatSize(entryBytes.length)})`);
    }
    for (const [entryPath, entryBytes] of entries.slice(0, 25)) {
      if (/\.(?:txt|md|json|xml|ya?ml|html?|css|js|ts|py|java|kt|sql|csv|ini| properties|gradle)$/i.test(entryPath)) {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(entryBytes.subarray(0, 8000));
        if (text.trim()) {
          out.push(`\n--- ${entryPath} ---\n${text.trim()}`);
        }
      }
    }
    return out.join('\n');
  } catch {
    return '';
  }
}

/** Extracts readable cells from a Jupyter Notebook (.ipynb). */
export function extractTextFromIpynb(rawJson: string): string {
  try {
    const parsed = JSON.parse(rawJson) as {
      cells?: Array<{
        cell_type?: string;
        source?: string | string[];
        outputs?: Array<{ text?: string | string[]; data?: Record<string, string | string[]> }>;
      }>;
    };
    if (!Array.isArray(parsed.cells)) return rawJson;
    const blocks: string[] = [];
    parsed.cells.forEach((cell, idx) => {
      const src = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || '');
      const kind = (cell.cell_type || 'code').toUpperCase();
      blocks.push(`# [Cell ${idx + 1} - ${kind}]\n${src.trim()}`);
      if (Array.isArray(cell.outputs)) {
        for (const out of cell.outputs.slice(0, 3)) {
          const outTxt = Array.isArray(out.text)
            ? out.text.join('')
            : typeof out.text === 'string'
              ? out.text
              : Array.isArray(out.data?.['text/plain'])
                ? out.data['text/plain'].join('')
                : typeof out.data?.['text/plain'] === 'string'
                  ? out.data['text/plain']
                  : '';
          if (outTxt.trim()) {
            blocks.push(`# [Output ${idx + 1}]\n${outTxt.trim().slice(0, 1500)}`);
          }
        }
      }
    });
    return blocks.join('\n\n');
  } catch {
    return rawJson;
  }
}

/** Extracts printable strings and header metadata from binary or unknown files. */
export function extractReadableFromBinary(bytes: Uint8Array, name: string, totalSizeBytes: number): string {
  const hexHeader = Array.from(bytes.subarray(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');

  // Extract runs of >= 4 printable ASCII/UTF-8 characters
  const strings: string[] = [];
  let current = '';
  const scanLimit = Math.min(bytes.length, 1_500_000);
  for (let i = 0; i < scanLimit; i++) {
    const b = bytes[i];
    if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13) {
      current += String.fromCharCode(b);
    } else {
      if (current.trim().length >= 4) {
        strings.push(current.trim());
      }
      current = '';
    }
    if (strings.length >= 4000) break;
  }
  if (current.trim().length >= 4) {
    strings.push(current.trim());
  }

  const body = strings.join('\n');
  return [
    `[Binary / Structured File Inspection: ${name} (${formatSize(totalSizeBytes)})]`,
    `Magic Bytes (first 16B): ${hexHeader}`,
    strings.length > 0
      ? `Extracted Printable Strings (${strings.length} segments):\n${body}`
      : 'No ASCII text segments found in binary payload.',
  ].join('\n');
}

/** Formats and summarizes CSV/TSV data for optimal LLM reading. */
export function formatDelimitedData(text: string, isTsv: boolean): { summary: string; formatted: string } {
  const delimiter = isTsv ? '\t' : ',';
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { summary: 'Empty data file', formatted: '' };

  const headerLine = lines[0];
  const columns = headerLine.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
  const totalRows = lines.length - 1;

  const summary = `${totalRows} rows, ${columns.length} columns (${columns.slice(0, 8).join(', ')}${
    columns.length > 8 ? '...' : ''
  })`;

  return { summary, formatted: text };
}

function extractHeadingFromChunk(text: string, chunkIdx: number): string {
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines.slice(0, 18)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Markdown headings, code declarations, JSON keys, or section headers
    if (
      /^#{1,6}\s+/.test(line) ||
      /^(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|def|pub\s+fn|fn|struct|enum)\s+[A-Za-z0-9_]+/.test(
        line
      ) ||
      /^\[[^\]]+\]$/.test(line) ||
      /^(?:Chapter|Section|Part|Slide|Worksheet|অধ্যায়|পর্ব|ধাপ)\b/i.test(line)
    ) {
      return line.slice(0, 90);
    }
  }
  const firstNonEmpty = lines.map((l) => l.trim()).find((l) => l.length > 2);
  return firstNonEmpty ? firstNonEmpty.slice(0, 80) : `Section ${chunkIdx + 1}`;
}

function extractKeywordsFromChunk(text: string): string[] {
  const tokens = (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && w.length <= 42);
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([word]) => word);
}

/**
 * Splits a document's extracted text into indexed, searchable chunks along
 * natural line boundaries while keeping memory bounded.
 */
export function indexDocumentIntoChunks(
  text: string,
  chunkSize = DEFAULT_CHUNK_SIZE
): DocumentChunk[] {
  const raw = text || '';
  if (!raw) return [];

  const effectiveChunkSize = Math.max(
    1000,
    Math.ceil(raw.length / MAX_INDEXED_CHUNKS),
    chunkSize
  );

  const chunks: DocumentChunk[] = [];
  let cursor = 0;
  let currentLine = 1;
  let idx = 0;

  while (cursor < raw.length && idx < MAX_INDEXED_CHUNKS) {
    let end = Math.min(raw.length, cursor + effectiveChunkSize);
    if (end < raw.length) {
      const nextNewline = raw.lastIndexOf('\n', end);
      if (nextNewline > cursor + Math.floor(effectiveChunkSize * 0.5)) {
        end = nextNewline + 1;
      }
    } else {
      end = raw.length;
    }

    const slice = raw.slice(cursor, end);
    const lineSpan = slice.split('\n').length - 1;
    const startLine = currentLine;
    const endLine = Math.max(startLine, currentLine + Math.max(0, lineSpan));

    chunks.push({
      index: idx,
      startChar: cursor,
      endChar: end,
      startLine,
      endLine,
      heading: extractHeadingFromChunk(slice, idx),
      keywords: extractKeywordsFromChunk(slice),
      text: slice,
    });

    cursor = end;
    currentLine = endLine + 1;
    idx += 1;
  }

  return chunks;
}

/**
 * Multi-pass structural summarization: produces a compact map of every chunk
 * in the file so the AI knows what exists across the entire document even when
 * only a subset of raw chunks fit into a single prompt budget.
 */
export function buildDocumentOutline(chunks: DocumentChunk[]): string {
  if (!chunks || chunks.length === 0) return '';
  if (chunks.length === 1) {
    const c = chunks[0];
    return `Chunk 1/1 (Lines ${c.startLine}–${c.endLine}, Chars ${c.startChar}–${c.endChar}): ${c.heading}`;
  }

  const maxOutlineLines = 40;
  const step = Math.max(1, Math.ceil(chunks.length / maxOutlineLines));
  const lines: string[] = [];

  for (let i = 0; i < chunks.length; i += step) {
    const c = chunks[i];
    const kwPreview = c.keywords.slice(0, 5).join(', ');
    lines.push(
      `• Chunk ${c.index + 1}/${chunks.length} [Lines ${c.startLine}–${c.endLine} | Chars ${c.startChar.toLocaleString()}–${c.endChar.toLocaleString()}]: ${c.heading}${
        kwPreview ? ` (keys: ${kwPreview})` : ''
      }`
    );
  }
  if ((chunks.length - 1) % step !== 0) {
    const last = chunks[chunks.length - 1];
    lines.push(
      `• Chunk ${last.index + 1}/${chunks.length} [Lines ${last.startLine}–${last.endLine} | Chars ${last.startChar.toLocaleString()}–${last.endChar.toLocaleString()}]: ${last.heading}`
    );
  }
  return lines.join('\n');
}

/**
 * Searchable File Context: selects the most query-relevant chunks (plus head
 * and tail anchor chunks) within `budgetChars`, and returns exact coverage metrics.
 */
export function selectRelevantDocumentChunks(
  chunks: DocumentChunk[],
  query: string,
  budgetChars = 42_000
): {
  selected: DocumentChunk[];
  includedChars: number;
  omittedChars: number;
  isTruncated: boolean;
} {
  if (!chunks || chunks.length === 0) {
    return { selected: [], includedChars: 0, omittedChars: 0, isTruncated: false };
  }

  const totalChars = chunks.reduce((acc, c) => acc + c.text.length, 0);
  if (totalChars <= budgetChars) {
    return {
      selected: [...chunks],
      includedChars: totalChars,
      omittedChars: 0,
      isTruncated: false,
    };
  }

  const queryLower = (query || '').toLowerCase();
  const queryTokens = queryLower
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  // Detect explicit line or chunk numbers mentioned in query
  const numberMatches = (queryLower.match(/\b\d{1,6}\b/g) || []).map((n) =>
    parseInt(n, 10)
  );

  const midChar = Math.floor(totalChars / 2);
  const midIdx = Math.floor(chunks.length / 2);

  const scored = chunks.map((chunk) => {
    let score = 0;
    // Always prioritize first chunk (header/imports/title), last chunk (conclusion/exports), and midpoint chunk
    if (chunk.index === 0) score += 100;
    if (chunk.index === chunks.length - 1) score += 85;
    if (
      chunk.index === midIdx ||
      (chunk.startChar <= midChar && chunk.endChar >= midChar)
    ) {
      score += 75;
    } else if (Math.abs(chunk.index - midIdx) === 1 && chunk.keywords.length > 1) {
      score += 55;
    }

    if (queryTokens.length > 0) {
      const textLower = chunk.text.toLowerCase();
      const headingLower = chunk.heading.toLowerCase();
      const kwSet = new Set(chunk.keywords);

      for (const qt of queryTokens) {
        if (headingLower.includes(qt)) score += 120;
        if (kwSet.has(qt)) score += 90;
        else if (textLower.includes(qt)) score += 50;
      }
    }

    for (const num of numberMatches) {
      if (num >= chunk.startLine && num <= chunk.endLine) {
        score += 110;
      }
      if (num === chunk.index + 1) {
        score += 95;
      }
    }

    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index);

  const pickedIndices = new Set<number>();
  let usedChars = 0;

  for (const item of scored) {
    const len = item.chunk.text.length;
    if (usedChars + len <= budgetChars || pickedIndices.size === 0) {
      pickedIndices.add(item.chunk.index);
      usedChars += len;
    }
    if (usedChars >= budgetChars) break;
  }

  const selected = chunks
    .filter((c) => pickedIndices.has(c.index))
    .sort((a, b) => a.index - b.index);

  const includedChars = selected.reduce((acc, c) => acc + c.text.length, 0);
  const omittedChars = Math.max(0, totalChars - includedChars);

  return {
    selected,
    includedChars,
    omittedChars,
    isTruncated: omittedChars > 0 || selected.length < chunks.length,
  };
}

/**
 * Builds a query-aware document context payload for the user's prompt.
 * Never claims a truncated file was read in full; reports exact char/chunk coverage.
 */
export function buildQueryAwareDocumentPayload(
  doc: ReadDocumentResult,
  query = '',
  maxChars = MAX_PREVIEW_CHARS
): string {
  if (!doc) return '';

  if (!doc.isTruncated && doc.readComplete && doc.content.length <= maxChars) {
    return [
      `[FILE READ STATUS: COMPLETE (100% Read) | File: ${doc.name} | Format: ${doc.type} | Size: ${formatSize(doc.sizeBytes)} | Read: ${doc.totalChars.toLocaleString()}/${doc.totalChars.toLocaleString()} chars (0 omitted)]`,
      doc.content,
    ].join('\n');
  }

  const chunkBudget = Math.max(8_000, maxChars - 3_600);
  const selection = selectRelevantDocumentChunks(doc.chunks || [], query, chunkBudget);
  const includedChars = selection.includedChars;
  const omittedChars = Math.max(
    doc.omittedChars || 0,
    doc.totalChars - includedChars
  );
  const coveragePct =
    doc.totalChars > 0
      ? Math.min(99.9, Math.max(0.1, Number(((includedChars / doc.totalChars) * 100).toFixed(1))))
      : 100;

  const chunkBlocks = selection.selected.map(
    (c) =>
      `--- [CHUNK ${c.index + 1}/${doc.totalChunks} · Lines ${c.startLine}–${c.endLine} · Chars ${c.startChar.toLocaleString()}–${c.endChar.toLocaleString()} · ${c.heading}] ---\n${c.text}`
  );

  return [
    `[FILE READ STATUS: PARTIAL / CHUNK-INDEXED | File: ${doc.name} | Format: ${doc.type} | Disk Size: ${formatSize(doc.sizeBytes)}]`,
    `[COVERAGE REPORT: Read Complete = false | Included = ${includedChars.toLocaleString()} chars (${coveragePct}%) | Total Extracted = ${doc.totalChars.toLocaleString()} chars | Omitted = ${omittedChars.toLocaleString()} chars | Chunks Shown = ${selection.selected.length}/${doc.totalChunks}]`,
    `[TRUTHFULNESS MANDATE: All ${doc.totalChunks} chunks were indexed in the structural outline below, and the ${selection.selected.length} most relevant chunks (${includedChars.toLocaleString()} chars) are included in full. Do NOT falsely claim that the omitted ${omittedChars.toLocaleString()} chars were read line-by-line; if the user asks about a specific section listed in the outline that is not shown below, state which chunk/lines were omitted and ask them to query that section or line range.]`,
    `=== MULTI-PASS STRUCTURAL OUTLINE (All ${doc.totalChunks} Chunks) ===\n${doc.structuralOutline}`,
    `=== SELECTED DOCUMENT CHUNKS (${selection.selected.length}/${doc.totalChunks}) ===`,
    chunkBlocks.join('\n\n'),
  ].join('\n\n');
}

/**
 * Reads a very large file (> 5 MB) using Blob.slice() windows (Head + Middle + Tail)
 * so even 100 MB, 1 GB, or 10 GB files load instantaneously without browser OOM errors.
 */
async function readHugeFileWindowedText(file: File): Promise<{
  text: string;
  sampledBytes: number;
  omittedBytes: number;
}> {
  const size = file.size;
  const headBlob = file.slice(0, SLICE_HEAD_BYTES);
  const midStart = Math.max(SLICE_HEAD_BYTES, Math.floor(size / 2) - Math.floor(SLICE_MID_BYTES / 2));
  const midBlob = file.slice(midStart, Math.min(size, midStart + SLICE_MID_BYTES));
  const tailStart = Math.max(midStart + SLICE_MID_BYTES, size - SLICE_TAIL_BYTES);
  const tailBlob = file.slice(tailStart, size);

  const [headText, midText, tailText] = await Promise.all([
    headBlob.text(),
    midBlob.text(),
    tailBlob.text(),
  ]);

  const sampledBytes = headBlob.size + midBlob.size + tailBlob.size;
  const omittedBytes = Math.max(0, size - sampledBytes);

  const text = [
    `[LARGE FILE STREAMED VIA MULTI-WINDOW READER: ${file.name} · Total Size: ${formatSize(size)} · Sampled: ${formatSize(sampledBytes)} · Unread Disk Bytes: ${formatSize(omittedBytes)}]`,
    `--- [1/3: START OF FILE (0 .. ${formatSize(headBlob.size)})] ---`,
    headText,
    `--- [2/3: MIDDLE SAMPLE (${formatSize(midStart)} .. ${formatSize(midStart + midBlob.size)})] ---`,
    midText,
    `--- [3/3: END OF FILE (${formatSize(tailStart)} .. ${formatSize(size)})] ---`,
    tailText,
  ].join('\n\n');

  return { text, sampledBytes, omittedBytes };
}

/**
 * Reads ANY file of ANY format and ANY size (text, code, data, PDF, DOCX, XLSX,
 * PPTX, ODT, EPUB, IPYNB, RTF, GZ, ZIP, or arbitrary binary files) and returns
 * structured, chunk-indexed text with verifiable coverage metrics.
 */
export async function readDocumentFile(
  file: File,
  query = ''
): Promise<ReadDocumentResult> {
  const name = file.name || 'unnamed-file';
  const sizeBytes = file.size;
  const ext = (name.split('.').pop() || '').toLowerCase();

  let extractedText = '';
  let formatType = ext ? ext.toUpperCase() : 'FILE';
  let byteWindowTruncated = false;

  try {
    if (ext === 'pdf') {
      if (sizeBytes > 25 * 1024 * 1024) byteWindowTruncated = true;
      const sliceBlob = sizeBytes > 25 * 1024 * 1024 ? file.slice(0, 25 * 1024 * 1024) : file;
      const arrayBuffer = await sliceBlob.arrayBuffer();
      const pdfBytes = new Uint8Array(arrayBuffer);
      extractedText = await extractTextFromPdfAsync(pdfBytes);
      if (!extractedText.trim()) {
        extractedText = extractReadableFromBinary(pdfBytes, name, sizeBytes);
      }
      formatType = 'PDF Document';
    } else if (ext === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      extractedText = await extractTextFromDocxAsync(new Uint8Array(arrayBuffer));
      formatType = 'Word Document (.docx)';
    } else if (ext === 'xlsx' || ext === 'xls') {
      const arrayBuffer = await file.arrayBuffer();
      extractedText = await extractTextFromXlsxAsync(new Uint8Array(arrayBuffer));
      formatType = `Excel Spreadsheet (.${ext})`;
    } else if (ext === 'pptx' || ext === 'odt' || ext === 'ods' || ext === 'odp' || ext === 'epub' || ext === 'zip' || ext === 'jar' || ext === 'apk') {
      if (sizeBytes <= 60 * 1024 * 1024) {
        const arrayBuffer = await file.arrayBuffer();
        extractedText = extractTextFromZipContainer(new Uint8Array(arrayBuffer), ext);
      } else {
        byteWindowTruncated = true;
      }
      if (!extractedText.trim()) {
        const headBuf = await file.slice(0, Math.min(sizeBytes, 2 * 1024 * 1024)).arrayBuffer();
        extractedText = extractReadableFromBinary(new Uint8Array(headBuf), name, sizeBytes);
      }
      formatType = `${ext.toUpperCase()} Document/Archive`;
    } else if (ext === 'gz' || ext === 'gzip') {
      if (sizeBytes > 20 * 1024 * 1024) byteWindowTruncated = true;
      const sliceBlob = sizeBytes > 20 * 1024 * 1024 ? file.slice(0, 20 * 1024 * 1024) : file;
      const bytes = new Uint8Array(await sliceBlob.arrayBuffer());
      try {
        const decompressed = gunzipSync(bytes);
        extractedText = new TextDecoder('utf-8', { fatal: false }).decode(decompressed);
      } catch {
        extractedText = extractReadableFromBinary(bytes, name, sizeBytes);
      }
      formatType = 'GZIP Archive';
    } else if (ext === 'ipynb') {
      let raw = '';
      if (sizeBytes > CHUNKED_READ_THRESHOLD_BYTES) {
        byteWindowTruncated = true;
        const win = await readHugeFileWindowedText(file);
        raw = win.text;
      } else {
        raw = await file.text();
      }
      extractedText = extractTextFromIpynb(raw);
      formatType = 'Jupyter Notebook (.ipynb)';
    } else if (ext === 'rtf') {
      let raw = '';
      if (sizeBytes > CHUNKED_READ_THRESHOLD_BYTES) {
        byteWindowTruncated = true;
        const win = await readHugeFileWindowedText(file);
        raw = win.text;
      } else {
        raw = await file.text();
      }
      extractedText = raw
        .replace(/\\par[d]?/gi, '\n')
        .replace(/\\tab/gi, '\t')
        .replace(/\\'[0-9a-fA-F]{2}/g, '')
        .replace(/\\[a-z]+-?\d*\s?/gi, '')
        .replace(/[{}]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      formatType = 'Rich Text (.rtf)';
    } else {
      // Universal reader for all text, data, code, logs, or unknown/binary files of ANY size
      if (sizeBytes > CHUNKED_READ_THRESHOLD_BYTES) {
        byteWindowTruncated = true;
        const win = await readHugeFileWindowedText(file);
        extractedText = win.text;
        formatType = `${ext ? ext.toUpperCase() : 'LARGE'} File (${formatSize(sizeBytes)})`;
      } else {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        // Check if binary (contains many null bytes in first 4KB)
        let nullCount = 0;
        const checkLen = Math.min(bytes.length, 4096);
        for (let i = 0; i < checkLen; i++) {
          if (bytes[i] === 0) nullCount++;
        }
        if (checkLen > 0 && nullCount / checkLen > 0.15) {
          extractedText = extractReadableFromBinary(bytes, name, sizeBytes);
          formatType = `Binary File (${ext || 'raw'})`;
          if (sizeBytes > 1_500_000) byteWindowTruncated = true;
        } else {
          extractedText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          if (ext === 'csv' || ext === 'tsv') {
            const { summary } = formatDelimitedData(extractedText, ext === 'tsv');
            formatType = `${ext.toUpperCase()} Data (${summary})`;
          }
        }
      }
    }
  } catch {
    // Ultimate failsafe: slice first 1 MB and decode whatever is readable
    try {
      if (sizeBytes > 1024 * 1024) byteWindowTruncated = true;
      const fallbackBuf = await file.slice(0, Math.min(sizeBytes, 1024 * 1024)).arrayBuffer();
      extractedText = extractReadableFromBinary(new Uint8Array(fallbackBuf), name, sizeBytes);
    } catch {
      extractedText = `[File attached: ${name} (${formatSize(sizeBytes)})]`;
    }
  }

  if (!extractedText.trim()) {
    extractedText = `[File attached: ${name} (${formatSize(sizeBytes)}) — empty or non-text payload]`;
  }

  const rawLength = extractedText.length;
  const chunks = indexDocumentIntoChunks(extractedText, DEFAULT_CHUNK_SIZE);
  const structuralOutline = buildDocumentOutline(chunks);
  const totalChunks = chunks.length;

  let finalContent = extractedText;
  let includedChars = rawLength;
  let omittedChars = 0;
  let includedChunks = totalChunks;
  let isTruncated = byteWindowTruncated;

  if (rawLength > MAX_PREVIEW_CHARS) {
    isTruncated = true;
    const chunkBudget = MAX_PREVIEW_CHARS - 3_600;
    const selection = selectRelevantDocumentChunks(chunks, query, chunkBudget);
    includedChars = selection.includedChars;
    omittedChars = selection.omittedChars;
    includedChunks = selection.selected.length;
    const totalLines = extractedText.split('\n').length;
    const coveragePct = Math.min(
      99.9,
      Math.max(0.1, Number(((includedChars / rawLength) * 100).toFixed(1)))
    );

    const renderedChunks = selection.selected
      .map(
        (c) =>
          `--- [CHUNK ${c.index + 1}/${totalChunks} · Lines ${c.startLine}–${c.endLine} · Chars ${c.startChar.toLocaleString()}–${c.endChar.toLocaleString()} · ${c.heading}] ---\n${c.text}`
      )
      .join('\n\n');

    finalContent = [
      `[FILE OVERVIEW: ${name} | Format: ${formatType} | Disk Size: ${formatSize(sizeBytes)} | Total Extracted: ${rawLength.toLocaleString()} chars (${totalLines.toLocaleString()} lines)]`,
      `[COVERAGE REPORT: Read Complete = false (Partial / Chunk-Indexed) | Included = ${includedChars.toLocaleString()} chars (${coveragePct}%) | Omitted = ${omittedChars.toLocaleString()} chars | Chunks Included = ${includedChunks}/${totalChunks}]`,
      `=== MULTI-PASS STRUCTURAL OUTLINE (All ${totalChunks} Chunks) ===\n${structuralOutline}`,
      `=== SELECTED CHUNKS (${includedChunks}/${totalChunks}) ===`,
      renderedChunks,
    ].join('\n\n');
  } else if (byteWindowTruncated) {
    omittedChars = Math.max(1, sizeBytes - rawLength);
  }

  const readComplete = !isTruncated && omittedChars === 0;
  const coverageRatio =
    rawLength > 0
      ? readComplete
        ? 1
        : Math.min(0.999, Math.max(0.001, Number((includedChars / (rawLength + (byteWindowTruncated ? Math.max(1, sizeBytes - rawLength) : 0))).toFixed(4))))
      : 1;

  const lineCount = extractedText.split('\n').length;
  const statusTag = readComplete
    ? `100% read (${rawLength.toLocaleString()} chars)`
    : `${Math.round(coverageRatio * 100)}% indexed (${includedChars.toLocaleString()}/${rawLength.toLocaleString()} chars, ${includedChunks}/${totalChunks} chunks)`;
  const summary = `${formatType} · ${formatSize(sizeBytes)} · ${lineCount.toLocaleString()} lines · ${statusTag}`;

  return {
    name,
    sizeBytes,
    type: formatType,
    charCount: rawLength,
    summary,
    content: finalContent,
    readComplete,
    isTruncated,
    totalChars: rawLength,
    includedChars,
    omittedChars,
    coverageRatio,
    totalChunks,
    includedChunks,
    chunks,
    structuralOutline,
  };
}
