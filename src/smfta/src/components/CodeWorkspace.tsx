import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  Play,
  RotateCw,
  Terminal,
  X,
} from 'lucide-react';
import type { CodeBlockInfo } from '../utils/livePreview';
import {
  buildCodeProject,
  downloadCodeProject,
  type CodeFile,
  type CodeProject,
} from '../utils/codeProject';

/* ────────────────────────────────────────────────────────────────────────────
   Shared building blocks
   ──────────────────────────────────────────────────────────────────────────── */

function LanguagePills({ project }: { project: CodeProject }) {
  const labels = Array.from(new Set(project.files.map((f) => f.label)));
  return (
    <div className="code-lang-pills">
      {labels.slice(0, 4).map((l) => (
        <span key={l} className="code-lang-pill">
          {l}
        </span>
      ))}
    </div>
  );
}

function FileTabs({
  files,
  active,
  onPick,
}: {
  files: CodeFile[];
  active: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className="code-tabs" role="tablist">
      {files.map((f, i) => (
        <button
          key={f.name}
          type="button"
          role="tab"
          aria-selected={i === active}
          onClick={() => onPick(i)}
          className={`code-tab${i === active ? ' is-active' : ''}`}
          title={`${f.name} · ${f.label}`}
        >
          {f.name}
        </button>
      ))}
    </div>
  );
}

