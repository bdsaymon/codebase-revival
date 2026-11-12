/**
 * SMFTA AI Pro v19.0.0 — Smart Conversation Context, Follow-Up Intelligence &
 * 7-Layer Context Continuity Engine
 *
 * Implements:
 * - PART 7: Conversation Context Understanding (coreference & anaphora resolution)
 * - PART 8: Complete Chat History Management (full context payload assembly)
 * - PART 9: Smart Context Management (7-layer envelope + lossless rolling summary + retrieval)
 * - PART 10: Follow-Up Question Intelligence (zero redundant clarifying questions)
 * - PART 11 & 12: Multi-Step Task Continuity & Honest Live Operation Progress
 */

import type { ChatMessage, ChatServiceSelectionContext, ChatSession } from '../types';
import type { VaultConnections } from './cloudVault';
import { resolveConnectionStatus } from './cloudVault';
import type { TaskExecutionPlan } from './taskExecutionEngine';

export interface SmartConversationContextEnvelope {
  /** 1. Recent Message Context */
  recentMessages: Array<{
    role: 'user' | 'assistant';
    text: string;
    imgs?: Array<{ mime: string; data: string }>;
  }>;
  /** 2. Intelligent Rolling Conversation Summary (for turns older than recent window) */
  conversationSummary: string;
  updatedSummary: string;
  /** Retrieved older turns matching the current query in long conversations */
  retrievedOlderTurns: Array<string & { text?: string }>;
  /** 3. Important Information Memory & Decisions from this thread */
  importantDecisions: string[];
  /** 4. Active Project Context (Selected GitHub Repo, Branch, Files, or Loaded Project) */
  activeProjectContext: string;
  /** 5. Current Multi-Step Task Context */
  currentTaskContext: string;
  /** 6. Connected Service Context (GitHub, Vercel, Supabase, Google) */
  connectedServiceContext: string;
  /** 7. Pending Action & Previous Tool Results Context */
  pendingActionContext: string;
  pendingOperations: string[];
  /** Follow-up resolution metadata */
  followUpResolution: FollowUpResolutionResult;
  resolvedFollowUp: FollowUpResolutionResult;
  /** Combined high-signal prompt block to inject into the AI system/project context */
  compiledContextPrompt: string;
  envelopeBlock: string;
}

export interface FollowUpResolutionResult {
  isFollowUp: boolean;
  inferredService: 'github' | 'vercel' | 'supabase' | 'google' | null;
  activeService: 'github' | 'vercel' | 'supabase' | 'google' | null;
  inferredSubject: string;
  inferredRepo?: string;
  activeRepo?: string;
  inferredBranch?: string;
  activeBranch?: string;
  inferredFiles: string[];
  activeFiles: string[];
  inferredVercelProject?: string;
  inferredSupabaseTable?: string;
  inferredGoogleDoc?: string;
  lastOperationStatus?: string;
  continuityDirective: string;
  resolutionDirective: string;
}

/**
 * Detects whether a user message is a follow-up question or continuation of prior turns.
 */
