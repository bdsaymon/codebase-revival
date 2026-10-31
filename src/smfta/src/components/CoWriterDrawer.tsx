import React, { useState } from 'react';
import {
  FileText,
  Sparkles,
  Lightbulb,
  Copy,
  Download,
  X,
  Loader2,
  Edit3,
  Eye,
} from 'lucide-react';
import { ProactiveSuggestion, InlineRevision } from '../types';
import { InteractiveMessageContent } from './InteractiveMessageContent';

interface CoWriterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onChangeTitle: (t: string) => void;
  content: string;
  onChangeContent: (newContent: string) => void;
  onOpenCodeLab: (code: string) => void;
  onToast: (msg: string) => void;
}

export const CoWriterDrawer: React.FC<CoWriterDrawerProps> = ({
  isOpen,
  onClose,
  title,
  onChangeTitle,
  content,
  onChangeContent,
  onOpenCodeLab,
  onToast,
}) => {
  const [mode, setMode] = useState<'interactive' | 'raw'>('interactive');
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([]);
  const [overallNote, setOverallNote] = useState<string>('');
  const [revisions, setRevisions] = useState<InlineRevision[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [newDraftPrompt, setNewDraftPrompt] = useState<string>('');
  const [isDrafting, setIsDrafting] = useState<boolean>(false);

  if (!isOpen) return null;

  const wordCount = content.trim()
    ? content.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const charCount = content.length;

  const handleProactiveScan = async (textToScan?: string) => {
    const target = (textToScan ?? content).trim();
    if (target.length < 25) {
      onToast('Write or load at least a few sentences for AI review');
      return;
    }
    setIsScanning(true);
    try {
      const res = await fetch('/api/proactive-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: target }),
      });
      const data = await res.json();
      if (Array.isArray(data.suggestions)) {
        setSuggestions(data.suggestions);
        setOverallNote(data.overallFeedback || '');
        if (data.suggestions.length > 0) {
          onToast(`${data.suggestions.length} suggestions found`);
        } else {
          onToast('Looks good — no urgent issues.');
        }
      }
    } catch (err: unknown) {
      console.error(
        '[CoWriterDrawer.handleProactiveScan]',
        err instanceof Error ? err.message : 'Scan failed'
      );
      onToast('⚠️ Could not run proactive review right now.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleGenerateInitialDraft = async () => {
    if (!newDraftPrompt.trim()) {
      onToast('Please describe what you want to write');
      return;
    }
    setIsDrafting(true);
    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              text: `Write a well-structured article, post, or draft for the Co-Writer canvas based on this topic: ${newDraftPrompt}. Use clear paragraphs so the user can give inline feedback on any section.`,
            },
          ],
          mode: 'power',
          style: 'detailed',
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payload);
              if (parsed.text) {
                acc += parsed.text;
                onChangeContent(acc);
              }
            } catch (parseErr: unknown) {
              console.error(
                '[CoWriterDrawer.streamChunk]',
                parseErr instanceof Error ? parseErr.message : 'Chunk parse error'
              );
            }
          }
        }
      }
      setNewDraftPrompt('');
      if (acc.trim().length > 40) {
        handleProactiveScan(acc);
      }
    } catch (err: unknown) {
      console.error(
        '[CoWriterDrawer.handleGenerateInitialDraft]',
        err instanceof Error ? err.message : 'Draft failed'
      );
      onToast('⚠️ Failed to generate draft');
    } finally {
      setIsDrafting(false);
    }
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([`# ${title}\n\n${content}`], {
      type: 'text/markdown;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.toLowerCase().replace(/\s+/g, '-') || 'document'}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    onToast('Downloaded Markdown document');
  };

  return (
    <div className="w-full lg:w-[48%] xl:w-[50%] h-full border-l border-[var(--border)] bg-[var(--surface)] flex flex-col shrink-0 z-30">
      {/* Header */}
      <div className="h-16 px-4 border-b border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => onChangeTitle(e.target.value)}
            className="font-bold text-sm text-[var(--text)] bg-transparent border-0 outline-none focus:underline truncate"
            placeholder="Untitled Co-Writer Post"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center bg-[var(--surface-2)] p-0.5 rounded-lg border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setMode('interactive')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'interactive'
                  ? 'bg-[var(--surface)] text-[var(--primary)] shadow-xs'
                  : 'text-[var(--text-2)]'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Interactive Inline
            </button>
            <button
              type="button"
              onClick={() => setMode('raw')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'raw'
                  ? 'bg-[var(--surface)] text-[var(--primary)] shadow-xs'
                  : 'text-[var(--text-2)]'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" /> Free Write
            </button>
          </div>

          <button
            type="button"
            disabled={isScanning || !content.trim()}
            onClick={() => handleProactiveScan()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap disabled:opacity-50"
            title="Have AI proactively review and suggest inline edits"
          >
            {isScanning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Lightbulb className="w-3.5 h-3.5" />
            )}
            <span>AI Review</span>
          </button>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(content);
              onToast('Full document copied');
            }}
            className="p-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--primary)] cursor-pointer"
            title="Copy all"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="p-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--primary)] cursor-pointer"
            title="Download Markdown"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
            title="Close Co-Writer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Draft Generator Bar */}
      <div className="px-4 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center gap-2">
        <input
          type="text"
          value={newDraftPrompt}
          onChange={(e) => setNewDraftPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleGenerateInitialDraft();
            }
          }}
          placeholder="নতুন আর্টিকেল, পোস্ট বা ইমেইল লিখতে বিষয় লিখুন... (Or click any paragraph below for inline rewrite)"
          className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
        />
        <button
          type="button"
          disabled={isDrafting}
          onClick={handleGenerateInitialDraft}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold hover:opacity-90 cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          {isDrafting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Writing...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" /> Generate Draft
            </>
          )}
        </button>
      </div>

      {overallNote && (
        <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span>
            <strong>AI Co-Pilot Note:</strong> {overallNote}
          </span>
          <button
            type="button"
            onClick={() => setOverallNote('')}
            className="text-xs underline ml-2 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {!content.trim() ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3 text-[var(--text-2)]">
            <div className="w-12 h-12 rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[var(--text)]">
              Interactive Inline Co-Writer Canvas
            </h3>
            <p className="text-xs leading-relaxed">
              No more copying and pasting back and forth into the chat box!
              Generate a draft above, or send any AI reply here. Then hover or
              double-click any line or paragraph to give inline feedback and
              weave changes right in place.
            </p>
          </div>
        ) : mode === 'raw' ? (
          <textarea
            value={content}
            onChange={(e) => onChangeContent(e.target.value)}
            placeholder="Write or paste your post, article, or code here..."
            className="w-full h-full min-h-[420px] bg-transparent border-0 outline-none resize-none text-sm leading-relaxed text-[var(--text)]"
          />
        ) : (
          <InteractiveMessageContent
            messageId="cowriter-doc"
            text={content}
            isStreaming={isDrafting}
            proactiveSuggestions={suggestions}
            revisions={revisions}
            onUpdateMessageText={(_id, newText, rev) => {
              onChangeContent(newText);
              if (rev) setRevisions((prev) => [...prev, rev]);
            }}
            onDismissSuggestion={(_id, sugId) =>
              setSuggestions((prev) => prev.filter((s) => s.id !== sugId))
            }
            onAcceptSuggestion={(_id, sug) => {
              if (content.includes(sug.targetText)) {
                const updated = content.replace(
                  sug.targetText,
                  sug.replacementText
                );
                onChangeContent(updated);
                setRevisions((prev) => [
                  ...prev,
                  {
                    id: 'rev-' + Date.now(),
                    timestamp: Date.now(),
                    feedback: `Applied AI ${sug.category} suggestion`,
                    scope: 'sentence',
                    previousText: content,
                    newText: updated,
                    summary: sug.reason,
                  },
                ]);
                setSuggestions((prev) => prev.filter((s) => s.id !== sug.id));
                onToast('✓ Proactive AI suggestion applied inline!');
              } else {
                onToast('Could not locate exact phrase; try Inline Rewrite');
              }
            }}
            onOpenCodeLab={onOpenCodeLab}
            onToast={onToast}
          />
        )}
      </div>

      {/* Footer status */}
      <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between text-[11px] text-[var(--text-2)] font-mono-num">
        <div>
          <span>{wordCount} words</span>
          <span className="mx-2">·</span>
          <span>{charCount} chars</span>
        </div>
        <div className="text-[var(--text-3)] font-sans">
          Tip: Hover or double-click any paragraph to give inline feedback
        </div>
      </div>
    </div>
  );
};
