import { applyPatch } from 'diff';

export interface AgentPlanStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done';
}

export interface ParsedPlanBlock {
  steps: AgentPlanStep[];
  textWithoutPlan: string;
}

export interface FilePatchInstruction {
  path: string;
  patchBody: string;
}

export interface AgentOperations {
  planSteps: AgentPlanStep[];
  patches: FilePatchInstruction[];
  deletes: string[];
  cleanedDisplayText: string;
}

function normalizePath(p: string): string {
  return String(p || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^\/+/, '');
}

/**
 * Extracts `<plan>...</plan>` (closed or actively streaming) checklist steps
 * and separates them cleanly from chat prose.
 */
export function extractAgentPlan(
  rawText: string,
  options?: { isStreaming?: boolean; completedFileCount?: number }
): ParsedPlanBlock {
  const source = String(rawText || '');
  const steps: AgentPlanStep[] = [];
  let planBody = '';

  const closedMatch = /<plan\b[^>]*>([\s\S]*?)<\/plan>/i.exec(source);
  let cleaned = source;

  if (closedMatch) {
    planBody = closedMatch[1] || '';
    cleaned = source.replace(closedMatch[0], '\n');
  } else {
    const openMatch = /<plan\b[^>]*>([\s\S]*)$/i.exec(source);
    if (openMatch) {
      planBody = openMatch[1] || '';
      cleaned = source.slice(0, openMatch.index);
    }
  }

  if (planBody.trim()) {
    const lines = planBody
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const checkMatch = /^(?:[-*•]|\d+[.)])\s*(?:\[([ xX~])\])?\s*(.+)$/.exec(line);
      if (!checkMatch) continue;
      const mark = (checkMatch[1] || '').toLowerCase();
      const label = checkMatch[2].trim();
      if (!label) continue;
      let status: AgentPlanStep['status'] =
        mark === 'x' ? 'done' : mark === '~' ? 'running' : 'pending';
      steps.push({ id: `plan-step-${i + 1}`, label, status });
    }
  }

  // Deterministically progress plan steps as files/patches finish or stream completes
  if (steps.length > 0) {
    const isStreaming = Boolean(options?.isStreaming);
    const doneFiles = options?.completedFileCount || 0;
    if (!isStreaming) {
      steps.forEach((s) => {
        s.status = 'done';
      });
    } else if (!steps.some((s) => s.status === 'done' || s.status === 'running')) {
      const targetDone = Math.min(steps.length - 1, doneFiles);
      steps.forEach((s, idx) => {
        if (idx < targetDone) s.status = 'done';
        else if (idx === targetDone) s.status = 'running';
      });
    }
  }

  return {
    steps,
    textWithoutPlan: cleaned.replace(/\n{3,}/g, '\n\n').trim(),
  };
}

/**
 * Applies a `<patch>` / `<file_patch>` body supporting:
 * 1) `<find>...</find><replace>...</replace>` blocks (one or multiple)
 * 2) `<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE` blocks (one or multiple)
 * 3) Unified diffs via `diff.applyPatch`
 */
