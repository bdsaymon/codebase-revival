import React, { useState } from 'react';
import {
  Copy,
  ExternalLink,
  LayoutTemplate,
  RotateCcw,
  Share,
  ThumbsDown,
  ThumbsUp,
  Zap,
} from 'lucide-react';
import type { ChatMessage, InlineRevision, ProactiveSuggestion } from '../../types';
import type { FileArtifactItem } from '../../utils/fileArtifacts';
import { stripContactTokensForText } from '../../utils/creatorIdentity';
import {
  InteractiveMessageContent,
  extractThinkingAndResponse,
} from '../InteractiveMessageContent';

export interface ChatMessageItemProps {
  message: ChatMessage;
  prevUserPrompt?: string;
  isLatestAiMsg: boolean;
  isStreaming: boolean;
  isGenerating: boolean;
  thinkingEnabled: boolean;
  liveThinkingSummary: boolean;
  renderMarkdown: boolean;
  highlightCode: boolean;
  showThinkingTopic: boolean;
  autoCollapseThinking: boolean;
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
  onInstallSelfWidget: (code: string) => void;
  onOpenWidgetById: (widgetId: string) => void;
  onOpenLightbox: (url: string) => void;
  onSubmitFeedback: (
    message: ChatMessage,
    rating: 'up' | 'down',
    reasonText?: string
  ) => void | Promise<void>;
  onRetryMessage: (messageId: string) => void;
  onToast: (msg: string) => void;
}

