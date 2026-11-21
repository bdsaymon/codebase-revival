/**
 * SMFTA AI Pro — Self-Evolution Core 🧬 (v18.0.0)
 *
 * Gives the assistant real control over itself, with guard-rails so that
 * "everything it upgrades actually works":
 *
 *   • reconcileSettings() — one atomic, validated path for every ⟦SELF_UPDATE⟧
 *     field the AI sends. Invalid values are REJECTED (and reported), never
 *     written, so a self-update can never leave the app in a broken state.
 *   • Self-built skills (⟦SELF_CODE⟧) — the AI can create its own capabilities
 *     (prompt skills that inject instructions, or widget skills it builds and
 *     installs as runnable mini-apps), pick triggering phrases and manage them.
 *   • runSelfCheck() / applyAutoRepairs() — a real health check over engine,
 *     memory, notebook, widgets, cloud links and CSS, plus deterministic repairs.
 *
 * Pure functions only → fully unit-testable.
 */

import {
  AppSettings,
  ExternalProviderId,
  SelfUpdatePayload,
  SelfUpdateWidget,
} from '../types';
import { DEFAULT_PROVIDER_MODELS } from './providers';
import { VALID_PROVIDERS } from './settings';

export type AutonomyLevel = 'safe' | 'full';

export const AUTONOMY_LS_KEY = 'smfta_autonomy';
export const SKILLS_LS_KEY = 'smfta_self_skills';

export interface SelfSkill {
  id: string;
  name: string;
  description: string;
  /** Phrases that activate the skill (lower-case, matched as substrings). */
  triggers: string[];
  type: 'prompt' | 'widget';
  /** For prompt skills: the extra instruction injected into the engine. */
  prompt?: string;
  /** For widget skills: complete standalone HTML/CSS/JS. */
  code?: string;
  enabled: boolean;
  createdAt: number;
  createdBy: 'ai' | 'user';
  runs: number;
}

export interface SelfSkillDraft {
  name: string;
  description?: string;
  triggers?: string[];
  type?: 'prompt' | 'widget';
  prompt?: string;
  code?: string;
}

export interface ReconcileResult {
  next: AppSettings;
  changes: string[];
  rejected: string[];
}

/** Human-readable labels for the self-update change log. */
const CHANGE_LABELS: Record<string, string> = {
  theme: 'Theme',
  accent: 'Accent',
  fontsize: 'Font size',
  radius: 'UI radius',
  density: 'UI density',
  mode: 'Engine mode',
  style: 'Answer style',
  replyLang: 'Language',
  customInst: 'Behavior',
  customCss: 'Live CSS',
  weightTemp: 'Weight temp',
  topP: 'Top-P',
  trainingData: 'Model weights',
  fastDecision: 'Fast decision',
  gpuAccel: 'Hardware accel',
  memoryCache: 'Memory cache',
  provider: 'Engine',
  externalModel: 'Model',
  workPersona: 'Persona',
  creativity: 'Creativity',
  autoMemory: 'Auto-memory',
  smartFormatting: 'Smart formatting',
  proactiveAuto: 'Proactive',
  sendOnEnter: 'Enter to send',
  mono: 'Mono font',
  voiceSpeed: 'Voice speed',
  displayName: 'Display name',
};

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;

const clampNum = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : undefined;

/**
 * Applies a self-update payload to the current settings **atomically**.
 * Every key is validated; invalid keys are skipped and listed in `rejected`.
 */
