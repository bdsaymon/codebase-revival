import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import type { WorkspaceArtifactFile } from '../../services/artifactManager';

export interface ArtifactFileTreeProps {
  files: WorkspaceArtifactFile[];
  activePath: string;
  onSelectFile: (path: string) => void;
  onCreateFile?: (path: string, initialContent?: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
  onDeleteFile?: (path: string) => void;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  children: TreeNode[];
  file?: WorkspaceArtifactFile;
}

function buildTree(files: WorkspaceArtifactFile[]): TreeNode[] {
  const root: TreeNode = {
    name: '',
    fullPath: '',
    isDir: true,
    children: [],
  };

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const f of sorted) {
    const parts = f.path.split('/').filter(Boolean);
    let curr = root;
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      const isLast = i === parts.length - 1;
      const accumPath = parts.slice(0, i + 1).join('/');
      let child = curr.children.find(
        (c) => c.name === seg && c.isDir === !isLast
      );
      if (!child) {
        child = {
          name: seg,
          fullPath: accumPath,
          isDir: !isLast,
          children: [],
          file: isLast ? f : undefined,
        };
        curr.children.push(child);
      }
      curr = child;
    }
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .map((n) => ({ ...n, children: sortNodes(n.children) }))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

  return sortNodes(root.children);
}

function renderFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (ext === 'csv') return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
  if (ext === 'md' || ext === 'txt') return <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
  return <FileCode2 className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />;
}

export const ArtifactFileTree: React.FC<ArtifactFileTreeProps> = ({
  files,
  activePath,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
}) => {
  const [collapsedDirs, setCollapsedDirs] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const tree = useMemo(() => buildTree(files), [files]);

  const toggleDir = (dirPath: string) => {
    setCollapsedDirs((prev) => ({ ...prev, [dirPath]: !prev[dirPath] }));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newFilePath.trim().replace(/^\/+/, '');
    if (!cleaned || !onCreateFile) return;
    onCreateFile(cleaned, '');
    setNewFilePath('');
    setCreating(false);
  };

  const commitRename = (oldPath: string) => {
    const cleaned = renameDraft.trim().replace(/^\/+/, '');
    setRenamingPath(null);
    if (!cleaned || cleaned === oldPath || !onRenameFile) return;
    onRenameFile(oldPath, cleaned);
  };

  const renderNodes = (nodes: TreeNode[], depth = 0): React.ReactNode =>
    nodes.map((node) => {
      if (node.isDir) {
        const isCollapsed = Boolean(collapsedDirs[node.fullPath]);
        return (
          <div key={`dir-${node.fullPath}`}>
            <button
              type="button"
              onClick={() => toggleDir(node.fullPath)}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              className="w-full py-1.5 pr-2 rounded-lg flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)] cursor-pointer text-left"
            >
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-70" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
              )}
              {isCollapsed ? (
                <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : (
                <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              )}
              <span className="truncate">{node.name}</span>
            </button>
            {!isCollapsed && (
              <div className="space-y-0.5">
                {renderNodes(node.children, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      const isSelected = node.fullPath === activePath;
      const isRenaming = renamingPath === node.fullPath;

      if (isRenaming) {
        return (
          <form
            key={`rename-${node.fullPath}`}
            onSubmit={(e) => {
              e.preventDefault();
              commitRename(node.fullPath);
            }}
            style={{ paddingLeft: `${12 + depth * 12}px` }}
            className="pr-1.5 py-1 rounded-lg flex items-center gap-1 bg-[var(--surface-2)]"
          >
            <input
              type="text"
              data-testid={`artifact-rename-input-${node.fullPath}`}
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setRenamingPath(null);
              }}
              autoFocus
              aria-label={`Rename ${node.fullPath}`}
              className="flex-1 min-w-0 px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--primary)] text-xs font-mono text-[var(--ink)] outline-none"
            />
            <button
              type="submit"
              data-testid={`artifact-rename-confirm-${node.fullPath}`}
              aria-label="Confirm rename"
              className="p-1 rounded bg-[var(--primary)] text-white cursor-pointer shrink-0"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              type="button"
              aria-label="Cancel rename"
              onClick={() => setRenamingPath(null)}
              className="p-1 rounded text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </form>
        );
      }

      return (
        <div
          key={`file-${node.fullPath}`}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
          className={`group pr-1.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
            isSelected
              ? 'bg-[var(--primary-soft)] text-[var(--primary)] font-semibold'
              : 'text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
          }`}
          onClick={() => onSelectFile(node.fullPath)}
          data-testid={`artifact-tree-item-${node.fullPath}`}
        >
          <span className="flex items-center gap-2 min-w-0">
            {renderFileIcon(node.fullPath)}
            <span className="truncate font-mono text-[12px]">{node.name}</span>
          </span>

          <span className="flex items-center gap-0.5 shrink-0">
            {onRenameFile && (
              <button
                type="button"
                data-testid={`artifact-rename-file-${node.fullPath}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingPath(node.fullPath);
                  setRenameDraft(node.fullPath);
                }}
                className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded hover:bg-[var(--surface-3)] text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer shrink-0"
                title={`Rename ${node.fullPath}`}
                aria-label={`Rename ${node.fullPath}`}
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            {onDeleteFile && (
              <button
                type="button"
                data-testid={`artifact-delete-file-${node.fullPath}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFile(node.fullPath);
                }}
                className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded hover:bg-[var(--surface-3)] text-[var(--ink-dim)] hover:text-rose-500 cursor-pointer shrink-0"
                title={`Delete ${node.fullPath}`}
                aria-label={`Delete ${node.fullPath}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </span>
        </div>
      );
    });

  return (
    <div className="h-full flex flex-col bg-[var(--surface)]" data-testid="artifact-file-tree">
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-dim)]">
          Workspace Files ({files.length})
        </span>
        {onCreateFile && (
          <button
            type="button"
            data-testid="artifact-new-file-btn"
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[11px] font-medium text-[var(--ink)] hover:bg-[var(--surface-3)] cursor-pointer"
          >
            <FilePlus2 className="w-3 h-3 text-[var(--primary)]" />
            <span>New File</span>
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={handleCreateSubmit}
          className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]/60 flex items-center gap-1.5"
        >
          <input
            type="text"
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            placeholder="e.g. src/utils.ts or main.py"
            autoFocus
            className="flex-1 min-w-0 px-2.5 py-1 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs font-mono text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
          <button
            type="submit"
            className="px-2.5 py-1 rounded-md bg-[var(--primary)] text-white text-xs font-semibold cursor-pointer"
          >
            Add
          </button>
        </form>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5">
        {tree.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--ink-dim)]">
            No workspace files yet. Ask the AI to create code, Markdown, Python, SVG, or CSV files.
          </div>
        ) : (
          renderNodes(tree)
        )}
      </div>
    </div>
  );
};
