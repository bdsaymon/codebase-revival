import React, { useState } from 'react';
import {
  BookOpen,
  Brain,
  Check,
  Edit3,
  Pin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AppSettings, KnowledgeDocument, KnowledgeSettings } from '../../types';
import {
  addManualMemoryFact,
  clearEntireMemoryBank,
  deleteMemoryFact,
  searchMemoryFacts,
  toggleMemoryPin,
  updateMemoryFact,
} from '../../utils/memoryBank';
import {
  buildKnowledgeChunks,
  createKnowledgeDocument,
  searchKnowledgeChunks,
} from '../../utils/knowledgeBase';
import { DEFAULT_KNOWLEDGE_SETTINGS } from '../../utils/settings';
import {
  SettingNumber,
  SettingSelect,
  SettingTextarea,
  SettingToggle,
  SettingsCard,
  SettingsGrid,
} from '../SettingsControls';

export interface MemoryKnowledgeSectionProps {
  draft: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
  memory: string[];
  onUpdateMemory?: (next: string[]) => void;
  onClearMemory: () => void;
  knowledgeDocs: KnowledgeDocument[];
  onUpdateKnowledgeDocs: (next: KnowledgeDocument[]) => void;
  notify?: (msg: string) => void;
}

export const MemoryKnowledgeSection: React.FC<MemoryKnowledgeSectionProps> = ({
  draft,
  patch,
  memory,
  onUpdateMemory,
  onClearMemory,
  knowledgeDocs,
  onUpdateKnowledgeDocs,
  notify,
}) => {
  const [newMemoryFact, setNewMemoryFact] = useState('');
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const [editingFact, setEditingFact] = useState<string | null>(null);
  const [editingFactValue, setEditingFactValue] = useState('');
  const [confirmingClearMemory, setConfirmingClearMemory] = useState(false);

  // Knowledge base state
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [kbQuery, setKbQuery] = useState('');

  const kbSettings: KnowledgeSettings = {
    ...DEFAULT_KNOWLEDGE_SETTINGS,
    ...(draft.knowledgeSettings || {}),
  };

  const patchKb = (partial: Partial<KnowledgeSettings>) => {
    patch({
      knowledgeSettings: {
        ...kbSettings,
        ...partial,
      },
    });
  };

  const filteredMemory = searchMemoryFacts(memory, memorySearchQuery);

  const handleAddMemoryItem = () => {
    const res = addManualMemoryFact(memory, newMemoryFact);
    if (res.error) {
      notify?.(res.error);
      return;
    }
    onUpdateMemory?.(res.updated);
    setNewMemoryFact('');
    notify?.('Memory saved');
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
    notify?.('Memory updated');
  };

  const handleDeleteSingleMemory = (factText: string) => {
    const next = deleteMemoryFact(memory, factText);
    if (next.length === 0) {
      clearEntireMemoryBank();
    }
    onUpdateMemory?.(next);
  };

  const handleConfirmClearAllMemory = () => {
    clearEntireMemoryBank();
    onUpdateMemory?.([]);
    onClearMemory();
    setConfirmingClearMemory(false);
    notify?.('All memory wiped / সব মেমোরি মুছে ফেলা হয়েছে');
  };

  const handleAddDocument = () => {
    if (!docTitle.trim() || !docContent.trim()) {
      notify?.('Provide both a document title and content.');
      return;
    }
    const created = createKnowledgeDocument({
      title: docTitle.trim(),
      content: docContent.trim(),
      chunkSize: kbSettings.chunkSize,
      chunkOverlap: kbSettings.chunkOverlap,
    });
    onUpdateKnowledgeDocs([created, ...knowledgeDocs]);
    setDocTitle('');
    setDocContent('');
    notify?.(`Indexed "${created.title}" (${created.chunkCount} chunks).`);
  };

  const handleUploadKbFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      notify?.('Knowledge document must be under 2 MB for browser indexing.');
      return;
    }
    const text = await file.text();
    const created = createKnowledgeDocument({
      title: file.name,
      content: text,
      mimeType: file.type || 'text/plain',
      chunkSize: kbSettings.chunkSize,
      chunkOverlap: kbSettings.chunkOverlap,
    });
    onUpdateKnowledgeDocs([created, ...knowledgeDocs]);
    e.target.value = '';
    notify?.(`Uploaded & indexed "${file.name}" (${created.chunkCount} chunks).`);
  };

  const kbHits = kbQuery.trim()
    ? searchKnowledgeChunks(
        kbQuery,
        buildKnowledgeChunks(knowledgeDocs, kbSettings.chunkSize, kbSettings.chunkOverlap),
        {
          topK: kbSettings.topK,
          minScore: kbSettings.minScore,
          vectorSearchEnabled: kbSettings.vectorSearchEnabled,
        }
      )
    : [];

  return (
    <div className="space-y-4">
      {/* 1. Memory Settings */}
      <SettingsCard
        title="Memory Settings"
        description="Configure short-term history window, long-term memory extraction, and retention."
        icon={<Brain className="w-4 h-4" />}
      >
        <SettingToggle
          label="Auto-Memory / অটো-মেমোরি"
          description="Automatically remember important personal preferences and facts across sessions."
          checked={draft.autoMemory !== false}
          onChange={(v) => patch({ autoMemory: v })}
          testId="auto-memory-toggle"
        />
        <SettingToggle
          label="Short-Term Conversation History"
          description="Include recent dialogue messages as context for follow-up questions."
          checked={draft.includeHistory !== false}
          onChange={(v) => patch({ includeHistory: v })}
        />
        <SettingsGrid>
          <SettingNumber
            label="Short-Term History Window (messages)"
            value={draft.maxHistoryMessages ?? 18}
            min={1}
            max={40}
            onChange={(v) => patch({ maxHistoryMessages: v })}
          />
          <SettingNumber
            label="Memory Retention Days (0 = Keep Forever)"
            value={draft.memoryRetentionDays ?? 0}
            min={0}
            max={3650}
            onChange={(v) => patch({ memoryRetentionDays: v })}
          />
        </SettingsGrid>
      </SettingsCard>

      {/* 2. Memory Management (View, Search, Pin, Inline Edit, Delete) */}
      <SettingsCard
        title={`Memory Management (${memory.length})`}
        description="Search, add, pin, inline edit, or delete saved long-term facts."
        rightSlot={
          !confirmingClearMemory ? (
            <button
              type="button"
              data-testid="clear-all-memory-btn"
              onClick={() => setConfirmingClearMemory(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-2)] text-[var(--settings-danger)] border border-red-500/35 inline-flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All Memory
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="confirm-clear-all-memory-btn"
                onClick={handleConfirmClearAllMemory}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--settings-danger)] text-[var(--settings-on-accent)] cursor-pointer"
              >
                Confirm Wipe ({memory.length})
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClearMemory(false)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )
        }
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
                placeholder="Add new fact (e.g. Role: Senior Engineer)"
                className="cs-input flex-1 text-xs"
              />
              <button
                type="button"
                data-testid="add-memory-fact-btn"
                onClick={handleAddMemoryItem}
                className="px-3 py-2 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
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
                placeholder="Search memories…"
                className="cs-input w-full text-xs pl-8"
              />
            </div>
          </div>

          {memory.length === 0 ? (
            <div
              data-testid="memory-empty-state"
              className="py-6 text-center text-xs text-[var(--text-3)] rounded-lg border border-dashed border-[var(--border)]"
            >
              No saved memory facts. Memory bank is completely clean.
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
                            onClick={() => onUpdateMemory?.(toggleMemoryPin(memory, fact))}
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

      {/* 3. Knowledge Base & Vector Search */}
      <SettingsCard
        title={`Knowledge Base (${knowledgeDocs.length} docs)`}
        description="Index documents into overlapping chunks and retrieve matching context via on-device TF-IDF Vector Similarity + Keyword search."
        icon={<BookOpen className="w-4 h-4" />}
      >
        <SettingToggle
          label="Enable Knowledge Base Context Injection"
          description="Automatically retrieve relevant document snippets and attach them to prompts."
          checked={kbSettings.enabled}
          onChange={(v) => patchKb({ enabled: v })}
        />
        <SettingToggle
          label="TF-IDF Vector Search Ranking"
          description="Use normalized TF-IDF cosine vector similarity instead of plain keyword matching."
          checked={kbSettings.vectorSearchEnabled}
          onChange={(v) => patchKb({ vectorSearchEnabled: v })}
        />
        <SettingsGrid>
          <SettingNumber
            label="Top-K Chunks Retrieved"
            value={kbSettings.topK}
            min={1}
            max={12}
            onChange={(v) => patchKb({ topK: v })}
          />
          <SettingNumber
            label="Minimum Similarity Score"
            value={kbSettings.minScore}
            min={0}
            max={0.9}
            step={0.05}
            onChange={(v) => patchKb({ minScore: v })}
          />
        </SettingsGrid>

        <div className="pt-2 border-t border-[var(--border)] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text)]">
              Add / Upload Document
            </span>
            <label className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] inline-flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Upload File (.txt, .md, .json, .csv)
              <input
                type="file"
                accept=".txt,.md,.markdown,.json,.csv,.ts,.tsx,.js,.py"
                className="hidden"
                onChange={handleUploadKbFile}
              />
            </label>
          </div>
          <input
            type="text"
            data-testid="kb-doc-title-input"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Document title (e.g. API Architecture Spec)"
            className="cs-input w-full text-xs"
          />
          <textarea
            rows={3}
            data-testid="kb-doc-content-input"
            value={docContent}
            onChange={(e) => setDocContent(e.target.value)}
            placeholder="Paste notes, documentation, specs, or reference text to index…"
            className="cs-textarea w-full text-xs"
          />
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="kb-add-doc-btn"
              onClick={handleAddDocument}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Index Document
            </button>
          </div>
        </div>

        {/* Indexed Document List */}
        {knowledgeDocs.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
            {knowledgeDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--text)] truncate">{doc.title}</div>
                  <div className="text-[11px] text-[var(--text-3)] tabular-nums">
                    {doc.chunkCount} chunks · {(doc.sizeBytes / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateKnowledgeDocs(knowledgeDocs.filter((d) => d.id !== doc.id))
                  }
                  className="p-1.5 rounded text-[var(--text-3)] hover:text-[var(--settings-danger)] cursor-pointer"
                  title="Remove document"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Vector Search Query Tester */}
        <div className="pt-2 border-t border-[var(--border)] space-y-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-[var(--text-3)] absolute left-3 pointer-events-none" />
            <input
              type="text"
              data-testid="kb-search-query-input"
              value={kbQuery}
              onChange={(e) => setKbQuery(e.target.value)}
              placeholder="Test vector search retrieval across indexed documents…"
              className="cs-input w-full text-xs pl-8"
            />
          </div>
          {kbQuery.trim() && (
            <div className="space-y-1.5">
              {kbHits.length === 0 ? (
                <div className="text-xs text-[var(--text-3)]">
                  No matching chunks above similarity threshold ({kbSettings.minScore}).
                </div>
              ) : (
                kbHits.map((hit) => (
                  <div
                    key={hit.chunk.id}
                    className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold text-[var(--text)]">
                      <span>{hit.chunk.docTitle}</span>
                      <span className="font-mono text-[11px] text-[var(--accent-emerald)] tabular-nums">
                        score {hit.score.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-2)] mt-1 line-clamp-3">
                      {hit.chunk.text}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </SettingsCard>

      {/* 4. Personalization */}
      <SettingsCard
        title="Personalization & Custom Instructions"
        description="Assistant persona, user background context, response tone, and coding style."
        icon={<Sparkles className="w-4 h-4" />}
      >
        <SettingsGrid>
          <SettingSelect
            label="Assistant Personality / Work Persona"
            value={draft.workPersona ?? 'allrounder'}
            options={[
              { value: 'allrounder', label: 'All-Rounder Assistant' },
              { value: 'developer', label: 'Senior Software Architect' },
              { value: 'office', label: 'Executive & Productivity' },
              { value: 'content', label: 'Creative Writer & Editor' },
              { value: 'academic', label: 'Research & Academic' },
            ]}
            onChange={(v) => patch({ workPersona: v as AppSettings['workPersona'] })}
          />
          <SettingSelect
            label="Response Tone"
            value={draft.responseTone ?? 'friendly'}
            options={[
              { value: 'friendly', label: 'Friendly & Direct' },
              { value: 'professional', label: 'Professional' },
              { value: 'concise', label: 'Ultra Concise' },
              { value: 'technical', label: 'Deep Technical' },
              { value: 'creative', label: 'Creative' },
            ]}
            onChange={(v) => patch({ responseTone: v as AppSettings['responseTone'] })}
          />
        </SettingsGrid>

        <SettingTextarea
          label="System Instruction (সিস্টেম নির্দেশনা)"
          testId="custom-system-instruction-textarea"
          value={draft.customInst || ''}
          rows={3}
          maxLength={4000}
          placeholder="Custom system instructions applied to every message…"
          onChange={(v) => patch({ customInst: v })}
        />

        <SettingsGrid>
          <SettingTextarea
            label="User Profile Context"
            value={draft.userProfileContext || ''}
            rows={2}
            maxLength={2000}
            placeholder="Your role, timezone, tech stack, or business domain…"
            onChange={(v) => patch({ userProfileContext: v })}
          />
          <SettingTextarea
            label="Coding Preferences"
            value={draft.codingPrefs || ''}
            rows={2}
            maxLength={500}
            placeholder="e.g. TypeScript strict, Tailwind CSS, no mock fallbacks…"
            onChange={(v) => patch({ codingPrefs: v })}
          />
        </SettingsGrid>
      </SettingsCard>
    </div>
  );
};
