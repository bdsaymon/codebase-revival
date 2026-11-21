import React, { useEffect, useState } from 'react';
import {
  Check,
  Database,
  Edit3,
  FileText,
  PauseCircle,
  Pin,
  PlayCircle,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AppSettings, KnowledgeDocument } from '../../types';
import {
  addManualMemoryFact,
  clearEntireMemoryBank,
  deleteMemoryFact,
  searchMemoryFacts,
  toggleMemoryPin,
  updateMemoryFact,
} from '../../utils/memoryBank';
import { readDocumentFile } from '../../utils/documentReader';
import { isV2ModelId } from '../../utils/v2UsageLimits';
import { SettingToggle, SettingsCard } from '../SettingsControls';

export interface MemoryKnowledgeSectionProps {
  draft: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
  memory: string[];
  onUpdateMemory?: (next: string[]) => void;
  onClearMemory: () => void;
  knowledgeDocs?: KnowledgeDocument[];
  onUpdateKnowledgeDocs?: (next: KnowledgeDocument[]) => void;
  notify?: (msg: string) => void;
}

interface V2RagDocSummary {
  docId: string;
  fileName: string;
  format: string;
  chunkCount: number;
  createdAt: string;
}

interface V2MemoryRow {
  id: string;
  content: string;
  pinned: boolean;
}

