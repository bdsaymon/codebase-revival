import React, { useState } from 'react';
import {
  Check,
  Edit3,
  PauseCircle,
  Pin,
  PlayCircle,
  Plus,
  RotateCcw,
  Search,
  Trash2,
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

  const isMemoryPaused = draft.memoryPaused === true;
  const filteredMemory = searchMemoryFacts(memory, memorySearchQuery);

  const handleAddMemoryItem = () => {
    const res = addManualMemoryFact(memory, newMemoryFact);
    if (res.error) {
      notify?.(res.error);
      return;
    }
    onUpdateMemory?.(res.updated);
    setNewMemoryFact('');
    notify?.('মেমোরি সংরক্ষিত হয়েছে');
  };

  const handleSaveEditedFact = (oldFact: string) => {
    const res = updateMemoryFact(memory, oldFact, editingFactValue);
    if (res.error) {
      notify?.(res.error);
      return;
    }
    onUpdateMemory?.(res.updated);
    setEditingFact(null);
    setEditingFactValue('');
    notify?.('মেমোরি আপডেট হয়েছে');
  };

  const handleDeleteSingleMemory = (factText: string) => {
    const next = deleteMemoryFact(memory, factText);
    if (next.length === 0) {
      clearEntireMemoryBank();
    }
    onUpdateMemory?.(next);
  };

  const handleFinalResetMemory = () => {
    clearEntireMemoryBank();
    onUpdateMemory?.([]);
    onClearMemory();
    setResetConfirmStep(0);
    notify?.('সব মেমোরি মুছে ফেলা হয়েছে');
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
                className="cs-input w-full text-xs pl-8 py-1.5"
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
    </div>
  );
};
