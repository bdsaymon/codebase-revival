import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Folder,
  FileCode2,
  GitBranch,
  RefreshCw,
  Search,
  Sparkles,
  ExternalLink,
  Play,
  Table,
  FileText,
  FileSpreadsheet,
  ShieldAlert,
  X,
  Loader2,
  Link2,
  Check,
  Terminal,
  Edit3,
} from 'lucide-react';
import { GithubIcon } from './icons/GithubIcon';
import { ChatServiceSelectionContext } from '../types';
import {
  VaultConnections,
  IntegrationProviderId,
  executeIntegrationAction,
  resolveConnectionStatus,
  GOOGLE_WORKSPACE_SCOPES,
} from '../utils/cloudVault';

export interface ChatConnectedServicesToolbarProps {
  connections: VaultConnections;
  onChangeConnections: (next: VaultConnections) => void;
  serviceContext?: ChatServiceSelectionContext;
  onChangeServiceContext: (next: ChatServiceSelectionContext) => void;
  onQuickPrompt: (promptText: string, updatedContext?: ChatServiceSelectionContext) => void;
  onOpenIntegrationsHub: () => void;
  notify: (msg: string) => void;
}

const VercelIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 2L2 21h20L12 2z" />
  </svg>
);

const SupabaseIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M13.5 2.5L4.5 14h6.5l-.5 7.5 9-11.5h-6.5l.5-7.5z"
      fill="#3ECF8E"
      stroke="#3ECF8E"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

const GoogleDriveIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      fill="#4285F4"
      d="M21.35 11.1h-9.17v2.73h6.51c-.33 1.81-1.5 3.34-3.2 4.37v3.62h5.18c3.03-2.79 4.78-6.9 4.78-11.72 0-.8-.08-1.57-.23-2.3z"
    />
    <path
      fill="#34A853"
      d="M12.18 22c4.32 0 7.95-1.43 10.6-3.88l-5.18-3.62c-1.43.96-3.26 1.53-5.42 1.53-4.17 0-7.7-2.81-8.96-6.6H-2.1v3.73C.54 18.4 5.94 22 12.18 22z"
    />
    <path
      fill="#FBBC05"
      d="M3.22 9.43A9.55 9.55 0 0 1 2.72 6.4c0-1.05.18-2.07.5-3.03V-.36H-2.1A15.96 15.96 0 0 0-3.82 6.4c0 2.58.62 5.02 1.72 7.16l5.32-4.13z"
    />
    <path
      fill="#EA4335"
      d="M12.18 2.77c2.35 0 4.46.81 6.12 2.4l4.59-4.59C20.12-1.99 16.5-.6 12.18-.6 5.94-.6.54 3-2.1 8.24l5.32 4.13c1.26-3.79 4.79-6.6 8.96-6.6z"
    />
  </svg>
);

interface PendingConfirmAction {
  provider: IntegrationProviderId;
  action: string;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  onSuccess: (data: any) => void;
}

