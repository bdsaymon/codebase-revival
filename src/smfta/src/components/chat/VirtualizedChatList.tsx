import React, { useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Brain } from 'lucide-react';
import type { ChatMessage, InlineRevision, ProactiveSuggestion } from '../../types';
import type { FileArtifactItem } from '../../utils/fileArtifacts';
import { deriveInitialThinkingTopic } from '../../utils/thinking';
import { ChatMessageItem } from './ChatMessageItem';

export interface VirtualizedChatListProps {
  messages: ChatMessage[];
  scrollElementRef: React.RefObject<HTMLDivElement | null>;
  streamingMsgId: string | null;
  isGenerating: boolean;
  isWaitingFirstToken: boolean;
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

export const VirtualizedChatList: React.FC<VirtualizedChatListProps> = ({
  messages,
  scrollElementRef,
  streamingMsgId,
  isGenerating,
  isWaitingFirstToken,
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
  const latestAiMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'ai') return messages[i].id;
    }
    return null;
  }, [messages]);

  const waitingSubject = useMemo(() => {
    if (!isWaitingFirstToken) return '';
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return deriveInitialThinkingTopic(messages[i].text || '');
      }
    }
    return '';
  }, [isWaitingFirstToken, messages]);

  const totalCount = messages.length + (isWaitingFirstToken ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 180,
    overscan: 6,
  });

  // For short chats (< 20 items) render directly inside the container with zero virtualizer height drift,
  // while switching automatically to windowing via @tanstack/react-virtual for longer histories.
  const useVirtualWindow = totalCount > 20;

  if (!useVirtualWindow) {
    return (
      <div className="w-full max-w-[780px] mx-auto" data-testid="chat-message-list">
        {messages.map((m, idx) => {
          let prevUserPrompt = '';
          if (m.role === 'ai') {
            for (let j = idx - 1; j >= 0; j--) {
              if (messages[j].role === 'user') {
                prevUserPrompt = messages[j].text;
                break;
              }
            }
          }
          return (
            <ChatMessageItem
              key={m.id}
              message={m}
              prevUserPrompt={prevUserPrompt}
              isLatestAiMsg={m.id === latestAiMsgId}
              isStreaming={streamingMsgId === m.id}
              isGenerating={isGenerating}
              thinkingEnabled={thinkingEnabled}
              liveThinkingSummary={liveThinkingSummary}
              renderMarkdown={renderMarkdown}
              highlightCode={highlightCode}
              showThinkingTopic={showThinkingTopic}
              autoCollapseThinking={autoCollapseThinking}
              onUpdateMessageText={onUpdateMessageText}
              onDismissSuggestion={onDismissSuggestion}
              onAcceptSuggestion={onAcceptSuggestion}
              onOpenCodeLab={onOpenCodeLab}
              onInstallSelfWidget={onInstallSelfWidget}
              onOpenWidgetById={onOpenWidgetById}
              onOpenLightbox={onOpenLightbox}
              onSubmitFeedback={onSubmitFeedback}
              onRetryMessage={onRetryMessage}
              onToast={onToast}
            />
          );
        })}

        {isWaitingFirstToken && (
          <div className="msg-row is-ai">
            <div data-testid="thinking-accordion" className="mt-0 mb-2.5 select-none">
              <div
                data-testid="thinking-accordion-headline"
                className="inline-flex items-center gap-2 py-1 px-2.5 -ml-1.5 rounded-lg text-[12.5px] font-medium text-[var(--ink)]"
              >
                <Brain className="w-3.5 h-3.5 text-[var(--primary)] animate-pulse shrink-0" />
                <span>{/[\u0980-\u09FF]/.test(waitingSubject) ? 'ভাবছি…' : 'Thinking…'}</span>
                {showThinkingTopic && waitingSubject && waitingSubject !== 'আপনার প্রশ্ন' && (
                  <span
                    data-testid="thinking-subject-label"
                    className="text-[12px] text-[var(--ink-dim)]/80 truncate max-w-[240px]"
                  >
                    · {waitingSubject}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className="w-full max-w-[780px] mx-auto relative"
      data-testid="chat-message-list-virtualized"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualItems.map((vItem) => {
        const isWaitingRow = isWaitingFirstToken && vItem.index === messages.length;
        return (
          <div
            key={vItem.key}
            data-index={vItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vItem.start}px)`,
            }}
          >
            {isWaitingRow ? (
              <div className="msg-row is-ai">
                <div data-testid="thinking-accordion" className="mt-0 mb-2.5 select-none">
                  <div
                    data-testid="thinking-accordion-headline"
                    className="inline-flex items-center gap-2 py-1 px-2.5 -ml-1.5 rounded-lg text-[12.5px] font-medium text-[var(--ink)]"
                  >
                    <Brain className="w-3.5 h-3.5 text-[var(--primary)] animate-pulse shrink-0" />
                    <span>{/[\u0980-\u09FF]/.test(waitingSubject) ? 'ভাবছি…' : 'Thinking…'}</span>
                    {showThinkingTopic && waitingSubject && waitingSubject !== 'আপনার প্রশ্ন' && (
                      <span
                        data-testid="thinking-subject-label"
                        className="text-[12px] text-[var(--ink-dim)]/80 truncate max-w-[240px]"
                      >
                        · {waitingSubject}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (() => {
              const m = messages[vItem.index];
              if (!m) return null;
              let prevUserPrompt = '';
              if (m.role === 'ai') {
                for (let j = vItem.index - 1; j >= 0; j--) {
                  if (messages[j].role === 'user') {
                    prevUserPrompt = messages[j].text;
                    break;
                  }
                }
              }
              return (
                <ChatMessageItem
                  message={m}
                  prevUserPrompt={prevUserPrompt}
                  isLatestAiMsg={m.id === latestAiMsgId}
                  isStreaming={streamingMsgId === m.id}
                  isGenerating={isGenerating}
                  thinkingEnabled={thinkingEnabled}
                  liveThinkingSummary={liveThinkingSummary}
                  renderMarkdown={renderMarkdown}
                  highlightCode={highlightCode}
                  showThinkingTopic={showThinkingTopic}
                  autoCollapseThinking={autoCollapseThinking}
                  onUpdateMessageText={onUpdateMessageText}
                  onDismissSuggestion={onDismissSuggestion}
                  onAcceptSuggestion={onAcceptSuggestion}
                  onOpenCodeLab={onOpenCodeLab}
                  onInstallSelfWidget={onInstallSelfWidget}
                  onOpenWidgetById={onOpenWidgetById}
                  onOpenLightbox={onOpenLightbox}
                  onSubmitFeedback={onSubmitFeedback}
                  onRetryMessage={onRetryMessage}
                  onToast={onToast}
                />
              );
            })()}
          </div>
        );
      })}
    </div>
  );
};
