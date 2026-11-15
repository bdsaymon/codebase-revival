import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Brain,
  Check,
  X,
  Copy,
  Wand2,
  Edit3,
  RotateCcw,
  Lightbulb,
  ArrowRight,
  ChevronRight,
  Eye,
  Code2,
  FileText,
  Download,
  FileArchive,
} from 'lucide-react';
import { ProactiveSuggestion, InlineRevision } from '../types';
import { INLINE_QUICK_ACTIONS } from '../utils/helpers';
import {
  deriveInitialThinkingTopic,
  formatThinkingParagraphs,
  formatThinkingTimerLabel,
  toBengaliDigits,
} from '../utils/thinking';
import { isPreviewableLanguage } from './ClaudeArtifactPanel';
import {
  FileArtifactItem,
  downloadArtifactsAsZip,
  downloadSingleArtifactFile,
  extractFileArtifacts,
  formatArtifactSize,
} from '../utils/fileArtifacts';
import {
  CONTACT_BUTTONS_TOKEN,
  CREATOR_NAME,
  CREATOR_TELEGRAM_URL,
  TELEGRAM_BUTTON_TOKEN,
  WHATSAPP_BUTTON_TOKEN,
  getCreatorWhatsAppUrl,
} from '../utils/creatorIdentity';

interface InteractiveMessageContentProps {
  messageId: string;
  text: string;
  thinking?: string;
  thinkingDurationSec?: number;
  statusSteps?: string[];
  liveThinkingSummary?: boolean;
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
  onOpenCodeLab: (
    code: string,
    lang?: string,
    filename?: string,
    title?: string,
    bundleFiles?: FileArtifactItem[]
  ) => void;
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
  /** Preceding user prompt text so Thinking immediately shows the subject/topic from t = 0. */
  userPromptPreview?: string;
  /** Lead Thinking header with the subject/topic up front. */
  showThinkingTopic?: boolean;
  /** Automatically collapse Thinking accordion once answer completes. */
  autoCollapseThinking?: boolean;
  /** Whether Thinking mode is enabled for the active AI turn. */
  thinkingEnabled?: boolean;
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

const GENERIC_THINKING_META_RE =
  /^(?:(?:initiating|starting|beginning|formulating|structuring|evaluating|reviewing|assessing|interpreting|analyzing|understanding|deconstructing|examining|planning|determining)\s+(?:the\s+|a\s+|an\s+|my\s+|user'?s?\s+)?(?:request|prompt|query|task|goal|user|analysis|problem|question|response|strategy|plan|steps|approach|process|calculation\s+process)|thinking\s+process|thought\s+process|let'?s\s+analyze|step\s+by\s+step)$/i;

/**
 * Extracts a concise, human-readable topic or first meaningful sentence
 * from raw `<think>` reasoning text, skipping generic meta-headers.
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
        .replace(/[.:;,]+$/, '')
        .trim()
    )
    .filter((line) => line.length >= 3 && !GENERIC_THINKING_META_RE.test(line));

  const candidateLine = lines[0] || '';
  if (!candidateLine) return 'Analyzing request';
  const firstSentence =
    candidateLine.split(/(?<=[.!?।])\s+/)[0]?.trim() || candidateLine;
  const cleaned = firstSentence.replace(/[.:;,]+$/, '').trim();
  if (!cleaned || GENERIC_THINKING_META_RE.test(cleaned)) {
    return 'Analyzing request';
  }

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
    return `Thinking: ${topic}...`;
  }
  const secs = estimateThinkingSeconds(thinkingText, durationSeconds);
  const unit = secs === 1 ? 'second' : 'seconds';
  return `Thought on ${topic} (${secs} ${unit})`;
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

function CreatorContactButtons({
  showWhatsApp = true,
  showTelegram = true,
  inline = false,
}: {
  showWhatsApp?: boolean;
  showTelegram?: boolean;
  inline?: boolean;
}) {
  const waUrl = getCreatorWhatsAppUrl();
  return (
    <span
      data-testid="creator-contact-actions"
      className={
        inline
          ? 'inline-flex flex-wrap items-center gap-2 align-middle mx-1'
          : 'flex flex-wrap items-center gap-2.5 my-2.5'
      }
    >
      {showWhatsApp && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="whatsapp-now-btn"
          title={`${CREATOR_NAME} — WhatsApp`}
          aria-label="WhatsApp Now"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white text-[13px] font-semibold shadow-xs transition-colors no-underline"
        >
          <svg
            className="w-4 h-4 shrink-0 fill-current"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12.03 2C6.51 2 2.04 6.47 2.04 11.99c0 1.76.46 3.48 1.34 5L2 22l5.15-1.35a9.96 9.96 0 0 0 4.88 1.27h.01c5.52 0 9.99-4.47 9.99-9.99C22.03 6.47 17.55 2 12.03 2zm5.82 14.18c-.24.68-1.42 1.3-1.97 1.38-.51.07-1.15.1-1.85-.12-.43-.14-.98-.32-1.69-.63-2.97-1.28-4.91-4.29-5.06-4.49-.15-.2-1.21-1.61-1.21-3.07 0-1.46.76-2.18 1.03-2.48.27-.3.59-.37.79-.37.2 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.83 2.02.9 2.17.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.61.17.3.77 1.27 1.66 2.06 1.14 1.02 2.1 1.33 2.4 1.48.3.15.47.13.65-.07.18-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.72.81 2.02.96.3.15.49.22.56.34.07.13.07.72-.17 1.4z" />
          </svg>
          <span>WhatsApp Now</span>
        </a>
      )}

      {showTelegram && (
        <a
          href={CREATOR_TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="telegram-contact-btn"
          title={`${CREATOR_NAME} — Telegram`}
          aria-label="Telegram Now"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#229ED9] hover:bg-[#1b8cc2] text-white text-[13px] font-semibold shadow-xs transition-colors no-underline"
        >
          <svg
            className="w-4 h-4 shrink-0 fill-current"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
          </svg>
          <span>Telegram Now</span>
        </a>
      )}
    </span>
  );
}

// Rich multi-color inline markdown formatter for bold, inline code, quoted phrases, and links
function renderInlineFormatting(line: string): React.ReactNode {
  const cleanLine = stripBrokenGlyphs(line);
  const parts = cleanLine.split(
    /(\[\[SMFTA_CONTACT_BUTTONS\]\]|\[\[WHATSAPP_NOW\]\]|\[\[TELEGRAM_NOW\]\]|`[^`]+`|\*\*[^*]+\*\*|"[^"\n]{2,60}"|“[^”\n]{2,60}”|\[[^\]]+\]\([^)]+\))/g
  );
  return parts.map((part, i) => {
    if (
      part === CONTACT_BUTTONS_TOKEN ||
      part === WHATSAPP_BUTTON_TOKEN ||
      part === TELEGRAM_BUTTON_TOKEN
    ) {
      return null;
    }
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
  thinkingDurationSec,
  statusSteps = [],
  liveThinkingSummary = true,
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
  userPromptPreview = '',
  showThinkingTopic = true,
  autoCollapseThinking = false,
  thinkingEnabled = true,
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

  const { thinkingText, cleanResponse, isThinkingActive } = extractThinkingAndResponse(
    text,
    thinking
  );

  const hasAnswerStarted = Boolean(cleanResponse.trim().length > 0);
  const isReasoningNow = Boolean(
    isThinkingActive ||
      (isStreaming &&
        (!hasAnswerStarted || statusSteps.length > 0) &&
        (Boolean(thinkingText) || thinkingEnabled !== false))
  );
  const showInlineThinkingCard = Boolean(
    thinkingText ||
      isThinkingActive ||
      (isStreaming && (thinkingEnabled !== false || statusSteps.length > 0))
  );
  const thinkingStartRef = useRef<number | null>(null);
  const thinkingScrollRef = useRef<HTMLDivElement | null>(null);
  const [liveElapsedMs, setLiveElapsedMs] = useState<number>(100);
  const [measuredThinkSec, setMeasuredThinkSec] = useState<number | undefined>(
    thinkingDurationSec
  );
  const [userToggledThinking, setUserToggledThinking] = useState<boolean | null>(
    null
  );
  const userManualToggleRef = useRef<boolean>(false);

  // Groq AI style 100ms precision timer while reasoning/streaming is active
  useEffect(() => {
    if (isReasoningNow || (isStreaming && showInlineThinkingCard)) {
      if (thinkingStartRef.current === null) {
        thinkingStartRef.current = Date.now();
      }
      const tick = () => {
        if (thinkingStartRef.current !== null) {
          setLiveElapsedMs(
            Math.max(100, Date.now() - thinkingStartRef.current)
          );
        }
      };
      tick();
      const interval = setInterval(tick, 100);
      return () => clearInterval(interval);
    } else if (thinkingStartRef.current !== null) {
      const elapsedSec = Math.max(
        0.2,
        Math.round((Date.now() - thinkingStartRef.current) / 100) / 10
      );
      setMeasuredThinkSec(elapsedSec);
      thinkingStartRef.current = null;
      if (!userManualToggleRef.current && autoCollapseThinking === true) {
        setUserToggledThinking(false);
      }
    }
  }, [isReasoningNow, isStreaming, showInlineThinkingCard, autoCollapseThinking]);

  const liveElapsedSec = Math.max(0.1, Math.round(liveElapsedMs / 100) / 10);

  const effectiveDurationSec =
    isReasoningNow || isStreaming
      ? liveElapsedSec
      : thinkingDurationSec ??
        measuredThinkSec ??
        estimateThinkingSeconds(thinkingText, measuredThinkSec);

  const formattedGroqSeconds =
    effectiveDurationSec < 10 && !Number.isInteger(effectiveDurationSec)
      ? effectiveDurationSec.toFixed(1)
      : String(Math.max(1, Math.round(effectiveDurationSec)));

  const isThinkingExpanded =
    userToggledThinking !== null
      ? userToggledThinking
      : isReasoningNow || isStreaming
        ? liveThinkingSummary !== false
        : autoCollapseThinking === true
          ? false
          : liveThinkingSummary !== false;

  // Auto-scroll reasoning stream while thoughts are streaming in (Groq AI style)
  useEffect(() => {
    if (isThinkingExpanded && (isReasoningNow || isStreaming) && thinkingScrollRef.current) {
      thinkingScrollRef.current.scrollTop = thinkingScrollRef.current.scrollHeight;
    }
  }, [thinkingText, statusSteps.length, isThinkingExpanded, isReasoningNow, isStreaming]);

  const rawThoughtTopic = thinkingText ? extractThinkingTopic(thinkingText) : '';
  const initialPromptTopic = userPromptPreview
    ? deriveInitialThinkingTopic(userPromptPreview)
    : '';
  const thinkingSubject =
    initialPromptTopic && initialPromptTopic !== 'আপনার প্রশ্ন'
      ? initialPromptTopic
      : rawThoughtTopic && rawThoughtTopic !== 'Analyzing request'
        ? rawThoughtTopic
        : 'আপনার প্রশ্ন';

  const thinkingHeadline = formatThinkingTimerLabel(
    Math.max(1, Math.round(effectiveDurationSec)),
    !(isReasoningNow || isStreaming)
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

  const { artifacts, processedText } = extractFileArtifacts(cleanResponse, {
    isStreaming,
  });

  const normalizedForBlocks = (processedText || '')
    .replace(
      /(\[\[SMFTA_CONTACT_BUTTONS\]\]|\[\[WHATSAPP_NOW\]\]|\[\[TELEGRAM_NOW\]\])/g,
      ''
    )
    .trim();

  // v18.11 — markdown off: keep the raw text as one plain block (code fences
  // are displayed literally, exactly as the model wrote them).
  const blocks: ParsedBlock[] =
    renderMarkdown === false
      ? [{ type: 'text', content: processedText || cleanResponse }]
      : parseBlocks(normalizedForBlocks);

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

  // Build a complete bundle of all fenced code blocks + extracted file artifacts in this message
  // so clicking Preview on any HTML, CSS, JS, or React block merges sibling blocks automatically.
  const allMessageCodeBundles: FileArtifactItem[] = React.useMemo(() => {
    const bundle: FileArtifactItem[] = [...artifacts];
    const extMap: Record<string, string> = {
      html: 'index.html',
      htm: 'index.html',
      svg: 'graphic.svg',
      css: 'styles.css',
      scss: 'styles.css',
      javascript: 'script.js',
      js: 'script.js',
      typescript: 'script.ts',
      ts: 'script.ts',
      jsx: 'App.jsx',
      tsx: 'App.tsx',
      react: 'App.tsx',
    };
    blocks.forEach((b, bIdx) => {
      if (b.type !== 'code' || !b.content.trim()) return;
      const rawLang = (b.lang || 'code').trim().toLowerCase();
      const baseExt = extMap[rawLang] || `snippet-${bIdx + 1}.${CODE_EXTS[rawLang] || 'txt'}`;
      const filename = bundle.some((x) => x.filename === baseExt)
        ? `${bIdx + 1}-${baseExt}`
        : baseExt;
      bundle.push({
        id: `code-block-${bIdx}`,
        filename,
        lang: rawLang,
        title: `${rawLang.toUpperCase()} Block ${bIdx + 1}`,
        content: b.content,
        isStreaming: false,
      });
    });
    return bundle;
  }, [artifacts, blocks]);

  return (
    <div className="msg-prose space-y-1.5 text-[var(--text)]">
      {/* Groq AI Style Inline Thinking Stream — directly inside the AI response turn */}
      {showInlineThinkingCard && (
        <div
          data-testid="thinking-accordion"
          className="mt-0 mb-2.5 select-none"
        >
          <button
            type="button"
            data-testid="thinking-accordion-toggle"
            aria-expanded={isThinkingExpanded}
            onClick={() => {
              userManualToggleRef.current = true;
              setUserToggledThinking(!isThinkingExpanded);
            }}
            className="group inline-flex max-w-full items-center gap-2 py-1 px-2.5 -ml-1.5 rounded-lg text-[13px] font-medium text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]/70 transition-colors cursor-pointer text-left"
          >
            <span
              className={`relative inline-flex items-center justify-center w-4 h-4 rounded shrink-0 transition-colors ${
                isReasoningNow || isStreaming
                  ? 'text-[var(--primary)]'
                  : 'text-[var(--ink-dim)] group-hover:text-[var(--ink)]'
              }`}
            >
              <Brain
                className={`w-3.5 h-3.5 ${
                  isReasoningNow || isStreaming ? 'animate-pulse' : ''
                }`}
              />
            </span>

            <div
              data-testid="thinking-accordion-headline"
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0"
            >
              <span
                className={`font-semibold tracking-[-0.01em] shrink-0 ${
                  isReasoningNow || isStreaming
                    ? 'text-[var(--primary)] animate-pulse'
                    : 'text-[var(--ink)]/90 group-hover:text-[var(--ink)]'
                }`}
              >
                {isReasoningNow || isStreaming
                  ? `Thinking... ${formattedGroqSeconds}s`
                  : `Thought for ${formattedGroqSeconds}s`}
              </span>

              {showThinkingTopic !== false && (
                <span
                  data-testid="thinking-subject-label"
                  className="text-[12.5px] font-medium text-[var(--ink-dim)] truncate max-w-[200px] sm:max-w-[320px]"
                >
                  · {thinkingSubject}
                </span>
              )}

              <span className="text-[11.5px] text-[var(--text-3)] shrink-0 hidden sm:inline">
                ({isReasoningNow || isStreaming ? 'চিন্তা করছি…' : thinkingHeadline})
              </span>
            </div>

            <ChevronRight
              className={`w-3.5 h-3.5 shrink-0 text-[var(--ink-dim)] group-hover:text-[var(--ink)] transition-transform duration-150 ${
                isThinkingExpanded ? 'rotate-90' : ''
              }`}
            />
          </button>

          {isThinkingExpanded && (
            <div
              ref={thinkingScrollRef}
              data-testid="thinking-accordion-content"
              className="mt-1 ml-2 pl-3.5 py-1 border-l-2 border-[var(--primary)]/40 dark:border-[var(--primary)]/50 max-h-64 overflow-y-auto space-y-2 select-text"
            >
              {showThinkingTopic !== false && thinkingSubject && (
                <div
                  data-testid="thinking-topic-banner"
                  className="text-[12px] font-medium text-[var(--ink-dim)] flex items-center gap-1.5"
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--primary)]/70 shrink-0" />
                  <span>বিষয়: {thinkingSubject}</span>
                </div>
              )}
              {thinkingText ? (
                formatThinkingParagraphs(thinkingText).map((step, sIdx, arr) => (
                  <div key={sIdx} className="space-y-0.5">
                    {step.title && (
                      <div className="text-[12.5px] font-semibold text-[var(--ink)]/90 leading-snug">
                        {step.title}
                      </div>
                    )}
                    {step.body && (
                      <div className="text-[12.5px] leading-[1.65] text-[var(--ink-dim)] font-normal whitespace-pre-line">
                        {step.body}
                        {(isReasoningNow || isStreaming) && sIdx === arr.length - 1 && (
                          <span
                            aria-hidden="true"
                            className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-[var(--primary)]/75 animate-pulse rounded-xs"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-[12.5px] text-[var(--ink-dim)] italic flex items-center gap-1.5">
                  <span>{thinkingSubject} বিশ্লেষণ করে উত্তরের রূপরেখা তৈরি হচ্ছে…</span>
                  <span
                    aria-hidden="true"
                    className="inline-block w-1.5 h-3.5 bg-[var(--primary)]/75 animate-pulse rounded-xs"
                  />
                </div>
              )}
            </div>
          )}
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

      {/* Clean standard message blocks & simple code boxes */}
      {blocks.map((block, idx) => {
        if (block.type === 'code') {
          const lang = (block.lang || 'code').trim();
          const canLivePreview = isPreviewableLanguage(lang, block.content);

          if (highlightCode === false) {
            return (
              <div key={idx} className="my-2">
                <div className="flex items-center justify-between text-xs text-[var(--text-3)] mb-1">
                  <span className="font-mono-num uppercase">{lang}</span>
                  <div className="flex items-center gap-2">
                    {canLivePreview && (
                      <button
                        type="button"
                        data-testid="preview-code-btn"
                        onClick={() =>
                          onOpenCodeLab(
                            block.content,
                            lang,
                            undefined,
                            undefined,
                            allMessageCodeBundles
                          )
                        }
                        className="underline cursor-pointer"
                      >
                        Preview
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="copy-code-btn"
                      onClick={() => handleCopyCode(block.content, idx)}
                      className="underline cursor-pointer"
                    >
                      {copiedCodeIdx === idx ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <pre className="px-3 py-2 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono-num text-[12px] leading-relaxed border border-[var(--border)]">
                  <code>{block.content}</code>
                </pre>
              </div>
            );
          }

          return (
            <div key={idx} className="my-3 space-y-2">
              <div
                className="chat-code-block rounded-xl overflow-hidden border border-[var(--code-border)] bg-[var(--code-bg)] text-slate-100"
                data-testid="chat-code-block"
                data-code-lang={lang}
              >
                <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-[var(--code-top)] border-b border-[var(--code-border)] text-xs">
                  <span className="font-mono-num text-slate-300 font-medium truncate">
                    {lang}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="preview-code-btn"
                      onClick={() =>
                        onOpenCodeLab(
                          block.content,
                          lang,
                          undefined,
                          undefined,
                          allMessageCodeBundles
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                      title="Open in side-by-side preview"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Preview</span>
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
                          <Copy className="w-3 h-3" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <pre
                  className="chat-code-pre px-3.5 py-2.5 m-0 overflow-x-auto font-mono-num text-[12.5px] leading-relaxed text-slate-100"
                  data-testid="chat-code-source-pre"
                >
                  <code>{block.content}</code>
                </pre>
              </div>

              {canLivePreview && (
                <button
                  type="button"
                  data-testid="claude-artifact-card"
                  onClick={() =>
                    onOpenCodeLab(
                      block.content,
                      lang,
                      undefined,
                      undefined,
                      allMessageCodeBundles
                    )
                  }
                  className="w-full max-w-md px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] inline-flex items-center justify-center text-[var(--primary)] shrink-0">
                      <Code2 className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-[var(--ink)] truncate">
                        Interactive {lang.toUpperCase()} Live Preview
                      </span>
                      <span className="block text-[11.5px] text-[var(--ink-dim)]">
                        পাশাপাশি লাইভ প্রিভিউ ও কোড দেখতে ক্লিক করুন
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-[var(--ink-dim)] shrink-0" />
                </button>
              )}
            </div>
          );
        }

        // Render Claude.ai-style File Artifact Cards for placeholder tokens
        const artifactMatch = /^\[\[SMFTA_ARTIFACT_(\d+)\]\]$/.exec(
          block.content.trim()
        );
        if (artifactMatch) {
          const artIdx = Number(artifactMatch[1]);
          const art = artifacts[artIdx];
          if (!art) return null;
          const isMd = art.lang === 'markdown' || art.filename.endsWith('.md');
          const extBadge = (
            art.filename.split('.').pop() ||
            art.lang ||
            'FILE'
          ).toUpperCase();
          return (
            <div
              key={`art-${idx}-${art.id}`}
              data-testid="claude-file-artifact-card"
              onClick={() =>
                onOpenCodeLab(
                  art.content,
                  art.lang,
                  art.filename,
                  art.title,
                  artifacts
                )
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenCodeLab(
                    art.content,
                    art.lang,
                    art.filename,
                    art.title,
                    artifacts
                  );
                }
              }}
              className="my-2.5 w-full max-w-md px-3.5 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] inline-flex items-center justify-center text-[var(--primary)] shrink-0">
                  {isMd ? (
                    <FileText className="w-4 h-4" />
                  ) : (
                    <Code2 className="w-4 h-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-[var(--ink)] truncate">
                    {art.title || art.filename}
                  </div>
                  <div className="text-[11.5px] text-[var(--ink-dim)] truncate font-mono">
                    {art.isStreaming
                      ? `Writing ${art.filename}…`
                      : `${art.filename} · ${extBadge} · ${formatArtifactSize(art.content)}`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  data-testid="artifact-card-download-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadSingleArtifactFile({
                      filename: art.filename,
                      lang: art.lang,
                      content: art.content,
                    });
                    onToast(`ডাউনলোড হয়েছে: ${art.filename}`);
                  }}
                  className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
                  title={`Download ${art.filename}`}
                  aria-label={`Download ${art.filename}`}
                >
                  <Download className="w-4 h-4" />
                </button>
                <ChevronRight className="w-4 h-4 text-[var(--ink-dim)]" />
              </div>
            </div>
          );
        }

        const trimmedBlock = block.content.trim();
        if (
          trimmedBlock === CONTACT_BUTTONS_TOKEN ||
          trimmedBlock === WHATSAPP_BUTTON_TOKEN ||
          trimmedBlock === TELEGRAM_BUTTON_TOKEN
        ) {
          return null;
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
      })}

      {/* Multi-file ZIP bundle download bar when 2+ files are generated */}
      {!isStreaming && artifacts.length > 1 && (
        <div className="pt-1">
          <button
            type="button"
            data-testid="download-all-zip-btn"
            onClick={() => {
              downloadArtifactsAsZip(
                artifacts.map((a) => ({
                  filename: a.filename,
                  content: a.content,
                })),
                'project-files.zip'
              );
              onToast(`ZIP ডাউনলোড হয়েছে (${artifacts.length}টি ফাইল)`);
            }}
            className="w-full max-w-md px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/70 hover:bg-[var(--surface-2)] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] inline-flex items-center justify-center text-[var(--primary)] shrink-0">
                <FileArchive className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-[var(--ink)] truncate">
                  Download All Files (.zip)
                </span>
                <span className="block text-[11px] text-[var(--ink-dim)]">
                  {artifacts.length} files packaged in ZIP
                </span>
              </span>
            </span>
            <Download className="w-4 h-4 text-[var(--ink-dim)] shrink-0" />
          </button>
        </div>
      )}

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
