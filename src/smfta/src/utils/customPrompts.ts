/**
 * Custom prompt library — user-authored prompts saved on the device and shown
 * in the Prompt Bank ("Tools") modal. Distinct from AI models: a prompt is
 * reusable instruction text, never a provider configuration.
 *
 * Storage: localStorage (mirrors the rest of the workspace). All functions
 * are defensive — a corrupt blob degrades to an empty library instead of
 * crashing the app. Pure validation/merge helpers are exported for unit tests.
 */
export const CUSTOM_PROMPTS_KEY = 'smfta_custom_prompts';

export const PROMPT_TITLE_MAX = 80;
export const PROMPT_TEXT_MAX = 4000;
export const PROMPT_CATEGORY_MAX = 40;
export const CUSTOM_PROMPT_LIMIT = 200;

export interface CustomPrompt {
  id: string;
  title: string;
  text: string;
  category: string;
  createdAt: number;
  updatedAt: number;
}

export interface PromptDraft {
  title: string;
  text: string;
  category?: string;
}

export type PromptValidationError =
  | 'title_required'
  | 'text_required'
  | 'title_too_long'
  | 'text_too_long'
  | 'limit_reached';

export function validatePromptDraft(
  draft: PromptDraft,
  librarySize: number
): PromptValidationError | null {
  const title = draft.title.trim();
  const text = draft.text.trim();
  if (!title) return 'title_required';
  if (!text) return 'text_required';
  if (title.length > PROMPT_TITLE_MAX) return 'title_too_long';
  if (text.length > PROMPT_TEXT_MAX) return 'text_too_long';
  if (librarySize >= CUSTOM_PROMPT_LIMIT) return 'limit_reached';
  return null;
}

function makeId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `cp-${crypto.randomUUID()}`;
  }
  return `cp-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

function isValidPrompt(p: unknown): p is CustomPrompt {
  if (!p || typeof p !== 'object') return false;
  const c = p as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.text === 'string' &&
    typeof c.createdAt === 'number' &&
    typeof c.updatedAt === 'number'
  );
}

export function loadCustomPrompts(): CustomPrompt[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CUSTOM_PROMPTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidPrompt)
      .map((p) => ({
        id: p.id,
        title: p.title,
        text: p.text,
        category:
          typeof p.category === 'string'
            ? p.category.slice(0, PROMPT_CATEGORY_MAX)
            : 'Custom',
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, CUSTOM_PROMPT_LIMIT);
  } catch {
    return [];
  }
}

export function saveCustomPrompts(list: CustomPrompt[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    CUSTOM_PROMPTS_KEY,
    JSON.stringify(list.slice(0, CUSTOM_PROMPT_LIMIT))
  );
}

/** Insert a validated prompt; returns the new library or an error code. */
export function addCustomPrompt(
  list: CustomPrompt[],
  draft: PromptDraft
): { ok: true; list: CustomPrompt[]; prompt: CustomPrompt } | { ok: false; error: PromptValidationError } {
  const error = validatePromptDraft(draft, list.length);
  if (error) return { ok: false, error };
  const now = Date.now();
  const prompt: CustomPrompt = {
    id: makeId(),
    title: draft.title.trim(),
    text: draft.text.trim(),
    category: (draft.category || 'Custom').trim() || 'Custom',
    createdAt: now,
    updatedAt: now,
  };
  return { ok: true, list: [prompt, ...list], prompt };
}

/** Update an existing prompt; unknown ids return an error. */
export function updateCustomPrompt(
  list: CustomPrompt[],
  id: string,
  draft: PromptDraft
): { ok: true; list: CustomPrompt[] } | { ok: false; error: PromptValidationError } {
  const existing = list.find((p) => p.id === id);
  if (!existing) return { ok: false, error: 'text_required' };
  const error = validatePromptDraft(draft, list.length);
  if (error) return { ok: false, error };
  const next = list.map((p) =>
    p.id === id
      ? {
          ...p,
          title: draft.title.trim(),
          text: draft.text.trim(),
          category: (draft.category || p.category || 'Custom').trim() || 'Custom',
          updatedAt: Date.now(),
        }
      : p
  );
  return { ok: true, list: next };
}

export function deleteCustomPrompt(
  list: CustomPrompt[],
  id: string
): CustomPrompt[] {
  return list.filter((p) => p.id !== id);
}

/** Human-friendly Bengali+English messages for validation failures. */
export function promptErrorMessage(error: PromptValidationError): string {
  switch (error) {
    case 'title_required':
      return 'শিরোনাম লিখুন · Title is required';
    case 'text_required':
      return 'প্রম্পট লিখুন · Prompt text is required';
    case 'title_too_long':
      return `শিরোনাম সর্বোচ্চ ${PROMPT_TITLE_MAX} অক্ষর · Title too long`;
    case 'text_too_long':
      return `প্রম্পট সর্বোচ্চ ${PROMPT_TEXT_MAX} অক্ষর · Prompt too long`;
    case 'limit_reached':
      return `সর্বোচ্চ ${CUSTOM_PROMPT_LIMIT}টি প্রম্পট · Library limit reached`;
  }
}
