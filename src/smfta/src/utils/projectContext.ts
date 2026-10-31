/**
 * SMFTA AI Pro — Project Context & Architectural Memory Engine (v19.1.0)
 *
 * Keeps track of:
 * - Active project specification (files, stack, database, routes)
 * - Key architectural decisions & constraints
 * - Task progress checklist (completed vs pending steps)
 * - Safe environment variable declarations (keys only, values redacted)
 * - Context prompt generation for multi-turn AI coding continuity
 */

export interface ProjectTaskItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  notes?: string;
}

export interface ProjectArchitecturalDecision {
  id: string;
  title: string;
  rationale: string;
  timestamp: string;
}

export interface ActiveProjectContext {
  id: string;
  name: string;
  title: string;
  techStack: string[];
  files: Array<{ path: string; purpose: string; linesCount?: number }>;
  decisions: ProjectArchitecturalDecision[];
  tasks: ProjectTaskItem[];
  envVarKeys: string[];
  lastModified: number;
}

export const PROJECT_CONTEXT_STORAGE_KEY = 'smfta_active_project_context';

export const DEFAULT_PROJECT_CONTEXT: ActiveProjectContext = {
  id: 'proj_default',
  name: 'smfta-fullstack-app',
  title: 'SMFTA Intelligent Full-Stack App',
  techStack: ['React', 'TypeScript', 'Node.js/Express', 'PostgreSQL/SQLite', 'Tailwind CSS'],
  files: [
    { path: 'index.html', purpose: 'Responsive frontend storefront and reactive UI components' },
    { path: 'server.js', purpose: 'Express REST API with authentication & CRUD routes' },
    { path: 'schema.sql', purpose: 'Relational database schema DDL with indexes & seed data' },
    { path: 'package.json', purpose: 'Project dependencies and build scripts' },
    { path: 'Dockerfile', purpose: 'Containerized deployment setup' },
  ],
  decisions: [
    {
      id: 'dec_1',
      title: 'Unified Full-Stack Architecture',
      rationale: 'Modular frontend with decoupled REST backend API and relational SQL database.',
      timestamp: new Date().toISOString(),
    },
    {
      id: 'dec_2',
      title: 'Zero-Secret Client Keystore',
      rationale: 'All API keys and secrets stay safely encrypted on client or server proxy.',
      timestamp: new Date().toISOString(),
    },
  ],
  tasks: [
    { id: 'task_1', title: 'Define PostgreSQL schema and seed data', status: 'completed' },
    { id: 'task_2', title: 'Implement Express REST API routes and auth middleware', status: 'completed' },
    { id: 'task_3', title: 'Build responsive client UI and interactive admin panel', status: 'completed' },
    { id: 'task_4', title: 'Integrate safe command terminal and build checks', status: 'in_progress' },
    { id: 'task_5', title: 'Test production deployment and container export', status: 'pending' },
  ],
  envVarKeys: ['PORT', 'DATABASE_URL', 'JWT_SECRET', 'ADMIN_EMAIL'],
  lastModified: Date.now(),
};

export function loadProjectContext(): ActiveProjectContext {
  if (typeof window === 'undefined') return DEFAULT_PROJECT_CONTEXT;
  try {
    const raw = localStorage.getItem(PROJECT_CONTEXT_STORAGE_KEY);
    if (!raw) return DEFAULT_PROJECT_CONTEXT;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.id && Array.isArray(parsed.files)) {
      return parsed as ActiveProjectContext;
    }
  } catch {
    // fallback
  }
  return DEFAULT_PROJECT_CONTEXT;
}

export function saveProjectContext(context: ActiveProjectContext): void {
  if (typeof window === 'undefined') return;
  try {
    const sanitized: ActiveProjectContext = {
      ...context,
      lastModified: Date.now(),
      // Ensure no raw tokens or keys leak into context
      envVarKeys: context.envVarKeys.map((k) => k.replace(/[^A-Z0-9_]/gi, '')).filter(Boolean),
    };
    localStorage.setItem(PROJECT_CONTEXT_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // quota exceeded or private mode
  }
}

export function clearProjectContext(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PROJECT_CONTEXT_STORAGE_KEY);
  } catch {}
}

/**
 * Compiles active project context into a high-density, concise prompt block
 * for the AI backend so it maintains context across conversation turns.
 */
export function compileProjectContextPrompt(context: ActiveProjectContext): string {
  const parts: string[] = [];
  parts.push(`[ACTIVE PROJECT CONTEXT: "${context.title}" (${context.name})]`);
  parts.push(`Tech Stack: ${context.techStack.join(', ')}`);

  if (context.files.length > 0) {
    parts.push('Files in Project:');
    context.files.forEach((f) => {
      parts.push(`  - ${f.path}: ${f.purpose}`);
    });
  }

  if (context.decisions.length > 0) {
    parts.push('Architectural Decisions:');
    context.decisions.slice(-3).forEach((d) => {
      parts.push(`  - ${d.title}: ${d.rationale}`);
    });
  }

  const completedTasks = context.tasks.filter((t) => t.status === 'completed').length;
  parts.push(`Progress: ${completedTasks}/${context.tasks.length} tasks completed.`);

  return parts.join('\n');
}
