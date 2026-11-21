import { createPatch, diffLines } from 'diff';
import { inferLanguageFromFilenameOrType } from '../utils/fileArtifacts';

export interface ArtifactVersion {
  id: string;
  timestamp: number;
  content: string;
  author: 'ai' | 'user';
  note: string;
}

export interface WorkspaceArtifactFile {
  path: string;
  lang: string;
  content: string;
  updatedAt: number;
}

export interface ComputedDiffLine {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

export const SUPPORTED_ARTIFACT_EXTENSIONS = [
  'md',
  'html',
  'css',
  'js',
  'ts',
  'tsx',
  'py',
  'json',
  'csv',
  'svg',
  'txt',
] as const;

export function isSupportedArtifactPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return (SUPPORTED_ARTIFACT_EXTENSIONS as readonly string[]).includes(ext) || !ext;
}

export function normalizeArtifactPath(rawPath: string): string {
  return String(rawPath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\.\.+/g, '.')
    .replace(/[:*?"<>|]/g, '-');
}

export function appendVersionIfChanged(
  history: Record<string, ArtifactVersion[]>,
  path: string,
  content: string,
  author: 'ai' | 'user',
  note: string
): Record<string, ArtifactVersion[]> {
  const existing = history[path] || [];
  const latest = existing[existing.length - 1];
  if (latest && latest.content === content) {
    return history;
  }
  const entry: ArtifactVersion = {
    id: `v${existing.length + 1}-${Date.now().toString(36)}`,
    timestamp: Date.now(),
    content,
    author,
    note,
  };
  return {
    ...history,
    [path]: [...existing.slice(-24), entry],
  };
}

export function computeStructuredFileDiff(
  oldContent: string,
  newContent: string,
  filename = 'file'
): {
  unifiedPatch: string;
  lines: ComputedDiffLine[];
  addedCount: number;
  removedCount: number;
} {
  const unifiedPatch = createPatch(
    filename,
    oldContent || '',
    newContent || '',
    'previous',
    'current'
  );
  const parts = diffLines(oldContent || '', newContent || '');
  const lines: ComputedDiffLine[] = [];
  let addedCount = 0;
  let removedCount = 0;

  for (const part of parts) {
    const rawLines = part.value.replace(/\n$/, '').split('\n');
    for (const line of rawLines) {
      if (part.added) {
        addedCount += 1;
        lines.push({ type: 'added', text: line });
      } else if (part.removed) {
        removedCount += 1;
        lines.push({ type: 'removed', text: line });
      } else {
        lines.push({ type: 'unchanged', text: line });
      }
    }
  }

  return { unifiedPatch, lines, addedCount, removedCount };
}

export function upsertWorkspaceFile(
  files: Record<string, WorkspaceArtifactFile>,
  history: Record<string, ArtifactVersion[]>,
  path: string,
  content: string,
  author: 'ai' | 'user',
  note: string
): {
  files: Record<string, WorkspaceArtifactFile>;
  history: Record<string, ArtifactVersion[]>;
  normalizedPath: string;
} {
  const normalizedPath = normalizeArtifactPath(path) || 'untitled.txt';
  const lang = inferLanguageFromFilenameOrType(normalizedPath);
  const nextFiles: Record<string, WorkspaceArtifactFile> = {
    ...files,
    [normalizedPath]: {
      path: normalizedPath,
      lang,
      content,
      updatedAt: Date.now(),
    },
  };
  const nextHistory = appendVersionIfChanged(
    history,
    normalizedPath,
    content,
    author,
    note
  );
  return { files: nextFiles, history: nextHistory, normalizedPath };
}

export function deleteWorkspaceFile(
  files: Record<string, WorkspaceArtifactFile>,
  rawPath: string
): Record<string, WorkspaceArtifactFile> {
  const norm = normalizeArtifactPath(rawPath);
  if (!norm || !files[norm]) return files;
  const copy = { ...files };
  delete copy[norm];
  return copy;
}

export function renameWorkspaceFile(
  files: Record<string, WorkspaceArtifactFile>,
  history: Record<string, ArtifactVersion[]>,
  rawOldPath: string,
  rawNewPath: string
): {
  files: Record<string, WorkspaceArtifactFile>;
  history: Record<string, ArtifactVersion[]>;
  oldPath: string;
  newPath: string;
  renamed: boolean;
} {
  const oldPath = normalizeArtifactPath(rawOldPath);
  const newPath = normalizeArtifactPath(rawNewPath);
  const existing = files[oldPath];
  if (!existing || !newPath || oldPath === newPath) {
    return { files, history, oldPath, newPath, renamed: false };
  }
  const nextFiles = { ...files };
  delete nextFiles[oldPath];
  nextFiles[newPath] = {
    path: newPath,
    lang: inferLanguageFromFilenameOrType(newPath),
    content: existing.content,
    updatedAt: Date.now(),
  };

  const nextHistory = { ...history };
  if (nextHistory[oldPath]) {
    nextHistory[newPath] = nextHistory[oldPath];
    delete nextHistory[oldPath];
  }
  return { files: nextFiles, history: nextHistory, oldPath, newPath, renamed: true };
}

export function buildWorkspaceContextPrompt(
  files: Record<string, WorkspaceArtifactFile>,
  maxTotalChars = 16000
): string {
  const entries = Object.values(files).sort((a, b) => a.path.localeCompare(b.path));
  if (entries.length === 0) return '';

  const header = [
    '[WORKSPACE FILES MANIFEST]',
    'Use <file path="..." type="...">...</file> for new files, <patch path="..."><find>...</find><replace>...</replace></patch> for edits to existing files (send ONLY changed parts), and <file_delete path="..." /> for deletions.',
    'Files:',
    ...entries.map((f) => `- ${f.path} (${f.content.length} chars)`),
  ].join('\n');

  let remaining = Math.max(0, maxTotalChars - header.length);
  const snippets: string[] = [];
  for (const f of entries) {
    if (remaining < 120) break;
    const body = f.content.slice(0, Math.min(3200, remaining));
    const block = `--- ${f.path} ---\n${body}${f.content.length > body.length ? '\n...[truncated]' : ''}`;
    snippets.push(block);
    remaining -= block.length + 2;
  }

  return `${header}\n\n${snippets.join('\n\n')}`;
}

