import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CloudUpload,
  HardDrive,
  Loader2,
  NotebookPen,
  Pin,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { NotebookNote } from '../types';
import { VaultConnections } from '../utils/cloudVault';
import { pushNoteToDrive, pushNoteToGithub } from '../utils/cloudVault';
import { VaultConnectionsPanel } from './VaultConnectionsPanel';
import { GithubIcon } from './icons/GithubIcon';

export interface NotebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: NotebookNote[];
  onChange: (next: NotebookNote[]) => void;
  connections: VaultConnections;
  onUpdateConnections: (next: VaultConnections) => void;
  notify: (msg: string) => void;
  onAskAI?: (prompt: string) => void;
}

export function createNote(partial?: Partial<NotebookNote>): NotebookNote {
  const now = Date.now();
  return {
    id: `note-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    content: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  } as NotebookNote;
}

export function sanitizeNotes(input: unknown): NotebookNote[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((n): n is Record<string, unknown> => Boolean(n && typeof n === 'object'))
    .map((n) => {
      const now = Date.now();
      return {
        id: typeof n.id === 'string' && n.id ? n.id : createNote().id,
        title: typeof n.title === 'string' ? n.title.slice(0, 200) : '',
        content: typeof n.content === 'string' ? n.content.slice(0, 200000) : '',
        tags: Array.isArray(n.tags)
          ? n.tags.filter((t): t is string => typeof t === 'string').slice(0, 12)
          : [],
        createdAt: typeof n.createdAt === 'number' ? n.createdAt : now,
        updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : now,
        pinned: n.pinned === true,
        driveFileId: typeof n.driveFileId === 'string' ? n.driveFileId : undefined,
        driveUrl: typeof n.driveUrl === 'string' ? n.driveUrl : undefined,
        driveSyncedAt:
          typeof n.driveSyncedAt === 'number' ? n.driveSyncedAt : undefined,
        githubPath: typeof n.githubPath === 'string' ? n.githubPath : undefined,
        githubUrl: typeof n.githubUrl === 'string' ? n.githubUrl : undefined,
        githubSyncedAt:
          typeof n.githubSyncedAt === 'number' ? n.githubSyncedAt : undefined,
        filename: typeof n.filename === 'string' ? n.filename.slice(0, 80) : undefined,
      } as NotebookNote;
    })
    .slice(0, 300);
}

export const NotebookModal: React.FC<NotebookModalProps> = ({
  isOpen,
  onClose,
  notes,
  onChange,
  connections,
  onUpdateConnections,
  notify,
  onAskAI,
}) => {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showConnections, setShowConnections] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const ordered = useMemo(() => {
    const list = [...notes];
    list.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.join(' ').toLowerCase().includes(q)
    );
  }, [notes, query]);

  const selected =
    notes.find((n) => n.id === selectedId) || ordered[0] || null;

  useEffect(() => {
    if (!isOpen) return;
    if (!selectedId && notes.length > 0) setSelectedId(notes[0].id);
  }, [isOpen, notes, selectedId]);

  useEffect(() => {
    if (!statusMsg) return;
    const t = window.setTimeout(() => setStatusMsg(''), 6000);
    return () => window.clearTimeout(t);
  }, [statusMsg]);

  if (!isOpen) return null;

  const updateNote = (id: string, patch: Partial<NotebookNote>) => {
    onChange(
      notes.map((n) =>
        n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n
      )
    );
  };

  const handleNew = () => {
    const note = createNote({ title: 'নতুন নোট' });
    onChange([note, ...notes]);
    setSelectedId(note.id);
  };

  const handleDelete = (id: string) => {
    onChange(notes.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
    notify('Note deleted');
  };

  const handlePush = async (target: 'drive' | 'github') => {
    if (!selected) return;
    setBusyId(selected.id);
    setStatusMsg('');
    const res =
      target === 'drive'
        ? await pushNoteToDrive(connections.drive, selected)
        : await pushNoteToGithub(connections.github, selected);
    setBusyId(null);
    setStatusMsg(res.message);
    notify(res.message);
    if (res.ok) {
      updateNote(selected.id, {
        ...(target === 'drive'
          ? {
              driveFileId: res.fileId || selected.driveFileId,
              driveUrl: res.url || selected.driveUrl,
              driveSyncedAt: Date.now(),
            }
          : {
              githubPath: res.path || selected.githubPath,
              githubUrl: res.url || selected.githubUrl,
              githubSyncedAt: Date.now(),
            }),
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-5xl h-[92vh] sm:h-[86vh] rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-[var(--primary-soft)] flex items-center justify-center shrink-0">
              <NotebookPen className="w-4 h-4 text-[var(--primary)]" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[var(--text)] truncate">
                AI Notebook
              </h3>
              <p className="text-[10px] font-mono text-[var(--text-3)] truncate">
                {notes.length} notes · Drive {connections.drive.connected ? '✓' : '—'} ·
                GitHub {connections.github.connected ? '✓' : '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowConnections((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-mono uppercase cursor-pointer ${
                showConnections
                  ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary-soft)]'
                  : 'border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)]'
              }`}
              title="Google Drive / GitHub connection"
            >
              <Settings2 className="w-3.5 h-3.5" /> Cloud
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Left: list */}
          <aside className="lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border)] flex flex-col min-h-0 max-h-[38%] lg:max-h-none">
            <div className="p-2.5 space-y-2 shrink-0">
              <button
                type="button"
                onClick={handleNew}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] text-white px-3 py-2 text-[11px] font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> New Note
              </button>
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
                <Search className="w-3.5 h-3.5 text-[var(--text-3)] shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search notes…"
                  className="w-full bg-transparent text-[11px] text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
              {ordered.length === 0 && (
                <p className="px-2 py-6 text-[11px] text-center text-[var(--text-3)]">
                  কোনো নোট নেই — “New Note” চেপে শুরু করুন, অথবা AI-কে বলুন
                  “নোট লিখে আমার Drive-এ সেভ করো”।
                </p>
              )}
              {ordered.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setSelectedId(n.id)}
                  className={`w-full text-left rounded-lg px-2.5 py-2 cursor-pointer transition-colors border ${
                    selected?.id === n.id
                      ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                      : 'border-transparent hover:bg-[var(--ink-faint)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {n.pinned && <Pin className="w-3 h-3 text-[var(--primary)] shrink-0" />}
                    <span className="text-[11.5px] font-semibold text-[var(--text)] truncate flex-1">
                      {n.title || 'Untitled'}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {n.driveFileId && <HardDrive className="w-3 h-3 text-emerald-500" />}
                      {n.githubPath && <GithubIcon className="w-3 h-3 text-[var(--text-2)]" />}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-3)] truncate mt-0.5">
                    {(n.content || '—').slice(0, 70)}
                  </p>
                </button>
              ))}
            </div>
          </aside>

          {/* Right: editor or connections */}
          <section className="flex-1 min-w-0 flex flex-col min-h-0">
            {showConnections ? (
              <div className="flex-1 overflow-y-auto p-4">
                <VaultConnectionsPanel
                  connections={connections}
                  onChange={onUpdateConnections}
                  notes={notes}
                  notify={notify}
                  compact
                />
              </div>
            ) : !selected ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <BookOpen className="w-8 h-8 text-[var(--text-3)]" />
                <p className="text-xs text-[var(--text-2)] max-w-xs">
                  AI Notebook হলো আপনার নিজের নোট-ওয়ার্কস্পেস। এখানে লেখা সরাসরি
                  Google Drive (Google Doc) বা GitHub রিপোতে পাঠানো যায়।
                </p>
                <button
                  type="button"
                  onClick={handleNew}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] text-white px-3.5 py-2 text-[11px] font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Create first note
                </button>
              </div>
            ) : (
              <>
                <div className="p-3 sm:p-4 space-y-2.5 border-b border-[var(--border)] shrink-0">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={selected.title}
                      onChange={(e) => updateNote(selected.id, { title: e.target.value })}
                      placeholder="Note title…"
                      className="flex-1 bg-transparent text-base font-bold text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateNote(selected.id, { pinned: !selected.pinned })
                      }
                      className={`p-1.5 rounded cursor-pointer ${
                        selected.pinned
                          ? 'text-[var(--primary)]'
                          : 'text-[var(--text-3)] hover:text-[var(--text)]'
                      }`}
                      title={selected.pinned ? 'Unpin' : 'Pin'}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(selected.id)}
                      className="p-1.5 rounded text-[var(--text-3)] hover:text-rose-500 cursor-pointer"
                      title="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={selected.tags.join(', ')}
                      onChange={(e) =>
                        updateNote(selected.id, {
                          tags: e.target.value
                            .split(',')
                            .map((t) => t.trim())
                            .filter(Boolean)
                            .slice(0, 8),
                        })
                      }
                      placeholder="tags: idea, work, code"
                      className="flex-1 min-w-[150px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] font-mono text-[var(--text)] outline-none focus:border-[var(--primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => handlePush('drive')}
                      disabled={busyId === selected.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[10.5px] font-medium text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer disabled:opacity-50"
                      title="Save this note to Google Drive"
                    >
                      {busyId === selected.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <HardDrive className="w-3.5 h-3.5" />
                      )}
                      Send to Drive
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePush('github')}
                      disabled={busyId === selected.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[10.5px] font-medium text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer disabled:opacity-50"
                      title="Commit this note to GitHub"
                    >
                      {busyId === selected.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <GithubIcon className="w-3.5 h-3.5" />
                      )}
                      Commit
                    </button>
                    {onAskAI && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onAskAI(
                            `আমার AI Notebook-এর জন্য একটি সুন্দর নোট লেখো।\nশিরোনাম: ${
                              selected.title || 'Untitled'
                            }\nবর্তমান খসড়া: ${
                              selected.content.slice(0, 500) || '(খালি)'
                            }\n\nনোটটি পূর্ণাঙ্গ, গোছানো ও কাজে লাগার মতো করে লেখো এবং শেষে অবশ্যই একটি ⟦NOTE⟧{"title":"...","content":"...","save":"local"}⟦/NOTE⟧ ব্লক দাও যাতে আমি নিজেই এটি Notebook-এ সেভ করতে পারি।`
                          );
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-2.5 py-1.5 text-[10.5px] font-semibold text-[var(--primary)] cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> AI দিয়ে লেখাও
                      </button>
                    )}
                  </div>
                  {(selected.driveUrl || selected.githubUrl) && (
                    <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono">
                      {selected.driveUrl && (
                        <a
                          href={selected.driveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-500 hover:underline inline-flex items-center gap-1"
                        >
                          <CloudUpload className="w-3 h-3" /> Google Drive
                        </a>
                      )}
                      {selected.githubUrl && (
                        <a
                          href={selected.githubUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--primary)] hover:underline inline-flex items-center gap-1"
                        >
                          <GithubIcon className="w-3 h-3" /> {selected.githubPath}
                        </a>
                      )}
                    </div>
                  )}
                  {statusMsg && (
                    <p
                      className={`text-[10.5px] flex items-start gap-1.5 ${
                        statusMsg.startsWith('✅') || statusMsg.startsWith('☁️') || statusMsg.startsWith('🐙')
                          ? 'text-emerald-500'
                          : 'text-amber-500'
                      }`}
                    >
                      {statusMsg.startsWith('✅') ||
                      statusMsg.startsWith('☁️') ||
                      statusMsg.startsWith('🐙') ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      )}
                      <span>{statusMsg}</span>
                    </p>
                  )}
                </div>
                <textarea
                  value={selected.content}
                  onChange={(e) => updateNote(selected.id, { content: e.target.value })}
                  placeholder="এখানে লিখুন… মাথায় যা আসে লিখে ফেলুন, পরে AI দিয়ে গুছিয়ে নিতে পারবেন।"
                  className="flex-1 w-full resize-none bg-transparent px-4 py-3 text-[13px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
                />
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default NotebookModal;
