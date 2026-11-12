/**
 * Honest generation progress phases & Live Thinking Processing (v19.1.0).
 *
 * Provides real-time, high-signal progress updates to the user:
 * - Analyzing requirements & code context
 * - Architecting full-stack system & database schemas
 * - Writing modular frontend & backend API code
 * - Validating syntax & security constraints
 * - Preparing sandbox execution & live preview
 *
 * Shows clean, realistic progress milestones without leaking private prompt chains.
 */
export type GenPhase = 'connecting' | 'processing' | 'generating';

export const GEN_PHASE_LABEL: Record<GenPhase, string> = {
  connecting: 'Connecting',
  processing: 'Processing',
  generating: 'Generating',
};

export interface LiveThinkingStep {
  id: string;
  label: string;
  labelEn: string;
  icon: string;
}

export type GenPhaseEvent =
  | { type: 'start' }
  | { type: 'response' }
  | { type: 'first-token' }
  | { type: 'stop' };

/**
 * Pure reducer for the phase machine.
 */
export function nextGenPhase(
  current: GenPhase | null,
  event: GenPhaseEvent
): GenPhase | null {
  switch (event.type) {
    case 'start':
      return 'connecting';
    case 'response':
      return current === 'generating' ? 'generating' : 'processing';
    case 'first-token':
      return 'generating';
    case 'stop':
      return null;
  }
}

export const CONNECTING_FALLBACK_MS = 1200;

/**
 * Simulated thinking steps are disabled so only genuine model reasoning
 * (`<think>...</think>` or dedicated thinking stream payloads) is displayed.
 */
export function deriveThinkingSteps(_prompt: string): LiveThinkingStep[] {
  return [];
}