export function applyTextPatch(
  originalContent: string,
  patchBody: string
): { ok: boolean; content: string; error?: string } {
  const original = String(originalContent || '');
  const body = String(patchBody || '').trim();
  if (!body) {
    return { ok: false, content: original, error: 'Empty patch body' };
  }

  const blocks: Array<{ search: string; replace: string }> = [];

  const findReplaceRegex =
    /<find\b[^>]*>([\s\S]*?)<\/find>\s*<replace\b[^>]*>([\s\S]*?)<\/replace>/gi;
  let frMatch: RegExpExecArray | null;
  while ((frMatch = findReplaceRegex.exec(body)) !== null) {
    const cleanFind = frMatch[1].replace(/^\r?\n/, '').replace(/\r?\n$/, '');
    const cleanReplace = frMatch[2].replace(/^\r?\n/, '').replace(/\r?\n$/, '');
    blocks.push({ search: cleanFind, replace: cleanReplace });
  }

  const searchReplaceRegex =
    /<<<<<<<\s*SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>>\s*REPLACE/g;
  let m: RegExpExecArray | null;
  while ((m = searchReplaceRegex.exec(body)) !== null) {
    blocks.push({ search: m[1], replace: m[2] });
  }

  if (blocks.length > 0) {
    let next = original;
    for (const blk of blocks) {
      if (next.includes(blk.search)) {
        next = next.replace(blk.search, blk.replace);
        continue;
      }

      const normNext = next.replace(/\r\n/g, '\n');
      const normSearch = blk.search.replace(/\r\n/g, '\n');
      const normReplace = blk.replace.replace(/\r\n/g, '\n');

      if (normNext.includes(normSearch)) {
        next = normNext.replace(normSearch, normReplace);
        continue;
      }

      // Line-trimmed block match (handles indentation / trailing space drift from AI models)
      const origLines = normNext.split('\n');
      let searchLines = normSearch.split('\n');
      while (searchLines.length > 1 && searchLines[0].trim() === '') searchLines.shift();
      while (searchLines.length > 1 && searchLines[searchLines.length - 1].trim() === '') searchLines.pop();
      const searchTrimmed = searchLines.map((l) => l.trim());

      let matchedStart = -1;
      if (searchTrimmed.length > 0 && searchTrimmed.some((l) => l.length > 0)) {
        for (let i = 0; i <= origLines.length - searchTrimmed.length; i++) {
          let allMatch = true;
          for (let j = 0; j < searchTrimmed.length; j++) {
            if (origLines[i + j].trim() !== searchTrimmed[j]) {
              allMatch = false;
              break;
            }
          }
          if (allMatch) {
            matchedStart = i;
            break;
          }
        }
      }

      if (matchedStart >= 0) {
        // Detect indentation delta so replacement preserves original block indentation if search omitted it
        const firstOrigIdx = searchTrimmed.findIndex((l) => l.length > 0);
        const origIndent =
          firstOrigIdx >= 0
            ? (origLines[matchedStart + firstOrigIdx].match(/^(\s*)/)?.[1] ?? '')
            : '';
        const searchIndent =
          firstOrigIdx >= 0
            ? (searchLines[firstOrigIdx].match(/^(\s*)/)?.[1] ?? '')
            : '';
        let replaceLines = normReplace.split('\n');
        if (origIndent.length > searchIndent.length && searchIndent === '') {
          const extraIndent = origIndent;
          replaceLines = replaceLines.map((l) => (l.trim() ? `${extraIndent}${l}` : l));
        }
        origLines.splice(matchedStart, searchLines.length, ...replaceLines);
        next = origLines.join('\n');
        continue;
      }

      return {
        ok: false,
        content: original,
        error: `Search hunk did not match target file content.`,
      };
    }
    return { ok: true, content: next };
  }

  // Try unified diff patch
  try {
    const patched = applyPatch(original, body, { fuzzFactor: 2 });
    if (typeof patched === 'string') {
      return { ok: true, content: patched };
    }
  } catch {
    // ignore
  }

  return {
    ok: false,
    content: original,
    error: 'Could not apply patch to existing file.',
  };
}

export function extractAgentOperations(
  rawText: string,
  options?: { isStreaming?: boolean; completedFileCount?: number }
): AgentOperations {
  const source = String(rawText || '');
  const patches: FilePatchInstruction[] = [];
  const deletes: string[] = [];

  let working = source;

  // Closed <patch path="...">...</patch>
  working = working.replace(
    /<patch\b([^>]*)>([\s\S]*?)<\/patch>/gi,
    (_full, attrStr: string, inner: string) => {
      const pathMatch = /(?:path|filename|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
        attrStr
      );
      const path = normalizePath(pathMatch?.[1] || pathMatch?.[2] || pathMatch?.[3] || '');
      if (path) {
        patches.push({ path, patchBody: String(inner || '').trim() });
        return `\n*${path}, updated*\n`;
      }
      return '';
    }
  );

  // Closed <file_patch path="...">...</file_patch>
  working = working.replace(
    /<file_patch\b([^>]*)>([\s\S]*?)<\/file_patch>/gi,
    (_full, attrStr: string, inner: string) => {
      const pathMatch = /(?:path|filename|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
        attrStr
      );
      const path = normalizePath(pathMatch?.[1] || pathMatch?.[2] || pathMatch?.[3] || '');
      if (path) {
        patches.push({ path, patchBody: String(inner || '').trim() });
        return `\n*${path}, updated*\n`;
      }
      return '';
    }
  );

  working = working.replace(
    /<file_delete\b([^>]*?)(?:\/>|><\/file_delete>)/gi,
    (_full, attrStr: string) => {
      const pathMatch = /(?:path|filename|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/i.exec(
        attrStr
      );
      const path = normalizePath(pathMatch?.[1] || pathMatch?.[2] || pathMatch?.[3] || '');
      if (path && !deletes.includes(path)) {
        deletes.push(path);
        return `\n*${path}, deleted*\n`;
      }
      return '';
    }
  );

  // Strip active/unclosed streaming <patch> / <file_patch> / <file_delete> blocks cleanly
  if (options?.isStreaming) {
    working = working.replace(/<(?:patch|file_patch)\b([^>]*)>([\s\S]*)$/i, (_f, attrStr: string) => {
      const pathMatch = /(?:path|filename|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
        attrStr
      );
      const path = normalizePath(pathMatch?.[1] || pathMatch?.[2] || pathMatch?.[3] || '');
      return path ? `\n*Updating ${path}…*\n` : '';
    });
    working = working.replace(/<(?:patch|file_patch|file_delete)\b[^>]*$/i, '');
  }

  const planRes = extractAgentPlan(working, options);
  return {
    planSteps: planRes.steps,
    patches,
    deletes,
    cleanedDisplayText: planRes.textWithoutPlan,
  };
}