export const MemoryKnowledgeSection: React.FC<MemoryKnowledgeSectionProps> = ({
  draft,
  patch,
  memory,
  onUpdateMemory,
  onClearMemory,
  notify,
}) => {
  const [newMemoryFact, setNewMemoryFact] = useState('');
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const [editingFact, setEditingFact] = useState<string | null>(null);
  const [editingFactValue, setEditingFactValue] = useState('');
  const [resetConfirmStep, setResetConfirmStep] = useState<0 | 1 | 2>(0);
  const [v2Memories, setV2Memories] = useState<V2MemoryRow[]>([]);
  const [v2RagDocs, setV2RagDocs] = useState<V2RagDocSummary[]>([]);
  const [isUploadingRag, setIsUploadingRag] = useState(false);

  const isMemoryPaused = draft.memoryPaused === true;
  const isV2Active =
    isV2ModelId(draft.externalModel) || (draft.provider as string) === 'firebase_v2';
  const filteredMemory = searchMemoryFacts(memory, memorySearchQuery);

  const fetchV2State = async () => {
    try {
      const [memRes, docsRes] = await Promise.all([
        fetch('/api/v2/memory').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/v2/rag/documents').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (memRes && Array.isArray(memRes.memories)) {
        setV2Memories(memRes.memories);
      }
      if (docsRes && Array.isArray(docsRes.documents)) {
        setV2RagDocs(docsRes.documents);
      }
    } catch {
      // Non-fatal in standalone mode
    }
  };

  useEffect(() => {
    void fetchV2State();
  }, []);

  const handleAddMemoryItem = () => {
    const res = addManualMemoryFact(memory, newMemoryFact);
    if (res.error) {
      notify?.(res.error);
      return;
    }
    const cleanText = newMemoryFact.trim();
    onUpdateMemory?.(res.updated);
    setNewMemoryFact('');
    notify?.('মেমোরি সংরক্ষিত হয়েছে');

    if (cleanText) {
      void fetch('/api/v2/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: cleanText }),
      })
        .then(() => fetchV2State())
        .catch(() => {});
    }
  };

  const handleSaveEditedFact = (oldFact: string) => {
    const res = updateMemoryFact(memory, oldFact, editingFactValue);
    if (res.error) {
      notify?.(res.error);
      return;
    }
    const updatedText = editingFactValue.trim();
    onUpdateMemory?.(res.updated);
    setEditingFact(null);
    setEditingFactValue('');
    notify?.('মেমোরি আপডেট হয়েছে');

    const cleanOld = oldFact.replace(/^📌\s*/, '').trim();
    const matchedRow = v2Memories.find(
      (m) => m.content.replace(/^📌\s*/, '').trim() === cleanOld
    );
    if (matchedRow) {
      void fetch(`/api/v2/memory/${encodeURIComponent(matchedRow.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: updatedText }),
      })
        .then(() => fetchV2State())
        .catch(() => {});
    }
  };

  const handleDeleteSingleMemory = (factText: string) => {
    const next = deleteMemoryFact(memory, factText);
    if (next.length === 0) {
      clearEntireMemoryBank();
    }
    onUpdateMemory?.(next);

    const cleanTarget = factText.replace(/^📌\s*/, '').trim();
    const matchedRow = v2Memories.find(
      (m) => m.content.replace(/^📌\s*/, '').trim() === cleanTarget
    );
    if (matchedRow) {
      void fetch(`/api/v2/memory/${encodeURIComponent(matchedRow.id)}`, {
        method: 'DELETE',
      })
        .then(() => fetchV2State())
        .catch(() => {});
    }
  };

  const handleFinalResetMemory = () => {
    clearEntireMemoryBank();
    onUpdateMemory?.([]);
    onClearMemory();
    setResetConfirmStep(0);
    setV2Memories([]);
    void fetch('/api/v2/memory', { method: 'DELETE' }).catch(() => {});
    notify?.('সব মেমোরি ও ভেক্টর মুছে ফেলা হয়েছে');
  };

  const handleRagFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;

    setIsUploadingRag(true);
    try {
      for (const file of files.slice(0, 4)) {
        const parsed = await readDocumentFile(file);
        const res = await fetch('/api/v2/rag/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || parsed.type,
            rawText: parsed.content,
          }),
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          chunkCount?: number;
          error?: string;
        } | null;
        if (res.ok && json?.ok) {
          notify?.(`RAG indexed: ${file.name} (${json.chunkCount || 1} chunks)`);
        } else {
          notify?.(json?.error || `Failed to index ${file.name}`);
        }
      }
      await fetchV2State();
    } finally {
      setIsUploadingRag(false);
    }
  };

  const handleDeleteRagDoc = async (docId: string) => {
    try {
      await fetch(`/api/v2/rag/documents/${encodeURIComponent(docId)}`, {
        method: 'DELETE',
      });
      await fetchV2State();
      notify?.('ডকুমেন্ট এবং এর এম্বেডিং মুছে ফেলা হয়েছে');
    } catch {
      notify?.('ডকুমেন্ট মুছতে সমস্যা হয়েছে');
    }
  };

  return (
    <div className="space-y-3" data-testid="settings-section-memory">
      <SettingsCard>
        <SettingToggle
          label="Auto Memory"
          checked={draft.autoMemory !== false}
          onChange={(v) => patch({ autoMemory: v })}
          testId="auto-memory-toggle"
        />

        <SettingToggle
          label="Search Past Chats"
          checked={draft.memorySearchChats !== false}
          onChange={(v) =>
            patch({ memorySearchChats: v, includeHistory: v })
          }
          testId="memory-search-chats-toggle"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5">
          <span className="text-[13.5px] font-medium text-[var(--ink)]">
            Memory Status
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="memory-pause-btn"
              onClick={() => {
                const nextPaused = !isMemoryPaused;
                patch({ memoryPaused: nextPaused });
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border inline-flex items-center gap-1.5 cursor-pointer ${
                isMemoryPaused
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
                  : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]'
              }`}
            >
              {isMemoryPaused ? (
                <>
                  <PlayCircle className="w-3.5 h-3.5" />
                  Resume
                </>
              ) : (
                <>
                  <PauseCircle className="w-3.5 h-3.5" />
                  Pause
                </>
              )}
            </button>

            {resetConfirmStep === 0 && (
              <button
                type="button"
                data-testid="clear-all-memory-btn"
                onClick={() => setResetConfirmStep(1)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-2)] text-[var(--settings-danger)] border border-red-500/35 inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}

            {resetConfirmStep === 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="reset-memory-step1-btn"
                  onClick={() => setResetConfirmStep(2)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-slate-950 cursor-pointer"
                >
                  নিশ্চিত?
                </button>
                <button
                  type="button"
                  onClick={() => setResetConfirmStep(0)}
                  className="px-2 py-1.5 rounded-lg border border-[var(--border)] text-xs cursor-pointer"
                >
                  বাতিল
                </button>
              </div>
            )}

            {resetConfirmStep === 2 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="confirm-clear-all-memory-btn"
                  onClick={handleFinalResetMemory}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--settings-danger)] text-[var(--settings-on-accent)] cursor-pointer"
                >
                  সব মুছুন ({memory.length})
                </button>
                <button
                  type="button"
                  onClick={() => setResetConfirmStep(0)}
                  className="px-2 py-1.5 rounded-lg border border-[var(--border)] text-xs cursor-pointer"
                >
                  বাতিল
                </button>
              </div>
            )}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title={`Saved Memories (${memory.length})`}>
        <div className="space-y-2.5 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                data-testid="add-memory-fact-input"
                value={newMemoryFact}
                onChange={(e) => setNewMemoryFact(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMemoryItem();
                  }
                }}
                placeholder="নতুন মেমোরি লিখুন…"
                className="cs-input flex-1 text-xs py-1.5"
              />
              <button
                type="button"
                data-testid="add-memory-fact-btn"
                onClick={handleAddMemoryItem}
                className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-[var(--text-3)] absolute left-3 pointer-events-none" />
              <input
                type="text"
                data-testid="search-memory-input"
                value={memorySearchQuery}
                onChange={(e) => setMemorySearchQuery(e.target.value)}
                placeholder="Search…"
                className="cs-input w-full text-xs !pl-8 py-1.5"
              />
            </div>
          </div>

          {memory.length === 0 ? (
            <div
              data-testid="memory-empty-state"
              className="py-4 text-center text-xs text-[var(--text-3)]"
            >
              কোনো মেমোরি নেই
            </div>
          ) : (
            <div
              data-testid="memory-facts-list"
              className="max-h-72 overflow-y-auto space-y-1.5 pr-1"
            >
              {filteredMemory.map((fact, idx) => {
                const isPinned = fact.startsWith('📌 ');
                const isEditing = editingFact === fact;
                return (
                  <div
                    key={`${idx}-${fact}`}
                    data-testid="memory-fact-row"
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text)]"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          type="text"
                          value={editingFactValue}
                          onChange={(e) => setEditingFactValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEditedFact(fact);
                            if (e.key === 'Escape') setEditingFact(null);
                          }}
                          className="cs-input flex-1 text-xs py-1"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditedFact(fact)}
                          className="p-1.5 rounded bg-[var(--primary)] text-[var(--settings-on-accent)] cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingFact(null)}
                          className="p-1.5 rounded border border-[var(--border)] cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="break-words min-w-0 flex-1">{fact}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateMemory?.(toggleMemoryPin(memory, fact))
                            }
                            className={`p-1.5 rounded cursor-pointer ${
                              isPinned
                                ? 'text-[var(--primary)] bg-[var(--primary-soft)]'
                                : 'text-[var(--text-3)] hover:text-[var(--text)]'
                            }`}
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            data-testid={`edit-memory-item-${idx}`}
                            onClick={() => {
                              setEditingFact(fact);
                              setEditingFactValue(fact);
                            }}
                            className="p-1.5 rounded text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            data-testid={`delete-memory-item-${idx}`}
                            onClick={() => handleDeleteSingleMemory(fact)}
                            className="p-1.5 rounded text-[var(--text-3)] hover:text-[var(--settings-danger)] cursor-pointer"
                            aria-label={`Delete memory fact ${fact}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title={`V2 Knowledge Base & RAG (${v2RagDocs.length} docs)${isV2Active ? '' : ' · V2 Only'}`}
      >
        <div className="space-y-2.5 pt-1" data-testid="v2-rag-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[12px] text-[var(--text-3)] flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              <span>TXT, CSV, JSON, PDF, DOCX, XLSX ডকুমেন্ট ইনডেক্স করে V2 চ্যাটে রেফারেন্সসহ ব্যবহার করুন।</span>
            </div>
            <label
              data-testid="v2-rag-upload-label"
              className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploadingRag ? 'Indexing…' : 'Upload Doc'}</span>
              <input
                type="file"
                accept=".txt,.md,.csv,.tsv,.json,.pdf,.docx,.xlsx,.xls"
                multiple
                disabled={isUploadingRag}
                onChange={handleRagFileUpload}
                className="sr-only"
                data-testid="v2-rag-file-input"
              />
            </label>
          </div>

          {v2RagDocs.length === 0 ? (
            <div className="py-3 text-center text-xs text-[var(--text-3)] border border-dashed border-[var(--border)] rounded-lg">
              কোনো V2 RAG ডকুমেন্ট আপলোড করা নেই
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {v2RagDocs.map((docItem) => (
                <div
                  key={docItem.docId}
                  data-testid={`v2-rag-doc-${docItem.docId}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text)]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                    <span className="truncate font-medium">{docItem.fileName}</span>
                    <span className="text-[11px] text-[var(--text-3)] shrink-0">
                      {docItem.chunkCount} chunks
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid={`delete-v2-rag-doc-${docItem.docId}`}
                    onClick={() => handleDeleteRagDoc(docItem.docId)}
                    className="p-1.5 rounded text-[var(--text-3)] hover:text-[var(--settings-danger)] cursor-pointer shrink-0"
                    aria-label={`Delete RAG document ${docItem.fileName}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingsCard>
    </div>
  );
};
