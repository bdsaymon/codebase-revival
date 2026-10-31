import { ENGINE_DEFAULTS } from './defaults';

/**
 * Section 10: CONTEXT AND MESSAGES (C1 - C5)
 */

export type CanonicalRole = 'system' | 'user' | 'assistant' | 'tool';

export interface CanonicalToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

export interface CanonicalMessage {
  role: CanonicalRole;
  content: string;
  imgs?: Array<{ mime: string; data: string }>;
  tool_calls?: CanonicalToolCall[];
  tool_call_id?: string;
  name?: string;
}

/**
 * C3: Estimate tokens as characters divided by 2, unless the provider's own tokenizer is available.
 */
export function estimateTokens(
  text: string,
  customTokenizer?: (input: string) => number
): number {
  if (!text) return 0;
  if (customTokenizer) {
    return Math.max(0, Math.ceil(customTokenizer(text)));
  }
  return Math.ceil(text.length / 2);
}

export function estimateMessageTokens(
  msg: CanonicalMessage,
  customTokenizer?: (input: string) => number
): number {
  let chars = (msg.content || '').length;
  if (Array.isArray(msg.imgs) && msg.imgs.length > 0) {
    chars += msg.imgs.length * 512;
  }
  if (Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      chars += (tc.id || '').length + (tc.name || '').length + (tc.argumentsJson || '').length + 16;
    }
  }
  if (msg.tool_call_id) {
    chars += msg.tool_call_id.length + 8;
  }
  if (customTokenizer) {
    return customTokenizer('x'.repeat(chars));
  }
  return Math.ceil(chars / 2);
}

export function estimateMessagesTokens(
  messages: CanonicalMessage[],
  customTokenizer?: (input: string) => number
): number {
  if (!Array.isArray(messages)) return 0;
  return messages.reduce(
    (sum, m) => sum + estimateMessageTokens(m, customTokenizer),
    0
  );
}

/**
 * C3: input_budget = context_window - max_output - safety_reserve,
 * where safety_reserve = max(5 percent of context_window, 500 tokens).
 */
export function computeInputBudget(
  contextWindow: number,
  maxOutput: number,
  budgetRatio = 1.0
): {
  inputBudget: number;
  safetyReserve: number;
} {
  const safetyReserve = Math.max(
    Math.ceil(contextWindow * ENGINE_DEFAULTS.CONTEXT_SAFETY_RESERVE_RATIO),
    ENGINE_DEFAULTS.CONTEXT_SAFETY_RESERVE_MIN_TOKENS
  );
  const rawBudget = Math.max(0, contextWindow - maxOutput - safetyReserve);
  return {
    inputBudget: Math.floor(rawBudget * budgetRatio),
    safetyReserve,
  };
}

/**
 * Groups non-system messages into indivisible turns:
 * Each turn starts with a 'user' message and includes all subsequent 'assistant' and 'tool'
 * messages up to the next 'user' message, ensuring a tool call is never separated from its result (C4, I9).
 */
export function groupMessagesIntoTurns(
  messages: CanonicalMessage[]
): {
  systemMessages: CanonicalMessage[];
  turns: CanonicalMessage[][];
} {
  const systemMessages: CanonicalMessage[] = [];
  const turns: CanonicalMessage[][] = [];
  let currentTurn: CanonicalMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessages.push(msg);
      continue;
    }

    if (msg.role === 'user') {
      // Only start a new turn if currentTurn already has a user message and no dangling tool calls
      const hasUnresolvedToolCall = hasDanglingToolCall(currentTurn);
      if (currentTurn.length > 0 && !hasUnresolvedToolCall) {
        turns.push(currentTurn);
        currentTurn = [msg];
      } else {
        currentTurn.push(msg);
      }
    } else {
      if (currentTurn.length === 0) {
        // Attach leading assistant/tool message to a synthetic turn
        currentTurn.push(msg);
      } else {
        currentTurn.push(msg);
      }
    }
  }

  if (currentTurn.length > 0) {
    turns.push(currentTurn);
  }

  // Validate each turn so any orphan tool result without a matching call in that turn is pruned safely
  const sanitizedTurns = turns
    .map((turn) => removeOrphanToolMessagesInTurn(turn))
    .filter((t) => t.length > 0);

  return { systemMessages, turns: sanitizedTurns };
}

function hasDanglingToolCall(turn: CanonicalMessage[]): boolean {
  const declaredIds = new Set<string>();
  const resolvedIds = new Set<string>();
  for (const m of turn) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc.id) declaredIds.add(tc.id);
      }
    } else if (m.role === 'tool' && m.tool_call_id) {
      resolvedIds.add(m.tool_call_id);
    }
  }
  for (const id of declaredIds) {
    if (!resolvedIds.has(id)) return true;
  }
  return false;
}

/**
 * C4 & I9: Never separate a tool call from its result, and never leave orphan tool results.
 */
