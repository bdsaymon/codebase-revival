import React, { useState } from 'react';
import { AlertCircle, Check, Copy, Loader2, X } from 'lucide-react';
import {
  type AttachmentCardMeta,
  buildAttachmentCardMeta,
} from '../../utils/chatDisplay';

export interface AttachmentCardProps {
  name: string;
  content?: string;
  sizeBytes?: number;
  status?: 'loading' | 'ready' | 'error';
  errorMessage?: string;
  onRemove?: () => void;
  onClick?: () => void;
  testId?: string;
}

export const AttachmentCard: React.FC<AttachmentCardProps> = ({
  name,
  content = '',
  sizeBytes,
  status = 'ready',
  errorMessage,
  onRemove,
  onClick,
  testId = 'attachment-card',
}) => {
  const meta = React.useMemo(
    () =>
      buildAttachmentCardMeta({
        name,
        content,
        sizeBytes,
      }),
    [name, content, sizeBytes]
  );

  const isClickable = status === 'ready' && Boolean(onClick);

  return (
    <div
      data-testid={testId}
      data-status={status}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={() => {
        if (isClickable && onClick) onClick();
      }}
      onKeyDown={(e) => {
        if (isClickable && onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`claude-attach-card relative group flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all select-none shrink-0 w-[210px] sm:w-[224px] h-[64px] ${
        status === 'error'
          ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--border-strong,var(--primary))]'
      } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {/* Type Badge / Status Icon */}
      <div
        data-testid={`${testId}-badge`}
        className={`w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-bold tracking-wider shrink-0 border ${
          status === 'error'
            ? 'bg-rose-500/20 border-rose-500/30 text-rose-300'
            : 'bg-[var(--bg)] border-[var(--border)] text-[var(--ink-2,var(--ink))]'
        }`}
      >
        {status === 'loading' ? (
          <Loader2
            data-testid={`${testId}-spinner`}
            className="w-4 h-4 animate-spin text-[var(--primary)]"
          />
        ) : status === 'error' ? (
          <AlertCircle className="w-4 h-4 text-rose-400" />
        ) : (
          meta.typeBadge
        )}
      </div>

      {/* Title & Meta */}
      <div className="flex flex-col min-w-0 flex-1">
        <span
          data-testid={`${testId}-title`}
          className="text-[12.5px] font-semibold leading-tight truncate text-[var(--ink)]"
          title={status === 'ready' ? meta.title : name}
        >
          {status === 'ready' ? meta.title : name}
        </span>
        <span
          data-testid={`${testId}-meta`}
          className={`text-[11px] leading-tight mt-1 truncate ${
            status === 'error'
              ? 'text-rose-400'
              : 'text-[var(--ink-dim)]'
          }`}
          title={status === 'error' ? errorMessage || 'Failed to read file' : meta.metaLabel}
        >
          {status === 'loading'
            ? 'Reading file…'
            : status === 'error'
              ? errorMessage || 'Read failed'
              : meta.metaLabel}
        </span>
      </div>

      {/* Remove button (×) */}
      {onRemove && (
        <button
          type="button"
          data-testid={`${testId}-remove`}
          aria-label={`Remove ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="w-5 h-5 rounded-full flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] text-[var(--ink-dim)] hover:text-rose-500 hover:border-rose-500/40 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

export interface ImageAttachmentCardProps {
  src: string;
  name?: string;
  mime?: string;
  onRemove?: () => void;
  onClick?: () => void;
  testId?: string;
}

export const ImageAttachmentCard: React.FC<ImageAttachmentCardProps> = ({
  src,
  name = 'Image',
  mime = 'image/jpeg',
  onRemove,
  onClick,
  testId = 'image-attachment-card',
}) => {
  const badge =
    mime.split('/')[1]?.toUpperCase().replace('JPEG', 'JPG').slice(0, 4) ||
    'IMG';

  return (
    <div
      data-testid={testId}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.()}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className="claude-attach-card relative group flex items-center gap-3 px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--border-strong,var(--primary))] transition-all select-none shrink-0 w-[210px] sm:w-[224px] h-[64px] cursor-pointer"
    >
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        className="w-11 h-11 rounded-lg object-cover shrink-0 border border-[var(--border)] bg-[var(--bg)]"
      />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[12.5px] font-semibold leading-tight truncate text-[var(--ink)]">
          {name}
        </span>
        <span className="text-[11px] leading-tight mt-1 text-[var(--ink-dim)] truncate">
          {badge} · Click to view
        </span>
      </div>
      {onRemove && (
        <button
          type="button"
          data-testid={`${testId}-remove`}
          aria-label={`Remove ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="w-5 h-5 rounded-full flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] text-[var(--ink-dim)] hover:text-rose-500 hover:border-rose-500/40 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

export interface AttachmentPreviewModalProps {
  attachment: AttachmentCardMeta | null;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
  attachment,
  onClose,
  onToast,
}) => {
  const [copied, setCopied] = useState(false);

  if (!attachment) return null;

  const handleCopy = () => {
    try {
      const p = navigator.clipboard?.writeText(attachment.content);
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch {
      // Ignore clipboard permission errors in headless environments
    }
    setCopied(true);
    onToast?.('Copied to clipboard');
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      data-testid="attachment-preview-modal"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--ink)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wider bg-[var(--bg)] border border-[var(--border)] text-[var(--ink)] shrink-0">
              {attachment.typeBadge}
            </span>
            <div className="min-w-0">
              <div
                data-testid="attachment-preview-title"
                className="text-sm font-semibold truncate text-[var(--ink)]"
              >
                {attachment.name}
              </div>
              <div
                data-testid="attachment-preview-meta"
                className="text-[11px] text-[var(--ink-dim)]"
              >
                {attachment.metaLabel}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="attachment-preview-copy-btn"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] bg-[var(--bg)] text-[var(--ink)] hover:bg-[var(--surface-3,var(--surface-2))] transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="attachment-preview-close-btn"
              onClick={onClose}
              aria-label="Close preview"
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-dim)] hover:text-[var(--ink)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Full Monospace Content */}
        <div className="flex-1 overflow-auto p-4 bg-[var(--bg)]">
          <pre
            data-testid="attachment-preview-content"
            className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-[var(--ink)] m-0 select-text"
          >
            {attachment.content}
          </pre>
        </div>
      </div>
    </div>
  );
};