export const ChatConnectedServicesToolbar: React.FC<ChatConnectedServicesToolbarProps> = ({
  connections,
  onChangeConnections,
  serviceContext,
  onChangeServiceContext,
  onQuickPrompt,
  onOpenIntegrationsHub,
  notify,
}) => {
  const [openDrawer, setOpenDrawer] = useState<IntegrationProviderId | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmAction | null>(null);

  // GitHub state
  const [ghRepos, setGhRepos] = useState<any[]>([]);
  const [ghRepoQuery, setGhRepoQuery] = useState('');
  const [ghBranches, setGhBranches] = useState<any[]>([]);
  const [ghFiles, setGhFiles] = useState<any[]>([]);
  const [ghCurrentPath, setGhCurrentPath] = useState('');
  const [ghViewingFile, setGhViewingFile] = useState<{
    path: string;
    content: string;
    sha?: string;
  } | null>(null);
  const [ghEditCommitMsg, setGhEditCommitMsg] = useState('fix: update via SMFTA AI Pro chatbox');

  // Vercel state
  const [vcProjects, setVcProjects] = useState<any[]>([]);
  const [vcDeployments, setVcDeployments] = useState<any[]>([]);
  const [vcLogsDeploymentId, setVcLogsDeploymentId] = useState<string | null>(null);
  const [vcBuildLogs, setVcBuildLogs] = useState<any[]>([]);

  // Supabase state
  const [sbTables, setSbTables] = useState<any[]>([]);
  const [sbSqlQuery, setSbSqlQuery] = useState('');
  const [sbSqlResult, setSbSqlResult] = useState<any | null>(null);

  // Google Drive state
  const [gdFiles, setGdFiles] = useState<any[]>([]);
  const [gdSearch, setGdSearch] = useState('');
  const [gdPreviewText, setGdPreviewText] = useState<{ title: string; content: string } | null>(
    null
  );

  const ghStatus = resolveConnectionStatus('github', connections);
  const vcStatus = resolveConnectionStatus('vercel', connections);
  const sbStatus = resolveConnectionStatus('supabase', connections);
  const gdStatus = resolveConnectionStatus('google', connections);

  const isConnected = (status: string) =>
    status === 'connected' || status === 'permission_required';

  const currentCtx: ChatServiceSelectionContext = serviceContext || {
    activeService: null,
    updatedAt: Date.now(),
  };

  // Trigger 1-Click Direct OAuth from Chatbox if service is not connected
  const triggerDirectOAuth = async (provider: IntegrationProviderId) => {
    setLoadingAction(`${provider}-oauth`);
    try {
      const res = await fetch(
        `/api/oauth/url?provider=${encodeURIComponent(provider)}&scope=${encodeURIComponent(
          provider === 'google' ? GOOGLE_WORKSPACE_SCOPES.join(' ') : ''
        )}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        notify(
          data.error ||
            `${provider.toUpperCase()} OAuth ইন্টিগ্রেশন প্যানেল খোলা হচ্ছে...`
        );
        onOpenIntegrationsHub();
        return;
      }
      const width = 560;
      const height = 680;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      window.open(
        data.url,
        `smfta_oauth_${provider}`,
        `width=${width},height=${height},left=${left},top=${top},noopener=no`
      );
    } catch {
      onOpenIntegrationsHub();
    } finally {
      setLoadingAction(null);
    }
  };

  const runServiceAction = useCallback(
    async (
      provider: IntegrationProviderId,
      action: string,
      payload: Record<string, unknown>,
      onSuccess: (data: any) => void,
      confirmMeta?: { title: string; description: string }
    ) => {
      setLoadingAction(`${provider}-${action}`);
      try {
        const token =
          provider === 'github'
            ? connections.github.token
            : provider === 'vercel'
              ? connections.vercel?.token
              : provider === 'supabase'
                ? connections.supabase?.managementToken
                : connections.drive.accessToken;

        const res = await executeIntegrationAction({
          provider,
          action,
          token,
          confirmed: false,
          payload,
        });

        if (res.requiresConfirmation) {
          setPendingConfirm({
            provider,
            action,
            title: confirmMeta?.title || `Confirm ${provider.toUpperCase()} · ${action}`,
            description:
              res.message ||
              confirmMeta?.description ||
              'এই পরিবর্তনটি সরাসরি সংযুক্ত সার্ভিসে কার্যকর হবে। আপনি কি নিশ্চিত?',
            payload,
            onSuccess,
          });
          return;
        }

        if (!res.ok) {
          notify(res.error || `${provider.toUpperCase()} action failed`);
          return;
        }

        onSuccess(res.data ?? res);
      } finally {
        setLoadingAction(null);
      }
    },
    [connections, notify]
  );

  const handleConfirmPending = async () => {
    if (!pendingConfirm) return;
    setLoadingAction(`${pendingConfirm.provider}-confirm`);
    try {
      const { provider, action, payload, onSuccess } = pendingConfirm;
      const token =
        provider === 'github'
          ? connections.github.token
          : provider === 'vercel'
            ? connections.vercel?.token
            : provider === 'supabase'
              ? connections.supabase?.managementToken
              : connections.drive.accessToken;

      const res = await executeIntegrationAction({
        provider,
        action,
        token,
        confirmed: true,
        payload,
      });

      if (!res.ok) {
        notify(res.error || 'Operation failed');
      } else {
        notify(`${provider.toUpperCase()}: অপারেশন সফলভাবে সম্পন্ন হয়েছে।`);
        onSuccess(res.data ?? res);
      }
      setPendingConfirm(null);
    } finally {
      setLoadingAction(null);
    }
  };

  // Load initial resources when drawer opens
  const loadGithubResources = useCallback(
    (ownerOverride?: string, repoOverride?: string, branchOverride?: string, path = '') => {
      const owner = ownerOverride || currentCtx.github?.owner || connections.github.owner;
      const repo = repoOverride || currentCtx.github?.repo || connections.github.repo;
      const branch =
        branchOverride || currentCtx.github?.branch || connections.github.branch || 'main';

      void runServiceAction(
        'github',
        ghRepoQuery.trim() ? 'search_repos' : 'list_repos',
        { owner, query: ghRepoQuery.trim(), visibility: 'all' },
        (data) => {
          setGhRepos(data.repos || []);
        }
      );

      if (owner && repo) {
        void runServiceAction('github', 'list_branches', { owner, repo }, (data) => {
          setGhBranches(data.branches || []);
        });
        void runServiceAction(
          'github',
          'list_contents',
          { owner, repo, branch, path },
          (data) => {
            setGhCurrentPath(path);
            setGhFiles(data.items || []);
          }
        );
      }
    },
    [
      runServiceAction,
      ghRepoQuery,
      currentCtx.github?.owner,
      currentCtx.github?.repo,
      currentCtx.github?.branch,
      connections.github.owner,
      connections.github.repo,
      connections.github.branch,
    ]
  );

  const loadVercelResources = useCallback(
    (projectIdOverride?: string) => {
      const pid = projectIdOverride || currentCtx.vercel?.projectId || connections.vercel?.projectId;
      void runServiceAction(
        'vercel',
        'list_projects',
        { teamId: connections.vercel?.teamId },
        (data) => {
          setVcProjects(data.projects || []);
        }
      );
      void runServiceAction(
        'vercel',
        'list_deployments',
        { projectId: pid || undefined, teamId: connections.vercel?.teamId },
        (data) => {
          setVcDeployments(data.deployments || []);
        }
      );
    },
    [
      runServiceAction,
      currentCtx.vercel?.projectId,
      connections.vercel?.projectId,
      connections.vercel?.teamId,
    ]
  );

  const loadSupabaseResources = useCallback(() => {
    void runServiceAction(
      'supabase',
      'inspect_schema',
      {
        projectUrl: connections.supabase?.projectUrl,
        anonKey: connections.supabase?.anonKey,
        serviceRoleKey: connections.supabase?.serviceRoleKey,
        projectRef: currentCtx.supabase?.projectRef || connections.supabase?.projectRef,
      },
      (data) => {
        setSbTables(data.tables || []);
      }
    );
  }, [
    runServiceAction,
    connections.supabase?.projectUrl,
    connections.supabase?.anonKey,
    connections.supabase?.serviceRoleKey,
    connections.supabase?.projectRef,
    currentCtx.supabase?.projectRef,
  ]);

  const loadGoogleResources = useCallback(() => {
    void runServiceAction(
      'google',
      gdSearch.trim() ? 'search_drive_files' : 'list_drive_files',
      { query: gdSearch.trim() },
      (data) => {
        setGdFiles(data.files || []);
      }
    );
  }, [runServiceAction, gdSearch]);

  useEffect(() => {
    if (openDrawer === 'github' && isConnected(ghStatus)) {
      loadGithubResources();
    } else if (openDrawer === 'vercel' && isConnected(vcStatus)) {
      loadVercelResources();
    } else if (openDrawer === 'supabase' && isConnected(sbStatus)) {
      loadSupabaseResources();
    } else if (openDrawer === 'google' && isConnected(gdStatus)) {
      loadGoogleResources();
    }
  }, [openDrawer]);

  const handlePillClick = (provider: IntegrationProviderId) => {
    const status =
      provider === 'github'
        ? ghStatus
        : provider === 'vercel'
          ? vcStatus
          : provider === 'supabase'
            ? sbStatus
            : gdStatus;

    if (!isConnected(status)) {
      void triggerDirectOAuth(provider);
      return;
    }

    if (openDrawer === provider) {
      setOpenDrawer(null);
    } else {
      setOpenDrawer(provider);
      onChangeServiceContext({
        ...currentCtx,
        activeService: provider,
        updatedAt: Date.now(),
      });
    }
  };

  const handleSelectGithubRepo = (fullName: string, defaultBranch = 'main') => {
    const [owner, repo] = fullName.split('/');
    if (!owner || !repo) return;
    const nextCtx: ChatServiceSelectionContext = {
      ...currentCtx,
      activeService: 'github',
      github: {
        owner,
        repo,
        branch: defaultBranch,
        selectedFiles: [],
      },
      updatedAt: Date.now(),
    };
    onChangeServiceContext(nextCtx);
    onChangeConnections({
      ...connections,
      github: {
        ...connections.github,
        owner,
        repo,
        branch: defaultBranch,
      },
    });
    loadGithubResources(owner, repo, defaultBranch, '');
  };

  const handleSelectGithubBranch = (branch: string) => {
    const owner = currentCtx.github?.owner || connections.github.owner;
    const repo = currentCtx.github?.repo || connections.github.repo;
    if (!owner || !repo) return;
    const nextCtx: ChatServiceSelectionContext = {
      ...currentCtx,
      activeService: 'github',
      github: {
        owner,
        repo,
        branch,
        selectedFiles: currentCtx.github?.selectedFiles || [],
      },
      updatedAt: Date.now(),
    };
    onChangeServiceContext(nextCtx);
    onChangeConnections({
      ...connections,
      github: {
        ...connections.github,
        branch,
      },
    });
    loadGithubResources(owner, repo, branch, ghCurrentPath);
  };

  const handleToggleGithubFileSelection = (filePath: string) => {
    const owner = currentCtx.github?.owner || connections.github.owner;
    const repo = currentCtx.github?.repo || connections.github.repo;
    const branch = currentCtx.github?.branch || connections.github.branch || 'main';
    const existing = currentCtx.github?.selectedFiles || [];
    const nextFiles = existing.includes(filePath)
      ? existing.filter((f) => f !== filePath)
      : [...existing, filePath];
    onChangeServiceContext({
      ...currentCtx,
      activeService: 'github',
      github: {
        owner,
        repo,
        branch,
        selectedFiles: nextFiles,
      },
      updatedAt: Date.now(),
    });
  };

  const handleReadGithubFile = (filePath: string) => {
    const owner = currentCtx.github?.owner || connections.github.owner;
    const repo = currentCtx.github?.repo || connections.github.repo;
    const branch = currentCtx.github?.branch || connections.github.branch || 'main';
    if (!owner || !repo) return;
    void runServiceAction(
      'github',
      'read_file',
      { owner, repo, branch, path: filePath },
      (data) => {
        setGhViewingFile({
          path: data.path || filePath,
          content: data.content || '',
          sha: data.sha,
        });
      }
    );
  };

  const handleSaveGithubFile = () => {
    if (!ghViewingFile) return;
    const owner = currentCtx.github?.owner || connections.github.owner;
    const repo = currentCtx.github?.repo || connections.github.repo;
    const branch = currentCtx.github?.branch || connections.github.branch || 'main';
    void runServiceAction(
      'github',
      'update_file',
      {
        owner,
        repo,
        branch,
        path: ghViewingFile.path,
        content: ghViewingFile.content,
        sha: ghViewingFile.sha,
        message: ghEditCommitMsg || `Update ${ghViewingFile.path}`,
      },
      () => {
        setGhViewingFile(null);
      },
      {
        title: `Confirm GitHub Commit · ${ghViewingFile.path}`,
        description: `${owner}/${repo} (${branch})-এ "${ghViewingFile.path}" ফাইলটি আপডেট ও কমিট করা হবে। আপনি কি নিশ্চিত?`,
      }
    );
  };

  const activeGhOwner = currentCtx.github?.owner || connections.github.owner;
  const activeGhRepo = currentCtx.github?.repo || connections.github.repo;
  const activeGhBranch = currentCtx.github?.branch || connections.github.branch || 'main';
  const selectedGhFiles = currentCtx.github?.selectedFiles || [];

  const activeVcProject =
    currentCtx.vercel?.projectName ||
    currentCtx.vercel?.projectId ||
    connections.vercel?.projectId ||
    '';

  const activeSbTable = currentCtx.supabase?.selectedTable || '';
  const activeGdFile = currentCtx.google?.selectedFileName || '';

  return (
    <div
      className="w-full mb-2 select-none"
      data-testid="chat-connected-services-toolbar"
    >
      {/* Top Pill Bar: Connected Services: [GitHub] [Vercel] [Supabase] [Google Drive] */}
      <div className="flex items-center gap-1.5 flex-wrap px-1 py-1">
        <span className="text-[11px] font-medium text-[var(--text-3)] flex items-center gap-1 mr-1">
          <Link2 className="w-3 h-3 text-[var(--accent)]" />
          <span>Connected Services:</span>
        </span>

        {/* 1. GitHub Pill */}
        <button
          type="button"
          onClick={() => handlePillClick('github')}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
            openDrawer === 'github' || currentCtx.activeService === 'github'
              ? 'bg-[var(--accent)]/15 text-[var(--text)] border-[var(--accent)]/50 shadow-sm'
              : isConnected(ghStatus)
                ? 'bg-[var(--surface-2)] text-[var(--text-2)] border-emerald-500/30 hover:border-emerald-500/60'
                : 'bg-[var(--surface)] text-[var(--text-3)] border-[var(--border)] hover:text-[var(--text-2)]'
          }`}
          title={
            isConnected(ghStatus)
              ? `GitHub Connected (${connections.github.account || 'active'})`
              : 'Click to Connect GitHub'
          }
        >
          <GithubIcon className="w-3.5 h-3.5" />
          <span>GitHub</span>
          {activeGhOwner && activeGhRepo && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/20 text-emerald-300 truncate max-w-[130px]">
              {activeGhRepo}@{activeGhBranch}
            </span>
          )}
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              ghStatus === 'connected'
                ? 'bg-emerald-400'
                : ghStatus === 'permission_required'
                  ? 'bg-amber-400'
                  : 'bg-zinc-500'
            }`}
          />
          {isConnected(ghStatus) &&
            (openDrawer === 'github' ? (
              <ChevronUp className="w-3 h-3 opacity-70" />
            ) : (
              <ChevronDown className="w-3 h-3 opacity-70" />
            ))}
        </button>

        {/* 2. Vercel Pill */}
        <button
          type="button"
          onClick={() => handlePillClick('vercel')}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
            openDrawer === 'vercel' || currentCtx.activeService === 'vercel'
              ? 'bg-[var(--accent)]/15 text-[var(--text)] border-[var(--accent)]/50 shadow-sm'
              : isConnected(vcStatus)
                ? 'bg-[var(--surface-2)] text-[var(--text-2)] border-emerald-500/30 hover:border-emerald-500/60'
                : 'bg-[var(--surface)] text-[var(--text-3)] border-[var(--border)] hover:text-[var(--text-2)]'
          }`}
          title={
            isConnected(vcStatus)
              ? `Vercel Connected (${connections.vercel?.account || 'active'})`
              : 'Click to Connect Vercel'
          }
        >
          <VercelIcon className="w-3 h-3" />
          <span>Vercel</span>
          {activeVcProject && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/20 text-sky-300 truncate max-w-[110px]">
              {activeVcProject}
            </span>
          )}
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              vcStatus === 'connected'
                ? 'bg-emerald-400'
                : vcStatus === 'permission_required'
                  ? 'bg-amber-400'
                  : 'bg-zinc-500'
            }`}
          />
          {isConnected(vcStatus) &&
            (openDrawer === 'vercel' ? (
              <ChevronUp className="w-3 h-3 opacity-70" />
            ) : (
              <ChevronDown className="w-3 h-3 opacity-70" />
            ))}
        </button>

        {/* 3. Supabase Pill */}
        <button
          type="button"
          onClick={() => handlePillClick('supabase')}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
            openDrawer === 'supabase' || currentCtx.activeService === 'supabase'
              ? 'bg-[var(--accent)]/15 text-[var(--text)] border-[var(--accent)]/50 shadow-sm'
              : isConnected(sbStatus)
                ? 'bg-[var(--surface-2)] text-[var(--text-2)] border-emerald-500/30 hover:border-emerald-500/60'
                : 'bg-[var(--surface)] text-[var(--text-3)] border-[var(--border)] hover:text-[var(--text-2)]'
          }`}
          title={
            isConnected(sbStatus)
              ? `Supabase Connected (${connections.supabase?.account || 'active'})`
              : 'Click to Connect Supabase'
          }
        >
          <SupabaseIcon className="w-3.5 h-3.5" />
          <span>Supabase</span>
          {activeSbTable && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/20 text-emerald-300 truncate max-w-[110px]">
              {activeSbTable}
            </span>
          )}
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              sbStatus === 'connected'
                ? 'bg-emerald-400'
                : sbStatus === 'permission_required'
                  ? 'bg-amber-400'
                  : 'bg-zinc-500'
            }`}
          />
          {isConnected(sbStatus) &&
            (openDrawer === 'supabase' ? (
              <ChevronUp className="w-3 h-3 opacity-70" />
            ) : (
              <ChevronDown className="w-3 h-3 opacity-70" />
            ))}
        </button>

        {/* 4. Google Drive Pill */}
        <button
          type="button"
          onClick={() => handlePillClick('google')}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
            openDrawer === 'google' || currentCtx.activeService === 'google'
              ? 'bg-[var(--accent)]/15 text-[var(--text)] border-[var(--accent)]/50 shadow-sm'
              : isConnected(gdStatus)
                ? 'bg-[var(--surface-2)] text-[var(--text-2)] border-emerald-500/30 hover:border-emerald-500/60'
                : 'bg-[var(--surface)] text-[var(--text-3)] border-[var(--border)] hover:text-[var(--text-2)]'
          }`}
          title={
            isConnected(gdStatus)
              ? `Google Drive Connected (${connections.drive.account || 'active'})`
              : 'Click to Connect Google Drive'
          }
        >
          <GoogleDriveIcon className="w-3.5 h-3.5" />
          <span>Google Drive</span>
          {activeGdFile && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/20 text-amber-300 truncate max-w-[110px]">
              {activeGdFile}
            </span>
          )}
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              gdStatus === 'connected'
                ? 'bg-emerald-400'
                : gdStatus === 'permission_required'
                  ? 'bg-amber-400'
                  : 'bg-zinc-500'
            }`}
          />
          {isConnected(gdStatus) &&
            (openDrawer === 'google' ? (
              <ChevronUp className="w-3 h-3 opacity-70" />
            ) : (
              <ChevronDown className="w-3 h-3 opacity-70" />
            ))}
        </button>

        {loadingAction && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] ml-auto">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Syncing...</span>
          </span>
        )}
      </div>

      {/* Confirmation Modal inside Chatbox Selector */}
      {pendingConfirm && (
        <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{pendingConfirm.title}</span>
            </div>
            <button
              type="button"
              onClick={() => setPendingConfirm(null)}
              className="text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-[var(--text-2)] leading-relaxed">
            {pendingConfirm.description}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleConfirmPending}
              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] cursor-pointer flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Confirm & Execute</span>
            </button>
            <button
              type="button"
              onClick={() => setPendingConfirm(null)}
              className="px-3 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] text-[11px] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* 1. GITHUB INLINE WORKSPACE DRAWER */}
      {openDrawer === 'github' && isConnected(ghStatus) && (
        <div className="mt-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 min-w-0">
              <GithubIcon className="w-4 h-4 text-[var(--text)] shrink-0" />
              <span className="font-semibold text-[var(--text)] truncate">
                GitHub Connected ({connections.github.account || 'Verified'})
              </span>
              {activeGhOwner && activeGhRepo && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {activeGhOwner}/{activeGhRepo} ({activeGhBranch})
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => loadGithubResources()}
                className="p-1 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
                title="Refresh Repositories & Files"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setOpenDrawer(null)}
                className="p-1 rounded-lg text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Repo & Branch Selector Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="flex items-center gap-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1">
              <Search className="w-3.5 h-3.5 text-[var(--text-3)] shrink-0" />
              <input
                type="text"
                value={ghRepoQuery}
                onChange={(e) => setGhRepoQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadGithubResources()}
                placeholder="Search Repository..."
                className="bg-transparent text-[11px] text-[var(--text)] focus:outline-none w-full"
              />
            </div>

            <select
              aria-label="Select GitHub Repository"
              value={activeGhOwner && activeGhRepo ? `${activeGhOwner}/${activeGhRepo}` : ''}
              onChange={(e) => {
                const chosen = ghRepos.find((r) => r.full_name === e.target.value);
                if (chosen) {
                  handleSelectGithubRepo(chosen.full_name, chosen.default_branch || 'main');
                }
              }}
              className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] text-[var(--text)]"
            >
              <option value="">-- Select Repository ({ghRepos.length}) --</option>
              {ghRepos.map((r) => (
                <option key={r.id || r.full_name} value={r.full_name}>
                  {r.full_name} {r.private ? '🔒' : '🌐'}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-[var(--text-3)] shrink-0" />
              <select
                aria-label="Select GitHub Branch"
                value={activeGhBranch}
                onChange={(e) => handleSelectGithubBranch(e.target.value)}
                className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] text-[var(--text)] w-full"
              >
                {ghBranches.length === 0 && <option value={activeGhBranch}>{activeGhBranch}</option>}
                {ghBranches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* File Explorer & Selection */}
          {activeGhOwner && activeGhRepo && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-3)]">
                <div className="flex items-center gap-1.5">
                  <span>Path: /{ghCurrentPath}</span>
                  {ghCurrentPath && (
                    <button
                      type="button"
                      onClick={() => {
                        const parent = ghCurrentPath.split('/').slice(0, -1).join('/');
                        loadGithubResources(activeGhOwner, activeGhRepo, activeGhBranch, parent);
                      }}
                      className="text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      (Up ..)
                    </button>
                  )}
                </div>
                <span>
                  Selected for AI Context: <strong>{selectedGhFiles.length}</strong> file(s)
                </span>
              </div>

              <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] divide-y divide-[var(--border)]">
                {ghFiles.length === 0 ? (
                  <div className="p-2 text-[11px] text-[var(--text-3)]">
                    No files loaded. Click refresh to load repository contents.
                  </div>
                ) : (
                  ghFiles.map((item) => {
                    const isDir = item.type === 'dir';
                    const isSelected = selectedGhFiles.includes(item.path);
                    return (
                      <div
                        key={item.path}
                        className="flex items-center justify-between px-2.5 py-1.5 hover:bg-white/5 text-[11px]"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (isDir) {
                              loadGithubResources(
                                activeGhOwner,
                                activeGhRepo,
                                activeGhBranch,
                                item.path
                              );
                            } else {
                              handleReadGithubFile(item.path);
                            }
                          }}
                          className="flex items-center gap-1.5 text-left truncate text-[var(--text)] hover:text-[var(--accent)] cursor-pointer"
                        >
                          {isDir ? (
                            <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          )}
                          <span className="truncate">{item.name}</span>
                        </button>

                        {!isDir && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleGithubFileSelection(item.path)}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer border ${
                                isSelected
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-[var(--surface)] text-[var(--text-3)] border-[var(--border)] hover:text-[var(--text)]'
                              }`}
                            >
                              {isSelected ? 'Selected ✓' : 'Select for AI'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Inline File Viewer / Editor with Confirmation */}
          {ghViewingFile && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-sky-300">
                  {ghViewingFile.path}
                </span>
                <button
                  type="button"
                  onClick={() => setGhViewingFile(null)}
                  className="text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                value={ghViewingFile.content}
                onChange={(e) =>
                  setGhViewingFile({ ...ghViewingFile, content: e.target.value })
                }
                rows={5}
                className="w-full rounded-lg border border-[var(--border)] bg-black/40 p-2 font-mono text-[11px] text-[var(--text)] focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ghEditCommitMsg}
                  onChange={(e) => setGhEditCommitMsg(e.target.value)}
                  placeholder="Commit message..."
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--text)]"
                />
                <button
                  type="button"
                  onClick={handleSaveGithubFile}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold cursor-pointer flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Update & Commit</span>
                </button>
              </div>
            </div>
          )}

          {/* Direct Chatbox AI Prompts for GitHub */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-[var(--text-3)] flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[var(--accent)]" />
              <span>AI Actions:</span>
            </span>
            {[
              'এই Project-এর Login System পরীক্ষা করো',
              'আমার GitHub Project পরীক্ষা করো',
              'এই Bug ঠিক করো',
              'এই File Update করো',
            ].map((promptLabel) => (
              <button
                key={promptLabel}
                type="button"
                onClick={() => {
                  onQuickPrompt(promptLabel, {
                    ...currentCtx,
                    activeService: 'github',
                    github: {
                      owner: activeGhOwner,
                      repo: activeGhRepo,
                      branch: activeGhBranch,
                      selectedFiles: selectedGhFiles,
                    },
                    updatedAt: Date.now(),
                  });
                  setOpenDrawer(null);
                }}
                className="px-2 py-0.5 rounded-md bg-[var(--surface-2)] hover:bg-[var(--accent)]/20 border border-[var(--border)] text-[10px] text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer transition-colors"
              >
                {promptLabel}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. VERCEL INLINE WORKSPACE DRAWER */}
      {openDrawer === 'vercel' && isConnected(vcStatus) && (
        <div className="mt-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <VercelIcon className="w-3.5 h-3.5 text-[var(--text)]" />
              <span className="font-semibold text-[var(--text)]">
                Vercel Connected ({connections.vercel?.account || 'Verified'})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => loadVercelResources()}
                className="p-1 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setOpenDrawer(null)}
                className="p-1 rounded-lg text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Select Vercel Project"
              value={currentCtx.vercel?.projectId || connections.vercel?.projectId || ''}
              onChange={(e) => {
                const pid = e.target.value;
                const proj = vcProjects.find((p) => p.id === pid || p.name === pid);
                onChangeServiceContext({
                  ...currentCtx,
                  activeService: 'vercel',
                  vercel: {
                    projectId: pid,
                    projectName: proj?.name || pid,
                    teamId: connections.vercel?.teamId,
                  },
                  updatedAt: Date.now(),
                });
                onChangeConnections({
                  ...connections,
                  vercel: {
                    ...(connections.vercel || { token: '', projectId: '', connected: true }),
                    projectId: pid,
                  },
                });
                loadVercelResources(pid);
              }}
              className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-[11px] text-[var(--text)]"
            >
              <option value="">-- Select Vercel Project ({vcProjects.length}) --</option>
              {vcProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.framework || 'web'})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                const proj = vcProjects.find(
                  (p) =>
                    p.id === (currentCtx.vercel?.projectId || connections.vercel?.projectId)
                );
                const name = proj?.name || currentCtx.vercel?.projectName || activeVcProject;
                if (!name) {
                  notify('প্রথমে একটি Vercel Project নির্বাচন করুন।');
                  return;
                }
                void runServiceAction(
                  'vercel',
                  'trigger_deploy',
                  {
                    name,
                    projectId: currentCtx.vercel?.projectId || connections.vercel?.projectId,
                    target: 'preview',
                    teamId: connections.vercel?.teamId,
                  },
                  () => loadVercelResources()
                );
              }}
              className="px-2.5 py-1 rounded-lg bg-sky-600/20 border border-sky-500/40 text-sky-300 hover:bg-sky-600/30 text-[11px] font-medium cursor-pointer flex items-center gap-1"
            >
              <Play className="w-3 h-3" />
              <span>Preview Deploy</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const proj = vcProjects.find(
                  (p) =>
                    p.id === (currentCtx.vercel?.projectId || connections.vercel?.projectId)
                );
                const name = proj?.name || currentCtx.vercel?.projectName || activeVcProject;
                if (!name) {
                  notify('প্রথমে একটি Vercel Project নির্বাচন করুন।');
                  return;
                }
                void runServiceAction(
                  'vercel',
                  'trigger_deploy',
                  {
                    name,
                    projectId: currentCtx.vercel?.projectId || connections.vercel?.projectId,
                    target: 'production',
                    teamId: connections.vercel?.teamId,
                  },
                  () => loadVercelResources(),
                  {
                    title: `Confirm Production Deployment · ${name}`,
                    description: `"${name}" প্রজেক্টটি সরাসরি Production-এ Deploy করা হবে। আপনি কি নিশ্চিত?`,
                  }
                );
              }}
              className="px-2.5 py-1 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 text-[11px] font-medium cursor-pointer flex items-center gap-1"
            >
              <Play className="w-3 h-3" />
              <span>Production Deploy</span>
            </button>
          </div>

          {/* Recent Deployments & Build Logs */}
          <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] divide-y divide-[var(--border)]">
            {vcDeployments.length === 0 ? (
              <div className="p-2 text-[11px] text-[var(--text-3)]">
                No deployments loaded yet. Select a project or click refresh.
              </div>
            ) : (
              vcDeployments.slice(0, 6).map((d) => (
                <div
                  key={d.uid || d.id}
                  className="flex items-center justify-between px-2.5 py-1.5 text-[11px]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[var(--text)] truncate">{d.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                          (d.state || d.readyState) === 'READY'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : (d.state || d.readyState) === 'ERROR'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {d.state || d.readyState}
                      </span>
                    </div>
                    {d.errorMessage && (
                      <p className="text-[10px] text-rose-400 truncate">Error: {d.errorMessage}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const depId = d.uid || d.id;
                        setVcLogsDeploymentId(depId);
                        void runServiceAction(
                          'vercel',
                          'get_build_logs',
                          { deploymentId: depId, teamId: connections.vercel?.teamId },
                          (data) => {
                            setVcBuildLogs(data.logs || []);
                          }
                        );
                      }}
                      className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[10px] text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer flex items-center gap-1"
                    >
                      <Terminal className="w-3 h-3" />
                      <span>Build Logs</span>
                    </button>
                    {d.url && (
                      <a
                        href={`https://${d.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent)] hover:underline inline-flex items-center gap-0.5 text-[10px]"
                      >
                        <span>Visit</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {vcLogsDeploymentId && vcBuildLogs.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-black/50 p-2 font-mono text-[10px] text-zinc-300 max-h-28 overflow-y-auto">
              <div className="flex items-center justify-between pb-1 mb-1 border-b border-white/10">
                <span className="text-sky-300">Build Logs ({vcLogsDeploymentId})</span>
                <button
                  type="button"
                  onClick={() => {
                    setVcLogsDeploymentId(null);
                    setVcBuildLogs([]);
                  }}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  Close
                </button>
              </div>
              {vcBuildLogs.slice(-20).map((l, i) => (
                <div key={i} className="truncate">
                  {l.text || l.payload?.text || JSON.stringify(l)}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-[var(--text-3)] flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[var(--accent)]" />
              <span>AI Actions:</span>
            </span>
            {[
              'আমার Website Deployment পরীক্ষা করো',
              'সর্বশেষ Build Error বিশ্লেষণ করো',
              'এখন Deploy করতে পারবে?',
            ].map((promptLabel) => (
              <button
                key={promptLabel}
                type="button"
                onClick={() => {
                  onQuickPrompt(promptLabel, {
                    ...currentCtx,
                    activeService: 'vercel',
                    updatedAt: Date.now(),
                  });
                  setOpenDrawer(null);
                }}
                className="px-2 py-0.5 rounded-md bg-[var(--surface-2)] hover:bg-[var(--accent)]/20 border border-[var(--border)] text-[10px] text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
              >
                {promptLabel}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. SUPABASE INLINE WORKSPACE DRAWER */}
      {openDrawer === 'supabase' && isConnected(sbStatus) && (
        <div className="mt-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <SupabaseIcon className="w-4 h-4" />
              <span className="font-semibold text-[var(--text)]">
                Supabase Connected ({connections.supabase?.account || 'Verified'})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => loadSupabaseResources()}
                className="p-1 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setOpenDrawer(null)}
                className="p-1 rounded-lg text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Table className="w-3.5 h-3.5 text-emerald-400" />
            <select
              aria-label="Select Supabase Table"
              value={activeSbTable}
              onChange={(e) => {
                onChangeServiceContext({
                  ...currentCtx,
                  activeService: 'supabase',
                  supabase: {
                    ...currentCtx.supabase,
                    selectedTable: e.target.value,
                  },
                  updatedAt: Date.now(),
                });
              }}
              className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-[11px] text-[var(--text)]"
            >
              <option value="">-- Select Table ({sbTables.length}) --</option>
              {sbTables.map((t) => (
                <option key={t.name} value={t.name}>
                  public.{t.name} ({t.columns?.length || 0} cols)
                </option>
              ))}
            </select>
          </div>

          {/* SQL / Migration Runner with Confirmation */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={sbSqlQuery}
                onChange={(e) => setSbSqlQuery(e.target.value)}
                placeholder="Run SQL or Migration (e.g. SELECT * FROM project_tasks LIMIT 5;)..."
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[11px] text-[var(--text)]"
              />
              <button
                type="button"
                onClick={() => {
                  if (!sbSqlQuery.trim()) return;
                  void runServiceAction(
                    'supabase',
                    'run_sql',
                    {
                      sql: sbSqlQuery,
                      projectRef:
                        currentCtx.supabase?.projectRef || connections.supabase?.projectRef,
                      projectUrl: connections.supabase?.projectUrl,
                      serviceRoleKey: connections.supabase?.serviceRoleKey,
                    },
                    (data) => {
                      setSbSqlResult(data);
                      loadSupabaseResources();
                    },
                    {
                      title: 'Confirm Supabase SQL / Migration Execution',
                      description: `নিম্নোক্ত SQL সরাসরি আপনার Supabase ডাটাবেসে রান হবে:\n${sbSqlQuery.slice(0, 180)}`,
                    }
                  );
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold cursor-pointer"
              >
                Run SQL
              </button>
            </div>
            {sbSqlResult && (
              <pre className="rounded-lg bg-black/40 p-2 font-mono text-[10px] text-emerald-300 max-h-24 overflow-y-auto">
                {JSON.stringify(sbSqlResult, null, 2)}
              </pre>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-[var(--text-3)] flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[var(--accent)]" />
              <span>AI Actions:</span>
            </span>
            {[
              'আমার Database পরীক্ষা করো',
              'নতুন Table তৈরি করো',
              'এই Table-এর Schema বিশ্লেষণ করো',
            ].map((promptLabel) => (
              <button
                key={promptLabel}
                type="button"
                onClick={() => {
                  onQuickPrompt(promptLabel, {
                    ...currentCtx,
                    activeService: 'supabase',
                    updatedAt: Date.now(),
                  });
                  setOpenDrawer(null);
                }}
                className="px-2 py-0.5 rounded-md bg-[var(--surface-2)] hover:bg-[var(--accent)]/20 border border-[var(--border)] text-[10px] text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
              >
                {promptLabel}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. GOOGLE DRIVE / DOCS / SHEETS INLINE WORKSPACE DRAWER */}
      {openDrawer === 'google' && isConnected(gdStatus) && (
        <div className="mt-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <GoogleDriveIcon className="w-4 h-4" />
              <span className="font-semibold text-[var(--text)]">
                Google Drive / Docs / Sheets ({connections.drive.account || 'Verified'})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => loadGoogleResources()}
                className="p-1 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setOpenDrawer(null)}
                className="p-1 rounded-lg text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 flex-1">
              <Search className="w-3.5 h-3.5 text-[var(--text-3)]" />
              <input
                type="text"
                value={gdSearch}
                onChange={(e) => setGdSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadGoogleResources()}
                placeholder="Search Google Drive files, Docs, or Sheets..."
                className="bg-transparent text-[11px] text-[var(--text)] focus:outline-none w-full"
              />
            </div>
            <button
              type="button"
              onClick={() => loadGoogleResources()}
              className="px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[11px] text-[var(--text)] cursor-pointer"
            >
              Search
            </button>
          </div>

          <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] divide-y divide-[var(--border)]">
            {gdFiles.length === 0 ? (
              <div className="p-2 text-[11px] text-[var(--text-3)]">
                No Google Drive files loaded. Click Search or Refresh.
              </div>
            ) : (
              gdFiles.slice(0, 12).map((f) => {
                const isSheet = String(f.mimeType || '').includes('spreadsheet');
                const isSelected = currentCtx.google?.selectedFileId === f.id;
                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between px-2.5 py-1.5 hover:bg-white/5 text-[11px]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onChangeServiceContext({
                          ...currentCtx,
                          activeService: 'google',
                          google: {
                            selectedFileId: f.id,
                            selectedFileName: f.name,
                            selectedMimeType: f.mimeType,
                          },
                          updatedAt: Date.now(),
                        });
                        if (isSheet) {
                          void runServiceAction(
                            'google',
                            'read_sheet',
                            { spreadsheetId: f.id, range: 'A1:E15' },
                            (data) => {
                              setGdPreviewText({
                                title: f.name,
                                content: JSON.stringify(data.values || [], null, 2),
                              });
                            }
                          );
                        } else {
                          void runServiceAction(
                            'google',
                            'read_doc',
                            { documentId: f.id },
                            (data) => {
                              setGdPreviewText({
                                title: data.title || f.name,
                                content: data.content || '',
                              });
                            }
                          );
                        }
                      }}
                      className="flex items-center gap-1.5 text-left truncate text-[var(--text)] hover:text-[var(--accent)] cursor-pointer"
                    >
                      {isSheet ? (
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      )}
                      <span className="truncate">{f.name}</span>
                    </button>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'text-[var(--text-3)]'
                      }`}
                    >
                      {isSelected ? 'Selected ✓' : 'Select'}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {gdPreviewText && (
            <div className="rounded-lg border border-[var(--border)] bg-black/40 p-2 text-[11px] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-300">{gdPreviewText.title}</span>
                <button
                  type="button"
                  onClick={() => setGdPreviewText(null)}
                  className="text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <pre className="text-[10px] text-[var(--text-2)] whitespace-pre-wrap max-h-24 overflow-y-auto">
                {gdPreviewText.content.slice(0, 1000) || '(Empty content)'}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-[var(--text-3)] flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[var(--accent)]" />
              <span>AI Actions:</span>
            </span>
            {[
              'Google Drive-এর এই ফাইল পড়ো',
              'Project Report তৈরি করে Google Docs-এ রাখো',
              'Google Sheet-এ Data সংরক্ষণ করো',
            ].map((promptLabel) => (
              <button
                key={promptLabel}
                type="button"
                onClick={() => {
                  onQuickPrompt(promptLabel, {
                    ...currentCtx,
                    activeService: 'google',
                    updatedAt: Date.now(),
                  });
                  setOpenDrawer(null);
                }}
                className="px-2 py-0.5 rounded-md bg-[var(--surface-2)] hover:bg-[var(--accent)]/20 border border-[var(--border)] text-[10px] text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
              >
                {promptLabel}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
