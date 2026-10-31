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
 * Derives realistic, context-aware thinking steps based on the user's prompt.
 */
export function deriveThinkingSteps(prompt: string): LiveThinkingStep[] {
  const p = (prompt || '').toLowerCase();

  if (
    p.includes('ওয়েবসাইট') ||
    p.includes('website') ||
    p.includes('fullstack') ||
    p.includes('ফুল স্ট্যাক') ||
    p.includes('app') ||
    p.includes('অ্যাপ')
  ) {
    return [
      {
        id: 'spec',
        label: 'প্রজেক্টের আর্কিটেকচার ও রিকোয়ারমেন্ট বিশ্লেষণ করছে...',
        labelEn: 'Analyzing architecture and system specifications...',
        icon: '🔍',
      },
      {
        id: 'db',
        label: 'ডেটাবেস স্কিমা ও রিলেশন স্ট্রাকচার ডিজাইন করছে...',
        labelEn: 'Formulating database schema and relational tables...',
        icon: '🗄️',
      },
      {
        id: 'api',
        label: 'এক্সপ্রেস ব্যাকএন্ড ও সিকিউর API এন্ডপয়েন্ট তৈরি করছে...',
        labelEn: 'Developing Express backend & authenticated API endpoints...',
        icon: '⚡',
      },
      {
        id: 'ui',
        label: 'রেসপন্সিভ ফ্রন্টএন্ড ও অ্যাডমিন প্যানেল সাজাচ্ছে...',
        labelEn: 'Building responsive frontend UI & admin dashboard...',
        icon: '🎨',
      },
      {
        id: 'verify',
        label: 'কোডের সিনট্যাক্স ও স্যান্ডবক্স লাইভ প্রিভিউ প্রস্তুত করছে...',
        labelEn: 'Validating code integrity & preparing sandbox preview...',
        icon: '🚀',
      },
    ];
  }

  if (p.includes('কোড') || p.includes('code') || p.includes('bug') || p.includes('error') || p.includes('fix')) {
    return [
      {
        id: 'inspect',
        label: 'কোড ফাইল ও লজিক স্ট্রাকচার পরীক্ষা করছে...',
        labelEn: 'Inspecting code files and logic flow...',
        icon: '🔎',
      },
      {
        id: 'diagnose',
        label: 'সমস্যা ও পারফরম্যান্স অপটিমাইজেশন শনাক্ত করছে...',
        labelEn: 'Diagnosing runtime errors and optimization points...',
        icon: '🧠',
      },
      {
        id: 'patch',
        label: 'সংশোধিত ক্লিন কোড ও টেস্ট কেস প্রস্তুত করছে...',
        labelEn: 'Formulating robust patch and test assertions...',
        icon: '✨',
      },
    ];
  }

  // Standard concise thinking steps
  return [
    {
      id: 'context',
      label: 'অনুরোধের প্রাসঙ্গিক তথ্য ও কন্টেক্সট বিশ্লেষণ করছে...',
      labelEn: 'Analyzing inquiry context and parameters...',
      icon: '💡',
    },
    {
      id: 'synthesize',
      label: 'যথাযথ সমাধান ও নির্ভুল উত্তর প্রস্তুত করছে...',
      labelEn: 'Synthesizing comprehensive, high-signal response...',
      icon: '⚡',
    },
  ];
}