export function removeOrphanToolMessagesInTurn(
  turn: CanonicalMessage[]
): CanonicalMessage[] {
  const callIds = new Set<string>();
  const resultIds = new Set<string>();

  for (const m of turn) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc.id) callIds.add(tc.id);
      }
    }
    if (m.role === 'tool' && m.tool_call_id) {
      resultIds.add(m.tool_call_id);
    }
  }

  // Only keep tool calls that have results AND tool results that have calls
  const pairedIds = new Set<string>();
  for (const id of callIds) {
    if (resultIds.has(id)) {
      pairedIds.add(id);
    }
  }

  const out: CanonicalMessage[] = [];
  for (const m of turn) {
    if (m.role === 'tool') {
      if (m.tool_call_id && pairedIds.has(m.tool_call_id)) {
        out.push(m);
      }
      continue;
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const validCalls = m.tool_calls.filter((tc) => pairedIds.has(tc.id));
      if (validCalls.length > 0) {
        out.push({ ...m, tool_calls: validCalls });
      } else if (m.content && m.content.trim()) {
        out.push({ role: 'assistant', content: m.content });
      }
      continue;
    }
    out.push(m);
  }
  return out;
}

export interface ContextBuildResult {
  fitsBudget: boolean;
  messageTooLong: boolean;
  messages: CanonicalMessage[];
  estimatedInputTokens: number;
  truncatedTurnsCount: number;
  summaryApplied: boolean;
}

/**
 * C4 & C5: Builds the context within input_budget:
 * - Never removes the system instruction.
 * - If system instruction + newest user turn alone exceed budget, returns messageTooLong = true BEFORE any provider call.
 * - Truncates whole turns from the oldest end (user message + assistant reply + tool results together).
 * - Creates a rolling summary only when truncation is needed; if the summary call fails, drops the oldest turns without a summary and logs it.
 */
export async function buildContextWithinBudget(params: {
  messages: CanonicalMessage[];
  contextWindow: number;
  maxOutput: number;
  budgetRatio?: number;
  customTokenizer?: (input: string) => number;
  summarizer?: (droppedTurns: CanonicalMessage[][]) => Promise<string>;
  logger?: (msg: string) => void;
}): Promise<ContextBuildResult> {
  const { inputBudget } = computeInputBudget(
    params.contextWindow,
    params.maxOutput,
    params.budgetRatio ?? 1.0
  );

  const { systemMessages, turns } = groupMessagesIntoTurns(params.messages);

  const systemTokens = systemMessages.reduce(
    (sum, m) => sum + estimateMessageTokens(m, params.customTokenizer),
    0
  );

  if (turns.length === 0) {
    if (systemTokens > inputBudget) {
      return {
        fitsBudget: false,
        messageTooLong: true,
        messages: [],
        estimatedInputTokens: systemTokens,
        truncatedTurnsCount: 0,
        summaryApplied: false,
      };
    }
    return {
      fitsBudget: true,
      messageTooLong: false,
      messages: [...systemMessages],
      estimatedInputTokens: systemTokens,
      truncatedTurnsCount: 0,
      summaryApplied: false,
    };
  }

  const newestTurn = turns[turns.length - 1];
  const newestTurnTokens = newestTurn.reduce(
    (sum, m) => sum + estimateMessageTokens(m, params.customTokenizer),
    0
  );

  // C4: If system instruction + newest user message/turn alone exceed budget, return "message too long" before any provider call
  if (systemTokens + newestTurnTokens > inputBudget) {
    return {
      fitsBudget: false,
      messageTooLong: true,
      messages: [],
      estimatedInputTokens: systemTokens + newestTurnTokens,
      truncatedTurnsCount: 0,
      summaryApplied: false,
    };
  }

  // Calculate which turns fit from newest to oldest
  const keptTurns: CanonicalMessage[][] = [newestTurn];
  let usedTokens = systemTokens + newestTurnTokens;
  let firstKeptIndex = turns.length - 1;

  for (let i = turns.length - 2; i >= 0; i--) {
    const turn = turns[i];
    const tTokens = turn.reduce(
      (sum, m) => sum + estimateMessageTokens(m, params.customTokenizer),
      0
    );
    if (usedTokens + tTokens <= inputBudget) {
      keptTurns.unshift(turn);
      usedTokens += tTokens;
      firstKeptIndex = i;
    } else {
      break;
    }
  }

  const droppedTurns = turns.slice(0, firstKeptIndex);
  let summaryApplied = false;
  const finalSystemMessages = [...systemMessages];

  // C5: Create a rolling summary ONLY when truncation is needed
  if (droppedTurns.length > 0 && params.summarizer) {
    try {
      const summaryText = (await params.summarizer(droppedTurns)).trim();
      if (summaryText) {
        const summaryMsg: CanonicalMessage = {
          role: 'system',
          content: `Conversation Summary of Earlier Turns:\n${summaryText}`,
        };
        const summaryTokens = estimateMessageTokens(
          summaryMsg,
          params.customTokenizer
        );
        if (usedTokens + summaryTokens <= inputBudget) {
          finalSystemMessages.push(summaryMsg);
          usedTokens += summaryTokens;
          summaryApplied = true;
        }
      }
    } catch (err: unknown) {
      // C5: If summary fails, drop oldest turns without a summary and log it
      const log =
        params.logger || ((msg: string) => console.warn('[Context Summary]', msg));
      log(
        `Rolling summary failed; dropping ${droppedTurns.length} oldest turn(s) without summary: ${
          err instanceof Error ? err.message : 'unknown error'
        }`
      );
    }
  }

  const flattenedTurns = keptTurns.flat();
  return {
    fitsBudget: true,
    messageTooLong: false,
    messages: [...finalSystemMessages, ...flattenedTurns],
    estimatedInputTokens: usedTokens,
    truncatedTurnsCount: droppedTurns.length,
    summaryApplied,
  };
}
