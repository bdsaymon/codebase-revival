/**
 * SMFTA AI Pro — Multi-Step Task Execution Engine (v19.1.0)
 *
 * Handles complex, multi-action user requests by:
 * 1. Generating or parsing a structured task checklist.
 * 2. Maintaining execution state (pending, running, completed, failed, paused).
 * 3. Enforcing per-step validation checks before advancing.
 * 4. Preventing duplicate execution.
 * 5. Providing Pause, Resume, Cancel, and Retry controls.
 */

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'waiting_for_confirmation';
export type PlanStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'waiting_for_confirmation';

export interface ExecutionTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  requiresConfirmation?: boolean;
  validationCriteria?: string;
  errorReason?: string;
  resultSnippet?: string;
  executedAt?: number;
}

export interface TaskExecutionPlan {
  id: string;
  goal: string;
  tasks: ExecutionTask[];
  status: PlanStatus;
  currentTaskIndex: number;
  createdAt: number;
  updatedAt: number;
}

export const ACTIVE_TASK_PLAN_KEY = 'smfta_active_task_plan';

/**
 * Detects if a user message contains multiple distinct instructions or complex tasks.
 */
export function isMultiStepRequest(text: string): boolean {
  const clean = (text || '').trim();
  if (clean.length < 30) return false;

  // Numbered list: 1. ... 2. ...
  if (/(?:^|\n)\s*(?:[1-9]\.|[১-৯]\.)\s+/i.test(clean)) return true;

  // Bullet points with action verbs
  const bulletCount = (clean.match(/(?:^|\n)\s*[-*•]\s+/g) || []).length;
  if (bulletCount >= 3) return true;

  // Common multi-task conjunctions in Bengali and English
  const multiActionKeywords = [
    /(?:প্রথমে|তারপর|এরপর|শেষে|এবং|পাশাপাশি).*(?:করো|বানাও|তৈরি|যুক্ত|আপডেট|ডিপ্লয়|পরীক্ষা)/i,
    /(?:first|then|next|after that|finally).*(?:build|create|fix|update|add|deploy|check)/i,
    /(?:complete|full|website|application|system|dashboard).*(?:frontend|backend|database|auth)/i,
    /(?:github|repository|রিপোজিটরি).*(?:bug|বাগ|login|লগইন|fix|ঠিক).*(?:deploy|ডিপ্লয়|vercel)/i,
  ];

  return multiActionKeywords.some((rx) => rx.test(clean));
}

/**
 * Creates a structured task execution plan from a list of steps.
 */