export function isFollowUpQuery(text: string, priorMessageCount = 0): boolean {
  const clean = (text || '').trim();
  if (!clean) return false;

  const followUpPatterns = [
    // Bengali follow-up markers & pronouns
    /^(?:কিন্তু|তাহলে|এবার|এখন|তারপর|এরপর|আচ্ছা|তবুও|ওটা|এটা|এইটা|সেটা|ওইটা|এগুলো|ওগুলো|এখানে|সেখানে|হ্যাঁ)\b/i,
    /(?:দেখতে পাচ্ছি না কেন|কাজ করছে না কেন|কেন হচ্ছে না|ঠিক করো|সমাধান করো|আপডেট করো|ডিপ্লয় করো|চেক করো|পরীক্ষা করো|সব ঠিক হয়েছে|আবার পরীক্ষা করো|deploy করতে পারবে)/i,
    /(?:এই\s+(?:bug|বাগ|সমস্যা|ফাইল|file|project|প্রজেক্ট|কোড|code|table|টেবিল|লিঙ্ক|ডকুমেন্ট))/i,
    /(?:এখন\s+deploy|এবার\s+deploy|এবার\s+login|এখন\s+আবার)/i,
    // English follow-up markers & pronouns
    /^(?:but|so|now|then|next|also|and|why|what about|how about|fix it|fix this|update it|update this|deploy it|deploy now|check again|is it fixed|did it work)\b/i,
    /\b(?:this bug|that bug|this file|that file|the repo|the repository|the deployment|it is not showing|why can'?t i see)\b/i,
  ];

  if (followUpPatterns.some((rx) => rx.test(clean))) {
    return true;
  }

  // Short conversational messages in an existing multi-turn thread are almost always follow-ups
  if (priorMessageCount > 0 && clean.length <= 65 && !/^(?:নতুন|new topic|reset)/i.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Extracts important entities (repo names, file paths, branches, tables, instructions, decisions)
 * from a list of messages without distorting or losing any critical facts.
 */
export function extractConversationEntities(
  messages: Array<{ role: string; text?: string; content?: string }>,
  serviceContext?: ChatServiceSelectionContext,
  connections?: VaultConnections
): {
  repos: string[];
  branches: string[];
  files: string[];
  vercelProjects: string[];
  supabaseTables: string[];
  googleDocs: string[];
  servicesMentioned: Array<'github' | 'vercel' | 'supabase' | 'google'>;
  importantDecisions: string[];
  pendingOperations: string[];
  lastTopicSummary: string;
} {
  const repos = new Set<string>();
  const branches = new Set<string>();
  const files = new Set<string>();
  const vercelProjects = new Set<string>();
  const supabaseTables = new Set<string>();
  const googleDocs = new Set<string>();
  const servicesMentioned = new Set<'github' | 'vercel' | 'supabase' | 'google'>();
  const importantDecisions: string[] = [];
  const pendingOperations: string[] = [];

  if (serviceContext?.activeService) {
    servicesMentioned.add(serviceContext.activeService);
  }
  if (serviceContext?.github?.owner && serviceContext?.github?.repo) {
    repos.add(`${serviceContext.github.owner}/${serviceContext.github.repo}`);
    servicesMentioned.add('github');
  }
  if (serviceContext?.github?.branch) {
    branches.add(serviceContext.github.branch);
  }
  if (serviceContext?.github?.selectedFiles?.length) {
    serviceContext.github.selectedFiles.forEach((f) => files.add(f));
  }
  if (serviceContext?.vercel?.projectName || serviceContext?.vercel?.projectId) {
    vercelProjects.add(serviceContext.vercel.projectName || serviceContext.vercel.projectId);
    servicesMentioned.add('vercel');
  }
  if (serviceContext?.supabase?.selectedTable) {
    supabaseTables.add(serviceContext.supabase.selectedTable);
    servicesMentioned.add('supabase');
  }
  if (serviceContext?.google?.selectedFileName || serviceContext?.google?.selectedFileId) {
    googleDocs.add(
      serviceContext.google.selectedFileName || serviceContext.google.selectedFileId || ''
    );
    servicesMentioned.add('google');
  }

  if (connections?.github?.owner && connections?.github?.repo) {
    repos.add(`${connections.github.owner}/${connections.github.repo}`);
  }
  if (connections?.github?.branch) {
    branches.add(connections.github.branch);
  }
  if (connections?.vercel?.projectId) {
    vercelProjects.add(connections.vercel.projectId);
  }

  let lastUserTopic = '';

  for (const m of messages || []) {
    const raw = String(m.text ?? m.content ?? '').trim();
    if (!raw) continue;

    if (m.role === 'user') {
      lastUserTopic = raw.replace(/⟦FILE:[^\n⟧]+⟧[\s\S]*?⟦\/FILE⟧/g, '').trim().slice(0, 220);
    }

    if (/(?:github|গিটহাব|repository|রিপোজিটরি|repo\b|রিপো|pull request|\bpr\b|commit|কমিট)/i.test(raw)) {
      servicesMentioned.add('github');
    }
    if (/(?:vercel|ভার্সেল|deploy|deployment|ডিপ্লয়|ডিপ্লয়মেন্ট|build log)/i.test(raw)) {
      servicesMentioned.add('vercel');
    }
    if (/(?:supabase|সুপাবেস|database|ডাটাবেস|ডেটাবেস|table|টেবিল|schema|স্কিমা|migration|sql)/i.test(raw)) {
      servicesMentioned.add('supabase');
    }
    if (/(?:google drive|গুগল ড্রাইভ|google doc|google sheet|spreadsheet|ড্রাইভ)/i.test(raw)) {
      servicesMentioned.add('google');
    }

    const repoMatches = raw.match(/\b([a-zA-Z0-9_.-]{2,39}\/[a-zA-Z0-9_.-]{2,80})\b/g);
    if (repoMatches) {
      for (const candidate of repoMatches) {
        if (
          !/^(?:src|server|public|app|api|components|utils|pages|lib|dist|node_modules|http|https|text|application|image)\//i.test(
            candidate
          ) &&
          !/\.[a-z0-9]{1,5}$/i.test(candidate)
        ) {
          repos.add(candidate);
        }
      }
    }

    const fileMatches = raw.match(
      /\b((?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.(?:tsx?|jsx?|py|sql|json|md|css|html|yml|yaml|sh|go|rs|java|kt|gradle))\b/g
    );
    if (fileMatches) {
      fileMatches.slice(0, 15).forEach((f) => files.add(f));
    }

    const branchMatch = raw.match(/\b(?:branch|ব্রাঞ্চ)[:\s]+[`'"]?([a-zA-Z0-9_./-]+)[`'"]?/i);
    if (branchMatch?.[1]) {
      branches.add(branchMatch[1]);
    }

    const tableMatch = raw.match(/\b(?:public\.)?([a-z0-9_]{3,40})\s+(?:table|টেবিল)/i);
    if (tableMatch?.[1]) {
      supabaseTables.add(tableMatch[1]);
    }

    if (
      m.role === 'user' &&
      /(?:সবসময়|সবসময়|কখনোই|মনে রাখবে|always|never|must|prefer|use\s+typescript|বাংলায়|ইংরেজিতে)/i.test(
        raw
      )
    ) {
      importantDecisions.push(raw.slice(0, 200));
    }

    if (
      m.role !== 'user' &&
      /(?:confirmation|অনুমতি|নিশ্চিত করুন|যদি নিশ্চিত|নিশ্চিত যে|waiting for confirmation|প্রস্তুত করা হয়েছে|সফলভাবে|ব্যর্থ হয়েছে)/i.test(
        raw
      )
    ) {
      const firstLine = raw.split('\n').find((l) => l.trim().length > 10) || raw.slice(0, 180);
      pendingOperations.push(firstLine.trim().slice(0, 200));
    }
  }

  return {
    repos: Array.from(repos),
    branches: Array.from(branches),
    files: Array.from(files),
    vercelProjects: Array.from(vercelProjects),
    supabaseTables: Array.from(supabaseTables),
    googleDocs: Array.from(googleDocs),
    servicesMentioned: Array.from(servicesMentioned),
    importantDecisions: importantDecisions.slice(-10),
    pendingOperations: pendingOperations.slice(-5),
    lastTopicSummary: lastUserTopic,
  };
}

/**
 * Resolves follow-up questions against the prior conversation turns and active service selection.
 * Supports both object and positional argument forms.
 */
export function resolveFollowUpContext(
  arg1:
    | {
        currentQuery: string;
        priorMessages: Array<{ role: string; text?: string; content?: string }>;
        serviceContext?: ChatServiceSelectionContext;
        connections?: VaultConnections;
      }
    | string,
  arg2?: Array<{ role: string; text?: string; content?: string }>,
  arg3?: VaultConnections,
  arg4?: ChatServiceSelectionContext
): FollowUpResolutionResult {
  const currentQuery = typeof arg1 === 'string' ? arg1 : arg1.currentQuery;
  const priorMessages =
    typeof arg1 === 'string' ? arg2 || [] : arg1.priorMessages || [];
  const connections = typeof arg1 === 'string' ? arg3 : arg1.connections;
  const serviceContext = typeof arg1 === 'string' ? arg4 : arg1.serviceContext;

  const isFollowUp = isFollowUpQuery(currentQuery, priorMessages.length);
  const entities = extractConversationEntities(priorMessages, serviceContext, connections);

  const q = (currentQuery || '').trim();
  let inferredService: FollowUpResolutionResult['inferredService'] =
    serviceContext?.activeService || null;

  if (/(?:deploy|ডিপ্লয়|ডিপ্লয়|vercel|ভার্সেল|build\s*log|production|preview)/i.test(q)) {
    inferredService = 'vercel';
  } else if (/(?:database|ডাটাবেস|ডেটাবেস|table|টেবিল|supabase|সুপাবেস|sql|migration|schema)/i.test(q)) {
    inferredService = 'supabase';
  } else if (/(?:google|ড্রাইভ|drive|doc|sheet|spreadsheet)/i.test(q)) {
    inferredService = 'google';
  } else if (
    /(?:repository|রিপোজিটরি|রিপো|github|গিটহাব|branch|ব্রাঞ্চ|commit|কমিট|file|ফাইল|login|bug|বাগ|কোড|code|pr|pull request)/i.test(
      q
    )
  ) {
    inferredService =
      entities.servicesMentioned[entities.servicesMentioned.length - 1] || 'github';
  } else if (!inferredService && entities.servicesMentioned.length > 0) {
    inferredService = entities.servicesMentioned[entities.servicesMentioned.length - 1];
  }

  const inferredRepo =
    (serviceContext?.github?.owner && serviceContext?.github?.repo
      ? `${serviceContext.github.owner}/${serviceContext.github.repo}`
      : undefined) ||
    entities.repos[entities.repos.length - 1] ||
    (connections?.github?.owner && connections?.github?.repo
      ? `${connections.github.owner}/${connections.github.repo}`
      : undefined);

  const inferredBranch =
    serviceContext?.github?.branch ||
    entities.branches[entities.branches.length - 1] ||
    connections?.github?.branch ||
    'main';

  const inferredVercelProject =
    serviceContext?.vercel?.projectName ||
    serviceContext?.vercel?.projectId ||
    entities.vercelProjects[entities.vercelProjects.length - 1] ||
    connections?.vercel?.projectId;

  const inferredSupabaseTable =
    serviceContext?.supabase?.selectedTable ||
    entities.supabaseTables[entities.supabaseTables.length - 1];

  const inferredGoogleDoc =
    serviceContext?.google?.selectedFileName ||
    serviceContext?.google?.selectedFileId ||
    entities.googleDocs[entities.googleDocs.length - 1];

  let inferredSubject = entities.lastTopicSummary || 'Active Workspace Task';
  if (/Repository দেখতে পাচ্ছি না|রিপোজিটরি দেখতে পাচ্ছি না|why.*repo.*not showing/i.test(q)) {
    inferredSubject =
      'GitHub OAuth Connection & Repository Access Troubleshooting (checking why repositories are not visible after connecting GitHub — e.g. private repo scope `repo`, organization OAuth app approval, or token verification)';
    inferredService = 'github';
  } else if (/(?:Login\s*System|লগইন\s*সিস্টেম|auth)/i.test(q)) {
    inferredSubject = `Analyzing/Fixing the Login & Authentication System in ${
      inferredRepo ? `repository ${inferredRepo}` : 'the active project'
    }`;
  } else if (/(?:এখন\s*Deploy|এবার\s*Deploy|deploy\s*now|can you deploy)/i.test(q)) {
    inferredSubject = `Deploying ${
      inferredRepo || 'the active project'
    } to Vercel (${inferredVercelProject || 'connected Vercel project'}) following the recent code analysis/fixes`;
    inferredService = 'vercel';
  } else if (/(?:এটা\s*ঠিক\s*করো|fix\s*this|fix\s*it|এই\s*Bug\s*ঠিক\s*করো)/i.test(q)) {
    inferredSubject = `Fixing the issue/bug discussed in the immediately preceding turn (${
      entities.lastTopicSummary || inferredRepo || 'active code/service'
    })`;
  } else if (/(?:এখন\s*আবার\s*পরীক্ষা\s*করো|সব\s*ঠিক\s*হয়েছে|check\s*again|is\s*it\s*fixed)/i.test(q)) {
    inferredSubject = `Re-verifying the fix and checking live status for ${
      inferredRepo || entities.lastTopicSummary || 'the active service'
    }`;
  }

  const lastOperationStatus =
    entities.pendingOperations.length > 0
      ? entities.pendingOperations[entities.pendingOperations.length - 1]
      : undefined;

  const continuityLines: string[] = [
    `[LAYER 1 — RECENT MESSAGE & FOLLOW-UP RESOLUTION CONTEXT]`,
    `1. Current User Message Is Follow-Up/Continuation: ${isFollowUp ? 'YES' : 'IN-THREAD'}`,
    `2. Resolved Subject / Intent: ${inferredSubject}`,
  ];
  if (inferredService) {
    continuityLines.push(`3. Active Connected Service in Context: ${inferredService.toUpperCase()}`);
  }
  if (inferredRepo) {
    continuityLines.push(`4. Active GitHub Repository: ${inferredRepo} (branch: ${inferredBranch})`);
  }
  if (entities.files.length > 0) {
    continuityLines.push(`5. Active / Discussed Files: ${entities.files.slice(-8).join(', ')}`);
  }
  if (inferredVercelProject) {
    continuityLines.push(`6. Active Vercel Project: ${inferredVercelProject}`);
  }
  if (inferredSupabaseTable) {
    continuityLines.push(`7. Active Supabase Table: ${inferredSupabaseTable}`);
  }
  if (inferredGoogleDoc) {
    continuityLines.push(`8. Active Google Drive File/Doc: ${inferredGoogleDoc}`);
  }
  if (lastOperationStatus) {
    continuityLines.push(`9. Previous Operation / Confirmation Status: ${lastOperationStatus}`);
  }
  continuityLines.push(
    `CRITICAL CONTINUITY RULE: NEVER ask "কোন Repository?", "কোন কাজ?", "কিসের কথা বলছেন?", or ask the user to repeat information already present in the conversation history or active service context above. Directly answer and continue the workflow seamlessly using the resolved context!`
  );

  const directive = continuityLines.join('\n');
  const filesList = entities.files.slice(-10);

  return {
    isFollowUp,
    inferredService,
    activeService: inferredService,
    inferredSubject,
    inferredRepo,
    activeRepo: inferredRepo,
    inferredBranch,
    activeBranch: inferredBranch,
    inferredFiles: filesList,
    activeFiles: filesList,
    inferredVercelProject,
    inferredSupabaseTable,
    inferredGoogleDoc,
    lastOperationStatus,
    continuityDirective: directive,
    resolutionDirective: directive,
  };
}

/**
 * Generates an intelligent, lossless rolling summary of older conversation turns
 * when the conversation exceeds the recent message window.
 * Preserves all project names, repositories, file paths, decisions, and instructions.
 */
export function buildIntelligentConversationSummary(
  messages: Array<{ role: string; text?: string; content?: string }>,
  existingSummary = '',
  recentWindowSize?: number
): string {
  if (!messages || messages.length === 0) {
    return existingSummary || '';
  }

  const olderMessages =
    typeof recentWindowSize === 'number' && messages.length > recentWindowSize
      ? messages.slice(0, messages.length - recentWindowSize)
      : messages;

  if (olderMessages.length === 0) {
    return existingSummary || '';
  }

  const entities = extractConversationEntities(olderMessages);
  const turnDigests: string[] = [];

  for (let i = 0; i < olderMessages.length; i++) {
    const m = olderMessages[i];
    const txt = String(m.text ?? m.content ?? '')
      .replace(/⟦FILE:[^\n⟧]+⟧[\s\S]*?⟦\/FILE⟧/g, '[Attached File]')
      .replace(/\s+/g, ' ')
      .trim();
    if (!txt) continue;
    const speaker = m.role === 'user' ? 'User' : 'AI';
    turnDigests.push(`- ${speaker}: ${txt.slice(0, 260)}${txt.length > 260 ? '…' : ''}`);
  }

  const summaryParts: string[] = [];
  if (existingSummary && existingSummary.trim()) {
    summaryParts.push(existingSummary.trim().slice(0, 2500));
  }
  const firstUserTurn = olderMessages.find((m) => m.role === 'user');
  if (firstUserTurn) {
    const firstTxt = String(firstUserTurn.text ?? firstUserTurn.content ?? '').trim();
    if (firstTxt) {
      summaryParts.push(`Original Conversation Goal: ${firstTxt.slice(0, 260)}`);
    }
  }
  if (entities.repos.length > 0) {
    summaryParts.push(`Repositories Discussed: ${entities.repos.join(', ')}`);
  }
  if (entities.files.length > 0) {
    summaryParts.push(`Files Referenced: ${entities.files.join(', ')}`);
  }
  if (entities.importantDecisions.length > 0) {
    summaryParts.push(
      `Key User Instructions & Decisions:\n  • ${entities.importantDecisions.join('\n  • ')}`
    );
  }
  if (turnDigests.length > 0) {
    summaryParts.push(
      `Earlier Conversation Turns (${turnDigests.length} messages):\n${turnDigests.slice(-24).join('\n')}`
    );
  }

  return summaryParts.join('\n').slice(0, 8000);
}

/**
 * Retrieves relevant older turns from outside the recent message window when
 * the user's current prompt references keywords from earlier in a long conversation.
 */
export function retrieveRelevantOlderTurns(
  arg1: Array<{ role: string; text?: string; content?: string }> | string,
  arg2: string | Array<{ role: string; text?: string; content?: string }>,
  arg3 = 6,
  arg4 = 6
): Array<string & { text: string; role: string }> {
  const isQueryFirst = typeof arg1 === 'string';
  const currentQuery = isQueryFirst ? arg1 : (arg2 as string);
  const rawMessages = isQueryFirst
    ? (arg2 as Array<{ role: string; text?: string; content?: string }>)
    : arg1;
  const recentWindowSize = isQueryFirst ? arg3 : 0;
  const maxTurns = isQueryFirst ? arg4 : arg3;

  const olderMessages =
    recentWindowSize > 0 && rawMessages.length > recentWindowSize
      ? rawMessages.slice(0, rawMessages.length - recentWindowSize)
      : rawMessages;

  if (!olderMessages || olderMessages.length === 0 || !currentQuery.trim()) {
    return [];
  }

  const tokens = currentQuery
    .toLowerCase()
    .split(/[\s,।!?.:;'"()[\]]+/)
    .filter((t) => t.length >= 3);

  const attachMeta = (str: string, role: string): string & { text: string; role: string } => {
    const boxed = new String(str) as string & { text: string; role: string };
    boxed.text = str;
    boxed.role = role;
    return boxed;
  };

  if (tokens.length === 0) {
    return olderMessages
      .slice(-4)
      .map((m) =>
        attachMeta(
          `${m.role === 'user' ? 'User' : 'AI'}: ${String(m.text ?? m.content ?? '').slice(0, 350)}`,
          m.role
        )
      );
  }

  const scored: Array<{ idx: number; score: number; formatted: string; role: string }> = [];
  for (let i = 0; i < olderMessages.length; i++) {
    const m = olderMessages[i];
    const raw = String(m.text ?? m.content ?? '').trim();
    if (!raw) continue;
    const lower = raw.toLowerCase();
    let score = 0;
    for (const tk of tokens) {
      if (lower.includes(tk)) score += 3;
    }
    if (score > 0) {
      scored.push({
        idx: i,
        score,
        role: m.role,
        formatted: `[Turn #${i + 1}] ${m.role === 'user' ? 'User' : 'AI'}: ${raw.slice(0, 420)}`,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || b.idx - a.idx);
  return scored
    .slice(0, maxTurns)
    .sort((a, b) => a.idx - b.idx)
    .map((s) => attachMeta(s.formatted, s.role));
}

/**
 * Builds the complete 7-Layer Smart Conversation Context Envelope for any AI request.
 */
export function buildSmartConversationContext(params: {
  session?: ChatSession | null;
  allMessages?: ChatMessage[];
  messages?: ChatMessage[];
  currentPrompt?: string;
  existingSummary?: string;
  memoryFacts?: string[];
  recentWindowSize?: number;
  connections?: VaultConnections;
  serviceContext?: ChatServiceSelectionContext;
  activeTaskPlan?: TaskExecutionPlan | null;
  projectSummaryBlock?: string;
  activeProjectName?: string;
  activeProjectFilesCount?: number;
}): SmartConversationContextEnvelope {
  const {
    session,
    allMessages: rawAllMsgs,
    messages: rawMsgs,
    currentPrompt,
    existingSummary,
    memoryFacts = [],
    recentWindowSize = 24,
    connections,
    serviceContext,
    activeTaskPlan,
    projectSummaryBlock = '',
    activeProjectName,
    activeProjectFilesCount,
  } = params;

  const allMessages = rawAllMsgs || rawMsgs || [];
  const effectiveServiceContext = serviceContext || session?.serviceContext;
  const totalMsgs = allMessages.length;
  const splitIdx = Math.max(0, totalMsgs - recentWindowSize);
  const olderMsgs = allMessages.slice(0, splitIdx);
  const recentSlice = allMessages.slice(splitIdx);

  const currentQuery =
    currentPrompt || allMessages[allMessages.length - 1]?.text || '';
  const priorMessages =
    allMessages.length > 1 ? allMessages.slice(0, -1) : allMessages;

  // 1. Recent Message Context
  const recentMessages = recentSlice.map((m) => ({
    role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    text: m.text || '',
    imgs: m.imgs?.map((im) => ({ mime: im.mime, data: im.data })),
  }));

  // 2. Intelligent Conversation Summary + Retrieval from Older Turns
  const conversationSummary = buildIntelligentConversationSummary(
    olderMsgs,
    existingSummary ?? session?.conversationSummary ?? ''
  );
  const retrievedOlderTurns = retrieveRelevantOlderTurns(olderMsgs, currentQuery, 6);

  // 3. Important Decisions & Instructions in this Conversation
  const entities = extractConversationEntities(
    allMessages,
    effectiveServiceContext,
    connections
  );
  const importantDecisions = Array.from(
    new Set([
      ...(session?.importantDecisions || []),
      ...entities.importantDecisions,
      ...memoryFacts.slice(0, 8),
    ])
  ).slice(-12);

  // 4. Active Project Context
  const projectLines: string[] = [];
  if (effectiveServiceContext?.github?.owner && effectiveServiceContext?.github?.repo) {
    const branch = effectiveServiceContext.github.branch || 'main';
    projectLines.push(
      `Selected GitHub Repository: ${effectiveServiceContext.github.owner}/${effectiveServiceContext.github.repo}@${branch}`
    );
    if (effectiveServiceContext.github.selectedFiles?.length) {
      projectLines.push(
        `Selected Repository Files: ${effectiveServiceContext.github.selectedFiles.join(', ')}`
      );
    }
  } else if (connections?.github?.owner && connections?.github?.repo) {
    const branch = connections.github.branch || 'main';
    projectLines.push(
      `Connected GitHub Repository: ${connections.github.owner}/${connections.github.repo}@${branch}`
    );
  }
  if (activeProjectName) {
    projectLines.push(
      `Loaded ZIP Project: ${activeProjectName} (${activeProjectFilesCount || 0} files)`
    );
  }
  if (projectSummaryBlock) {
    projectLines.push(projectSummaryBlock);
  }
  const activeProjectContext = projectLines.length
    ? `[LAYER 4 — ACTIVE PROJECT & REPOSITORY CONTEXT]\n${projectLines.join('\n')}`
    : `[LAYER 4 — ACTIVE PROJECT & REPOSITORY CONTEXT]\nNo specific repository selected yet.`;

  // 5. Current Multi-Step Task Context
  let currentTaskContext = `[LAYER 5 — CURRENT MULTI-STEP TASK CONTEXT]\nNo multi-step task plan active.`;
  if (activeTaskPlan && activeTaskPlan.tasks.length > 0) {
    const taskLines = activeTaskPlan.tasks.map(
      (t, i) =>
        `  ${i + 1}. [${t.status.toUpperCase()}] ${t.title}${
          t.resultSnippet ? ` — ${t.resultSnippet}` : ''
        }`
    );
    currentTaskContext = `[LAYER 5 — CURRENT MULTI-STEP TASK CONTEXT]\nPlan: "${activeTaskPlan.goal}" (Status: ${activeTaskPlan.status.toUpperCase()})\n${taskLines.join('\n')}`;
  }

  // 6. Connected Service Context
  const serviceLines: string[] = [];
  if (connections) {
    const ghStatus = resolveConnectionStatus('github', connections);
    const vcStatus = resolveConnectionStatus('vercel', connections);
    const sbStatus = resolveConnectionStatus('supabase', connections);
    const ggStatus = resolveConnectionStatus('google', connections);
    serviceLines.push(
      `- GitHub: ${ghStatus.toUpperCase()}${
        connections.github.account ? ` (Account: ${connections.github.account})` : ''
      }${
        connections.github.owner && connections.github.repo
          ? ` · Repo: ${connections.github.owner}/${connections.github.repo}@${
              connections.github.branch || 'main'
            }`
          : ''
      }`
    );
    serviceLines.push(
      `- Vercel: ${vcStatus.toUpperCase()}${
        connections.vercel?.account ? ` (Account: ${connections.vercel.account})` : ''
      }${
        effectiveServiceContext?.vercel?.projectName || connections.vercel?.projectId
          ? ` · Project: ${
              effectiveServiceContext?.vercel?.projectName || connections.vercel?.projectId
            }`
          : ''
      }`
    );
    serviceLines.push(
      `- Supabase: ${sbStatus.toUpperCase()}${
        connections.supabase?.account ? ` (Project: ${connections.supabase.account})` : ''
      }${
        effectiveServiceContext?.supabase?.selectedTable
          ? ` · Selected Table: ${effectiveServiceContext.supabase.selectedTable}`
          : ''
      }`
    );
    serviceLines.push(
      `- Google Workspace (Drive/Docs/Sheets): ${ggStatus.toUpperCase()}${
        connections.drive.account ? ` (Account: ${connections.drive.account})` : ''
      }${
        effectiveServiceContext?.google?.selectedFileName
          ? ` · Selected File: ${effectiveServiceContext.google.selectedFileName}`
          : ''
      }`
    );
  }
  const connectedServiceContext = `[LAYER 6 — CONNECTED SERVICES LIVE STATUS]\n${
    serviceLines.length ? serviceLines.join('\n') : 'No connected services active.'
  }`;

  // 7. Pending Action & Follow-Up Resolution Context
  const followUpResolution = resolveFollowUpContext({
    currentQuery,
    priorMessages,
    serviceContext: effectiveServiceContext,
    connections,
  });

  const pendingOps = [...entities.pendingOperations];
  if (activeTaskPlan?.status === 'waiting_for_confirmation') {
    pendingOps.push(`Task plan "${activeTaskPlan.goal}" is Waiting for Confirmation`);
  }

  const pendingActionContext = `[LAYER 7 — PENDING ACTION & CONFIRMATION CONTEXT]\n${
    pendingOps.length > 0
      ? pendingOps.map((op) => `- ${op}`).join('\n')
      : 'No pending write confirmations.'
  }`;

  const layer2Block =
    conversationSummary || retrievedOlderTurns.length > 0
      ? `[LAYER 2 — CONVERSATION SUMMARY & RETRIEVED OLDER TURNS]\n${[
          conversationSummary,
          retrievedOlderTurns.map((t) => String(t)).join('\n'),
        ]
          .filter(Boolean)
          .join('\n')}`
      : '';

  const layer3Block = `[LAYER 3 — IMPORTANT INFORMATION & DECISIONS MEMORY]\n${
    importantDecisions.length > 0
      ? importantDecisions.map((d) => `- ${d}`).join('\n')
      : 'None recorded yet.'
  }`;

  const compiledBlocks = [
    `=== 7-LAYER SMART CONVERSATION & WORKSPACE CONTEXT ENVELOPE (v19.0.0) ===`,
    followUpResolution.continuityDirective,
    layer2Block,
    layer3Block,
    activeProjectContext,
    currentTaskContext,
    connectedServiceContext,
    pendingActionContext,
  ].filter(Boolean);

  const envelopeBlock = compiledBlocks.join('\n\n');

  return {
    recentMessages,
    conversationSummary,
    updatedSummary: conversationSummary,
    retrievedOlderTurns,
    importantDecisions,
    activeProjectContext,
    currentTaskContext,
    connectedServiceContext,
    pendingActionContext,
    pendingOperations: pendingOps,
    followUpResolution,
    resolvedFollowUp: followUpResolution,
    compiledContextPrompt: envelopeBlock,
    envelopeBlock,
  };
}

/**
 * Derives honest, operation-specific live streaming status labels (PART 12)
 * without exposing private chain-of-thought.
 */
export function deriveLiveOperationProgressSteps(
  arg1:
    | string
    | {
        prompt: string;
        activeService?: 'github' | 'vercel' | 'supabase' | 'google' | null;
        hasHistory?: boolean;
      },
  followUp?: FollowUpResolutionResult
): string[] {
  const query = typeof arg1 === 'string' ? arg1 : arg1.prompt;
  const service =
    typeof arg1 === 'string'
      ? followUp?.inferredService
      : arg1.activeService || followUp?.inferredService;
  const q = (query || '').toLowerCase();

  if (!service) {
    return [];
  }

  const steps: string[] = [];

  if (service === 'github') {
    steps.push('Connecting to GitHub...');
    steps.push('Loading Repository...');
    steps.push('Reading Source Files...');
    if (/(?:login|লগইন|auth)/i.test(q)) {
      steps.push('Analyzing Login System...');
    }
    if (/(?:fix|bug|বাগ|ঠিক|update|আপডেট|edit|পরিবর্তন)/i.test(q)) {
      steps.push('Preparing Code Changes...');
    }
  } else if (service === 'vercel') {
    steps.push('Connecting to Vercel...');
    steps.push('Checking Project & Deployment Status...');
    steps.push('Verifying Deployment...');
  } else if (service === 'supabase') {
    steps.push('Connecting to Supabase...');
    steps.push('Inspecting Database Schema & Tables...');
    if (/(?:create|alter|নতুন|তৈরি|migration)/i.test(q)) {
      steps.push('Preparing SQL Migration...');
    }
  } else if (service === 'google') {
    steps.push('Connecting to Google Workspace...');
    steps.push('Accessing Authorized Drive / Docs / Sheets...');
  }

  return steps;
}
