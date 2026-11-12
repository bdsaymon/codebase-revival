import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Brain,
  Check,
  X,
  Copy,
  Play,
  Terminal,
  Download,
  Wand2,
  Edit3,
  RotateCcw,
  Lightbulb,
  ArrowRight,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { ProactiveSuggestion, InlineRevision } from '../types';
import { INLINE_QUICK_ACTIONS } from '../utils/helpers';
import {
  buildPreviewDocument,
  hasPreviewableCode,
} from '../utils/livePreview';
import { InlineCodePreview } from './CodeWorkspace';

interface InteractiveMessageContentProps {
  messageId: string;
  text: string;
  thinking?: string;
  isStreaming?: boolean;
  proactiveSuggestions?: ProactiveSuggestion[];
  revisions?: InlineRevision[];
  onUpdateMessageText: (
    messageId: string,
    newText: string,
    revision?: InlineRevision
  ) => void;
  onDismissSuggestion: (messageId: string, suggestionId: string) => void;
  onAcceptSuggestion: (messageId: string, suggestion: ProactiveSuggestion) => void;
  onOpenCodeLab: (code: string) => void;
  onInstallSelfWidget?: (code: string) => void;
  onToast: (msg: string) => void;
  /** Opens the full Live Preview modal for this message. */
  onOpenLivePreview?: (blocks: Array<{ lang: string; content: string; index: number }>) => void;
  /** v19.0.0 — opens the dedicated full-screen /workspace/code page without auto-running in chat. */
  onOpenCodeWorkspace?: (
    blocks: Array<{ lang: string; content: string; index: number }>,
    selectedBlockIndex?: number,
    messageId?: string
  ) => void;
  /** v18.11 — when false, render raw text instead of markdown formatting. */
  renderMarkdown?: boolean;
  /** v18.11 — when false, code shows as a plain pre without styled chrome. */
  highlightCode?: boolean;
}


interface ParsedBlock {
  type: 'code' | 'text';
  content: string;
  lang?: string;
}

export interface ExtractedThinkingResult {
  thinkingText: string;
  cleanResponse: string;
  isThinkingActive: boolean;
}

/**
 * Extracts `<think>...</think>`, `<thinking>...</thinking>`, or `◁think▷...◁/think▷`
 * blocks (including unclosed streaming `<think>` blocks and orphan `</think>` tags)
 * and merges with `explicitThinking` so raw `<think>` tags never bleed into the response.
 */
