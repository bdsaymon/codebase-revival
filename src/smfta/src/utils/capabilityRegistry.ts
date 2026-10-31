export interface ToolCapabilityEntry {
  id: string;
  name: string;
  category: 'math' | 'search' | 'writing' | 'coding' | 'media' | 'storage' | 'connector';
  available: boolean;
  requiresConfirmation: boolean;
  executionTarget: 'server' | 'browser-sandbox' | 'client-vault';
  description: string;
  statusNote: string;
}

export interface WorkspaceRuntimeCapability {
  language: string;
  aliases: string[];
  mode: 'html-preview' | 'js-sandbox' | 'json-validator' | 'unsupported-runtime';
  executableInBrowser: boolean;
  description: string;
}

export const TOOL_CAPABILITY_REGISTRY: ReadonlyArray<ToolCapabilityEntry> = [
  {
    id: 'calculate',
    name: 'Safe AST Math Calculator',
    category: 'math',
    available: true,
    requiresConfirmation: false,
    executionTarget: 'server',
    description: 'Deterministic recursive-descent arithmetic & scientific math evaluator (no eval).',
    statusNote: 'Operational on server (/api/execute-tool)',
  },
  {
    id: 'web_search',
    name: 'Live Web Search (DuckDuckGo Instant Answer)',
    category: 'search',
    available: true,
    requiresConfirmation: false,
    executionTarget: 'server',
    description: 'Queries DuckDuckGo Instant Answer JSON API with timeout and sanitized output.',
    statusNote: 'Operational on server (/api/execute-tool)',
  },
  {
    id: 'web_browse',
    name: 'Real-Time Web Page Inspector & Scraper',
    category: 'search',
    available: true,
    requiresConfirmation: false,
    executionTarget: 'server',
    description: 'Fetches live web pages over HTTPS, strips scripts/markup, and extracts main readable text, headings, and metadata.',
    statusNote: 'Operational on server (/api/execute-tool)',
  },
  {
    id: 'web_fetch',
    name: 'Real-Time Live HTTP Fetcher',
    category: 'search',
    available: true,
    requiresConfirmation: false,
    executionTarget: 'server',
    description: 'Retrieves live JSON APIs and public web content in real time with SSRF protection.',
    statusNote: 'Operational on server (/api/execute-tool)',
  },
  {
    id: 'summarize',
    name: 'Document Summarizer',
    category: 'writing',
    available: true,
    requiresConfirmation: false,
    executionTarget: 'server',
    description: 'Summarizes long passages into concise bullet points in Bengali or English.',
    statusNote: 'Operational via active AI provider',
  },
  {
    id: 'code_review',
    name: 'Static Code Reviewer',
    category: 'coding',
    available: true,
    requiresConfirmation: false,
    executionTarget: 'server',
    description: 'Analyzes code for security, logic bugs, and performance improvements.',
    statusNote: 'Operational via active AI provider',
  },
  {
    id: 'task_breakdown',
    name: 'Actionable Task Breakdown',
    category: 'writing',
    available: true,
    requiresConfirmation: false,
    executionTarget: 'server',
    description: 'Converts goals into step-by-step checklists.',
    statusNote: 'Operational via active AI provider',
  },
  {
    id: 'inline_rewrite',
    name: 'Co-Writer Inline Rewrite',
    category: 'writing',
    available: true,
    requiresConfirmation: false,
    executionTarget: 'server',
    description: 'Rewrites highlighted paragraphs with structured JSON output validation.',
    statusNote: 'Operational on server (/api/inline-rewrite)',
  },
  {
    id: 'generate_image',
    name: 'AI Image Generation',
    category: 'media',
    available: true,
    requiresConfirmation: false,
    executionTarget: 'server',
    description: 'Generates images from text prompts via Pollinations endpoint.',
    statusNote: 'Operational on server (/api/generate-image)',
  },
  {
    id: 'create_note',
    name: 'Notebook Note Creation',
    category: 'storage',
    available: true,
    requiresConfirmation: true,
    executionTarget: 'server',
    description: 'Creates or updates a persisted note after one-time user confirmation.',
    statusNote: 'Operational (confirmation-gated)',
  },
  {
    id: 'delete_note',
    name: 'Notebook Note Deletion',
    category: 'storage',
    available: true,
    requiresConfirmation: true,
    executionTarget: 'server',
    description: 'Deletes a persisted note after one-time user confirmation.',
    statusNote: 'Operational (confirmation-gated)',
  },
  {
    id: 'send_webhook',
    name: 'Outgoing Webhook Dispatch',
    category: 'connector',
    available: true,
    requiresConfirmation: true,
    executionTarget: 'server',
    description: 'Sends SSRF-checked POST payloads to user-confirmed HTTPS endpoints.',
    statusNote: 'Operational (SSRF-guarded & confirmation-gated)',
  },
  {
    id: 'github_integration',
    name: 'GitHub Repository & Code Manager',
    category: 'connector',
    available: true,
    requiresConfirmation: true,
    executionTarget: 'server',
    description: 'Reads repositories, branches, files, commits, and PRs; creates/edits/deletes files, branches, and merges PRs after confirmation.',
    statusNote: 'Operational (/api/integrations/action)',
  },
  {
    id: 'vercel_integration',
    name: 'Vercel Project & Deployment Manager',
    category: 'connector',
    available: true,
    requiresConfirmation: true,
    executionTarget: 'server',
    description: 'Inspects Vercel projects, domains, deployments, build logs, and masked env vars; triggers Preview/Production deployments with confirmation.',
    statusNote: 'Operational (/api/integrations/action)',
  },
  {
    id: 'supabase_integration',
    name: 'Supabase Database & Schema Assistant',
    category: 'connector',
    available: true,
    requiresConfirmation: true,
    executionTarget: 'server',
    description: 'Explores database schemas, tables, columns, and relationships; queries data and executes approved SQL migrations with confirmation.',
    statusNote: 'Operational (/api/integrations/action)',
  },
  {
    id: 'google_workspace_integration',
    name: 'Google Drive, Docs & Sheets Connector',
    category: 'connector',
    available: true,
    requiresConfirmation: true,
    executionTarget: 'server',
    description: 'Lists and searches Google Drive files, reads/creates/edits Google Docs, and reads/updates Google Sheets with scope verification.',
    statusNote: 'Operational (/api/integrations/action)',
  },
];