function CodePane({ file }: { file?: CodeFile }) {
  if (!file) {
    return <div className="code-empty">এই উত্তরে কোনো কোড পাওয়া যায়নি।</div>;
  }
  const lines = file.content.split('\n');
  return (
    <div className="code-scroll">
      <pre className="code-pre">
        <code>
          {lines.map((line, i) => (
            <span key={i} className="code-line">
              <span className="code-line-no">{i + 1}</span>
              <span className="code-line-text">{line || ' '}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function PreviewFrame({
  html,
  device,
  nonce,
  compact = false,
}: {
  html: string;
  device: 'desktop' | 'tablet' | 'mobile';
  nonce: number;
  compact?: boolean;
}) {
  const width = device === 'mobile' ? 390 : device === 'tablet' ? 768 : 0;
  return (
    <div className="code-preview-stage">
      <div
        className="code-preview-frame"
        style={{
          maxWidth: width ? `${width}px` : '100%',
          borderRadius: device === 'mobile' ? 16 : 8,
        }}
      >
        <iframe
          key={`${nonce}-${device}`}
          title="SMFTA code preview"
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
          srcDoc={html}
          className="code-preview-iframe"
        />
      </div>
      {!compact && (
        <span className="code-preview-note">
          Sandboxed preview · আপনার অ্যাপের ডেটা স্পর্শ করতে পারে না
        </span>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Inline card inside a chat answer: code on the left, the site running on the
   right — automatically, as soon as the answer is finished.
   ──────────────────────────────────────────────────────────────────────────── */

export interface InlineCodePreviewProps {
  blocks: CodeBlockInfo[];
  title?: string;
  onOpenWorkspace: () => void;
  notify?: (msg: string) => void;
}

export const InlineCodePreview: React.FC<InlineCodePreviewProps> = ({
  blocks,
  title,
  onOpenWorkspace,
  notify,
}) => {
  const project = useMemo(() => buildCodeProject(blocks, title), [blocks, title]);
  const [active, setActive] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [tab, setTab] = useState<'code' | 'preview'>(() =>
    project.runnable ? 'preview' : 'code'
  );

  // A stable signature: the blocks array is a new reference on every render, so
  // depending on it directly would re-run the reset effect forever.
  const signature = useMemo(
    () => blocks.map((b) => `${b.lang}:${b.content.length}`).join('|'),
    [blocks]
  );

  useEffect(() => {
    setActive(0);
    setNonce((n) => n + 1);
    setTab(project.runnable ? 'preview' : 'code');
  }, [signature, project.runnable]);

  if (project.files.length === 0) return null;
  const file = project.files[Math.min(active, project.files.length - 1)];

  return (
    <div className="code-inline">
      <div className="code-inline-head">
        <div className="code-inline-title">
          <span className="code-inline-dot" />
          <span>{project.runnable ? 'কোড + লাইভ প্রিভিউ' : 'কোড ওয়ার্কস্পেস'}</span>
          <LanguagePills project={project} />
        </div>
        <div className="code-inline-actions">
          <div className="code-inline-switch">
            <button
              type="button"
              onClick={() => setTab('code')}
              className={tab === 'code' ? 'is-on' : ''}
            >
              Code
            </button>
            <button
              type="button"
              onClick={() => setTab('preview')}
              className={tab === 'preview' ? 'is-on' : ''}
            >
              Preview
            </button>
          </div>
          <button
            type="button"
            className="code-inline-btn"
            onClick={onOpenWorkspace}
            title="Open the full side panel"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>খুলুন</span>
          </button>
          <button
            type="button"
            className="code-inline-btn"
            onClick={() => {
              try {
                downloadCodeProject(project);
                notify?.(`${project.title}.zip ডাউনলোড হচ্ছে`);
              } catch {
                notify?.('ZIP তৈরি করা যায়নি');
              }
            }}
            title="Download the whole project as .zip"
          >
            <Download className="w-3.5 h-3.5" />
            <span>.zip</span>
          </button>
        </div>
      </div>

      {/* Wide screens show code and the running site together; phones get a
          Code/Preview switch so nothing is squeezed. */}
      <div className={`code-inline-body${project.runnable ? ' is-split' : ''}`}>
        <div className={`code-inline-code${tab === 'preview' ? ' is-tab-hidden' : ''}`}>
          <FileTabs files={project.files} active={active} onPick={setActive} />
          <CodePane file={file} />
        </div>
        {project.runnable && project.previewHtml ? (
          <div className={`code-inline-preview${tab === 'code' ? ' is-tab-hidden' : ''}`}>
            <div className="code-inline-preview-bar">
              <span>{project.languageLabel}</span>
              <button type="button" onClick={() => setNonce((n) => n + 1)}>
                <RotateCw className="w-3 h-3" /> Reload
              </button>
            </div>
            <PreviewFrame html={project.previewHtml} device="desktop" nonce={nonce} compact />
          </div>
        ) : (
          <div className="code-inline-hint">
            <Terminal className="w-4 h-4" />
            <p>{project.runHint}</p>
            <button type="button" className="code-inline-btn" onClick={onOpenWorkspace}>
              <Play className="w-3.5 h-3.5" />
              ওয়ার্কস্পেস খুলুন
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
   Full side workspace: file list · formatted code · the site running beside it
   ──────────────────────────────────────────────────────────────────────────── */

export interface CodeWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  blocks: CodeBlockInfo[];
  title?: string;
  notify?: (msg: string) => void;
}

export const CodeWorkspaceModal: React.FC<CodeWorkspaceModalProps> = ({
  isOpen,
  onClose,
  blocks,
  title,
  notify,
}) => {
  const project = useMemo(() => buildCodeProject(blocks, title), [blocks, title]);
  const [active, setActive] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const blobUrl = useRef<string | null>(null);
  // Keep the latest onClose without re-arming the effect on every parent render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const signature = useMemo(
    () => blocks.map((b) => `${b.lang}:${b.content.length}`).join('|'),
    [blocks]
  );

  useEffect(() => {
    if (!isOpen) return;
    setActive(0);
    setNonce((n) => n + 1);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, signature]);

  useEffect(
    () => () => {
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    },
    []
  );

  if (!isOpen) return null;
  const file = project.files[Math.min(active, Math.max(0, project.files.length - 1))];

  const openTab = () => {
    if (!project.previewHtml) {
      notify?.('এই ভাষাটা ব্রাউজারে সরাসরি চলে না — ফাইল নামিয়ে চালান');
      return;
    }
    try {
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      const blob = new Blob([project.previewHtml], { type: 'text/html;charset=utf-8' });
      blobUrl.current = URL.createObjectURL(blob);
      window.open(blobUrl.current, '_blank', 'noopener,noreferrer');
    } catch {
      notify?.('নতুন ট্যাবে খোলা যায়নি — পপ-আপ ব্লক হতে পারে');
    }
  };

  return (
    <div className="codews-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`codews${full ? ' is-full' : ''}`}>
        <header className="codews-head">
          <div className="codews-head-main">
            <span className="codews-badge">{project.languageLabel}</span>
            <div className="codews-titles">
              <strong>{project.title}</strong>
              <span>
                {project.files.length} file{project.files.length === 1 ? '' : 's'}
                {project.runnable ? ' · live preview' : ' · download only'}
              </span>
            </div>
          </div>
          <div className="codews-head-actions">
            {project.runnable && (
              <div className="codews-devices">
                {(['mobile', 'tablet', 'desktop'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDevice(d)}
                    className={device === d ? 'is-on' : ''}
                  >
                    {d === 'mobile' ? 'Mobile' : d === 'tablet' ? 'Tablet' : 'Desktop'}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setNonce((n) => n + 1)} title="Reload preview">
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Copy the code"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(file?.content || '');
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                  notify?.('Code copied');
                } catch {
                  notify?.('কপি করা যায়নি');
                }
              }}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            <button type="button" onClick={openTab} title="Open in a new tab">
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setFull((v) => !v)}
              title={full ? 'Exit fullscreen' : 'Fullscreen'}
              className="hidden sm:grid"
            >
              {full ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button type="button" onClick={onClose} title="Close (Esc)">
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="codews-body">
          <section className="codews-code">
            <FileTabs files={project.files} active={active} onPick={setActive} />
            <CodePane file={file} />
          </section>
          <section className="codews-preview">
            {project.runnable && project.previewHtml ? (
              <PreviewFrame html={project.previewHtml} device={device} nonce={nonce} />
            ) : (
              <div className="code-inline-hint">
                <Terminal className="w-5 h-5" />
                <p>{project.runHint}</p>
              </div>
            )}
          </section>
        </div>

        <footer className="codews-foot">
          <span className="codews-foot-note">{project.runHint}</span>
          <div className="codews-foot-actions">
            <button
              type="button"
              className="codews-primary"
              onClick={() => {
                try {
                  downloadCodeProject(project);
                  notify?.('.zip ডাউনলোড হচ্ছে');
                } catch {
                  notify?.('ZIP তৈরি করা যায়নি');
                }
              }}
            >
              <Download className="w-3.5 h-3.5" />
              Download .zip
            </button>
            <button type="button" className="codews-ghost" onClick={onClose}>
              বন্ধ করুন
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
