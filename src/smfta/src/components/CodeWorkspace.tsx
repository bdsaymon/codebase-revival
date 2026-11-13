import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  MoreHorizontal,
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
  const [viewTab, setViewTab] = useState<'preview' | 'code'>(project.runnable ? 'preview' : 'code');
  const [menuOpen, setMenuOpen] = useState(false);
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
    <div className="ref-preview-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ref-preview-sheet" onClick={(e) => e.stopPropagation()}>
        {/* Screenshot 3 crisp white top bar: × left, ••• actions right */}
        <header className="ref-preview-sheet-head relative">
          <button
            type="button"
            onClick={onClose}
            className="ref-preview-icon-btn"
            aria-label="Close preview"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="min-w-0 text-center px-3">
            <div className="text-[14px] font-semibold text-[#1A1918] truncate">
              {project.title}
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="ref-preview-icon-btn"
              aria-label="Preview options"
              title="Preview options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl bg-[#2C2B28] border border-white/10 shadow-2xl p-1.5 z-20 text-xs text-[#F5F4EE] space-y-0.5">
                  {project.runnable && (
                    <button
                      type="button"
                      onClick={() => {
                        setViewTab(viewTab === 'preview' ? 'code' : 'preview');
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 flex items-center justify-between cursor-pointer"
                    >
                      <span>{viewTab === 'preview' ? 'View source code' : 'View live preview'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setNonce((n) => n + 1);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Reload</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setMenuOpen(false);
                      try {
                        await navigator.clipboard.writeText(file?.content || '');
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1600);
                        notify?.('Code copied');
                      } catch {
                        notify?.('কপি করা যায়নি');
                      }
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy code</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      openTab();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in new tab</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      try {
                        downloadCodeProject(project);
                        notify?.('.zip ডাউনলোড হচ্ছে');
                      } catch {
                        notify?.('ZIP তৈরি করা যায়নি');
                      }
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .zip</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Dark #22211F interactive workspace body */}
        <div className="flex-1 min-h-0 flex flex-col bg-[#22211F] p-3 sm:p-4 gap-3 overflow-hidden">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-[16px] font-semibold text-[#F5F4EE]">
                {project.title}
              </div>
              <div className="text-[12px] text-[#9E9B94]">
                {project.files.length} file{project.files.length === 1 ? '' : 's'} · {project.languageLabel}
              </div>
            </div>
            {project.runnable && (
              <div className="flex items-center gap-1 bg-[#2C2B28] p-1 rounded-xl border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setViewTab('preview')}
                  className={`px-3 py-1 rounded-lg cursor-pointer transition-colors ${
                    viewTab === 'preview' ? 'bg-[#3D3C38] text-white font-medium' : 'text-[#9E9B94]'
                  }`}
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setViewTab('code')}
                  className={`px-3 py-1 rounded-lg cursor-pointer transition-colors ${
                    viewTab === 'code' ? 'bg-[#3D3C38] text-white font-medium' : 'text-[#9E9B94]'
                  }`}
                >
                  Code
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 rounded-2xl bg-[#2C2B28] border border-white/[0.08] overflow-hidden flex flex-col">
            {viewTab === 'preview' && project.runnable && project.previewHtml ? (
              <PreviewFrame html={project.previewHtml} device={device} nonce={nonce} compact />
            ) : (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <FileTabs files={project.files} active={active} onPick={setActive} />
                <CodePane file={file} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1 shrink-0">
            <button
              type="button"
              onClick={() => setDevice(device === 'mobile' ? 'desktop' : 'mobile')}
              className="h-11 rounded-xl bg-[#2C2B28] hover:bg-[#363532] border border-white/[0.08] text-[#F5F4EE] text-sm font-medium cursor-pointer"
            >
              {device === 'mobile' ? 'Desktop view' : 'Mobile view'}
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  downloadCodeProject(project);
                  notify?.('.zip ডাউনলোড হচ্ছে');
                } catch {
                  notify?.('ZIP তৈরি করা যায়নি');
                }
              }}
              className="h-11 rounded-xl bg-gradient-to-r from-[#585B9E] to-[#6E72B8] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer hover:opacity-95"
            >
              <Download className="w-4 h-4" />
              <span>Download .zip</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