const ChatMessageItemInner: React.FC<ChatMessageItemProps> = ({
  message: m,
  prevUserPrompt = '',
  isLatestAiMsg,
  isStreaming,
  isGenerating,
  thinkingEnabled,
  liveThinkingSummary,
  renderMarkdown,
  highlightCode,
  showThinkingTopic,
  autoCollapseThinking,
  onUpdateMessageText,
  onDismissSuggestion,
  onAcceptSuggestion,
  onOpenCodeLab,
  onInstallSelfWidget,
  onOpenWidgetById,
  onOpenLightbox,
  onSubmitFeedback,
  onRetryMessage,
  onToast,
}) => {
  const [feedbackReasonOpen, setFeedbackReasonOpen] = useState(false);
  const [feedbackReasonInput, setFeedbackReasonInput] = useState(
    m.feedback?.reason || ''
  );

  const attachedDocNames = React.useMemo(() => {
    if (m.role !== 'user') return [];
    return Array.from(
      m.text.matchAll(/⟦FILE:([^\n⟦]+)⟧[\s\S]*?⟦\/FILE⟧/g)
    ).map((match) => match[1].trim());
  }, [m.role, m.text]);

  const cleanUserText = React.useMemo(() => {
    if (m.role !== 'user') return m.text;
    return m.text.replace(/⟦FILE:([^\n⟦]+)⟧[\s\S]*?⟦\/FILE⟧/g, '').trim();
  }, [m.role, m.text]);

  return (
    <div className={`msg-row ${m.role === 'user' ? 'is-user' : 'is-ai'} group`}>
      <div
        className={`flex flex-col min-w-0 ${
          m.role === 'user'
            ? 'items-end max-w-[92%] sm:max-w-2xl'
            : 'items-start w-full'
        }`}
      >
        {m.role === 'user' ? (
          <>
            {((m.imgs && m.imgs.length > 0) || attachedDocNames.length > 0) && (
              <div className="ref-attach-grid">
                {m.imgs?.map((im, idx) => {
                  const src = im.url || `data:${im.mime};base64,${im.data}`;
                  return (
                    <img
                      key={`img-${idx}`}
                      src={src}
                      alt="Uploaded attachment"
                      referrerPolicy="no-referrer"
                      onClick={() => onOpenLightbox(src)}
                      className="ref-attach-img"
                    />
                  );
                })}
                {attachedDocNames.map((fname, idx) => {
                  const ext =
                    fname.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE';
                  return (
                    <div key={`doc-${idx}`} className="ref-attach-doc">
                      <span className="ref-attach-badge">{ext}</span>
                      <span className="ref-attach-name">{fname}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {cleanUserText && (
              <div className="msg-user-bubble">{cleanUserText}</div>
            )}
          </>
        ) : (
          <div className="w-full min-w-0">
            <InteractiveMessageContent
              messageId={m.id}
              text={m.text}
              thinking={m.thinking}
              thinkingDurationSec={m.thinkingDurationSec}
              statusSteps={m.statusSteps}
              thinkingEnabled={thinkingEnabled}
              liveThinkingSummary={liveThinkingSummary}
              isStreaming={isStreaming}
              proactiveSuggestions={m.proactiveSuggestions}
              revisions={m.revisions}
              onUpdateMessageText={onUpdateMessageText}
              onDismissSuggestion={onDismissSuggestion}
              onAcceptSuggestion={onAcceptSuggestion}
              onOpenCodeLab={onOpenCodeLab}
              onInstallSelfWidget={onInstallSelfWidget}
              onToast={onToast}
              renderMarkdown={renderMarkdown}
              highlightCode={highlightCode}
              userPromptPreview={prevUserPrompt}
              showThinkingTopic={showThinkingTopic}
              autoCollapseThinking={autoCollapseThinking}
            />

            {(m.selfUpdateSummary ||
              m.selfUpdateWidgetId ||
              (m.memoryAdded && m.memoryAdded.length > 0)) && (
              <div className="mt-3 space-y-2">
                {m.selfUpdateWidgetId && (
                  <button
                    type="button"
                    onClick={() => onOpenWidgetById(m.selfUpdateWidgetId!)}
                    className="ref-artifact-card"
                  >
                    <span className="ref-artifact-thumb">
                      <LayoutTemplate className="w-5 h-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15.5px] font-semibold text-[var(--ink)] truncate">
                        {m.selfUpdateSummary || 'Interactive App Solution'}
                      </span>
                      <span className="block text-[13px] text-[var(--ink-dim)] mt-0.5">
                        Interactive Artifact · Open
                      </span>
                    </span>
                  </button>
                )}
                {!m.selfUpdateWidgetId && m.selfUpdateSummary && (
                  <div className="text-xs text-[var(--ink-dim)] flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{m.selfUpdateSummary}</span>
                  </div>
                )}
                {m.memoryAdded && m.memoryAdded.length > 0 && (
                  <div className="text-[11px] text-[var(--ink-dim)]">
                    Memory updated
                  </div>
                )}
              </div>
            )}

            {m.imgGen && (
              <div className="mt-3 max-w-xs rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--surface-2)]">
                <img
                  src={m.imgGen.url}
                  alt={m.imgGen.prompt}
                  referrerPolicy="no-referrer"
                  onClick={() => onOpenLightbox(m.imgGen!.url)}
                  className="w-full aspect-square object-cover block cursor-zoom-in"
                />
                <div className="px-3 py-2 flex items-center justify-between text-xs text-[var(--text-2)]">
                  <span>Image Studio</span>
                  <a
                    href={m.imgGen.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--primary)] font-semibold inline-flex items-center gap-1 hover:underline"
                  >
                    Open HD <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            {m.sources && m.sources.length > 0 && (
              <div className="mt-3 pt-2 border-t border-[var(--border)] text-xs text-[var(--text-2)]">
                <span className="font-semibold text-[var(--text)] mr-2">
                  Sources:
                </span>
                {m.sources.map((s, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span className="mx-1.5">·</span>}
                    <a
                      href={s.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--primary)] hover:underline"
                    >
                      {s.title}
                    </a>
                  </React.Fragment>
                ))}
              </div>
            )}

            {m.fallbackNotice && (
              <div className="mt-1.5 text-[11px] text-amber-400/90 flex items-center gap-1.5">
                <span>⚡ {m.fallbackNotice}</span>
              </div>
            )}
          </div>
        )}

        {!isStreaming && (
          <div className="flex flex-col gap-1.5 mt-1">
            <div
              data-testid={`msg-actions-${m.role}`}
              className={`msg-actions flex items-center gap-0.5 ${
                m.role === 'ai'
                  ? isLatestAiMsg
                    ? 'opacity-100 -ml-1.5'
                    : 'opacity-85 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 hover:opacity-100 transition-opacity -ml-1.5'
                  : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 hover:opacity-100 transition-opacity'
              }`}
            >
              {m.role === 'ai' ? (
                <>
                  <button
                    type="button"
                    data-testid="msg-copy-btn"
                    onClick={() => {
                      const { cleanResponse } = extractThinkingAndResponse(
                        m.text,
                        m.thinking
                      );
                      navigator.clipboard?.writeText(
                        stripContactTokensForText(cleanResponse || m.text)
                      );
                      onToast('কপি করা হয়েছে');
                    }}
                    className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                    title="Copy"
                    aria-label="Copy response"
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    data-testid="msg-feedback-up-btn"
                    onClick={() => void onSubmitFeedback(m, 'up')}
                    className={`w-8 h-8 rounded-lg inline-flex items-center justify-center hover:bg-[var(--surface-2)] transition-colors cursor-pointer ${
                      m.feedback?.rating === 'up'
                        ? 'text-[var(--ink)] bg-[var(--surface-2)]'
                        : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                    }`}
                    title="Like"
                    aria-label="Good response"
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    data-testid="msg-feedback-down-btn"
                    onClick={() => {
                      void onSubmitFeedback(m, 'down');
                      setFeedbackReasonOpen((prev) => !prev);
                    }}
                    className={`w-8 h-8 rounded-lg inline-flex items-center justify-center hover:bg-[var(--surface-2)] transition-colors cursor-pointer ${
                      m.feedback?.rating === 'down'
                        ? 'text-[var(--ink)] bg-[var(--surface-2)]'
                        : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                    }`}
                    title="Dislike"
                    aria-label="Bad response"
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    data-testid="msg-share-btn"
                    onClick={() => {
                      const { cleanResponse } = extractThinkingAndResponse(
                        m.text,
                        m.thinking
                      );
                      const exportText = stripContactTokensForText(
                        cleanResponse || m.text
                      );
                      if (
                        typeof navigator !== 'undefined' &&
                        typeof navigator.share === 'function'
                      ) {
                        navigator
                          .share({ title: 'SMFTA AI Pro', text: exportText })
                          .catch(() => {
                            navigator.clipboard?.writeText(exportText);
                            onToast('কপি করা হয়েছে');
                          });
                      } else {
                        const blob = new Blob([exportText], {
                          type: 'text/markdown;charset=utf-8',
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `response-${m.id}.md`;
                        a.click();
                        URL.revokeObjectURL(url);
                        onToast('ডাউনলোড করা হয়েছে');
                      }
                    }}
                    className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                    title="Share / Export"
                    aria-label="Share or export response"
                  >
                    <Share className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    data-testid="msg-retry-btn"
                    disabled={isGenerating}
                    onClick={() => onRetryMessage(m.id)}
                    className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer disabled:opacity-40"
                    title="Retry"
                    aria-label="Retry response"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  data-testid="user-msg-copy-btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(cleanUserText || m.text);
                    onToast('কপি করা হয়েছে');
                  }}
                  className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                  title="Copy"
                  aria-label="Copy message"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {m.role === 'ai' && feedbackReasonOpen && (
              <div
                data-testid="feedback-reason-box"
                className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] max-w-md"
              >
                <input
                  type="text"
                  data-testid="feedback-reason-input"
                  value={feedbackReasonInput}
                  onChange={(e) => setFeedbackReasonInput(e.target.value)}
                  placeholder="কেন উত্তরটি ভালো লাগেনি? (ঐচ্ছিক)"
                  className="flex-1 min-w-[180px] px-2.5 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] outline-none"
                />
                <button
                  type="button"
                  data-testid="feedback-reason-submit"
                  onClick={() => {
                    void onSubmitFeedback(m, 'down', feedbackReasonInput);
                    setFeedbackReasonOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold cursor-pointer"
                >
                  জমা দিন
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackReasonOpen(false)}
                  className="px-2 py-1.5 rounded-lg text-xs text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
                >
                  বাতিল
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const ChatMessageItem = React.memo(ChatMessageItemInner);