export function extractThinkingAndResponse(
  rawText: string,
  explicitThinking?: string
): ExtractedThinkingResult {
  let working = String(rawText || '');
  const extractedParts: string[] = [];
  let isThinkingActive = false;

  // 1. Closed <think>...</think>, <thinking>...</thinking>, or ◁think▷...◁/think▷
  const closedThinkRegex =
    /(?:<think(?:ing)?\b[^>]*>|◁think▷)([\s\S]*?)(?:<\/think(?:ing)?>|◁\/think▷)/gi;
  working = working.replace(closedThinkRegex, (_full, inner: string) => {
    const trimmed = (inner || '').trim();
    if (trimmed) extractedParts.push(trimmed);
    return '\n\n';
  });

  // 2. Unclosed <think>... at end of stream
  const openMatch = /(?:<think(?:ing)?\b[^>]*>|◁think▷)([\s\S]*)$/i.exec(working);
  if (openMatch && openMatch.index !== undefined) {
    isThinkingActive = true;
    const partial = (openMatch[1] || '').trim();
    if (partial) extractedParts.push(partial);
    working = working.slice(0, openMatch.index);
  }

  // 3. Orphan closing </think> when opening tag was omitted
  const orphanClose = /([\s\S]*?)(?:<\/think(?:ing)?>|◁\/think▷)/i.exec(working);
  if (orphanClose) {
    const before = (orphanClose[1] || '').trim();
    if (before) extractedParts.push(before);
    working = working.slice((orphanClose.index || 0) + orphanClose[0].length);
  }

  // 4. Strip any remaining stray <think> or </think> tags
  const cleanResponse = working
    .replace(/<\/?think(?:ing)?\b[^>]*>|◁\/?think▷/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const explicit = String(explicitThinking || '')
    .replace(/<\/?think(?:ing)?\b[^>]*>|◁\/?think▷/gi, '')
    .trim();
  const inlineJoined = extractedParts.join('\n\n').trim();

  let thinkingText = '';
  if (explicit && inlineJoined) {
    thinkingText =
      explicit.includes(inlineJoined)
        ? explicit
        : inlineJoined.includes(explicit)
        ? inlineJoined
        : `${explicit}\n\n${inlineJoined}`;
  } else {
    thinkingText = explicit || inlineJoined;
  }

  return {
    thinkingText,
    cleanResponse,
    isThinkingActive,
  };
}

/**
 * Extracts a concise, human-readable topic or first meaningful sentence
 * from raw `<think>` reasoning text.
 */
export function extractThinkingTopic(thinkingText: string): string {
  const raw = String(thinkingText || '').trim();
  if (!raw) return 'Analyzing request';

  const lines = raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^(?:\d+[.)]\s*|step\s+\d+[:.-]?\s*|[-*•#>]+\s*)+/i, '')
        .replace(/\*\*|__|`/g, '')
        .replace(
          /^(?:okay[,.\s]*|alright[,.\s]*|hmm+[,.\s]*|let'?s\s+see[,.\s]*|let\s+me\s+think(?:\s+about\s+this)?[,.\s]*)/i,
          ''
        )
        .trim()
    )
    .filter((line) => line.length >= 3);

  const candidateLine = lines[0] || raw.replace(/\s+/g, ' ').trim();
  const firstSentence =
    candidateLine.split(/(?<=[.!?।])\s+/)[0]?.trim() || candidateLine;
  const cleaned = firstSentence.replace(/[.:;,]+$/, '').trim();
  if (!cleaned) return 'Analyzing request';

  if (cleaned.length > 56) {
    return `${cleaned.slice(0, 53).trimEnd()}...`;
  }
  return cleaned;
}

export function estimateThinkingSeconds(
  thinkingText: string,
  measuredSeconds?: number
): number {
  if (
    typeof measuredSeconds === 'number' &&
    Number.isFinite(measuredSeconds) &&
    measuredSeconds >= 1
  ) {
    return Math.max(1, Math.round(measuredSeconds));
  }
  const words = String(thinkingText || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (words === 0) return 1;
  return Math.max(1, Math.min(45, Math.ceil(words / 14)));
}

export function formatThinkingHeadline(
  thinkingText: string,
  isReasoningActive: boolean,
  durationSeconds?: number
): string {
  const topic = extractThinkingTopic(thinkingText);
  if (isReasoningActive) {
    const suffix = topic.endsWith('...') ? '' : '...';
    return `Thinking: ${topic}${suffix}`;
  }
  const cleanTopic = topic.replace(/\.{2,}$/, '').trim() || 'request';
  const secs = estimateThinkingSeconds(thinkingText, durationSeconds);
  return `Thought on ${cleanTopic} (${secs} seconds)`;
}

function parseBlocks(markdown: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const codeRegex = /```([^\n`]*)\r?\n([\s\S]*?)(?:```|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeRegex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      const textSegment = markdown.slice(lastIndex, match.index);
      splitTextIntoParagraphs(textSegment).forEach((p) =>
        blocks.push({ type: 'text', content: p })
      );
    }
    const rawLang = (match[1] || '').trim().split(/\s+/)[0] || 'code';
    blocks.push({
      type: 'code',
      lang: rawLang.toLowerCase(),
      content: match[2].replace(/\n$/, ''),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    const rest = markdown.slice(lastIndex);
    splitTextIntoParagraphs(rest).forEach((p) =>
      blocks.push({ type: 'text', content: p })
    );
  }

  return blocks.length > 0 ? blocks : [{ type: 'text', content: markdown }];
}

function splitTextIntoParagraphs(segment: string): string[] {
  return segment
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Removes broken surrogate pairs and obscure symbol glyphs (e.g. 🗐 U+1F5D0) that render as [x][x] boxes on Android
function stripBrokenGlyphs(str: string): string {
  return str
    .replace(/[\u{1F5B0}-\u{1F5FF}]/gu, '📌 ')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|\uFFFD+/g, '')
    .replace(/  +/g, ' ');
}

// Rich multi-color inline markdown formatter for bold, inline code, quoted phrases, and links
function renderInlineFormatting(line: string): React.ReactNode {
  const cleanLine = stripBrokenGlyphs(line);
  const parts = cleanLine.split(
    /(`[^`]+`|\*\*[^*]+\*\*|"[^"\n]{2,60}"|“[^”\n]{2,60}”|\[[^\]]+\]\([^)]+\))/g
  );
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded-md bg-[var(--inline-code-bg)] border border-[var(--inline-code-border)] font-mono-num text-[0.9em] text-[var(--inline-code-text)] font-semibold break-words"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong
          key={i}
          className="font-bold text-[var(--primary)]"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (
      ((part.startsWith('"') && part.endsWith('"')) ||
        (part.startsWith('“') && part.endsWith('”'))) &&
      part.length > 2
    ) {
      return (
        <span
          key={i}
          className="font-semibold text-[var(--accent-emerald)]"
        >
          {part}
        </span>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-sky)] font-semibold underline underline-offset-2 hover:opacity-80"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part.replace(/\*\*/g, '');
  });
}

function renderSingleLineElement(rawLine: string, key: number): React.ReactNode {
  const l = stripBrokenGlyphs(rawLine).trim();
  if (!l) return null;
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(l)) {
    return <hr key={key} className="my-3.5 border-t border-[var(--border)]" />;
  }
  if (l.startsWith('#### ')) {
    return (
      <h4
        key={key}
        className="text-[0.95em] font-bold text-[var(--accent-amber)] mt-3 mb-1"
      >
        {renderInlineFormatting(l.slice(5))}
      </h4>
    );
  }
  if (l.startsWith('### ')) {
    return (
      <h3
        key={key}
        className="text-[13.8px] font-bold text-[var(--accent-violet)] mt-3.5 mb-1 pb-1 border-b border-[var(--border)]/60"
      >
        {renderInlineFormatting(l.slice(4))}
      </h3>
    );
  }
  if (l.startsWith('## ')) {
    return (
      <h2
        key={key}
        className="text-[15px] font-bold text-[var(--accent-emerald)] mt-3.5 mb-1.5 pb-1 border-b border-[var(--border)]"
      >
        {renderInlineFormatting(l.slice(3))}
      </h2>
    );
  }
  if (l.startsWith('# ')) {
    return (
      <h1
        key={key}
        className="text-[17px] font-bold text-[var(--primary)] mt-3.5 mb-2 pb-1 border-b border-[var(--border)]"
      >
        {renderInlineFormatting(l.slice(2))}
      </h1>
    );
  }
  if (l.startsWith('> ')) {
    return (
      <blockquote
        key={key}
        className="px-4 py-2.5 my-2.5 bg-[var(--primary-soft)] rounded-xl border border-[var(--primary-border)] text-[var(--text)] font-medium leading-relaxed"
      >
        {renderInlineFormatting(l.slice(2))}
      </blockquote>
    );
  }

  const numMatch = rawLine.match(/^\s*([0-9০-৯]+[.)])\s+([\s\S]+)$/);
  if (numMatch) {
    return (
      <div
        key={key}
        className="flex items-start gap-2.5 py-1 leading-relaxed"
      >
        <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-md bg-[var(--primary-soft)] font-mono-num text-xs font-bold text-[var(--primary)] shrink-0 select-none mt-0.5">
          {numMatch[1].replace(/[.)]$/, '')}
        </span>
        <div className="min-w-0 flex-1 text-[var(--text)] font-normal">
          {renderInlineFormatting(numMatch[2])}
        </div>
      </div>
    );
  }

  const bulletMatch = rawLine.match(/^\s*([-*•])\s+([\s\S]+)$/);
  if (bulletMatch) {
    return (
      <div
        key={key}
        className="flex items-start gap-2.5 py-1 leading-relaxed"
      >
        <span className="text-[var(--accent-emerald)] font-bold shrink-0 select-none mt-0.5">
          ▸
        </span>
        <div className="min-w-0 flex-1 text-[var(--text)] font-normal">
          {renderInlineFormatting(bulletMatch[2])}
        </div>
      </div>
    );
  }

  // Clean inline rendering for emoji-prefixed lines without heavy box enclosures
  if (/^(?:📌|💡|✅|⚠️|🔍)\s+/.test(l)) {
    return (
      <p key={key} className="m-0 py-0.5 leading-relaxed text-[var(--text)]">
        {renderInlineFormatting(l)}
      </p>
    );
  }

  // Highlight leading label before ':' or '—' if line has no explicit markdown bold
  if (!rawLine.includes('**') && !rawLine.includes('`')) {
    const labelMatch = rawLine.match(/^([^:：—]{2,38}[:：—])\s+([\s\S]+)$/);
    if (labelMatch && !/^https?:/i.test(labelMatch[1])) {
      return (
        <p key={key} className="m-0 leading-relaxed text-[var(--text)]">
          <span className="font-bold text-[var(--primary)]">
            {labelMatch[1]}
          </span>{' '}
          {renderInlineFormatting(labelMatch[2])}
        </p>
      );
    }
  }

  return (
    <p key={key} className="m-0 leading-relaxed text-[var(--text)]">
      {renderInlineFormatting(rawLine)}
    </p>
  );
}

function renderParagraphContent(blockText: string): React.ReactNode {
  const lines = blockText.split('\n');

  // Markdown Table Detection
  if (
    lines.length >= 2 &&
    lines[0].includes('|') &&
    /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[1])
  ) {
    const parseRow = (row: string) =>
      row
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim());
    const headers = parseRow(lines[0]);
    const bodyRows = lines.slice(2).filter((r) => r.includes('|')).map(parseRow);
    return (
      <div className="my-3.5 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xs">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-[var(--primary-soft)] border-b border-[var(--border)] divide-x divide-[var(--border)]/60">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="px-3.5 py-2.5 font-bold text-[var(--primary)] whitespace-nowrap"
                >
                  {renderInlineFormatting(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {bodyRows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="even:bg-[var(--surface-2)]/35 hover:bg-[var(--surface-2)]/60 transition-colors divide-x divide-[var(--border)]/50"
              >
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className={`px-3.5 py-2.5 leading-relaxed align-top ${
                      cIdx === 0
                        ? 'font-bold text-[var(--primary)] whitespace-nowrap'
                        : 'text-[var(--text)] font-medium'
                    }`}
                  >
                    {renderInlineFormatting(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-1 leading-relaxed">
      {lines.map((l, idx) => renderSingleLineElement(l, idx))}
    </div>
  );
}

const CODE_EXTS: Record<string, string> = {
  html: 'html',
  xml: 'html',
  css: 'css',
  javascript: 'js',
  js: 'js',
  typescript: 'ts',
  ts: 'ts',
  python: 'py',
  py: 'py',
  json: 'json',
  sql: 'sql',
  sh: 'sh',
  bash: 'sh',
};

export const InteractiveMessageContent: React.FC<InteractiveMessageContentProps> = ({
  messageId,
  text,
  thinking,
  isStreaming = false,
  proactiveSuggestions = [],
  revisions = [],
  onUpdateMessageText,
  onDismissSuggestion,
  onAcceptSuggestion,
  onOpenCodeLab,
  onInstallSelfWidget,
  onToast,
  onOpenLivePreview,
  onOpenCodeWorkspace,
  renderMarkdown = true,
  highlightCode = true,
}) => {
  const [activeBlockIdx, setActiveBlockIdx] = useState<number | null>(null);
  const [selectedSnippet, setSelectedSnippet] = useState<string>('');
  const [feedbackInput, setFeedbackInput] = useState<string>('');
  const [rewriteScope, setRewriteScope] = useState<
    'sentence' | 'paragraph' | 'full_weave'
  >('paragraph');
  const [isRewriting, setIsRewriting] = useState<boolean>(false);
  const [directEditIdx, setDirectEditIdx] = useState<number | null>(null);
  const [directEditValue, setDirectEditValue] = useState<string>('');
  const [openHtmlPreviews, setOpenHtmlPreviews] = useState<Record<number, boolean>>({});
  const [expandedCodeBlocks, setExpandedCodeBlocks] = useState<Record<number, boolean>>({});
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);
  const [showRevisions, setShowRevisions] = useState<boolean>(false);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState<boolean>(false);

  const { thinkingText, cleanResponse, isThinkingActive } = extractThinkingAndResponse(
    text,
    thinking
  );

  const isReasoningNow = Boolean(isThinkingActive || (isStreaming && !cleanResponse && thinkingText));
  const thinkingStartRef = useRef<number | null>(null);
  const [measuredThinkSec, setMeasuredThinkSec] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (isReasoningNow) {
      if (thinkingStartRef.current === null) {
        thinkingStartRef.current = Date.now();
      }
    } else if (thinkingStartRef.current !== null) {
      const elapsedSec = Math.max(
        1,
        Math.round((Date.now() - thinkingStartRef.current) / 1000)
      );
      setMeasuredThinkSec(elapsedSec);
      thinkingStartRef.current = null;
    }
  }, [isReasoningNow]);

  const thinkingHeadline = formatThinkingHeadline(
    thinkingText,
    isReasoningNow,
    measuredThinkSec
  );

  const isWebCodeLang = (lang?: string): boolean => {
    const l = (lang || '').toLowerCase().trim();
    return [
      'html',
      'htm',
      'xml',
      'svg',
      'css',
      'scss',
      'less',
      'javascript',
      'js',
      'mjs',
      'typescript',
      'ts',
      'jsx',
      'tsx',
      'react',
    ].includes(l);
  };

  const getFriendlyWebFileLabel = (lang: string, index: number): { filename: string; badge: string } => {
    const l = lang.toLowerCase().trim();
    if (l === 'html' || l === 'htm' || l === 'xml') {
      return { filename: index === 0 ? 'index.html' : `page-${index + 1}.html`, badge: 'HTML Page Layout' };
    }
    if (l === 'css' || l === 'scss' || l === 'less') {
      return { filename: index === 0 ? 'styles.css' : `styles-${index + 1}.css`, badge: 'Stylesheet' };
    }
    if (l === 'tsx' || l === 'jsx' || l === 'react') {
      return { filename: index === 0 ? 'src/App.tsx' : `src/Component${index + 1}.tsx`, badge: 'React Component' };
    }
    if (l === 'ts' || l === 'typescript') {
      return { filename: index === 0 ? 'src/main.ts' : `src/module-${index + 1}.ts`, badge: 'TypeScript Module' };
    }
    if (l === 'js' || l === 'javascript' || l === 'mjs') {
      return { filename: index === 0 ? 'app.js' : `module-${index + 1}.js`, badge: 'Interactive Script' };
    }
    if (l === 'svg') {
      return { filename: `graphic-${index + 1}.svg`, badge: 'Vector Graphic' };
    }
    return { filename: `file-${index + 1}.${CODE_EXTS[l] || 'txt'}`, badge: l.toUpperCase() };
  };

  // v18.11 — markdown off: keep the raw text as one plain block (code fences
  // are displayed literally, exactly as the model wrote them).
  const blocks: ParsedBlock[] =
    renderMarkdown === false
      ? [{ type: 'text', content: cleanResponse }]
      : parseBlocks(cleanResponse);

  // Everything the Live Preview needs, computed once per render.
  const codeBlocks = blocks
    .filter((b) => b.type === 'code')
    .map((b, i) => ({ lang: b.lang || 'code', content: b.content, index: i }));
  const livePreview =
    !isStreaming && hasPreviewableCode(codeBlocks)
      ? buildPreviewDocument(codeBlocks, { title: 'AI Live Demo' })
      : null;

  // v18.8.0 — every code answer becomes a workspace: the code gets named files,
  // and (when the language can run in a browser) the page starts on the side by
  // itself. The raw per-block cards are replaced so nothing is shown twice.
  const useWorkspace =
    !isStreaming &&
    codeBlocks.some((b) => b.content.trim().length > 0) &&
    Boolean(onOpenCodeWorkspace);

  const handleOpenInlineEditor = (idx: number, blockContent: string) => {
    if (isStreaming) return;
    const sel = window.getSelection()?.toString().trim() || '';
    const snippetInBlock =
      sel && blockContent.includes(sel) ? sel : '';
    setSelectedSnippet(snippetInBlock);
    setRewriteScope(snippetInBlock ? 'sentence' : 'paragraph');
    setActiveBlockIdx(activeBlockIdx === idx ? null : idx);
    setDirectEditIdx(null);
    setFeedbackInput('');
  };

  const handleStartDirectEdit = (idx: number, blockContent: string) => {
    if (isStreaming) return;
    setDirectEditIdx(directEditIdx === idx ? null : idx);
    setDirectEditValue(blockContent);
    setActiveBlockIdx(null);
  };

  const handleSaveDirectEdit = (idx: number) => {
    const oldBlock = blocks[idx]?.content || '';
    if (!directEditValue.trim() || directEditValue === oldBlock) {
      setDirectEditIdx(null);
      return;
    }
    const updatedFull = text.replace(oldBlock, directEditValue.trim());
    const rev: InlineRevision = {
      id: 'rev-' + Date.now(),
      timestamp: Date.now(),
      feedback: 'Direct manual edit',
      scope: 'paragraph',
      previousText: text,
      newText: updatedFull,
      summary: 'Directly edited paragraph inline',
    };
    onUpdateMessageText(messageId, updatedFull, rev);
    setDirectEditIdx(null);
    onToast('Paragraph updated inline');
  };

  const handleExecuteInlineRewrite = async (
    idx: number,
    customInstruction?: string
  ) => {
    const instruction = (customInstruction ?? feedbackInput).trim();
    if (!instruction) {
      onToast('অনুগ্রহ করে ইনলাইন ফিডব্যাক লিখুন (Enter feedback first)');
      return;
    }

    const blockContent = blocks[idx]?.content || '';
    const targetToSend =
      rewriteScope === 'sentence' && selectedSnippet
        ? selectedSnippet
        : blockContent;

    setIsRewriting(true);
    try {
      const response = await fetch('/api/inline-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullDocument: text,
          targetBlock: targetToSend,
          feedback: instruction,
          scope: rewriteScope,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Inline rewrite failed');
      }

      let newFullText = text;
      if (rewriteScope === 'full_weave' && data.updatedFullDocument) {
        newFullText = data.updatedFullDocument;
      } else if (data.rewrittenBlock) {
        if (text.includes(targetToSend)) {
          newFullText = text.replace(targetToSend, data.rewrittenBlock.trim());
        } else if (data.updatedFullDocument) {
          newFullText = data.updatedFullDocument;
        }
      }

      const rev: InlineRevision = {
        id: 'rev-' + Date.now(),
        timestamp: Date.now(),
        feedback: instruction,
        scope: rewriteScope,
        previousText: text,
        newText: newFullText,
        summary: data.summary || 'Wove changes inline',
      };

      onUpdateMessageText(messageId, newFullText, rev);
      setActiveBlockIdx(null);
      setFeedbackInput('');
      setSelectedSnippet('');
      onToast(`✨ ${data.summary || 'Inline rewrite applied!'}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rewrite error';
      onToast(`⚠️ ${msg}`);
    } finally {
      setIsRewriting(false);
    }
  };

  const handleCopyCode = (code: string, idx: number) => {
    navigator.clipboard?.writeText(code);
    setCopiedCodeIdx(idx);
    onToast('Code copied to clipboard');
    setTimeout(() => setCopiedCodeIdx(null), 1800);
  };

  const handleDownloadCode = (code: string, lang: string) => {
    const ext = CODE_EXTS[lang] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `smfta-code.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
    onToast(`Downloaded smfta-code.${ext}`);
  };

  return (
    <div className="msg-prose space-y-1.5 text-[var(--text)]">
      {/* Modern Collapsible "Thinking" UI with Animated Aurora Gradient Glow */}
      {(Boolean(thinkingText) || isThinkingActive) && (
        <div
          data-testid="thinking-accordion"
          className="thinking-accordion-container"
        >
          <div className="thinking-accordion-inner">
            <button
              type="button"
              data-testid="thinking-accordion-toggle"
              aria-expanded={isThinkingExpanded}
              onClick={() => setIsThinkingExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between gap-2.5 text-xs font-medium text-[var(--text-2)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Brain
                  className={`w-3.5 h-3.5 text-pink-400 shrink-0 ${
                    isReasoningNow ? 'animate-pulse' : ''
                  }`}
                />
                <Sparkles
                  className={`w-3.5 h-3.5 text-purple-400 shrink-0 ${
                    isReasoningNow ? 'animate-spin' : 'animate-pulse'
                  }`}
                />
                <span
                  data-testid="thinking-accordion-headline"
                  className="truncate font-semibold bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(139,92,246,0.45)]"
                >
                  {thinkingHeadline}
                </span>
              </span>
              <ChevronDown
                className={`w-4 h-4 text-purple-400/80 shrink-0 transition-transform duration-200 ${
                  isThinkingExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isThinkingExpanded && (
              <div
                data-testid="thinking-accordion-content"
                className="mt-2.5 pt-2.5 px-3 py-2.5 rounded-lg border-t border-purple-500/20 bg-muted/40 font-mono text-xs leading-relaxed text-[var(--text-2)] max-h-60 overflow-y-auto whitespace-pre-wrap"
              >
                {thinkingText || 'Thinking...'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Proactive Suggestions Banner if AI found inline improvements */}
      {!isStreaming && proactiveSuggestions.length > 0 && (
        <div className="mb-3 rounded-xl border border-[var(--primary-border)] bg-[var(--primary-soft)] p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--primary)]">
              <Lightbulb className="w-4 h-4 shrink-0" />
              <span>
                Proactive AI Co-Pilot · {proactiveSuggestions.length} Inline{' '}
                {proactiveSuggestions.length === 1 ? 'Suggestion' : 'Suggestions'}
              </span>
            </div>
            <span className="text-[11px] text-[var(--text-2)]">
              Click Apply to weave changes directly
            </span>
          </div>

          <div className="space-y-2">
            {proactiveSuggestions.map((sug) => (
              <div
                key={sug.id}
                className="rounded-lg bg-[var(--surface)] border border-[var(--border)] p-2.5 text-xs transition-all"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-[var(--primary)]">
                    {sug.category}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onAcceptSuggestion(messageId, sug)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--primary)] text-white font-medium hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
                    >
                      <Check className="w-3 h-3" /> Apply Inline
                    </button>
                    <button
                      type="button"
                      onClick={() => onDismissSuggestion(messageId, sug.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] transition-colors cursor-pointer"
                      title="Dismiss suggestion"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p className="text-[var(--text-2)] mb-1.5">{sug.reason}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] bg-[var(--surface-2)] p-2 rounded-md">
                  <span className="line-through text-rose-500/90">
                    {sug.targetText}
                  </span>
                  <ArrowRight className="w-3 h-3 text-[var(--text-3)] shrink-0" />
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {sug.replacementText}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Render Interactive Blocks (v19.0.0: Web source code hidden by default; Preview-first experience) */}
      {(() => {
        let codeBlockCounter = -1;
        return blocks.map((block, idx) => {
          if (block.type === 'code') {
            codeBlockCounter += 1;
            const currentCodeIdx = codeBlockCounter;
            const lang = block.lang || 'code';
            const lineCount = Math.max(1, block.content.split('\n').length);
            const isWebCode = isWebCodeLang(lang);
            const isCodeVisible = isWebCode
              ? Boolean(expandedCodeBlocks[idx])
              : expandedCodeBlocks[idx] !== false;
            const fileMeta = getFriendlyWebFileLabel(lang, currentCodeIdx);

            // v18.11 — Code Syntax Highlight off: plain, unadorned block with workspace action.
            if (highlightCode === false) {
              return (
                <div key={idx} className="my-2">
                  <div className="flex items-center justify-between text-xs text-[var(--text-3)] mb-1">
                    <span className="font-mono-num uppercase">{fileMeta.filename} ({lang})</span>
                    <div className="flex items-center gap-2">
                      {isWebCode && (
                        <button
                          type="button"
                          data-testid="chat-toggle-code-view-btn"
                          onClick={() =>
                            setExpandedCodeBlocks((prev) => ({
                              ...prev,
                              [idx]: !prev[idx],
                            }))
                          }
                          className="underline cursor-pointer"
                        >
                          {isCodeVisible ? 'Hide Code' : 'Code View'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyCode(block.content, idx)}
                        className="underline cursor-pointer"
                      >
                        {copiedCodeIdx === idx ? 'Copied' : 'Copy Code'}
                      </button>
                      {onOpenCodeWorkspace && (
                        <button
                          type="button"
                          data-testid="open-in-code-workspace-btn"
                          onClick={() =>
                            onOpenCodeWorkspace(codeBlocks, currentCodeIdx, messageId)
                          }
                          className="underline font-semibold text-[var(--primary)] cursor-pointer"
                        >
                          Open Live Preview
                        </button>
                      )}
                    </div>
                  </div>
                  {isCodeVisible && (
                    <pre className="px-3 py-2 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono-num text-[12px] leading-relaxed border border-[var(--border)]">
                      <code>{block.content}</code>
                    </pre>
                  )}
                </div>
              );
            }

            return (
              <div
                key={idx}
                className="chat-code-block my-3 rounded-xl overflow-hidden border border-[var(--code-border)] bg-[var(--code-bg)] text-slate-100"
                data-testid="chat-code-block"
                data-code-lang={lang}
                data-code-hidden={!isCodeVisible ? 'true' : 'false'}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-[var(--code-top)] border-b border-[var(--code-border)] text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="font-mono-num text-slate-100 font-semibold truncate">
                      {isWebCode ? fileMeta.filename : lang}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10.5px] text-slate-300 font-medium">
                      {fileMeta.badge}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      · {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {onOpenCodeWorkspace && (
                      <button
                        type="button"
                        data-testid="open-in-code-workspace-btn"
                        onClick={() =>
                          onOpenCodeWorkspace(codeBlocks, currentCodeIdx, messageId)
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[var(--primary)] text-white hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap font-semibold shadow-xs"
                        title="Open in Code Workspace"
                      >
                        <Play className="w-3 h-3" />
                        <span>Open in Code Workspace</span>
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="chat-toggle-code-view-btn"
                      onClick={() =>
                        setExpandedCodeBlocks((prev) => ({
                          ...prev,
                          [idx]: !isCodeVisible,
                        }))
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                      title="Developer Option: Toggle Raw Source Code View"
                    >
                      <Terminal className="w-3 h-3" />
                      <span>{isCodeVisible ? 'Hide Code' : 'Code View'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadCode(block.content, lang)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer"
                      title="Download file"
                      aria-label={`Download ${lang} code`}
                    >
                      <Download className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      data-testid="copy-code-btn"
                      onClick={() => handleCopyCode(block.content, idx)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {copiedCodeIdx === idx ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copy Code
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {isCodeVisible ? (
                  <pre
                    className="chat-code-pre px-3.5 py-2.5 m-0 overflow-x-auto font-mono-num text-[12.5px] leading-relaxed text-slate-100"
                    data-testid="chat-code-source-pre"
                  >
                    <code>{block.content}</code>
                  </pre>
                ) : (
                  <div
                    className="px-3.5 py-2.5 text-xs text-slate-300 flex items-center justify-between gap-2 bg-slate-900/50"
                    data-testid="chat-code-hidden-notice"
                  >
                    <span>
                      ✓ Background project file ready ({fileMeta.filename}) · Source code hidden by default
                    </span>
                    {onOpenCodeWorkspace && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenCodeWorkspace(codeBlocks, currentCodeIdx, messageId)
                        }
                        className="text-indigo-300 hover:text-indigo-200 font-semibold underline cursor-pointer shrink-0"
                      >
                        Launch Preview →
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={idx} className="py-0.5">
              {renderMarkdown === false ? (
                <div className="whitespace-pre-wrap leading-relaxed">
                  {block.content}
                </div>
              ) : (
                renderParagraphContent(block.content)
              )}
            </div>
          );
        });
      })()}

      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-[var(--primary)] rounded-sm animate-pulse ml-1 align-middle" />
      )}

      {/* Revision History & Undo Bar if user made inline edits */}
      {!isStreaming && revisions.length > 0 && (
        <div className="pt-2 mt-2 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-2)]">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--primary)]">
              ✨ {revisions.length} Inline{' '}
              {revisions.length === 1 ? 'Edit' : 'Edits'} Applied
            </span>
            <span>·</span>
            <span className="truncate max-w-xs">
              Latest: {revisions[revisions.length - 1].summary}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRevisions(!showRevisions)}
              className="text-[var(--text-2)] hover:text-[var(--primary)] underline cursor-pointer"
            >
              {showRevisions ? 'Hide History' : 'View Revisions'}
            </button>
            <button
              type="button"
              onClick={() => {
                const lastRev = revisions[revisions.length - 1];
                if (lastRev) {
                  onUpdateMessageText(messageId, lastRev.previousText);
                  onToast('Reverted last inline change');
                }
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--surface-2)] hover:text-[var(--primary)] cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> Undo Last
            </button>
          </div>

          {showRevisions && (
            <div className="w-full mt-2 space-y-1.5 bg-[var(--surface-2)] p-2.5 rounded-lg">
              {revisions.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-[var(--border)] last:border-0"
                >
                  <div>
                    <span className="font-mono-num text-[var(--text-3)] mr-2">
                      #{i + 1} [{r.scope}]
                    </span>
                    <strong className="text-[var(--text)]">{r.feedback}</strong>
                    <span className="text-[var(--text-2)] ml-2">
                      — {r.summary}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateMessageText(messageId, r.previousText);
                      onToast('Restored version before this edit');
                    }}
                    className="text-[var(--primary)] hover:underline shrink-0 cursor-pointer"
                  >
                    Restore Prior
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
