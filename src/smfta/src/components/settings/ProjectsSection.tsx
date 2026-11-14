import React, { useState } from 'react';
import { Check, Edit3, Plus, Trash2, X } from 'lucide-react';
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
      notify?.('প্রজেক্টের নাম লিখুন');
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
    if (!cleanName) return;
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
  };

  const handleDeleteProject = (id: string) => {
    const next = projects.filter((p) => p.id !== id);
    patch({ projects: next });
    if (activeProjectId === id) {
      onSelectActiveProject?.(undefined);
    }
  };

  return (
    <div className="space-y-3" data-testid="settings-section-projects">
      <SettingsCard title="New Project">
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center gap-2">
            <input
              type="text"
              data-testid="new-project-name-input"
              value={newName}
              maxLength={120}
              placeholder="Project Name…"
              onChange={(e) => setNewName(e.target.value)}
              className="cs-input flex-1 text-xs sm:text-[13px] py-1.5"
            />
            <button
              type="button"
              data-testid="create-project-btn"
              onClick={handleCreateProject}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Create
            </button>
          </div>
          <textarea
            rows={2}
            data-testid="new-project-instructions-input"
            value={newInstructions}
            maxLength={4000}
            placeholder="Project instructions (optional)…"
            onChange={(e) => setNewInstructions(e.target.value)}
            className="cs-textarea w-full text-xs sm:text-[13px]"
          />
        </div>
      </SettingsCard>

      {projects.length > 0 && (
        <SettingsCard title={`Projects (${projects.length})`}>
          <div className="space-y-2 pt-1" data-testid="projects-list">
            {projects.map((proj) => {
              const isEditing = editingId === proj.id;
              const isSelected = activeProjectId === proj.id;
              return (
                <div
                  key={proj.id}
                  data-testid={`project-card-${proj.id}`}
                  className={`p-2.5 rounded-xl border transition-colors ${
                    isSelected
                      ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                      : 'border-[var(--border)] bg-[var(--bg)]'
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        data-testid="edit-project-name-input"
                        value={editName}
                        maxLength={120}
                        onChange={(e) => setEditName(e.target.value)}
                        className="cs-input w-full text-xs py-1.5"
                      />
                      <textarea
                        rows={2}
                        data-testid="edit-project-instructions-input"
                        value={editInstructions}
                        maxLength={4000}
                        onChange={(e) => setEditInstructions(e.target.value)}
                        className="cs-textarea w-full text-xs"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          data-testid="save-project-edit-btn"
                          onClick={() => handleSaveEdit(proj.id)}
                          className="px-3 py-1 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-xs cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-[13px] font-semibold text-[var(--ink)] truncate">
                            {proj.name}
                          </span>
                          {isSelected && (
                            <span className="px-1.5 py-0.5 rounded bg-[var(--primary)] text-[var(--settings-on-accent)] text-[10px] font-semibold">
                              Active
                            </span>
                          )}
                        </div>
                        {proj.instructions && (
                          <p className="text-[11.5px] text-[var(--ink-dim)] mt-0.5 line-clamp-1">
                            {proj.instructions}
                          </p>
                        )}
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
                            className="px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] cursor-pointer"
                          >
                            {isSelected ? 'Unselect' : 'Select'}
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
                          aria-label={`Edit project ${proj.name}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          data-testid={`delete-project-${proj.id}`}
                          onClick={() => handleDeleteProject(proj.id)}
                          className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--settings-danger)] cursor-pointer"
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
        </SettingsCard>
      )}
    </div>
  );
};