export function createTaskPlan(goal: string, steps: Array<{ title: string; description?: string; validation?: string }>): TaskExecutionPlan {
  const now = Date.now();
  const tasks: ExecutionTask[] = steps.map((s, idx) => ({
    id: `task_${idx + 1}_${Math.random().toString(36).slice(2, 6)}`,
    title: s.title.trim(),
    description: (s.description || s.title).trim(),
    status: 'pending',
    validationCriteria: s.validation || 'Completed without unhandled exceptions',
  }));

  return {
    id: `plan_${now}`,
    goal: goal.trim(),
    tasks,
    status: 'idle',
    currentTaskIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Extracts a task plan from a prompt or AI-generated task breakdown.
 */
export function parseTaskPlanFromText(text: string): TaskExecutionPlan | null {
  const clean = (text || '').trim();
  if (!clean) return null;

  // Check for ⟦TASK_PLAN⟧...⟦/TASK_PLAN⟧ block
  const blockMatch = clean.match(/⟦TASK_PLAN⟧([\s\S]*?)⟦\/TASK_PLAN⟧/);
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[1]);
      if (parsed && Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
        return createTaskPlan(
          parsed.goal || 'Multi-step Task Execution',
          parsed.tasks.map((t: { title: string; description?: string; validation?: string }) => ({
            title: t.title || 'Execute Step',
            description: t.description || t.title,
            validation: t.validation,
          }))
        );
      }
    } catch {
      // ignore
    }
  }

  // Parse numbered list (1. ..., 2. ...)
  const lines = clean.split('\n');
  const items: Array<{ title: string; description?: string }> = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:[0-9]{1,2}\.|[১-৯]{1,2}\.|[-*•])\s+(.+)$/);
    if (m && m[1]) {
      const stepText = m[1].trim();
      if (stepText.length >= 4 && !stepText.startsWith('http')) {
        items.push({ title: stepText });
      }
    }
  }

  if (items.length >= 2) {
    const goal = lines[0].replace(/^[#*-.\s]+/, '').slice(0, 100) || 'Multi-step Task Execution';
    return createTaskPlan(goal, items);
  }

  return null;
}

/**
 * Advances the active task in the plan.
 */
export function advanceTaskPlan(
  plan: TaskExecutionPlan,
  result: { success: boolean; error?: string; snippet?: string }
): TaskExecutionPlan {
  const now = Date.now();
  const currentIdx = plan.currentTaskIndex;
  const currentTask = plan.tasks[currentIdx];

  if (!currentTask) {
    return {
      ...plan,
      status: 'completed',
      updatedAt: now,
    };
  }

  const updatedTasks = plan.tasks.map((t, idx) => {
    if (idx === currentIdx) {
      return {
        ...t,
        status: result.success ? ('completed' as TaskStatus) : ('failed' as TaskStatus),
        errorReason: result.error,
        resultSnippet: result.snippet,
        executedAt: now,
      };
    }
    return t;
  });

  if (!result.success) {
    return {
      ...plan,
      tasks: updatedTasks,
      status: 'failed',
      updatedAt: now,
    };
  }

  const nextIdx = currentIdx + 1;
  const allDone = nextIdx >= updatedTasks.length;

  return {
    ...plan,
    tasks: updatedTasks,
    currentTaskIndex: nextIdx,
    status: allDone ? 'completed' : 'running',
    updatedAt: now,
  };
}

/**
 * Controls for Pause, Resume, Cancel, Retry.
 */
export function setPlanPaused(plan: TaskExecutionPlan): TaskExecutionPlan {
  const tasks = plan.tasks.map((t, i) =>
    i === plan.currentTaskIndex && (t.status === 'running' || t.status === 'waiting_for_confirmation')
      ? { ...t, status: 'paused' as TaskStatus }
      : t
  );
  return { ...plan, tasks, status: 'paused', updatedAt: Date.now() };
}

export function setPlanResumed(plan: TaskExecutionPlan): TaskExecutionPlan {
  const tasks = plan.tasks.map((t, i) =>
    i === plan.currentTaskIndex && t.status === 'paused'
      ? { ...t, status: 'running' as TaskStatus }
      : t
  );
  return { ...plan, tasks, status: 'running', updatedAt: Date.now() };
}

export function setPlanWaitingForConfirmation(
  plan: TaskExecutionPlan,
  stepIndexOrReason: number | string = plan.currentTaskIndex
): TaskExecutionPlan {
  const stepIndex = typeof stepIndexOrReason === 'number' ? stepIndexOrReason : plan.currentTaskIndex;
  const reason = typeof stepIndexOrReason === 'string' ? stepIndexOrReason : undefined;
  const tasks = plan.tasks.map((t, i) =>
    i === stepIndex
      ? {
          ...t,
          status: 'waiting_for_confirmation' as TaskStatus,
          resultSnippet: reason || t.resultSnippet,
        }
      : t
  );
  return {
    ...plan,
    tasks,
    currentTaskIndex: stepIndex,
    status: 'waiting_for_confirmation',
    updatedAt: Date.now(),
  };
}

export function confirmPlanStep(plan: TaskExecutionPlan): TaskExecutionPlan {
  const now = Date.now();
  const currentIdx = plan.currentTaskIndex;
  const tasks = plan.tasks.map((t, i) =>
    i === currentIdx
      ? {
          ...t,
          status: 'running' as TaskStatus,
          resultSnippet: 'User confirmed execution',
          executedAt: now,
        }
      : t
  );
  return {
    ...plan,
    tasks,
    status: 'running',
    updatedAt: now,
  };
}

export function setPlanCancelled(plan: TaskExecutionPlan): TaskExecutionPlan {
  return { ...plan, status: 'cancelled', updatedAt: Date.now() };
}

export function retryFailedTask(plan: TaskExecutionPlan): TaskExecutionPlan {
  const tasks = plan.tasks.map((t, i) =>
    i === plan.currentTaskIndex ? { ...t, status: 'pending' as TaskStatus, errorReason: undefined } : t
  );
  return { ...plan, tasks, status: 'running', updatedAt: Date.now() };
}

export function loadStoredTaskPlan(): TaskExecutionPlan | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_TASK_PLAN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function persistTaskPlan(plan: TaskExecutionPlan | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!plan) {
      localStorage.removeItem(ACTIVE_TASK_PLAN_KEY);
    } else {
      localStorage.setItem(ACTIVE_TASK_PLAN_KEY, JSON.stringify(plan));
    }
  } catch {}
}
