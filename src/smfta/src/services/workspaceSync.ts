import type { ChatMessage } from '../types';
import { extractFileArtifacts } from '../utils/fileArtifacts';
import type { TaskExecutionPlan, TaskStatus } from '../utils/taskExecutionEngine';
import {
  type ArtifactVersion,
  type WorkspaceArtifactFile,
  deleteWorkspaceFile,
  normalizeArtifactPath,
  upsertWorkspaceFile,
} from './artifactManager';
import {
  type AgentPlanStep,
  applyTextPatch,
  extractAgentOperations,
} from './patchEngine';

export function agentPlanToTaskExecutionPlan(
  steps: AgentPlanStep[],
  goal = 'Agent Execution Plan'
): TaskExecutionPlan | null {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const now = Date.now();
  let runningIdx = steps.findIndex((s) => s.status === 'running');
  if (runningIdx < 0) {
    runningIdx = steps.every((s) => s.status === 'done')
      ? steps.length
      : Math.max(0, steps.findIndex((s) => s.status === 'pending'));
  }

  const allDone = steps.every((s) => s.status === 'done');
  return {
    id: `agent-plan-${now}`,
    goal,
    tasks: steps.map((s) => ({
      id: s.id,
      title: s.label,
      description: s.label,
      status: (s.status === 'done'
        ? 'completed'
        : s.status === 'running'
          ? 'running'
          : 'pending') as TaskStatus,
    })),
    status: allDone ? 'completed' : 'running',
    currentTaskIndex: runningIdx,
    createdAt: now,
    updatedAt: now,
  };
}

export interface WorkspaceTurnSyncResult {
  files: Record<string, WorkspaceArtifactFile>;
  history: Record<string, ArtifactVersion[]>;
  changedPaths: string[];
  deletedPaths: string[];
  patchErrors: string[];
  planSteps: AgentPlanStep[];
  primaryFilePath: string | null;
}

export function applyModelWorkspaceTurn(
  currentFiles: Record<string, WorkspaceArtifactFile>,
  currentHistory: Record<string, ArtifactVersion[]>,
  rawModelOutput: string,
  options?: { isStreaming?: boolean; notePrefix?: string }
): WorkspaceTurnSyncResult {
  const isStreaming = Boolean(options?.isStreaming);
  const notePrefix = options?.notePrefix || 'AI workspace update';
  let nextFiles = { ...currentFiles };
  let nextHistory = { ...currentHistory };
  const changedPaths: string[] = [];
  const deletedPaths: string[] = [];
  const patchErrors: string[] = [];

  const { artifacts } = extractFileArtifacts(rawModelOutput, { isStreaming });
  for (const art of artifacts) {
    const targetPath = normalizeArtifactPath(art.filename || art.title || 'untitled.txt');
    if (!targetPath) continue;
    const prevContent = nextFiles[targetPath]?.content;
    if (prevContent !== art.content) {
      const up = upsertWorkspaceFile(
        nextFiles,
        nextHistory,
        targetPath,
        art.content,
        'ai',
        isStreaming ? `${notePrefix} (streaming)` : notePrefix
      );
      nextFiles = up.files;
      nextHistory = up.history;
      if (!changedPaths.includes(up.normalizedPath)) {
        changedPaths.push(up.normalizedPath);
      }
    }
  }

  const ops = extractAgentOperations(rawModelOutput, {
    isStreaming,
    completedFileCount: changedPaths.length,
  });

  if (!isStreaming) {
    for (const p of ops.patches) {
      const targetPath = normalizeArtifactPath(p.path);
      const existing = nextFiles[targetPath];
      if (!existing) {
        patchErrors.push(`Cannot patch missing file "${targetPath}"`);
        continue;
      }
      const patched = applyTextPatch(existing.content, p.patchBody);
      if (!patched.ok) {
        patchErrors.push(`${targetPath}: ${patched.error || 'Patch failed'}`);
        continue;
      }
      if (patched.content !== existing.content) {
        const up = upsertWorkspaceFile(
          nextFiles,
          nextHistory,
          targetPath,
          patched.content,
          'ai',
          `${notePrefix} (patch)`
        );
        nextFiles = up.files;
        nextHistory = up.history;
        if (!changedPaths.includes(up.normalizedPath)) {
          changedPaths.push(up.normalizedPath);
        }
      }
    }

    for (const delPath of ops.deletes) {
      const targetPath = normalizeArtifactPath(delPath);
      if (nextFiles[targetPath]) {
        nextFiles = deleteWorkspaceFile(nextFiles, targetPath);
        deletedPaths.push(targetPath);
      }
    }
  }

  const primaryFilePath =
    changedPaths.find((p) => /\.(html?|tsx|jsx|svg|py|md)$/i.test(p)) ||
    changedPaths[0] ||
    null;

  return {
    files: nextFiles,
    history: nextHistory,
    changedPaths,
    deletedPaths,
    patchErrors,
    planSteps: ops.planSteps,
    primaryFilePath,
  };
}

export function applyFixFallbackFromReply(
  currentFiles: Record<string, WorkspaceArtifactFile>,
  currentHistory: Record<string, ArtifactVersion[]>,
  targetFilename: string,
  rawModelOutput: string,
  note = 'AI error fix'
): WorkspaceTurnSyncResult {
  const turn = applyModelWorkspaceTurn(currentFiles, currentHistory, rawModelOutput, {
    isStreaming: false,
    notePrefix: note,
  });

  const normalizedTarget = normalizeArtifactPath(targetFilename);
  if (
    normalizedTarget &&
    !turn.changedPaths.includes(normalizedTarget) &&
    turn.changedPaths.length === 0
  ) {
    const fencedBlocks: string[] = [];
    const fenceRx = /```[^\n`]*\r?\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = fenceRx.exec(String(rawModelOutput || ''))) !== null) {
      const code = String(m[1] || '').trim();
      if (code) fencedBlocks.push(code);
    }
    if (fencedBlocks.length > 0) {
      const best = fencedBlocks.sort((a, b) => b.length - a.length)[0]!;
      const up = upsertWorkspaceFile(
        turn.files,
        turn.history,
        normalizedTarget,
        best,
        'ai',
        `${note} (code block)`
      );
      return {
        ...turn,
        files: up.files,
        history: up.history,
        changedPaths: [up.normalizedPath],
        patchErrors: [],
        primaryFilePath: up.normalizedPath,
      };
    }
  }

  return turn;
}

export function shouldSummarizeConversation(
  cleanMessages: ChatMessage[],
  existingSummary?: string
): boolean {
  if (!Array.isArray(cleanMessages) || cleanMessages.length < 18) {
    return false;
  }
  const totalChars = cleanMessages.reduce(
    (sum, m) => sum + (m.text ? m.text.length : 0),
    0
  );
  if (totalChars < 8000 && cleanMessages.length < 24) {
    return false;
  }
  if (!existingSummary || existingSummary.trim().length < 80) {
    return true;
  }
  // Re-summarize periodically every 10 additional turns when chat grows long
  return cleanMessages.length % 10 === 0;
}