export const WORKSPACE_RUNTIME_CAPABILITIES: ReadonlyArray<WorkspaceRuntimeCapability> = [
  {
    language: 'html',
    aliases: ['html', 'htm', 'svg', 'xml', 'css'],
    mode: 'html-preview',
    executableInBrowser: true,
    description: 'Runs in an isolated sandboxed iframe (sandbox="allow-scripts", no same-origin access) when you click Run.',
  },
  {
    language: 'javascript',
    aliases: ['javascript', 'js', 'mjs', 'jsx', 'typescript', 'ts', 'tsx'],
    mode: 'js-sandbox',
    executableInBrowser: true,
    description: 'Runs inside an isolated sandboxed iframe worker frame with console & runtime error capture when you click Run.',
  },
  {
    language: 'json',
    aliases: ['json'],
    mode: 'json-validator',
    executableInBrowser: true,
    description: 'Validates and formats JSON structure deterministically when you click Run.',
  },
  {
    language: 'python',
    aliases: ['python', 'py', 'sql', 'bash', 'sh', 'shell', 'c', 'cpp', 'c++', 'rust', 'rs', 'go', 'golang', 'java', 'php', 'ruby'],
    mode: 'unsupported-runtime',
    executableInBrowser: false,
    description: 'No isolated server-side container runtime is configured for this language. Code editing, formatting, copy, and file download are available.',
  },
];

export const DEFAULT_ENABLED_TOOLS: Record<string, boolean> = Object.fromEntries(
  TOOL_CAPABILITY_REGISTRY.map((t) => [t.id, true])
);

export function isToolEnabled(
  toolName: string,
  enabledTools?: Record<string, boolean>
): boolean {
  const normalized = String(toolName || '').trim().toLowerCase();
  const canonical = normalized === 'math' ? 'calculate' : normalized === 'search' ? 'web_search' : normalized;
  if (!enabledTools || typeof enabledTools !== 'object') {
    return true;
  }
  if (canonical in enabledTools) {
    return Boolean(enabledTools[canonical]);
  }
  return true;
}