export function reconcileSettings(
  current: AppSettings,
  payload: SelfUpdatePayload | null | undefined
): ReconcileResult {
  const next: AppSettings = { ...current };
  const changes: string[] = [];
  const rejected: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { next, changes, rejected };
  }

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (next[key] === value) return;
    next[key] = value;
    changes.push(`${CHANGE_LABELS[key as string] || String(key)} → ${String(value)}`);
  };

  const theme = oneOf(payload.theme, ['light', 'dark'] as const);
  if (payload.theme !== undefined) {
    theme ? set('theme', theme) : rejected.push('theme');
  }

  const accent = oneOf(payload.accent, [
    'indigo',
    'emerald',
    'rose',
    'amber',
    'sky',
  ] as const);
  if (payload.accent !== undefined) {
    accent ? set('accent', accent) : rejected.push('accent');
  }

  const fontsize = oneOf(payload.fontsize, ['small', 'normal', 'large'] as const);
  if (payload.fontsize !== undefined) {
    fontsize ? set('fontsize', fontsize) : rejected.push('fontsize');
  }

  const radius = oneOf(payload.radius, ['sharp', 'soft', 'round'] as const);
  if (payload.radius !== undefined) {
    radius ? set('radius', radius) : rejected.push('radius');
  }

  const density = oneOf(payload.density, ['compact', 'cozy', 'spacious'] as const);
  if (payload.density !== undefined) {
    density ? set('density', density) : rejected.push('density');
  }

  const mode = oneOf(payload.mode, ['fast', 'balanced', 'power'] as const);
  if (payload.mode !== undefined) mode ? set('mode', mode) : rejected.push('mode');

  const style = oneOf(payload.style, ['concise', 'detailed'] as const);
  if (payload.style !== undefined) {
    style ? set('style', style) : rejected.push('style');
  }

  const replyLang = oneOf(payload.replyLang, ['auto', 'bn', 'en'] as const);
  if (payload.replyLang !== undefined) {
    replyLang ? set('replyLang', replyLang) : rejected.push('replyLang');
  }

  const persona = oneOf(payload.workPersona, [
    'allrounder',
    'office',
    'developer',
    'content',
    'academic',
  ] as const);
  if (payload.workPersona !== undefined) {
    persona ? set('workPersona', persona) : rejected.push('workPersona');
  }

  const creativity = oneOf(payload.creativity, [
    'precise',
    'balanced',
    'creative',
  ] as const);
  if (payload.creativity !== undefined) {
    creativity ? set('creativity', creativity) : rejected.push('creativity');
  }

  if (typeof payload.customInst === 'string') {
    set('customInst', payload.customInst.slice(0, 500));
  }

  if (payload.resetCustomCss) {
    if (next.customCss) set('customCss', '');
  } else if (typeof payload.customCss === 'string' && payload.customCss.trim()) {
    set('customCss', payload.customCss.slice(0, 20000));
  }

  if (payload.weightTemp !== undefined) {
    const v = clampNum(payload.weightTemp, 0.1, 1.2);
    v === undefined ? rejected.push('weightTemp') : set('weightTemp', v);
  }
  if (payload.topP !== undefined) {
    const v = clampNum(payload.topP, 0.1, 1);
    v === undefined ? rejected.push('topP') : set('topP', v);
  }
  if (typeof payload.trainingData === 'string') {
    set('trainingData', payload.trainingData.slice(0, 4000));
  }

  // Boolean switches.
  const boolKeys: Array<
    keyof Pick<
      AppSettings,
      | 'fastDecision'
      | 'gpuAccel'
      | 'memoryCache'
      | 'autoMemory'
      | 'smartFormatting'
      | 'proactiveAuto'
      | 'sendOnEnter'
      | 'mono'
    >
  > = [
    'fastDecision',
    'gpuAccel',
    'memoryCache',
    'autoMemory',
    'smartFormatting',
    'proactiveAuto',
    'sendOnEnter',
    'mono',
  ];
  for (const key of boolKeys) {
    const value = (payload as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      rejected.push(key);
      continue;
    }
    set(key, value);
  }

  if (payload.voiceSpeed !== undefined) {
    const v = clampNum(payload.voiceSpeed, 0.5, 2);
    v === undefined ? rejected.push('voiceSpeed') : set('voiceSpeed', v);
  }

  if (typeof payload.displayName === 'string' && payload.displayName.trim()) {
    set('displayName', payload.displayName.trim().slice(0, 80));
  }

  // ── Engine / provider switching ─────────────────────────────────────────
  if (payload.provider !== undefined) {
    const provider = oneOf(
      payload.provider,
      VALID_PROVIDERS as readonly ExternalProviderId[]
    );
    if (provider) {
      set('provider', provider);
      // A provider switch must never leave a foreign model id behind.
      const fallbackModel = DEFAULT_PROVIDER_MODELS[provider] || '';
      if (
        fallbackModel &&
        (!next.externalModel || payload.externalModel === undefined)
      ) {
        const isKeyless = provider === 'xrahat' || provider === 'smfta_cloud';
        if (!isKeyless) set('externalModel', fallbackModel);
      }
    } else {
      rejected.push('provider');
    }
  }

  if (typeof payload.externalModel === 'string' && payload.externalModel.trim()) {
    set('externalModel', payload.externalModel.trim().slice(0, 200));
  }

  return { next, changes, rejected };
}

