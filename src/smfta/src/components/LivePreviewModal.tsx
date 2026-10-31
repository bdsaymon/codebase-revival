import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  RotateCw,
  X,
} from 'lucide-react';
import {
  CodeBlockInfo,
  PREVIEW_DEVICES,
  PreviewDeviceId,
  buildPreviewDocument,
  previewTitleFromHtml,
} from '../utils/livePreview';
import { downloadWebsiteZip } from '../utils/websiteZip';

export interface LivePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Blocks taken from the AI message (best effort). */
  blocks: CodeBlockInfo[];
  /** Raw markdown — used when the caller only has the message text. */
  markdown?: string;
  title?: string;
  notify?: (msg: string) => void;
}

/**
 * Real "see the code running" surface: sandboxed iframe, device sizes,
 * reload, open in a new tab, fullscreen and copy/download.
 */
export const LivePreviewModal: React.FC<LivePreviewModalProps> = ({
  isOpen,
  onClose,
  blocks,
  markdown,
  title,
  notify,
}) => {
  const [device, setDevice] = useState<PreviewDeviceId>('desktop');
  const [nonce, setNonce] = useState(0);
  const [internal, setInternal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [openedOnce, setOpenedOnce] = useState(false);
  const [previewPath, setPreviewPath] = useState('/preview/live-modal');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const doc = useMemo(() => {
    const source =
      blocks.length > 0
        ? blocks
        : markdown
        ? // Lazy import would complicate the modal; inline parse is cheap here.
          ((): CodeBlockInfo[] => {
            const out: CodeBlockInfo[] = [];
            const rx = /```([^\n`]*)\r?\n([\s\S]*?)(?:```|$)/g;
            let m: RegExpExecArray | null;
            let i = 0;
            while ((m = rx.exec(markdown)) !== null) {
              out.push({
                lang: (m[1] || '').trim().split(/\s+/)[0]?.toLowerCase() || 'code',
                content: (m[2] || '').replace(/\n$/, ''),
                index: i++,
              });
            }
            return out;
          })()
        : [];
    return buildPreviewDocument(source, { title });
  }, [blocks, markdown, title]);

  const heading = doc ? previewTitleFromHtml(doc.html, doc.title) : 'Live preview';

  const fullPreviewUrl = useMemo(() => {
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost:3000';
    return `${origin}${previewPath}`;
  }, [previewPath]);

  useEffect(() => {
    if (!isOpen) return;
    setOpenedOnce(true);
    setNonce((n) => n + 1);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !doc?.html) return;
    if (typeof fetch !== 'function') return;
    let cancelled = false;
    fetch('/api/preview/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'live-modal',
        name: heading,
        html: doc.html,
        files: [{ path: 'index.html', language: 'html', size: doc.html.length }],
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.previewPath) {
          setPreviewPath(data.previewPath);
        }
      })
      .catch(() => {
        // Ignore network errors in test/offline mode
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, doc?.html, heading]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const deviceSpec = PREVIEW_DEVICES.find((d) => d.id === device) || PREVIEW_DEVICES[2];

  const handleOpenTab = () => {
    if (!doc) return;
    try {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      const blob = new Blob([doc.html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      window.open(url, '_blank', 'noopener,noreferrer');
      notify?.('Live demo opened in a new tab');
    } catch {
      notify?.('নতুন ট্যাবে খোলা যায়নি — পপ-আপ ব্লক হতে পারে');
    }
  };

  const handleCopyPreviewUrl = async () => {
    try {
      await navigator.clipboard.writeText(fullPreviewUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1800);
      notify?.('Preview URL copied');
    } catch {
      notify?.('URL কপি করা যায়নি');
    }
  };

  const handleCopy = async () => {
    if (!doc) return;
    try {
      await navigator.clipboard.writeText(doc.html);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      notify?.('HTML copied');
    } catch {
      notify?.('কপি করা যায়নি');
    }
  };

  const handleDownload = () => {
    if (!doc) return;
    const blob = new Blob([doc.html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'smfta-live-demo.html';
    a.click();
    URL.revokeObjectURL(a.href);
    notify?.('Downloaded smfta-live-demo.html');
  };

  /** v18.7.0 — take the whole site away as a runnable project. */
  const handleDownloadZip = () => {
    if (!doc) return;
    try {
      downloadWebsiteZip(doc.html, heading, heading);
      notify?.(`Downloaded ${heading}.zip`);
    } catch {
      notify?.('ZIP তৈরি করা যায়নি');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`w-full bg-[var(--surface)] border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden ${
          internal
            ? 'h-screen max-w-none rounded-none'
            : 'h-[92vh] sm:h-[88vh] max-w-6xl rounded-none sm:rounded-2xl'
        }`}
      >
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--primary)' }} />
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-[var(--text)] truncate">
                {heading}
              </div>
              <div className="text-[9.5px] font-mono text-[var(--text-3)] truncate">
                Live Preview · {doc?.mode || 'n/a'} · {(doc?.parts || []).join(' + ')}
              </div>
            </div>
          </div>

          {/* Preview URL bar */}
          <div
            className="hidden md:flex items-center gap-1.5 flex-1 max-w-md mx-2 px-2.5 py-1 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[11px]"
            data-testid="preview-modal-url-bar"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <input
              type="text"
              readOnly
              value={fullPreviewUrl}
              aria-label="Preview URL"
              className="flex-1 min-w-0 bg-transparent border-0 text-[var(--text-2)] font-mono-num text-[11px] focus:outline-none truncate"
            />
            <button
              type="button"
              onClick={handleCopyPreviewUrl}
              className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] text-[10px] cursor-pointer shrink-0"
              title="Copy Preview URL"
            >
              {copiedUrl ? 'Copied' : 'Copy URL'}
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {PREVIEW_DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDevice(d.id)}
                className={`rounded-lg px-2 py-1 text-[10.5px] font-mono cursor-pointer border transition-colors ${
                  device === d.id
                    ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary-soft)]'
                    : 'border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)]'
                }`}
                title={d.label}
              >
                {d.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setNonce((n) => n + 1)}
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              title="Refresh preview"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              title="Copy full HTML"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              title="Download .html"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDownloadZip}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[10.5px] font-medium text-[var(--text-2)] hover:text-[var(--primary)] hover:border-[var(--primary-border)] cursor-pointer"
              title="Download the whole site as .zip"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">.zip</span>
            </button>
            <button
              type="button"
              onClick={handleOpenTab}
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--primary)] cursor-pointer"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setInternal((v) => !v)}
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              title={internal ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {internal ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-rose-500 cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Preview surface */}
        <div className="flex-1 min-h-0 bg-[var(--bg)] overflow-auto flex items-start justify-center p-2 sm:p-3">
          {!doc ? (
            <div className="m-auto text-center max-w-sm p-6">
              <p className="text-sm text-[var(--text-2)]">
                এই উত্তরে চালানোর মতো কোনো HTML/CSS/JS পাওয়া যায়নি।
              </p>
              <p className="text-[11px] text-[var(--text-3)] mt-2">
                চ্যাটে বলুন: “একটা ল্যান্ডিং পেজের ডেমো বানাও” — AI পুরো HTML ফাইল দিলে এখানে
                লাইভ চলবে।
              </p>
            </div>
          ) : (
            <div
              className="bg-white shadow-lg overflow-hidden w-full h-full"
              style={{
                maxWidth: deviceSpec.width ? `${deviceSpec.width}px` : '100%',
                borderRadius: device === 'mobile' ? 18 : 6,
              }}
            >
              <iframe
                key={`${nonce}-${device}`}
                ref={iframeRef}
                title="SMFTA live preview"
                // No same-origin: the demo cannot touch the app's storage.
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
                srcDoc={doc.html}
                className="w-full h-full border-0 bg-white block"
              />
            </div>
          )}
        </div>

        <footer className="shrink-0 px-3 py-1.5 border-t border-[var(--border)] text-[9.5px] font-mono text-[var(--text-3)] flex items-center justify-between gap-2">
          <span>Sandboxed demo · আপনার অ্যাপের ডেটা স্পর্শ করতে পারে না</span>
          {openedOnce && <span>{doc ? `${doc.html.length} chars` : '0 chars'}</span>}
        </footer>
      </div>
    </div>
  );
};

export default LivePreviewModal;
