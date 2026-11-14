import React, { useState } from 'react';
import {
  Brain,
  Check,
  Edit3,
  EyeOff,
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
  // 2-step confirmation for Reset Memory (0 = idle, 1 = step 1, 2 = step 2 final)
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
    notify?.('সব মেমোরি স্থায়ীভাবে রিসেট করা হয়েছে');
  };

  return (
    <div className="space-y-4" data-testid="settings-section-memory">
      {/* ১. মেমোরি সেটিংস ও Pause / Reset কন্ট্রোল */}
      <SettingsCard
        title="Memory সেটিংস"
        description="চ্যাট থেকে দরকারি তথ্য মনে রাখা, পুরনো চ্যাট খোঁজা, সাময়িক বিরতি (Pause) এবং রিসেট নিয়ন্ত্রণ করুন।"
        icon={<Brain className="w-4 h-4" />}
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            {/* Pause বাটন */}
            <button
              type="button"
              data-testid="memory-pause-btn"
              onClick={() => {
                const nextPaused = !isMemoryPaused;
                patch({ memoryPaused: nextPaused });
                notify?.(
                  nextPaused
                    ? 'মেমোরি সাময়িকভাবে Pause করা হয়েছে'
                    : 'মেমোরি আবার চালু করা হয়েছে'
                );
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
                  Resume (চালু করুন)
                </>
              ) : (
                <>
                  <PauseCircle className="w-3.5 h-3.5" />
                  Pause
                </>
              )}
            </button>

            {/* Reset বাটন — দুই ধাপে কনফার্মেশন */}
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
                  ধাপ ১: নিশ্চিত? (পরবর্তী ধাপ)
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
                  চূড়ান্ত নিশ্চিতকরণ: সব মুছুন ({memory.length})
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
        }
      >
        {isMemoryPaused && (
          <div
            data-testid="memory-paused-banner"
            className="mb-3 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-300 font-medium"
          >
            ⏸️ মেমোরি বর্তমানে Pause অবস্থায় আছে — নতুন কোনো মেমোরি তৈরি বা প্রম্পটে যুক্ত হচ্ছে না।
          </div>
        )}

        <SettingToggle
          label="চ্যাট থেকে মেমোরি তৈরি করো"
          description="কথোপকথন থেকে আপনার নাম, পছন্দ ও কাজের তথ্য স্বয়ংক্রিয়ভাবে মনে রাখবে (পাসওয়ার্ড বা গোপন তথ্য কখনো সেভ হবে না)।"
          checked={draft.autoMemory !== false}
          onChange={(v) => patch({ autoMemory: v })}
          testId="auto-memory-toggle"
        />

        <SettingToggle
          label="পুরনো চ্যাটে খুঁজে দেখার অনুমতি"
          description="প্রয়োজন হলে আগের কথোপকথনের সারাংশ থেকে প্রাসঙ্গিক তথ্য খুঁজে উত্তর দেবে।"
          checked={draft.memorySearchChats !== false}
          onChange={(v) =>
            patch({ memorySearchChats: v, includeHistory: v })
          }
          testId="memory-search-chats-toggle"
        />

        <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center gap-2 text-xs text-[var(--text-3)]">
          <EyeOff className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
          <span>
            চ্যাটের উপরের বার থেকে <strong>&ldquo;Incognito চ্যাট&rdquo;</strong> চালু করলে ওই চ্যাটে আগের কোনো মেমোরি পড়া হবে না এবং নতুন কোনো মেমোরি সেভও হবে না।
          </span>
        </div>
      </SettingsCard>

      {/* ২. মেমোরি লিস্ট: দেখা, খোঁজা, এডিট করা, মুছে ফেলা */}
      <SettingsCard
        title={`মেমোরি লিস্ট (${memory.length})`}
        description="সংরক্ষিত মেমোরি দেখুন, খুঁজুন, এডিট করুন অথবা মুছে ফেলুন। একই বিষয়ে নতুন তথ্য এলে ডুপ্লিকেট না করে আগেরটি আপডেট হয়।"
      >
        <div className="space-y-3">
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
                placeholder="নতুন মেমোরি যোগ করুন (যেমন: পেশা: সফটওয়্যার ইঞ্জিনিয়ার)"
                className="cs-input flex-1 text-xs"
              />
              <button
                type="button"
                data-testid="add-memory-fact-btn"
                onClick={handleAddMemoryItem}
                className="px-3 py-2 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                যোগ করুন
              </button>
            </div>

            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-[var(--text-3)] absolute left-3 pointer-events-none" />
              <input
                type="text"
                data-testid="search-memory-input"
                value={memorySearchQuery}
                onChange={(e) => setMemorySearchQuery(e.target.value)}
                placeholder="মেমোরি খুঁজুন…"
                className="cs-input w-full text-xs pl-8"
              />
            </div>
          </div>

          {memory.length === 0 ? (
            <div
              data-testid="memory-empty-state"
              className="py-6 text-center text-xs text-[var(--text-3)] rounded-lg border border-dashed border-[var(--border)]"
            >
              কোনো মেমোরি সংরক্ষিত নেই।
            </div>
          ) : (
            <div
              data-testid="memory-facts-list"
              className="max-h-80 overflow-y-auto space-y-1.5 pr-1"
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
                          className="cs-input flex-1 text-xs"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditedFact(fact)}
                          className="p-1.5 rounded bg-[var(--primary)] text-[var(--settings-on-accent)] cursor-pointer"
                          title="Save"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingFact(null)}
                          className="p-1.5 rounded border border-[var(--border)] cursor-pointer"
                          title="Cancel"
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
                            title={isPinned ? 'Unpin' : 'Pin fact'}
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
                            title="Edit fact"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            data-testid={`delete-memory-item-${idx}`}
                            onClick={() => handleDeleteSingleMemory(fact)}
                            className="p-1.5 rounded text-[var(--text-3)] hover:text-[var(--settings-danger)] cursor-pointer"
                            title="Delete memory item"
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