// ─────────────────────────────────────────────────────────────────────────────
// Self-built skills (⟦SELF_CODE⟧)
// ─────────────────────────────────────────────────────────────────────────────

export function makeSkillId(): string {
  return `sk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function sanitizeSkills(input: unknown): SelfSkill[] {
  if (!Array.isArray(input)) return [];
  const out: SelfSkill[] = [];
  for (const raw of input.slice(0, 40)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 80) : '';
    if (!name) continue;
    const type: SelfSkill['type'] = r.type === 'widget' ? 'widget' : 'prompt';
    const prompt = typeof r.prompt === 'string' ? r.prompt.slice(0, 4000) : '';
    const code = typeof r.code === 'string' ? r.code.slice(0, 120000) : '';
    if (type === 'prompt' && !prompt) continue;
    if (type === 'widget' && !code) continue;
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id.slice(0, 80) : makeSkillId(),
      name,
      description:
        typeof r.description === 'string' ? r.description.slice(0, 240) : '',
      triggers: Array.isArray(r.triggers)
        ? r.triggers
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim().toLowerCase().slice(0, 60))
            .filter(Boolean)
            .slice(0, 12)
        : [],
      type,
      prompt: prompt || undefined,
      code: code || undefined,
      enabled: r.enabled !== false,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
      createdBy: r.createdBy === 'user' ? 'user' : 'ai',
      runs: typeof r.runs === 'number' && Number.isFinite(r.runs) ? r.runs : 0,
    });
  }
  return out;
}

export function loadSkills(): SelfSkill[] {
  try {
    const raw = localStorage.getItem(SKILLS_LS_KEY);
    return raw ? sanitizeSkills(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function persistSkills(skills: SelfSkill[]): void {
  try {
    localStorage.setItem(SKILLS_LS_KEY, JSON.stringify(sanitizeSkills(skills)));
  } catch {
    // Ignore quota errors
  }
}

export function loadAutonomy(): AutonomyLevel {
  try {
    return localStorage.getItem(AUTONOMY_LS_KEY) === 'safe' ? 'safe' : 'full';
  } catch {
    return 'full';
  }
}

export function persistAutonomy(level: AutonomyLevel): void {
  try {
    localStorage.setItem(AUTONOMY_LS_KEY, level === 'safe' ? 'safe' : 'full');
  } catch {
    // Ignore storage errors
  }
}

/** Turns an AI ⟦SELF_CODE⟧ draft into a stored skill, or null if unusable. */
export function skillFromDraft(
  draft: SelfSkillDraft,
  createdBy: 'ai' | 'user' = 'ai'
): SelfSkill | null {
  const [clean] = sanitizeSkills([
    {
      id: makeSkillId(),
      name: draft?.name,
      description: draft?.description || 'AI-built capability',
      triggers: draft?.triggers || [draft?.name],
      type: draft?.type === 'widget' ? 'widget' : 'prompt',
      prompt: draft?.prompt,
      code: draft?.code,
      enabled: true,
      createdAt: Date.now(),
      createdBy,
    },
  ]);
  return clean || null;
}

/** Skills whose trigger phrase appears in the user's message. */
export function matchSkills(
  text: string,
  skills: SelfSkill[]
): SelfSkill[] {
  const lower = (text || '').toLowerCase();
  if (!lower.trim()) return [];
  return skills.filter(
    (s) =>
      s.enabled &&
      s.triggers.some((t) => t.length >= 3 && lower.includes(t))
  );
}

/** Instruction block injected into the engine when a skill fires. */
export function buildSkillInstruction(skills: SelfSkill[]): string {
  const active = skills.filter((s) => s.enabled && s.type === 'prompt' && s.prompt);
  if (active.length === 0) return '';
  return active
    .slice(0, 6)
    .map(
      (s, i) =>
        `[SKILL ${i + 1}: ${s.name}]${s.description ? ` (${s.description})` : ''}\n${s.prompt}`
    )
    .join('\n---\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Self check & auto repair
// ─────────────────────────────────────────────────────────────────────────────

export interface SelfCheckItem {
  id: string;
  label: string;
  ok: boolean;
  level: 'ok' | 'warn' | 'error';
  detail: string;
}

export interface SelfCheckContext {
  settings: AppSettings;
  memory: string[];
  notes: number;
  widgets: SelfUpdateWidget[];
  skills: SelfSkill[];
  driveConnected: boolean;
  githubConnected: boolean;
  autonomy: AutonomyLevel;
}

export function runSelfCheck(ctx: SelfCheckContext): {
  items: SelfCheckItem[];
  score: number;
  ok: boolean;
} {
  const items: SelfCheckItem[] = [];
  const push = (
    id: string,
    label: string,
    ok: boolean,
    detail: string,
    level: SelfCheckItem['level'] = ok ? 'ok' : 'warn'
  ) => items.push({ id, label, ok, detail, level });

  const provider = ctx.settings.provider || 'xrahat';
  const keyless = provider === 'xrahat' || provider === 'smfta_cloud';
  const local = provider === 'ollama' || provider === 'lmstudio';
  const hasKey = Boolean((ctx.settings.externalKeys || '').trim());
  push(
    'engine',
    'Engine provider',
    keyless || local || hasKey,
    `${provider}${keyless ? ' (keyless)' : local ? ' (local)' : hasKey ? ' (key set)' : ' — API key missing'}`,
    keyless || local || hasKey ? 'ok' : 'error'
  );

  push(
    'model',
    'Active model',
    keyless || Boolean((ctx.settings.externalModel || '').trim()),
    keyless
      ? 'built-in routing'
      : ctx.settings.externalModel?.trim() || 'no model id — using provider default'
  );

  const temp = ctx.settings.weightTemp ?? 0.65;
  const topP = ctx.settings.topP ?? 0.92;
  push(
    'sampling',
    'Sampling bounds',
    temp >= 0.1 && temp <= 1.2 && topP >= 0.1 && topP <= 1,
    `temp ${temp} · top-p ${topP}`
  );

  const css = ctx.settings.customCss || '';
  const braces =
    (css.split('{').length - 1) - (css.split('}').length - 1);
  push(
    'css',
    'Live CSS integrity',
    css.trim() === '' || braces === 0,
    css.trim() === ''
      ? 'no custom CSS'
      : braces === 0
      ? `${css.length} chars, balanced`
      : `unbalanced braces (${braces}) — will be reset`,
    css.trim() === '' || braces === 0 ? 'ok' : 'error'
  );

  push(
    'memory',
    'Memory bank',
    ctx.memory.length <= 60,
    `${ctx.memory.length}/60 facts`,
    ctx.memory.length <= 60 ? 'ok' : 'warn'
  );

  const emptyWidgets = ctx.widgets.filter((w) => !w.code || !w.title);
  push(
    'widgets',
    'Self-built widgets',
    emptyWidgets.length === 0,
    `${ctx.widgets.length} installed${emptyWidgets.length ? ` · ${emptyWidgets.length} broken` : ''}`,
    emptyWidgets.length === 0 ? 'ok' : 'warn'
  );

  push(
    'skills',
    'Self-built skills',
    true,
    `${ctx.skills.filter((s) => s.enabled).length}/${ctx.skills.length} active`
  );

  push(
    'notebook',
    'AI Notebook',
    true,
    `${ctx.notes} note(s)`
  );

  push(
    'cloud',
    'Cloud links',
    ctx.driveConnected || ctx.githubConnected,
    [ctx.driveConnected ? 'Drive ✓' : 'Drive —', ctx.githubConnected ? 'GitHub ✓' : 'GitHub —'].join(' · '),
    ctx.driveConnected || ctx.githubConnected ? 'ok' : 'warn'
  );

  push(
    'autonomy',
    'Self-control level',
    true,
    ctx.autonomy === 'full' ? 'FULL (AI may rewrite itself)' : 'SAFE (confirm first)'
  );

  const passed = items.filter((i) => i.ok).length;
  const score = Math.round((passed / items.length) * 100);
  return {
    items,
    score,
    ok: items.every((i) => i.level !== 'error'),
  };
}

/**
 * Deterministic repairs — used on boot and by the AI's `selfRepair` command so
 * a broken setting can never brick the engine.
 */
export function applyAutoRepairs(
  settings: AppSettings,
  ctx: Omit<SelfCheckContext, 'settings'> & { settings?: AppSettings }
): { settings: AppSettings; memory: string[]; actions: string[] } {
  const next: AppSettings = { ...settings };
  const actions: string[] = [];
  const provider = next.provider || 'xrahat';

  if (!(VALID_PROVIDERS as readonly string[]).includes(provider)) {
    next.provider = 'xrahat';
    actions.push('Engine reset to default (invalid provider)');
  }

  const keyless =
    next.provider === 'xrahat' ||
    next.provider === 'smfta_cloud' ||
    (next.provider === 'gemini_custom' && !(next.externalKeys || '').trim());
  if (
    !keyless &&
    !(next.externalModel || '').trim() &&
    DEFAULT_PROVIDER_MODELS[next.provider as string]
  ) {
    next.externalModel = DEFAULT_PROVIDER_MODELS[next.provider as string];
    actions.push(`Model restored → ${next.externalModel}`);
  }

  const temp = next.weightTemp ?? 0.65;
  if (temp < 0.1 || temp > 1.2 || Number.isNaN(temp)) {
    next.weightTemp = 0.65;
    actions.push('Temperature clamped to 0.65');
  }
  const topP = next.topP ?? 0.92;
  if (topP < 0.1 || topP > 1 || Number.isNaN(topP)) {
    next.topP = 0.92;
    actions.push('Top-P clamped to 0.92');
  }

  const css = next.customCss || '';
  const braces = (css.split('{').length - 1) - (css.split('}').length - 1);
  if (css.trim() && braces !== 0) {
    next.customCss = '';
    actions.push('Broken custom CSS cleared');
  }
  if (css.length > 20000) {
    next.customCss = css.slice(0, 20000);
    actions.push('Custom CSS trimmed to 20k chars');
  }

  const memory = ctx.memory.slice(-60);
  if (memory.length !== ctx.memory.length) {
    actions.push(`Memory trimmed to ${memory.length} facts`);
  }

  const voiceSpeed = next.voiceSpeed ?? 1;
  if (voiceSpeed < 0.5 || voiceSpeed > 2) {
    next.voiceSpeed = 1;
    actions.push('Voice speed reset to 1x');
  }

  return { settings: next, memory, actions };
}
