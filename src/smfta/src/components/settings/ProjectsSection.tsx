import React, { useState } from 'react';
import { Check, Edit3, FolderKanban, Plus, Trash2, X } from 'lucide-react';
import type { AppSettings, ChatProject } from '../../types';
import { SettingsCard } from '../SettingsControls';

export interface ProjectsSectionProps {
  draft: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
  activeProjectId?: string;
  onSelectActiveProject?: (projectId: string | undefined) => void;
  notify?: (msg: string) => void;
}

export const ProjectsSection: React.FC<ProjectsSectionProps> = ({
  draft,
  patch,
  activeProjectId,
  onSelectActiveProject,
  notify,
}) => {
  const projects: ChatProject[] = Array.isArray(draft.projects)
    ? draft.projects
    : [];

  const [newName, setNewName] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editInstructions, setEditInstructions] = useState('');

  const handleCreateProject = () => {
    const cleanName = newName.trim();
    const cleanInst = newInstructions.trim();
    if (!cleanName) {
      notify?.('প্রজেক্টের নাম লিখুন (Enter project name)');
      return;
    }
    const now = Date.now();
    const created: ChatProject = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `proj_${crypto.randomUUID()}`
          : `proj_${now}`,
      name: cleanName.slice(0, 120),
      instructions: cleanInst.slice(0, 4000),
      createdAt: now,
      updatedAt: now,
    };
    const next = [created, ...projects];
    patch({ projects: next });
    setNewName('');
    setNewInstructions('');
    notify?.(`প্রজেক্ট "${created.name}" তৈরি হয়েছে`);
  };

  const handleSaveEdit = (id: string) => {
    const cleanName = editName.trim();
    if (!cleanName) {
      notify?.('প্রজেক্টের নাম খালি রাখা যাবে না');
      return;
    }
    const next = projects.map((p) =>
      p.id === id
        ? {
            ...p,
            name: cleanName.slice(0, 120),
            instructions: editInstructions.trim().slice(0, 4000),
            updatedAt: Date.now(),
          }
        : p
    );
    patch({ projects: next });
    setEditingId(null);
    notify?.('প্রজেক্ট আপডেট হয়েছে');
  };

  const handleDeleteProject = (id: string) => {
    const target = projects.find((p) => p.id === id);
    const next = projects.filter((p) => p.id !== id);
    patch({ projects: next });
    if (activeProjectId === id) {
      onSelectActiveProject?.(undefined);
    }
    notify?.(
      target ? `"${target.name}" প্রজেক্ট মুছে ফেলা হয়েছে` : 'প্রজেক্ট মুছে ফেলা হয়েছে'
    );
  };

  return (
    <div className="space-y-4" data-testid="settings-section-projects">
      {/* ১. নতুন প্রজেক্ট তৈরি */}
      <SettingsCard
        title="নতুন প্রজেক্ট তৈরি করুন"
        description="প্রজেক্টের ভেতরের সব চ্যাটে শুধু ওই প্রজেক্টের নির্দেশনা স্বয়ংক্রিয়ভাবে যোগ হবে — অন্য চ্যাটে মিশবে না।"
        icon={<FolderKanban className="w-4 h-4" />}
      >
        <div className="space-y-3">
          <label className="settings-control">
            <span>প্রজেক্টের নাম</span>
            <input
              type="text"
              data-testid="new-project-name-input"
              value={newName}
              maxLength={120}
              placeholder="যেমন: ই-কমার্স ওয়েবসাইট / হিসাব অ্যাপ"
              onChange={(e) => setNewName(e.target.value)}
              className="cs-input text-xs sm:text-sm"
            />
          </label>
          <label className="settings-control">
            <span>প্রজেক্টের নির্দেশনা (Project Instructions)</span>
            <textarea
              rows={4}
              data-testid="new-project-instructions-input"
              value={newInstructions}
              maxLength={4000}
              placeholder="এই প্রজেক্টের চ্যাটে AI কী নিয়ম, টেক স্ট্যাক বা প্রসঙ্গ মেনে উত্তর দেবে তা লিখুন…"
              onChange={(e) => setNewInstructions(e.target.value)}
              className="cs-textarea w-full text-xs sm:text-sm"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="create-project-btn"
              onClick={handleCreateProject}
              className="px-3.5 py-2 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              প্রজেক্ট তৈরি করুন
            </button>
          </div>
        </div>
      </SettingsCard>

      {/* ২. প্রজেক্ট তালিকা (Edit, Delete, Activate) */}
      <SettingsCard
        title={`আপনার প্রজেক্টসমূহ (${projects.length})`}
        description="যেকোনো প্রজেক্ট এডিট, ডিলিট বা বর্তমান চ্যাটের জন্য নির্বাচন করুন।"
      >
        {projects.length === 0 ? (
          <div
            data-testid="projects-empty-state"
            className="py-6 text-center text-xs text-[var(--text-3)] rounded-lg border border-dashed border-[var(--border)]"
          >
            এখনো কোনো প্রজেক্ট তৈরি করা হয়নি। উপরে নাম ও নির্দেশনা দিয়ে নতুন প্রজেক্ট তৈরি করুন।
          </div>
        ) : (
          <div className="space-y-2.5" data-testid="projects-list">
            {projects.map((proj) => {
              const isEditing = editingId === proj.id;
              const isSelected = activeProjectId === proj.id;
              return (
                <div
                  key={proj.id}
                  data-testid={`project-card-${proj.id}`}
                  className={`p-3 rounded-xl border transition-colors ${
                    isSelected
                      ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                      : 'border-[var(--border)] bg-[var(--bg)]'
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-2.5">
                      <input
                        type="text"
                        data-testid="edit-project-name-input"
                        value={editName}
                        maxLength={120}
                        onChange={(e) => setEditName(e.target.value)}
                        className="cs-input w-full text-xs sm:text-sm"
                      />
                      <textarea
                        rows={3}
                        data-testid="edit-project-instructions-input"
                        value={editInstructions}
                        maxLength={4000}
                        onChange={(e) => setEditInstructions(e.target.value)}
                        className="cs-textarea w-full text-xs sm:text-sm"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          data-testid="save-project-edit-btn"
                          onClick={() => handleSaveEdit(proj.id)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          সেভ
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          বাতিল
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                            {proj.name}
                          </span>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded bg-[var(--primary)] text-[var(--settings-on-accent)] text-[10px] font-semibold">
                              সক্রিয় (Active)
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] sm:text-xs text-[var(--text-2)] mt-1 whitespace-pre-wrap break-words">
                          {proj.instructions || 'কোনো নির্দেশনা দেওয়া হয়নি'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {onSelectActiveProject && (
                          <button
                            type="button"
                            data-testid={`select-project-${proj.id}`}
                            onClick={() =>
                              onSelectActiveProject(
                                isSelected ? undefined : proj.id
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] cursor-pointer"
                          >
                            {isSelected ? 'নিষ্ক্রিয় করুন' : 'চ্যাটে যুক্ত করুন'}
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid={`edit-project-${proj.id}`}
                          onClick={() => {
                            setEditingId(proj.id);
                            setEditName(proj.name);
                            setEditInstructions(proj.instructions);
                          }}
                          className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
                          title="প্রজেক্ট এডিট করুন"
                          aria-label={`Edit project ${proj.name}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          data-testid={`delete-project-${proj.id}`}
                          onClick={() => handleDeleteProject(proj.id)}
                          className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--settings-danger)] cursor-pointer"
                          title="প্রজেক্ট মুছে ফেলুন"
                          aria-label={`Delete project ${proj.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SettingsCard>
    </div>
  );
};
