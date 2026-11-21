import React, { useEffect, useMemo, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import {
  type ArtifactVersion,
  computeStructuredFileDiff,
} from '../../services/artifactManager';

export interface ArtifactDiffViewerProps {
  filename: string;
  versions: ArtifactVersion[];
  currentContent: string;
  onRestoreVersion?: (version: ArtifactVersion) => void;
}

export const ArtifactDiffViewer: React.FC<ArtifactDiffViewerProps> = ({
  filename,
  versions,
  currentContent,
  onRestoreVersion,
}) => {
  const [selectedIdx, setSelectedIdx] = useState<number>(() =>
    Math.max(0, versions.length >= 2 ? versions.length - 2 : 0)
  );

  useEffect(() => {
    setSelectedIdx((prev) => {
      if (versions.length === 0) return 0;
      if (prev >= versions.length) {
        return Math.max(0, versions.length >= 2 ? versions.length - 2 : 0);
      }
      return prev;
    });
  }, [versions.length]);

  const comparedVersion = versions[selectedIdx];
  const diffResult = useMemo(() => {
    const oldText = comparedVersion?.content ?? '';
    return computeStructuredFileDiff(oldText, currentContent, filename);
  }, [comparedVersion?.content, currentContent, filename]);

  if (versions.length === 0) {
    return (
      <div className="p-4 text-xs text-[var(--ink-dim)]" data-testid="artifact-diff-empty">
        No recorded version snapshots for this file yet.
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full min-h-0 bg-[var(--surface)]"
      data-testid="artifact-diff-viewer"
    >
      <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]/70 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <History className="w-3.5 h-3.5 text-[var(--primary)]" />
          <span className="font-semibold text-[var(--ink)]">Compare with snapshot:</span>
          <select
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
            className="px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-xs font-mono text-[var(--ink)] outline-none"
          >
            {versions.map((v, i) => (
              <option key={v.id} value={i}>
                v{i + 1} · {v.author.toUpperCase()} ·{' '}
                {new Date(v.timestamp).toLocaleTimeString()} ({v.note})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-emerald-500">+{diffResult.addedCount}</span>
          <span className="text-rose-500">-{diffResult.removedCount}</span>
          {onRestoreVersion && comparedVersion && (
            <button
              type="button"
              onClick={() => onRestoreVersion(comparedVersion)}
              className="ml-1 px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[11px] font-sans font-semibold text-[var(--ink)] hover:bg-[var(--surface-3)] inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Restore v{selectedIdx + 1}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto font-mono text-[12px] leading-relaxed p-2">
        {diffResult.lines.map((line, i) => (
          <div
            key={i}
            className={`px-2 py-0.5 whitespace-pre-wrap break-all ${
              line.type === 'added'
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : line.type === 'removed'
                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  : 'text-[var(--ink-dim)]'
            }`}
          >
            <span className="inline-block w-4 select-none opacity-60">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            {line.text || ' '}
          </div>
        ))}
      </div>
    </div>
  );
};
