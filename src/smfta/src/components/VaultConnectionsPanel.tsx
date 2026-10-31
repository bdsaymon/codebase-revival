import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Upload,
  Download,
  Unplug,
  FolderPlus,
  Loader2,
  ShieldCheck,
  FileCode2,
  GitBranch,
  GitPullRequest,
  GitCommit,
  Plus,
  Trash2,
  Edit3,
  Eye,
  Play,
  Terminal,
  Table,
  FileText,
  FileSpreadsheet,
  Search,
  Lock,
  History,
  KeyRound,
  Layers,
  Globe,
  Check,
  X,
} from 'lucide-react';
import { GithubIcon } from './icons/GithubIcon';
import { NotebookNote } from '../types';
import {
  VaultConnections,
  IntegrationProviderId,
  IntegrationConnectionStatus,
  ProviderVerificationResult,
  OAuthConfigStatusResponse,
  IntegrationAuditLogItem,
  verifyGithubConnection,
  pushNotesToGithub,
  pullNotesFromGithub,
  verifyDriveToken,
  ensureDriveFolder,
  pushNotesToDrive,
  pullNotesFromDrive,
  verifyVercelToken,
  verifySupabaseConnection,
  verifyProviderPermissions,
  executeIntegrationAction,
  fetchOAuthConfigStatus,
  storeEncryptedProviderSession,
  disconnectProviderSession,
  fetchIntegrationAuditLogs,
  resolveConnectionStatus,
  formatConnectionStatusLabel,
  GOOGLE_WORKSPACE_SCOPES,
} from '../utils/cloudVault';
import { authorizeGoogleWorkspaceWithPopup } from '../utils/googleWorkspaceAuth';

interface VaultConnectionsPanelProps {
  connections: VaultConnections;
  onChange: (next: VaultConnections) => void;
  notes: NotebookNote[];
  onImportNotes?: (imported: NotebookNote[]) => void;
  notify: (msg: string) => void;
  compact?: boolean;
}

interface PendingConfirmation {
  provider: IntegrationProviderId;
  action: string;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  onSuccess: (data: any) => void;
}

const VercelLogo: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 2L2 21h20L12 2z" />
  </svg>
);

const SupabaseLogo: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
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

const GoogleLogo: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
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

function getStatusBadgeStyle(status: IntegrationConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    case 'connecting':
      return 'bg-sky-500/15 text-sky-400 border border-sky-500/30';
    case 'permission_required':
      return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    case 'connection_expired':
      return 'bg-orange-500/15 text-orange-400 border border-orange-500/30';
    case 'connection_error':
      return 'bg-rose-500/15 text-rose-400 border border-rose-500/30';
    default:
      return 'bg-[var(--surface)] text-[var(--text-3)] border border-[var(--border)]';
  }
}

export const VaultConnectionsPanel: React.FC<VaultConnectionsPanelProps> = ({
  connections,
  onChange,
  notes,
  onImportNotes,
  notify,
  compact = false,
}) => {
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    provider: string;
    ok: boolean;
    text: string;
  } | null>(null);

  const [oauthConfig, setOauthConfig] = useState<OAuthConfigStatusResponse | null>(null);
  const [verifications, setVerifications] = useState<
    Partial<Record<IntegrationProviderId, ProviderVerificationResult>>
  >({});

  // Active workbench expanders
  const [activeWorkbench, setActiveWorkbench] = useState<IntegrationProviderId | null>(null);

  // Confirmation modal state
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmation | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Audit logs state
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<IntegrationAuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // ── GitHub Workbench State ──────────────────────────────────────────────
  const [ghTab, setGhTab] = useState<'repos' | 'files' | 'commits' | 'prs'>('repos');
  const [ghRepos, setGhRepos] = useState<any[]>([]);
  const [ghRepoVisibility, setGhRepoVisibility] = useState<'all' | 'public' | 'private'>('all');
  const [ghRepoSearch, setGhRepoSearch] = useState('');
  const [ghBranches, setGhBranches] = useState<any[]>([]);
  const [ghCurrentPath, setGhCurrentPath] = useState('');
  const [ghFiles, setGhFiles] = useState<any[]>([]);
  const [ghFileSearchQuery, setGhFileSearchQuery] = useState('');
  const [ghSelectedFile, setGhSelectedFile] = useState<{
    path: string;
    content: string;
    sha?: string;
  } | null>(null);
  const [ghNewFilePath, setGhNewFilePath] = useState('');
  const [ghNewFileContent, setGhNewFileContent] = useState('');
  const [ghCommitMsg, setGhCommitMsg] = useState('chore: update via SMFTA AI Pro');
  const [ghNewBranchName, setGhNewBranchName] = useState('');
  const [ghCommits, setGhCommits] = useState<any[]>([]);
  const [ghCompareBase, setGhCompareBase] = useState('main');
  const [ghCompareHead, setGhCompareHead] = useState('');
  const [ghCompareResult, setGhCompareResult] = useState<any | null>(null);
  const [ghPrs, setGhPrs] = useState<any[]>([]);
  const [ghPrTitle, setGhPrTitle] = useState('');
  const [ghPrHead, setGhPrHead] = useState('');
  const [ghPrBase, setGhPrBase] = useState('main');
  const [ghPrBody, setGhPrBody] = useState('');
  const [ghPrFiles, setGhPrFiles] = useState<{ prNumber: number; files: any[] } | null>(null);

  // ── Vercel Workbench State ──────────────────────────────────────────────
  const [vcTab, setVcTab] = useState<'projects' | 'deployments' | 'env'>('projects');
  const [vcProjects, setVcProjects] = useState<any[]>([]);
  const [vcDomains, setVcDomains] = useState<any[]>([]);
  const [vcDeployments, setVcDeployments] = useState<any[]>([]);
  const [vcSelectedDeployment, setVcSelectedDeployment] = useState<any | null>(null);
  const [vcBuildLogs, setVcBuildLogs] = useState<any[]>([]);
  const [vcEnvs, setVcEnvs] = useState<any[]>([]);
  const [vcNewEnvKey, setVcNewEnvKey] = useState('');
  const [vcNewEnvValue, setVcNewEnvValue] = useState('');
  const [vcNewEnvTarget, setVcNewEnvTarget] = useState<'production' | 'preview' | 'development'>('preview');

  // ── Supabase Workbench State ────────────────────────────────────────────
  const [sbTab, setSbTab] = useState<'projects' | 'schema' | 'data' | 'sql'>('schema');
  const [sbOrgs, setSbOrgs] = useState<any[]>([]);
  const [sbMgmtProjects, setSbMgmtProjects] = useState<any[]>([]);
  const [sbTables, setSbTables] = useState<any[]>([]);
  const [sbSelectedTable, setSbSelectedTable] = useState('');
  const [sbTableRows, setSbTableRows] = useState<any[]>([]);
  const [sbRowJsonInput, setSbRowJsonInput] = useState('{\n  \n}');
  const [sbMatchCol, setSbMatchCol] = useState('id');
  const [sbMatchVal, setSbMatchVal] = useState('');
  const [sbSqlInput, setSbSqlInput] = useState(
    'CREATE TABLE IF NOT EXISTS public.project_tasks (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  title text NOT NULL,\n  status text DEFAULT \'todo\',\n  created_at timestamptz DEFAULT now()\n);'
  );
  const [sbSqlOutput, setSbSqlOutput] = useState<any | null>(null);

  // ── Google Workbench State ──────────────────────────────────────────────
  const [ggTab, setGgTab] = useState<'drive' | 'docs' | 'sheets'>('drive');
  const [ggFiles, setGgFiles] = useState<any[]>([]);
  const [ggSearchQuery, setGgSearchQuery] = useState('');
  const [ggDocId, setGgDocId] = useState('');
  const [ggDocTitle, setGgDocTitle] = useState('');
  const [ggDocContent, setGgDocContent] = useState('');
  const [ggSheetId, setGgSheetId] = useState('');
  const [ggSheetRange, setGgSheetRange] = useState('Sheet1!A1:E20');
  const [ggSheetValues, setGgSheetValues] = useState<any[][]>([]);
  const [ggSheetUpdateJson, setGgSheetUpdateJson] = useState('[["Column A", "Column B"], ["Value 1", "Value 2"]]');

  // ── Direct Token & API Key Connection States ──────────────────────────────
  const [showGhDirect, setShowGhDirect] = useState(false);
  const [ghPatInput, setGhPatInput] = useState('');
  const [ghOwnerInput, setGhOwnerInput] = useState(connections.github.owner || '');
  const [ghRepoInput, setGhRepoInput] = useState(connections.github.repo || '');
  const [ghBranchInput, setGhBranchInput] = useState(connections.github.branch || 'main');

  const [showVcDirect, setShowVcDirect] = useState(false);
  const [vcTokenInput, setVcTokenInput] = useState(connections.vercel?.token || '');
  const [vcProjectInput, setVcProjectInput] = useState(connections.vercel?.projectId || '');
  const [vcTeamInput, setVcTeamInput] = useState(connections.vercel?.teamId || '');

  const [showSbDirect, setShowSbDirect] = useState(false);
  const [sbUrlInput, setSbUrlInput] = useState(connections.supabase?.projectUrl || '');
  const [sbKeyInput, setSbKeyInput] = useState(connections.supabase?.anonKey || connections.supabase?.serviceRoleKey || '');
  const [sbManagementTokenInput, setSbManagementTokenInput] = useState(connections.supabase?.managementToken || '');

  const [showOAuthConfigModal, setShowOAuthConfigModal] = useState<IntegrationProviderId | null>(null);
  const [oauthAppClientId, setOauthAppClientId] = useState('');
  const [oauthAppClientSecret, setOauthAppClientSecret] = useState('');

  const updateGithub = (patch: Partial<VaultConnections['github']>) => {
    onChange({
      ...connections,
      github: { ...connections.github, ...patch },
    });
  };

  const updateDrive = (patch: Partial<VaultConnections['drive']>) => {
    onChange({
      ...connections,
      drive: { ...connections.drive, ...patch },
    });
  };

  const updateVercel = (patch: Partial<NonNullable<VaultConnections['vercel']>>) => {
    const curr = connections.vercel || {
      token: '',
      projectId: '',
      teamId: '',
      connected: false,
    };
    onChange({
      ...connections,
      vercel: { ...curr, ...patch },
    });
  };

  const updateSupabase = (patch: Partial<NonNullable<VaultConnections['supabase']>>) => {
    const curr = connections.supabase || {
      projectUrl: '',
      anonKey: '',
      serviceRoleKey: '',
      connected: false,
    };
    onChange({
      ...connections,
      supabase: { ...curr, ...patch },
    });
  };

  const refreshOAuthConfig = useCallback(async () => {
    const cfg = await fetchOAuthConfigStatus();
    if (cfg) setOauthConfig(cfg);
  }, []);

  const refreshAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const logs = await fetchIntegrationAuditLogs(50);
      setAuditLogs(logs);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshOAuthConfig();
  }, [refreshOAuthConfig]);

  // Run permission verification for a provider using server-side encrypted OAuth session
  const runPermissionCheck = useCallback(
    async (
      provider: IntegrationProviderId,
      opts?: {
        owner?: string;
        repo?: string;
        projectId?: string;
        teamId?: string;
        projectUrl?: string;
        silent?: boolean;
      }
    ) => {
      if (!opts?.silent) setBusyProvider(`${provider}-verify`);
      try {
        const res = await verifyProviderPermissions(provider, {
          owner: opts?.owner ?? connections.github.owner,
          repo: opts?.repo ?? connections.github.repo,
          projectId: opts?.projectId ?? connections.vercel?.projectId,
          teamId: opts?.teamId ?? connections.vercel?.teamId,
          projectUrl: opts?.projectUrl ?? connections.supabase?.projectUrl,
        });

        setVerifications((prev) => ({ ...prev, [provider]: res }));
        const isConnected =
          Boolean(res.ok) &&
          (res.status === 'connected' || res.status === 'permission_required');

        if (provider === 'github') {
          const meta = (res.accountMeta || {}) as Record<string, any>;
          const resolvedOwner =
            typeof meta.defaultOwner === 'string' && meta.defaultOwner
              ? meta.defaultOwner
              : connections.github.owner;
          const resolvedRepo =
            typeof meta.defaultRepo === 'string' && meta.defaultRepo
              ? meta.defaultRepo
              : connections.github.repo;
          const resolvedBranch =
            typeof meta.defaultBranch === 'string' && meta.defaultBranch
              ? meta.defaultBranch
              : connections.github.branch || 'main';
          if (Array.isArray(meta.repos) && meta.repos.length > 0) {
            setGhRepos(meta.repos);
          }
          updateGithub({
            token: '',
            owner: isConnected ? resolvedOwner : connections.github.owner,
            repo: isConnected ? resolvedRepo : connections.github.repo,
            branch: resolvedBranch,
            connected: isConnected,
            status: res.status,
            account: isConnected ? res.account : '',
            grantedPermissions: res.grantedScopes,
            missingPermissions: res.missingScopes,
            permissionChecks: res.permissions,
            availableServices: res.availableServices,
            lastError: res.ok ? '' : res.error || res.message,
          });
        } else if (provider === 'vercel') {
          updateVercel({
            token: '',
            connected: isConnected,
            status: res.status,
            account: isConnected ? res.account : '',
            grantedPermissions: res.grantedScopes,
            missingPermissions: res.missingScopes,
            permissionChecks: res.permissions,
            availableServices: res.availableServices,
            lastError: res.ok ? '' : res.error || res.message,
          });
        } else if (provider === 'supabase') {
          updateSupabase({
            managementToken: '',
            anonKey: '',
            serviceRoleKey: '',
            connected: isConnected,
            status: res.status,
            account: isConnected ? res.account : '',
            grantedPermissions: res.grantedScopes,
            missingPermissions: res.missingScopes,
            permissionChecks: res.permissions,
            availableServices: res.availableServices,
            lastError: res.ok ? '' : res.error || res.message,
          });
        } else if (provider === 'google') {
          updateDrive({
            accessToken: '',
            clientId: '',
            connected: isConnected,
            status: res.status,
            account: isConnected ? res.account : '',
            grantedScopes: res.grantedScopes,
            missingScopes: res.missingScopes,
            permissionChecks: res.permissions,
            availableServices: res.availableServices,
            lastError: res.ok ? '' : res.error || res.message,
          });
        }

        if (!opts?.silent) {
          setStatusMessage({
            provider,
            ok: res.ok,
            text: res.message,
          });
          notify(res.message);
        }
        return res;
      } finally {
        if (!opts?.silent) setBusyProvider(null);
      }
    },
    [connections, notify]
  );

  // Verify server-stored encrypted OAuth sessions on load and clear any stale local connected flags
  useEffect(() => {
    if (!oauthConfig?.providers) return;
    const providers: IntegrationProviderId[] = ['github', 'vercel', 'supabase', 'google'];
    for (const p of providers) {
      const hasServerToken = Boolean(oauthConfig.providers[p]?.storedTokenLast4);
      const localConnected =
        p === 'github'
          ? connections.github.connected
          : p === 'vercel'
            ? Boolean(connections.vercel?.connected)
            : p === 'supabase'
              ? Boolean(connections.supabase?.connected)
              : connections.drive.connected;
      if (hasServerToken || localConnected) {
        void runPermissionCheck(p, { silent: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthConfig?.redirectUri]);

  // Listen for OAuth popup callback messages
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data) return;

      if (data.type === 'OAUTH_AUTH_ERROR') {
        const prov = (data.provider || 'github') as IntegrationProviderId;
        const errText =
          data.error || 'Authorization failed or was cancelled. Please try again.';
        setBusyProvider(null);
        setStatusMessage({
          provider: prov,
          ok: false,
          text: errText,
        });
        if (prov === 'github') updateGithub({ connected: false, status: 'connection_error', lastError: errText });
        if (prov === 'vercel') updateVercel({ connected: false, status: 'connection_error', lastError: errText });
        if (prov === 'supabase') updateSupabase({ connected: false, status: 'connection_error', lastError: errText });
        if (prov === 'google') updateDrive({ connected: false, status: 'connection_error', lastError: errText });
        notify(`OAuth Error (${prov.toUpperCase()}): ${errText}`);
        return;
      }

      if (data.type === 'OAUTH_AUTH_SUCCESS' || data.type === 'smfta_oauth_callback') {
        const rawProv = String(data.provider || '');
        const provider: IntegrationProviderId =
          rawProv === 'drive' ? 'google' : (rawProv as IntegrationProviderId);
        if (!['github', 'vercel', 'supabase', 'google'].includes(provider)) return;

        if (provider === 'google' && data.expiresIn) {
          updateDrive({ expiresAt: Date.now() + Number(data.expiresIn) * 1000 });
        }

        const verifyRes = await runPermissionCheck(provider);
        if (verifyRes.ok) {
          setActiveWorkbench(provider);
        }
        void refreshOAuthConfig();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [runPermissionCheck, refreshOAuthConfig]);

  // Real OAuth 2.0 Authorization Flow Launcher
  const handleOneClickOAuth = async (provider: IntegrationProviderId) => {
    setBusyProvider(`${provider}-oauth`);
    setStatusMessage(null);
    try {
      // For Google Workspace in AI Studio: use official Google OAuth 2.0 popup when server client_secret is not set
      if (
        provider === 'google' &&
        !oauthConfig?.providers?.google?.clientSecretConfigured
      ) {
        const popupRes = await authorizeGoogleWorkspaceWithPopup();
        if (!popupRes.ok) {
          updateDrive({
            connected: false,
            status: 'connection_error',
            lastError: popupRes.error || 'Google authorization failed.',
          });
          setStatusMessage({
            provider: 'google',
            ok: false,
            text: popupRes.error || 'Google authorization failed or was cancelled.',
          });
          notify(popupRes.error || 'Google authorization failed.');
          return;
        }
        if (popupRes.expiresAt) {
          updateDrive({ expiresAt: popupRes.expiresAt });
        }
        const verifyRes = await runPermissionCheck('google');
        if (verifyRes.ok) {
          setActiveWorkbench('google');
        }
        void refreshOAuthConfig();
        return;
      }

      const res = await fetch(
        `/api/oauth/url?provider=${encodeURIComponent(provider)}&scope=${encodeURIComponent(
          provider === 'google' ? GOOGLE_WORKSPACE_SCOPES.join(' ') : ''
        )}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.url) {
        const errMsg =
          data.message ||
          data.error ||
          `OAuth 2.0 is not configured on the backend for ${provider.toUpperCase()}. Please ask the application administrator to configure ${(
            data.missingEnvVars || [`${provider.toUpperCase()}_CLIENT_ID`, `${provider.toUpperCase()}_CLIENT_SECRET`]
          ).join(' & ')} and callback URL ${oauthConfig?.callbackUrl || `${window.location.origin}/auth/callback`}.`;
        if (provider === 'github') updateGithub({ connected: false, status: 'connection_error', lastError: errMsg });
        if (provider === 'vercel') updateVercel({ connected: false, status: 'connection_error', lastError: errMsg });
        if (provider === 'supabase') updateSupabase({ connected: false, status: 'connection_error', lastError: errMsg });
        if (provider === 'google') updateDrive({ connected: false, status: 'connection_error', lastError: errMsg });
        setStatusMessage({
          provider,
          ok: false,
          text: errMsg,
        });
        notify(errMsg);
        return;
      }

      const width = 580;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        data.url,
        `smfta_oauth_${provider}`,
        `width=${width},height=${height},left=${left},top=${top},noopener=no`
      );

      if (!popup) {
        const blockedMsg =
          'Popup window was blocked by the browser. Please allow popups for this site and click Retry.';
        setStatusMessage({
          provider,
          ok: false,
          text: blockedMsg,
        });
        notify(blockedMsg);
        return;
      }

      // Monitor popup closure in case user cancels/closes the window before authorization completes
      const pollTimer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(pollTimer);
          setBusyProvider((curr) => (curr === `${provider}-oauth` ? null : curr));
        }
      }, 600);
    } catch (err: any) {
      const errText = err?.message || 'Failed to start OAuth authorization flow.';
      setStatusMessage({
        provider,
        ok: false,
        text: errText,
      });
      notify(errText);
    } finally {
      setBusyProvider(null);
    }
  };

  const handleGoogleClientOAuth = () => {
    void handleOneClickOAuth('google');
  };

  // Disconnect Handler (Wipes both client & server encrypted tokens)
  const handleDisconnect = async (provider: IntegrationProviderId) => {
    setBusyProvider(`${provider}-disconnect`);
    try {
      await disconnectProviderSession(provider);
      setVerifications((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
      if (provider === 'github') {
        updateGithub({
          token: '',
          connected: false,
          status: 'not_connected',
          account: undefined,
          lastSyncAt: undefined,
          grantedPermissions: [],
          missingPermissions: [],
          permissionChecks: [],
          availableServices: [],
        });
      } else if (provider === 'vercel') {
        updateVercel({
          token: '',
          connected: false,
          status: 'not_connected',
          account: undefined,
          lastSyncAt: undefined,
          grantedPermissions: [],
          missingPermissions: [],
          permissionChecks: [],
          availableServices: [],
        });
      } else if (provider === 'supabase') {
        updateSupabase({
          anonKey: '',
          serviceRoleKey: '',
          managementToken: '',
          connected: false,
          status: 'not_connected',
          account: undefined,
          lastSyncAt: undefined,
          grantedPermissions: [],
          missingPermissions: [],
          permissionChecks: [],
          availableServices: [],
        });
      } else if (provider === 'google') {
        updateDrive({
          accessToken: '',
          connected: false,
          status: 'not_connected',
          account: undefined,
          lastSyncAt: undefined,
          grantedScopes: [],
          missingScopes: [],
          permissionChecks: [],
          availableServices: [],
        });
      }
      if (activeWorkbench === provider) setActiveWorkbench(null);
      notify(`${provider.toUpperCase()} disconnected and encrypted session cleared.`);
      void refreshOAuthConfig();
    } finally {
      setBusyProvider(null);
    }
  };

  // ── Direct Connection Handlers (Token / API Key) ────────────────────────
  const handleConnectGithubDirect = async () => {
    const token = ghPatInput.trim();
    if (!token) {
      notify('GitHub Personal Access Token (PAT) লিখুন।');
      return;
    }
    setBusyProvider('github-direct');
    setStatusMessage(null);
    try {
      const storeRes = await storeEncryptedProviderSession({
        provider: 'github',
        token,
        account: ghOwnerInput.trim() || undefined,
      });
      if (!storeRes.ok) {
        notify('Failed to store GitHub token securely.');
      }
      const verifyRes = await runPermissionCheck('github', {
        owner: ghOwnerInput.trim() || undefined,
        repo: ghRepoInput.trim() || undefined,
      });
      if (verifyRes.ok) {
        setShowGhDirect(false);
        setActiveWorkbench('github');
        setStatusMessage({
          provider: 'github',
          ok: true,
          text: `GitHub সফলভাবে কানেক্ট হয়েছে! (@${verifyRes.account || ghOwnerInput.trim() || 'user'})`,
        });
        notify(`✅ GitHub সফলভাবে কানেক্ট হয়েছে! (@${verifyRes.account || ghOwnerInput.trim() || 'user'})`);
      } else {
        setStatusMessage({
          provider: 'github',
          ok: false,
          text: verifyRes.error || verifyRes.message || 'GitHub টোকেন ভেরিফিকেশন ব্যর্থ হয়েছে।',
        });
      }
      void refreshOAuthConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'GitHub কানেকশন ব্যর্থ হয়েছে।';
      notify(msg);
      setStatusMessage({ provider: 'github', ok: false, text: msg });
    } finally {
      setBusyProvider(null);
    }
  };

  const handleConnectVercelDirect = async () => {
    const token = vcTokenInput.trim();
    if (!token) {
      notify('Vercel Access Token লিখুন।');
      return;
    }
    setBusyProvider('vercel-direct');
    setStatusMessage(null);
    try {
      const storeRes = await storeEncryptedProviderSession({
        provider: 'vercel',
        token,
      });
      if (!storeRes.ok) {
        notify('Failed to store Vercel token securely.');
      }
      if (vcProjectInput.trim() || vcTeamInput.trim()) {
        updateVercel({
          projectId: vcProjectInput.trim() || undefined,
          teamId: vcTeamInput.trim() || undefined,
        });
      }
      const verifyRes = await runPermissionCheck('vercel', {
        projectId: vcProjectInput.trim() || undefined,
        teamId: vcTeamInput.trim() || undefined,
      });
      if (verifyRes.ok) {
        setShowVcDirect(false);
        setActiveWorkbench('vercel');
        setStatusMessage({
          provider: 'vercel',
          ok: true,
          text: `Vercel সফলভাবে কানেক্ট হয়েছে! (${verifyRes.account || 'connected'})`,
        });
        notify(`✅ Vercel সফলভাবে কানেক্ট হয়েছে! (${verifyRes.account || 'connected'})`);
      } else {
        setStatusMessage({
          provider: 'vercel',
          ok: false,
          text: verifyRes.error || verifyRes.message || 'Vercel টোকেন যাচাই ব্যর্থ হয়েছে।',
        });
      }
      void refreshOAuthConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Vercel কানেকশন ব্যর্থ হয়েছে।';
      notify(msg);
      setStatusMessage({ provider: 'vercel', ok: false, text: msg });
    } finally {
      setBusyProvider(null);
    }
  };

  const handleConnectSupabaseDirect = async () => {
    const url = sbUrlInput.trim();
    const key = sbKeyInput.trim();
    const mgmt = sbManagementTokenInput.trim();
    if (!url && !mgmt) {
      notify('Supabase Project URL ও API Key অথবা Management Access Token দিন।');
      return;
    }
    setBusyProvider('supabase-direct');
    setStatusMessage(null);
    try {
      const tokenToStore = mgmt || key;
      if (tokenToStore) {
        await storeEncryptedProviderSession({
          provider: 'supabase',
          token: tokenToStore,
          account: url,
        });
      }
      updateSupabase({
        projectUrl: url,
        anonKey: key,
        managementToken: mgmt,
      });
      const verifyRes = await runPermissionCheck('supabase', {
        projectUrl: url,
      });
      if (verifyRes.ok) {
        setShowSbDirect(false);
        setActiveWorkbench('supabase');
        setStatusMessage({
          provider: 'supabase',
          ok: true,
          text: `Supabase Database সফলভাবে কানেক্ট হয়েছে! (${verifyRes.account || url})`,
        });
        notify(`✅ Supabase Database সফলভাবে কানেক্ট হয়েছে!`);
      } else {
        setStatusMessage({
          provider: 'supabase',
          ok: false,
          text: verifyRes.error || verifyRes.message || 'Supabase সংযোগ যাচাই ব্যর্থ হয়েছে।',
        });
      }
      void refreshOAuthConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Supabase কানেকশন ব্যর্থ হয়েছে।';
      notify(msg);
      setStatusMessage({ provider: 'supabase', ok: false, text: msg });
    } finally {
      setBusyProvider(null);
    }
  };

  const handleSaveOAuthAppConfig = async (provider: IntegrationProviderId) => {
    if (!oauthAppClientId.trim()) {
      notify('OAuth Client ID প্রয়োজন।');
      return;
    }
    setBusyProvider(`${provider}-app-cfg`);
    try {
      const res = await fetch('/api/oauth/configure-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          clientId: oauthAppClientId.trim(),
          clientSecret: oauthAppClientSecret.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        notify(`✅ ${provider.toUpperCase()} OAuth App ক্রেডেনশিয়াল সংরক্ষিত হয়েছে!`);
        setShowOAuthConfigModal(null);
        setOauthAppClientId('');
        setOauthAppClientSecret('');
        void refreshOAuthConfig();
      } else {
        notify(data.error || 'সংরক্ষণ ব্যর্থ হয়েছে।');
      }
    } catch {
      notify('সার্ভার রিকোয়েস্ট ব্যর্থ হয়েছে।');
    } finally {
      setBusyProvider(null);
    }
  };

  // Generic helper to run an integration action with automatic Confirmation Modal support
  const runAction = async (
    provider: IntegrationProviderId,
    action: string,
    payload: Record<string, unknown>,
    onSuccess: (data: any) => void,
    confirmMeta?: { title: string; description: string }
  ) => {
    setBusyProvider(`${provider}-${action}`);
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
            'এই পরিবর্তনটি সরাসরি লাইভ সার্ভিসে কার্যকর হবে। আপনি কি নিশ্চিত?',
          payload,
          onSuccess,
        });
        return;
      }

      if (!res.ok) {
        notify(res.error || `${provider} ${action} failed`);
        setStatusMessage({
          provider,
          ok: false,
          text: res.error || `${action} failed`,
        });
        return;
      }

      onSuccess(res.data);
    } finally {
      setBusyProvider(null);
    }
  };

  const handleConfirmPendingAction = async () => {
    if (!pendingConfirm) return;
    setConfirmBusy(true);
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
        setStatusMessage({ provider, ok: false, text: res.error || 'Operation failed' });
      } else {
        notify(`${provider.toUpperCase()}: ${action} সফলভাবে সম্পন্ন হয়েছে।`);
        onSuccess(res.data);
      }
      setPendingConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  // ── GitHub Workbench Operations ──────────────────────────────────────────
  const loadGithubRepos = () => {
    void runAction(
      'github',
      ghRepoSearch.trim() ? 'search_repos' : 'list_repos',
      {
        owner: connections.github.owner,
        visibility: ghRepoVisibility,
        query: ghRepoSearch.trim(),
      },
      (data) => {
        setGhRepos(data.repos || []);
      }
    );
  };

  const loadGithubBranchesAndFiles = (owner?: string, repo?: string, branch?: string, path = '') => {
    const o = owner ?? connections.github.owner;
    const r = repo ?? connections.github.repo;
    const b = branch ?? connections.github.branch ?? 'main';
    if (!o || !r) {
      notify('প্রথমে একটি GitHub Repository নির্বাচন করুন।');
      return;
    }
    void runAction('github', 'list_branches', { owner: o, repo: r }, (data) => {
      setGhBranches(data.branches || []);
    });
    void runAction(
      'github',
      'list_contents',
      { owner: o, repo: r, branch: b, path },
      (data) => {
        setGhCurrentPath(path);
        setGhFiles(data.items || []);
      }
    );
  };

  const openGithubFile = (filePath: string) => {
    void runAction(
      'github',
      'read_file',
      {
        owner: connections.github.owner,
        repo: connections.github.repo,
        branch: connections.github.branch || 'main',
        path: filePath,
      },
      (data) => {
        setGhSelectedFile({
          path: data.path,
          content: data.content || '',
          sha: data.sha,
        });
      }
    );
  };

  // ── Vercel Workbench Operations ──────────────────────────────────────────
  const loadVercelProjects = () => {
    void runAction(
      'vercel',
      'list_projects',
      { teamId: connections.vercel?.teamId },
      (data) => {
        setVcProjects(data.projects || []);
      }
    );
  };

  const loadVercelDeployments = (projectId?: string) => {
    const pid = projectId ?? connections.vercel?.projectId;
    void runAction(
      'vercel',
      'list_deployments',
      { projectId: pid, teamId: connections.vercel?.teamId },
      (data) => {
        setVcDeployments(data.deployments || []);
      }
    );
  };

  const loadVercelEnvs = (projectId?: string) => {
    const pid = projectId ?? connections.vercel?.projectId;
    if (!pid) {
      notify('Project ID নির্বাচন করুন।');
      return;
    }
    void runAction(
      'vercel',
      'list_envs',
      { projectId: pid, teamId: connections.vercel?.teamId },
      (data) => {
        setVcEnvs(data.envs || []);
      }
    );
  };

  // ── Supabase Workbench Operations ────────────────────────────────────────
  const loadSupabaseSchema = () => {
    void runAction(
      'supabase',
      'inspect_schema',
      {
        projectUrl: connections.supabase?.projectUrl,
        anonKey: connections.supabase?.anonKey,
        serviceRoleKey: connections.supabase?.serviceRoleKey,
        projectRef: connections.supabase?.projectRef,
      },
      (data) => {
        setSbTables(data.tables || []);
        if (data.tables?.[0]?.name && !sbSelectedTable) {
          setSbSelectedTable(data.tables[0].name);
        }
      }
    );
  };

  const loadSupabaseTableData = (tableName?: string) => {
    const tbl = tableName || sbSelectedTable;
    if (!tbl) {
      notify('একটি Table নির্বাচন করুন।');
      return;
    }
    void runAction(
      'supabase',
      'read_table',
      {
        projectUrl: connections.supabase?.projectUrl,
        anonKey: connections.supabase?.anonKey,
        serviceRoleKey: connections.supabase?.serviceRoleKey,
        table: tbl,
        limit: 25,
      },
      (data) => {
        setSbTableRows(data.rows || []);
      }
    );
  };

  // ── Google Workbench Operations ──────────────────────────────────────────
  const loadGoogleDriveFiles = () => {
    void runAction(
      'google',
      ggSearchQuery.trim() ? 'search_files' : 'list_files',
      { query: ggSearchQuery.trim() },
      (data) => {
        setGgFiles(data.files || []);
      }
    );
  };

  // Compute current 6-state statuses
  const ghStatus =
    busyProvider?.startsWith('github')
      ? 'connecting'
      : verifications.github?.status || resolveConnectionStatus('github', connections);
  const vcStatus =
    busyProvider?.startsWith('vercel')
      ? 'connecting'
      : verifications.vercel?.status || resolveConnectionStatus('vercel', connections);
  const sbStatus =
    busyProvider?.startsWith('supabase')
      ? 'connecting'
      : verifications.supabase?.status || resolveConnectionStatus('supabase', connections);
  const ggStatus =
    busyProvider?.startsWith('google')
      ? 'connecting'
      : verifications.google?.status || resolveConnectionStatus('google', connections);

  const githubChecks = verifications.github?.permissions || connections.github.permissionChecks || [];
  const vercelChecks = verifications.vercel?.permissions || connections.vercel?.permissionChecks || [];
  const supabaseChecks =
    verifications.supabase?.permissions || connections.supabase?.permissionChecks || [];
  const googleChecks = verifications.google?.permissions || connections.drive.permissionChecks || [];

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      {/* Top Bar: Integrations Overview + Security Audit Log Toggle */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-[var(--text)]">
              SMFTA Real OAuth &amp; Service Integration Hub
            </h4>
          </div>
          <p className="text-[11px] text-[var(--text-3)] mt-0.5">
            বাস্তব API ও Permission Verification-সহ GitHub, Vercel, Supabase এবং Google সার্ভিস কানেকশন। কোনো ফাইল পরিবর্তন, Commit, Merge, Migration বা Production Deploy করার আগে সর্বদা আপনার অনুমতি নেওয়া হয়।
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !showAuditLogs;
              setShowAuditLogs(next);
              if (next) void refreshAuditLogs();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-[var(--primary)]" />
            Audit Log
          </button>
        </div>
      </div>

      {/* Audit Log Panel */}
      {showAuditLogs && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text)]">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              Integration Security &amp; Audit Log (Redacted)
            </div>
            <button
              type="button"
              onClick={() => void refreshAuditLogs()}
              className="text-[11px] text-[var(--primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${auditLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          {auditLogs.length === 0 ? (
            <p className="text-[11px] text-[var(--text-3)]">
              এখনও কোনো Integration Operation রেকর্ড হয়নি।
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[10.5px] flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold uppercase text-[var(--text)]">{log.provider}</span>
                    <span className="font-mono text-[var(--primary)]">{log.action}</span>
                    {log.account && (
                      <span className="text-[var(--text-3)] truncate">({log.account})</span>
                    )}
                    {log.target && (
                      <span className="font-mono text-[var(--text-2)] truncate">{log.target}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-1.5 py-0.5 rounded font-semibold uppercase text-[9.5px] ${
                        log.status === 'confirmed' || log.status === 'success'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-rose-500/15 text-rose-400'
                      }`}
                    >
                      {log.status}
                    </span>
                    <span className="text-[var(--text-3)]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          CARD 1: GITHUB — COMPLETE REPOSITORY ACCESS
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
              <GithubIcon className="w-5 h-5 text-[var(--text)]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-[var(--text)]">GitHub</h4>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getStatusBadgeStyle(
                    ghStatus
                  )}`}
                >
                  {formatConnectionStatusLabel(ghStatus)}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-3)]">
                Repository Metadata, Contents Read/Write, Branches, Commits &amp; Pull Requests
              </p>
            </div>
          </div>
          {connections.github.connected && (
            <button
              type="button"
              onClick={() =>
                setActiveWorkbench(activeWorkbench === 'github' ? null : 'github')
              }
              className="rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/30 px-2.5 py-1.5 text-[11px] font-semibold hover:opacity-90 cursor-pointer"
            >
              {activeWorkbench === 'github' ? 'Close Workbench' : 'Open GitHub Workbench'}
            </button>
          )}
        </div>

        {/* Account & Available Services */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)] block">
              Connected Account &amp; Repository
            </span>
            <span className="font-mono font-semibold text-[var(--text)]">
              {connections.github.account
                ? `@${connections.github.account}`
                : 'Not authenticated'}
              {connections.github.owner && connections.github.repo
                ? ` · ${connections.github.owner}/${connections.github.repo} (${
                    connections.github.branch || 'main'
                  })`
                : ''}
            </span>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)] block">
              Available Services
            </span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {(
                verifications.github?.availableServices ||
                connections.github.availableServices || [
                  'Repository Explorer',
                  'Code Read/Write',
                  'Branch & Commit Manager',
                  'Pull Requests',
                ]
              ).map((srv) => (
                <span
                  key={srv}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]"
                >
                  {srv}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Verified Permissions Matrix */}
        {githubChecks.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)]">
              Verified Permissions &amp; Scopes
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {githubChecks.map((chk) => (
                <div
                  key={chk.id}
                  className={`rounded-lg px-2 py-1 text-[10.5px] flex items-center gap-1.5 border ${
                    chk.granted
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/5 text-amber-300'
                  }`}
                  title={chk.detail}
                >
                  {chk.granted ? (
                    <Check className="w-3 h-3 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 shrink-0 text-amber-400" />
                  )}
                  <span className="truncate">{chk.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleOneClickOAuth('github')}
            disabled={busyProvider !== null}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--text)] text-[var(--bg)] px-3 py-2 text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {busyProvider === 'github-oauth' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <GithubIcon className="w-3.5 h-3.5" />
            )}
            {connections.github.connected ? 'Reconnect GitHub (OAuth)' : 'Connect GitHub (OAuth)'}
          </button>

          <button
            type="button"
            onClick={() => setShowGhDirect((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--primary)]/40 bg-[var(--primary-soft)] text-[var(--primary)] px-3 py-2 text-xs font-bold hover:opacity-90 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {showGhDirect ? 'Hide Token Input' : 'Direct Token (PAT)'}
          </button>

          <button
            type="button"
            onClick={() => void runPermissionCheck('github')}
            disabled={busyProvider !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
          >
            {busyProvider === 'github-verify' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Verify Connection
          </button>

          <button
            type="button"
            onClick={() => setShowOAuthConfigModal('github')}
            className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
            title="Configure GitHub OAuth App Client ID & Secret"
          >
            <Lock className="w-3.5 h-3.5" /> OAuth App
          </button>

          {connections.github.connected && (
            <button
              type="button"
              onClick={() => void handleDisconnect('github')}
              disabled={busyProvider !== null}
              className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 cursor-pointer ml-auto"
            >
              <Unplug className="w-3.5 h-3.5" /> Disconnect
            </button>
          )}
        </div>

        {/* GitHub Direct Token Drawer */}
        {showGhDirect && (
          <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--surface)] p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[var(--primary)]" />
                GitHub Personal Access Token (PAT) কানেকশন
              </span>
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,read:user,user:email&description=SMFTA+AI+Pro"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-[var(--primary)] hover:underline inline-flex items-center gap-1"
              >
                Create GitHub Token <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
              সার্ভারে OAuth App ক্রেডেনশিয়াল না থাকলেও Personal Access Token দিয়ে কোড, রিপোজিটরি, ব্রাঞ্চ ও PR অ্যাক্সেস করতে পারবেন। (প্রয়োজনীয় Scopes: <code>repo</code>, <code>read:user</code>)
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">
                  Personal Access Token (ghp_... বা github_pat_...) *
                </label>
                <input
                  type="password"
                  value={ghPatInput}
                  onChange={(e) => setGhPatInput(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-xs font-mono text-[var(--text)]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">
                    Owner / Username
                  </label>
                  <input
                    type="text"
                    value={ghOwnerInput}
                    onChange={(e) => setGhOwnerInput(e.target.value)}
                    placeholder="e.g. octocat"
                    className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">
                    Default Repo
                  </label>
                  <input
                    type="text"
                    value={ghRepoInput}
                    onChange={(e) => setGhRepoInput(e.target.value)}
                    placeholder="e.g. my-project"
                    className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">
                    Branch
                  </label>
                  <input
                    type="text"
                    value={ghBranchInput}
                    onChange={(e) => setGhBranchInput(e.target.value)}
                    placeholder="main"
                    className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text)]"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowGhDirect(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConnectGithubDirect}
                disabled={busyProvider === 'github-direct' || !ghPatInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--primary)] text-white px-3.5 py-1.5 text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {busyProvider === 'github-direct' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Connect with Token
              </button>
            </div>
          </div>
        )}

        {/* GitHub Status Feedback */}
        {statusMessage?.provider === 'github' && (
          <div
            className={`rounded-xl px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 ${
              statusMessage.ok
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {statusMessage.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            {!statusMessage.ok && (
              <button
                type="button"
                onClick={() => void handleOneClickOAuth('github')}
                className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/25 shrink-0 cursor-pointer"
              >
                Retry Authorization
              </button>
            )}
          </div>
        )}

        {/* ── GITHUB INTERACTIVE WORKBENCH ─────────────────────────────────── */}
        {activeWorkbench === 'github' && (
          <div className="rounded-xl border border-[var(--primary)]/40 bg-[var(--surface)] p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] pb-2">
              {(
                [
                  { id: 'repos', label: 'A. Repositories', icon: Layers },
                  { id: 'files', label: 'B/C. File Explorer & Code', icon: FileCode2 },
                  { id: 'commits', label: 'C. Branches & Commits', icon: GitCommit },
                  { id: 'prs', label: 'D. Pull Requests', icon: GitPullRequest },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setGhTab(t.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer ${
                      ghTab === t.id
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>

            {/* TAB A: REPOSITORIES */}
            {ghTab === 'repos' && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={ghRepoVisibility}
                    onChange={(e) => setGhRepoVisibility(e.target.value as any)}
                    className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text)]"
                  >
                    <option value="all">All Repositories (Public + Private)</option>
                    <option value="public">Public Only</option>
                    <option value="private">Private Only</option>
                  </select>
                  <input
                    type="text"
                    value={ghRepoSearch}
                    onChange={(e) => setGhRepoSearch(e.target.value)}
                    placeholder="Search repositories..."
                    className="flex-1 min-w-[160px] rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text)]"
                  />
                  <button
                    type="button"
                    onClick={loadGithubRepos}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" /> Load Repositories
                  </button>
                </div>

                {ghRepos.length > 0 && (
                  <div className="max-h-56 overflow-y-auto space-y-1.5">
                    {ghRepos.map((r) => (
                      <div
                        key={r.id || r.fullName}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold font-mono text-[var(--text)] truncate">
                              {r.fullName}
                            </span>
                            <span
                              className={`text-[9.5px] px-1.5 py-0.5 rounded font-semibold ${
                                r.private
                                  ? 'bg-amber-500/15 text-amber-400'
                                  : 'bg-emerald-500/15 text-emerald-400'
                              }`}
                            >
                              {r.private ? 'Private' : 'Public'}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--text-3)]">
                              default: {r.defaultBranch}
                            </span>
                          </div>
                          {r.description && (
                            <p className="text-[10.5px] text-[var(--text-3)] truncate mt-0.5">
                              {r.description}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            updateGithub({
                              owner: r.owner,
                              repo: r.name,
                              branch: r.defaultBranch || 'main',
                            });
                            loadGithubBranchesAndFiles(
                              r.owner,
                              r.name,
                              r.defaultBranch || 'main',
                              ''
                            );
                            setGhTab('files');
                          }}
                          className="rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] px-2.5 py-1 text-[11px] font-semibold shrink-0 cursor-pointer"
                        >
                          Select &amp; Explore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB B/C: FILE EXPLORER & CODE MANAGEMENT */}
            {ghTab === 'files' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-[var(--text)]">
                    {connections.github.owner}/{connections.github.repo}
                  </span>
                  {ghBranches.length > 0 && (
                    <select
                      value={connections.github.branch || 'main'}
                      onChange={(e) => {
                        updateGithub({ branch: e.target.value });
                        loadGithubBranchesAndFiles(
                          connections.github.owner,
                          connections.github.repo,
                          e.target.value,
                          ghCurrentPath
                        );
                      }}
                      className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1 text-xs font-mono text-[var(--text)]"
                    >
                      {ghBranches.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      loadGithubBranchesAndFiles(
                        connections.github.owner,
                        connections.github.repo,
                        connections.github.branch || 'main',
                        ghCurrentPath
                      )
                    }
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
                  >
                    Load Files
                  </button>
                  {ghCurrentPath && (
                    <button
                      type="button"
                      onClick={() => {
                        const parent = ghCurrentPath.split('/').slice(0, -1).join('/');
                        loadGithubBranchesAndFiles(
                          connections.github.owner,
                          connections.github.repo,
                          connections.github.branch || 'main',
                          parent
                        );
                      }}
                      className="rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--primary)] cursor-pointer"
                    >
                      ← Up ({ghCurrentPath})
                    </button>
                  )}
                </div>

                {/* File Search */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ghFileSearchQuery}
                    onChange={(e) => setGhFileSearchQuery(e.target.value)}
                    placeholder="Search file name in repository..."
                    className="flex-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text)]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        'github',
                        'search_files',
                        {
                          owner: connections.github.owner,
                          repo: connections.github.repo,
                          branch: connections.github.branch || 'main',
                          query: ghFileSearchQuery,
                        },
                        (data) => {
                          setGhFiles(
                            (data.files || []).map((f: any) => ({
                              name: f.path,
                              path: f.path,
                              type: 'file',
                              size: f.size,
                              sha: f.sha,
                            }))
                          );
                        }
                      )
                    }
                    className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--text)] cursor-pointer"
                  >
                    Search Files
                  </button>
                </div>

                {/* Directory / File Listing */}
                {ghFiles.length > 0 && (
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
                    {ghFiles.map((item) => (
                      <div
                        key={item.path}
                        className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-[var(--surface-2)]"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (item.type === 'dir') {
                              loadGithubBranchesAndFiles(
                                connections.github.owner,
                                connections.github.repo,
                                connections.github.branch || 'main',
                                item.path
                              );
                            } else {
                              openGithubFile(item.path);
                            }
                          }}
                          className="font-mono text-left text-[var(--text)] hover:text-[var(--primary)] truncate cursor-pointer"
                        >
                          {item.type === 'dir' ? `📁 ${item.name}/` : `📄 ${item.path}`}
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.type === 'file' && (
                            <button
                              type="button"
                              onClick={() => openGithubFile(item.path)}
                              className="text-[10.5px] text-[var(--primary)] hover:underline cursor-pointer"
                            >
                              View / Edit
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selected File Viewer / Editor / Commit / Delete */}
                {ghSelectedFile && (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-bold text-[var(--text)]">
                        {ghSelectedFile.path}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const blob = new Blob([ghSelectedFile.content], {
                              type: 'text/plain;charset=utf-8',
                            });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = ghSelectedFile.path.split('/').pop() || 'file.txt';
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="rounded border border-[var(--border)] px-2 py-0.5 text-[10.5px] text-[var(--text-2)] cursor-pointer"
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(
                              'github',
                              'delete_file',
                              {
                                owner: connections.github.owner,
                                repo: connections.github.repo,
                                branch: connections.github.branch || 'main',
                                path: ghSelectedFile.path,
                                sha: ghSelectedFile.sha,
                                message: `chore: delete ${ghSelectedFile.path}`,
                              },
                              () => {
                                setGhSelectedFile(null);
                                loadGithubBranchesAndFiles(
                                  connections.github.owner,
                                  connections.github.repo,
                                  connections.github.branch || 'main',
                                  ghCurrentPath
                                );
                              },
                              {
                                title: `Confirm Delete File: ${ghSelectedFile.path}`,
                                description: `${connections.github.owner}/${connections.github.repo} থেকে ${ghSelectedFile.path} ফাইলটি ডিলিট এবং Commit করা হবে।`,
                              }
                            )
                          }
                          className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10.5px] text-rose-400 cursor-pointer"
                        >
                          Delete File
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={8}
                      value={ghSelectedFile.content}
                      onChange={(e) =>
                        setGhSelectedFile({ ...ghSelectedFile, content: e.target.value })
                      }
                      className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] p-2.5 text-xs font-mono text-[var(--text)]"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={ghCommitMsg}
                        onChange={(e) => setGhCommitMsg(e.target.value)}
                        placeholder="Commit message..."
                        className="flex-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text)]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(
                            'github',
                            'update_file',
                            {
                              owner: connections.github.owner,
                              repo: connections.github.repo,
                              branch: connections.github.branch || 'main',
                              path: ghSelectedFile.path,
                              content: ghSelectedFile.content,
                              sha: ghSelectedFile.sha,
                              message: ghCommitMsg,
                            },
                            (data) => {
                              setGhSelectedFile({
                                ...ghSelectedFile,
                                sha: data.commitSha || ghSelectedFile.sha,
                              });
                            },
                            {
                              title: `Confirm Commit & Update: ${ghSelectedFile.path}`,
                              description: `Branch "${
                                connections.github.branch || 'main'
                              }"-এ পরিবর্তনটি Commit করা হবে।`,
                            }
                          )
                        }
                        className="rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                      >
                        Commit &amp; Update File
                      </button>
                    </div>
                  </div>
                )}

                {/* Create New File */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5 space-y-2">
                  <div className="text-[11px] font-bold text-[var(--text)]">Create New File</div>
                  <input
                    type="text"
                    value={ghNewFilePath}
                    onChange={(e) => setGhNewFilePath(e.target.value)}
                    placeholder="src/newComponent.tsx"
                    className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1 text-xs font-mono text-[var(--text)]"
                  />
                  <textarea
                    rows={3}
                    value={ghNewFileContent}
                    onChange={(e) => setGhNewFileContent(e.target.value)}
                    placeholder="// File content..."
                    className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] p-2 text-xs font-mono text-[var(--text)]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        'github',
                        'create_file',
                        {
                          owner: connections.github.owner,
                          repo: connections.github.repo,
                          branch: connections.github.branch || 'main',
                          path: ghNewFilePath,
                          content: ghNewFileContent,
                          message: `feat: create ${ghNewFilePath}`,
                        },
                        () => {
                          setGhNewFilePath('');
                          setGhNewFileContent('');
                          loadGithubBranchesAndFiles();
                        }
                      )
                    }
                    disabled={!ghNewFilePath.trim()}
                    className="rounded-lg bg-[var(--primary)] text-white px-3 py-1 text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    Create &amp; Commit File
                  </button>
                </div>
              </div>
            )}

            {/* TAB C: BRANCHES & COMMITS */}
            {ghTab === 'commits' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={ghNewBranchName}
                    onChange={(e) => setGhNewBranchName(e.target.value)}
                    placeholder="feature/new-branch"
                    className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-mono text-[var(--text)]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        'github',
                        'create_branch',
                        {
                          owner: connections.github.owner,
                          repo: connections.github.repo,
                          fromBranch: connections.github.branch || 'main',
                          newBranch: ghNewBranchName,
                        },
                        () => {
                          updateGithub({ branch: ghNewBranchName });
                          setGhNewBranchName('');
                        }
                      )
                    }
                    disabled={!ghNewBranchName.trim()}
                    className="rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    Create Branch
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        'github',
                        'list_commits',
                        {
                          owner: connections.github.owner,
                          repo: connections.github.repo,
                          branch: connections.github.branch || 'main',
                        },
                        (data) => setGhCommits(data.commits || [])
                      )
                    }
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] cursor-pointer"
                  >
                    Load Commit History
                  </button>
                </div>

                {/* Compare Changes */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={ghCompareBase}
                    onChange={(e) => setGhCompareBase(e.target.value)}
                    placeholder="Base branch (main)"
                    className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1 text-xs font-mono text-[var(--text)]"
                  />
                  <input
                    type="text"
                    value={ghCompareHead}
                    onChange={(e) => setGhCompareHead(e.target.value)}
                    placeholder="Head branch"
                    className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1 text-xs font-mono text-[var(--text)]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        'github',
                        'compare_commits',
                        {
                          owner: connections.github.owner,
                          repo: connections.github.repo,
                          base: ghCompareBase,
                          head: ghCompareHead,
                        },
                        (data) => setGhCompareResult(data)
                      )
                    }
                    disabled={!ghCompareBase || !ghCompareHead}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text)] cursor-pointer"
                  >
                    Compare Changes
                  </button>
                </div>

                {ghCompareResult && (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs">
                    Status: <b>{ghCompareResult.status}</b> · Ahead by{' '}
                    <b>{ghCompareResult.aheadBy}</b> · Behind by <b>{ghCompareResult.behindBy}</b> ·
                    Changed files: <b>{ghCompareResult.files?.length || 0}</b>
                  </div>
                )}

                {ghCommits.length > 0 && (
                  <div className="max-h-44 overflow-y-auto space-y-1.5">
                    {ghCommits.map((c) => (
                      <div
                        key={c.sha}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--text)] truncate">
                            {c.message}
                          </div>
                          <div className="text-[10px] text-[var(--text-3)]">
                            {c.author} · {c.date}
                          </div>
                        </div>
                        <span className="font-mono text-[10.5px] text-[var(--primary)] shrink-0">
                          {c.shortSha}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB D: PULL REQUESTS */}
            {ghTab === 'prs' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text)]">Pull Requests</span>
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        'github',
                        'list_prs',
                        {
                          owner: connections.github.owner,
                          repo: connections.github.repo,
                          state: 'all',
                        },
                        (data) => setGhPrs(data.pullRequests || [])
                      )
                    }
                    className="rounded-lg bg-[var(--primary)] text-white px-2.5 py-1 text-xs font-semibold cursor-pointer"
                  >
                    Load Pull Requests
                  </button>
                </div>

                {ghPrs.length > 0 && (
                  <div className="max-h-44 overflow-y-auto space-y-1.5">
                    {ghPrs.map((pr) => (
                      <div
                        key={pr.number}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[var(--text)]">
                            #{pr.number} {pr.title}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                void runAction(
                                  'github',
                                  'review_pr_files',
                                  {
                                    owner: connections.github.owner,
                                    repo: connections.github.repo,
                                    pullNumber: pr.number,
                                  },
                                  (data) =>
                                    setGhPrFiles({ prNumber: pr.number, files: data.files || [] })
                                )
                              }
                              className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-2)] cursor-pointer"
                            >
                              Review Changes
                            </button>
                            {pr.state === 'open' && (
                              <button
                                type="button"
                                onClick={() =>
                                  void runAction(
                                    'github',
                                    'merge_pr',
                                    {
                                      owner: connections.github.owner,
                                      repo: connections.github.repo,
                                      pullNumber: pr.number,
                                    },
                                    () => {
                                      notify(`PR #${pr.number} merged.`);
                                    },
                                    {
                                      title: `Confirm Merge Pull Request #${pr.number}`,
                                      description: `PR #${pr.number} (${pr.head} → ${pr.base}) মূল ব্রাঞ্চে Merge করা হবে।`,
                                    }
                                  )
                                }
                                className="rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold cursor-pointer"
                              >
                                Merge PR
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-[10px] font-mono text-[var(--text-3)]">
                          {pr.head} → {pr.base} · state: {pr.state}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {ghPrFiles && (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs space-y-1">
                    <div className="font-bold">
                      PR #{ghPrFiles.prNumber} Changed Files ({ghPrFiles.files.length})
                    </div>
                    {ghPrFiles.files.map((f: any) => (
                      <div key={f.filename} className="font-mono text-[10.5px] text-[var(--text-2)]">
                        {f.filename} (+{f.additions} / -{f.deletions})
                      </div>
                    ))}
                  </div>
                )}

                {/* Create PR */}
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 space-y-2">
                  <div className="text-[11px] font-bold">Create Pull Request</div>
                  <input
                    type="text"
                    value={ghPrTitle}
                    onChange={(e) => setGhPrTitle(e.target.value)}
                    placeholder="PR Title"
                    className="w-full rounded bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1 text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={ghPrHead}
                      onChange={(e) => setGhPrHead(e.target.value)}
                      placeholder="Head branch (feature)"
                      className="rounded bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1 text-xs font-mono"
                    />
                    <input
                      type="text"
                      value={ghPrBase}
                      onChange={(e) => setGhPrBase(e.target.value)}
                      placeholder="Base branch (main)"
                      className="rounded bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1 text-xs font-mono"
                    />
                  </div>
                  <textarea
                    rows={2}
                    value={ghPrBody}
                    onChange={(e) => setGhPrBody(e.target.value)}
                    placeholder="Pull request description..."
                    className="w-full rounded bg-[var(--surface)] border border-[var(--border)] p-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        'github',
                        'create_pr',
                        {
                          owner: connections.github.owner,
                          repo: connections.github.repo,
                          title: ghPrTitle,
                          head: ghPrHead,
                          base: ghPrBase,
                          body: ghPrBody,
                        },
                        () => {
                          setGhPrTitle('');
                          setGhPrBody('');
                        }
                      )
                    }
                    disabled={!ghPrTitle || !ghPrHead}
                    className="rounded bg-[var(--primary)] text-white px-3 py-1 text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    Create Pull Request
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          CARD 2: VERCEL — COMPLETE PROJECT & DEPLOYMENT ACCESS
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
              <VercelLogo className="w-4 h-4 text-[var(--text)]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-[var(--text)]">Vercel</h4>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getStatusBadgeStyle(
                    vcStatus
                  )}`}
                >
                  {formatConnectionStatusLabel(vcStatus)}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-3)]">
                Projects, Domains, Production/Preview Deployments, Build Logs &amp; Masked Env Vars
              </p>
            </div>
          </div>
          {connections.vercel?.connected && (
            <button
              type="button"
              onClick={() =>
                setActiveWorkbench(activeWorkbench === 'vercel' ? null : 'vercel')
              }
              className="rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/30 px-2.5 py-1.5 text-[11px] font-semibold hover:opacity-90 cursor-pointer"
            >
              {activeWorkbench === 'vercel' ? 'Close Workbench' : 'Open Vercel Workbench'}
            </button>
          )}
        </div>

        {/* Account & Services */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)] block">
              Connected Account &amp; Project
            </span>
            <span className="font-mono font-semibold text-[var(--text)]">
              {connections.vercel?.account || 'Not authenticated'}
              {connections.vercel?.projectId ? ` · Project: ${connections.vercel.projectId}` : ''}
            </span>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)] block">
              Available Services
            </span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {(
                verifications.vercel?.availableServices ||
                connections.vercel?.availableServices || [
                  'Vercel Projects',
                  'Deployment Inspector',
                  'Build Logs',
                  'Env Variables (Masked)',
                ]
              ).map((srv) => (
                <span
                  key={srv}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]"
                >
                  {srv}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Permission Matrix */}
        {vercelChecks.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)]">
              Verified Permissions
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {vercelChecks.map((chk) => (
                <div
                  key={chk.id}
                  className={`rounded-lg px-2 py-1 text-[10.5px] flex items-center gap-1.5 border ${
                    chk.granted
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/5 text-amber-300'
                  }`}
                  title={chk.detail}
                >
                  {chk.granted ? (
                    <Check className="w-3 h-3 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 shrink-0 text-amber-400" />
                  )}
                  <span className="truncate">{chk.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleOneClickOAuth('vercel')}
            disabled={busyProvider !== null}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--text)] text-[var(--bg)] px-3 py-2 text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {busyProvider === 'vercel-oauth' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <VercelLogo className="w-3.5 h-3.5" />
            )}
            {connections.vercel?.connected ? 'Reconnect Vercel (OAuth)' : 'Connect Vercel (OAuth)'}
          </button>

          <button
            type="button"
            onClick={() => setShowVcDirect((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--primary)]/40 bg-[var(--primary-soft)] text-[var(--primary)] px-3 py-2 text-xs font-bold hover:opacity-90 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {showVcDirect ? 'Hide Token Input' : 'Direct Vercel Token'}
          </button>

          <button
            type="button"
            onClick={() => void runPermissionCheck('vercel')}
            disabled={busyProvider !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Verify Connection
          </button>

          <button
            type="button"
            onClick={() => setShowOAuthConfigModal('vercel')}
            className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
            title="Configure Vercel OAuth App Client ID & Secret"
          >
            <Lock className="w-3.5 h-3.5" /> OAuth App
          </button>

          {connections.vercel?.connected && (
            <button
              type="button"
              onClick={() => void handleDisconnect('vercel')}
              disabled={busyProvider !== null}
              className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 cursor-pointer ml-auto"
            >
              <Unplug className="w-3.5 h-3.5" /> Disconnect
            </button>
          )}
        </div>

        {/* Vercel Direct Token Drawer */}
        {showVcDirect && (
          <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--surface)] p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[var(--primary)]" />
                Vercel Personal Access Token কানেকশন
              </span>
              <a
                href="https://vercel.com/account/tokens"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-[var(--primary)] hover:underline inline-flex items-center gap-1"
              >
                Create Vercel Token <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
              Vercel Dashboard → Account Settings → Tokens থেকে একটি পার্সোনাল টোকেন তৈরি করে এখানে দিন। এটি দিয়ে প্রজেক্ট, ডিপ্লয়মেন্ট ও এনভায়রনমেন্ট ভেরিয়েবল সম্পূর্ণ অ্যাক্সেস করা যাবে।
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">
                  Vercel Access Token *
                </label>
                <input
                  type="password"
                  value={vcTokenInput}
                  onChange={(e) => setVcTokenInput(e.target.value)}
                  placeholder="Paste Vercel token..."
                  className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-xs font-mono text-[var(--text)]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">
                    Project ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={vcProjectInput}
                    onChange={(e) => setVcProjectInput(e.target.value)}
                    placeholder="prj_..."
                    className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">
                    Team ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={vcTeamInput}
                    onChange={(e) => setVcTeamInput(e.target.value)}
                    placeholder="team_..."
                    className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text)]"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowVcDirect(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConnectVercelDirect}
                disabled={busyProvider === 'vercel-direct' || !vcTokenInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--primary)] text-white px-3.5 py-1.5 text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {busyProvider === 'vercel-direct' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Connect with Token
              </button>
            </div>
          </div>
        )}

        {statusMessage?.provider === 'vercel' && (
          <div
            className={`rounded-xl px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 ${
              statusMessage.ok
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {statusMessage.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            {!statusMessage.ok && (
              <button
                type="button"
                onClick={() => void handleOneClickOAuth('vercel')}
                className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/25 shrink-0 cursor-pointer"
              >
                Retry Authorization
              </button>
            )}
          </div>
        )}

        {/* ── VERCEL INTERACTIVE WORKBENCH ─────────────────────────────────── */}
        {activeWorkbench === 'vercel' && (
          <div className="rounded-xl border border-[var(--primary)]/40 bg-[var(--surface)] p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] pb-2">
              {(
                [
                  { id: 'projects', label: 'Projects & Domains', icon: Globe },
                  { id: 'deployments', label: 'Deployments & Build Logs', icon: Play },
                  { id: 'env', label: 'Environment Variables (Safe)', icon: Lock },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setVcTab(t.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer ${
                      vcTab === t.id
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>

            {vcTab === 'projects' && (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={loadVercelProjects}
                  className="rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  Load Vercel Projects
                </button>
                {vcProjects.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {vcProjects.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="font-bold text-[var(--text)]">
                            {p.name}{' '}
                            <span className="font-mono text-[10px] text-[var(--text-3)]">
                              ({p.framework || 'web'})
                            </span>
                          </div>
                          <div className="text-[10.5px] font-mono text-[var(--text-3)]">
                            ID: {p.id}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              updateVercel({ projectId: p.id });
                              void runAction(
                                'vercel',
                                'list_domains',
                                { projectId: p.id, teamId: connections.vercel?.teamId },
                                (data) => setVcDomains(data.domains || [])
                              );
                            }}
                            className="rounded border border-[var(--border)] px-2 py-1 text-[10.5px] cursor-pointer"
                          >
                            Domains
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateVercel({ projectId: p.id });
                              loadVercelDeployments(p.id);
                              setVcTab('deployments');
                            }}
                            className="rounded bg-[var(--primary-soft)] text-[var(--primary)] px-2 py-1 text-[10.5px] font-semibold cursor-pointer"
                          >
                            Deployments
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {vcDomains.length > 0 && (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs">
                    <div className="font-bold mb-1">Project Domains:</div>
                    {vcDomains.map((d) => (
                      <div key={d.name} className="font-mono text-[11px]">
                        https://{d.name} ({d.verified ? 'Verified' : 'Pending'})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {vcTab === 'deployments' && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadVercelDeployments()}
                    className="rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                  >
                    Refresh Deployments
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        'vercel',
                        'trigger_deploy',
                        {
                          projectId: connections.vercel?.projectId,
                          name: connections.vercel?.projectId || connections.github.repo,
                          target: 'preview',
                          teamId: connections.vercel?.teamId,
                        },
                        () => loadVercelDeployments(),
                        {
                          title: 'Confirm Preview Deployment',
                          description: 'Vercel-এ একটি নতুন Preview Deployment শুরু করা হবে।',
                        }
                      )
                    }
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] cursor-pointer"
                  >
                    Trigger Preview Deploy
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        'vercel',
                        'trigger_deploy',
                        {
                          projectId: connections.vercel?.projectId,
                          name: connections.vercel?.projectId || connections.github.repo,
                          target: 'production',
                          teamId: connections.vercel?.teamId,
                        },
                        () => loadVercelDeployments(),
                        {
                          title: 'Confirm PRODUCTION Deployment',
                          description:
                            'সতর্কতা: এটি সরাসরি Production Environment-এ লাইভ ডিপ্লয়মেন্ট শুরু করবে। আপনি কি নিশ্চিত?',
                        }
                      )
                    }
                    className="rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    Deploy to Production
                  </button>
                </div>

                {vcDeployments.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {vcDeployments.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[var(--text)] truncate">
                            {d.name} · <span className="font-mono">{d.state}</span> ({d.target})
                          </div>
                          <div className="text-[10.5px] font-mono text-[var(--text-3)] truncate">
                            {d.url ? `https://${d.url}` : d.id}
                          </div>
                          {d.errorMessage && (
                            <div className="text-[10.5px] text-rose-400">
                              Error: {d.errorCode} — {d.errorMessage}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setVcSelectedDeployment(d);
                            void runAction(
                              'vercel',
                              'get_build_logs',
                              { deploymentId: d.id, teamId: connections.vercel?.teamId },
                              (data) => setVcBuildLogs(data.logs || [])
                            );
                          }}
                          className="rounded border border-[var(--border)] px-2 py-1 text-[10.5px] shrink-0 cursor-pointer"
                        >
                          Build Logs
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {vcSelectedDeployment && (
                  <div className="rounded-lg border border-[var(--border)] bg-black/50 p-2.5 font-mono text-[10.5px] max-h-44 overflow-y-auto space-y-1">
                    <div className="text-emerald-400 font-bold">
                      Build Logs — {vcSelectedDeployment.id}
                    </div>
                    {vcBuildLogs.length === 0 ? (
                      <div className="text-[var(--text-3)]">No log lines returned.</div>
                    ) : (
                      vcBuildLogs.map((l, idx) => (
                        <div key={idx} className="text-[var(--text-2)]">
                          {l.text}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {vcTab === 'env' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text)]">
                    Environment Variables (Values Masked for Security)
                  </span>
                  <button
                    type="button"
                    onClick={() => loadVercelEnvs()}
                    className="rounded-lg bg-[var(--primary)] text-white px-2.5 py-1 text-xs font-semibold cursor-pointer"
                  >
                    Load Env Vars
                  </button>
                </div>

                {vcEnvs.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {vcEnvs.map((ev) => (
                      <div
                        key={ev.id || ev.key}
                        className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs flex items-center justify-between font-mono"
                      >
                        <span className="font-bold text-[var(--text)]">{ev.key}</span>
                        <span className="text-[var(--text-3)]">
                          •••••••• ({(ev.target || []).join(', ')})
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 space-y-2">
                  <div className="text-[11px] font-bold">Add Encrypted Environment Variable</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={vcNewEnvKey}
                      onChange={(e) => setVcNewEnvKey(e.target.value)}
                      placeholder="KEY_NAME"
                      className="rounded bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1 text-xs font-mono"
                    />
                    <input
                      type="password"
                      value={vcNewEnvValue}
                      onChange={(e) => setVcNewEnvValue(e.target.value)}
                      placeholder="Secret value (never shown in chat)"
                      className="rounded bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1 text-xs font-mono"
                    />
                    <select
                      value={vcNewEnvTarget}
                      onChange={(e) => setVcNewEnvTarget(e.target.value as any)}
                      className="rounded bg-[var(--surface)] border border-[var(--border)] px-2 py-1 text-xs"
                    >
                      <option value="preview">Preview</option>
                      <option value="production">Production</option>
                      <option value="development">Development</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        'vercel',
                        'create_env',
                        {
                          projectId: connections.vercel?.projectId,
                          teamId: connections.vercel?.teamId,
                          key: vcNewEnvKey,
                          value: vcNewEnvValue,
                          target: [vcNewEnvTarget],
                        },
                        () => {
                          setVcNewEnvKey('');
                          setVcNewEnvValue('');
                          loadVercelEnvs();
                        }
                      )
                    }
                    disabled={!vcNewEnvKey || !vcNewEnvValue}
                    className="rounded bg-[var(--primary)] text-white px-3 py-1 text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    Save Encrypted Variable
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          CARD 3: SUPABASE — COMPLETE PROJECT & DATABASE ACCESS
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
              <SupabaseLogo className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-[var(--text)]">Supabase</h4>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getStatusBadgeStyle(
                    sbStatus
                  )}`}
                >
                  {formatConnectionStatusLabel(sbStatus)}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-3)]">
                Organizations, Projects, Schema/Table Explorer, CRUD Operations &amp; Safe Migrations
              </p>
            </div>
          </div>
          {connections.supabase?.connected && (
            <button
              type="button"
              onClick={() =>
                setActiveWorkbench(activeWorkbench === 'supabase' ? null : 'supabase')
              }
              className="rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/30 px-2.5 py-1.5 text-[11px] font-semibold hover:opacity-90 cursor-pointer"
            >
              {activeWorkbench === 'supabase' ? 'Close Workbench' : 'Open Database Workbench'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)] block">
              Connected Project &amp; Organization
            </span>
            <span className="font-mono font-semibold text-[var(--text)]">
              {connections.supabase?.account ||
                connections.supabase?.projectUrl ||
                'Not connected'}
            </span>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)] block">
              Available Services
            </span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {(
                verifications.supabase?.availableServices ||
                connections.supabase?.availableServices || [
                  'Database Schema Explorer',
                  'Table Data CRUD',
                  'SQL & Migration Assistant',
                ]
              ).map((srv) => (
                <span
                  key={srv}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]"
                >
                  {srv}
                </span>
              ))}
            </div>
          </div>
        </div>

        {supabaseChecks.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)]">
              Verified Permissions
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {supabaseChecks.map((chk) => (
                <div
                  key={chk.id}
                  className={`rounded-lg px-2 py-1 text-[10.5px] flex items-center gap-1.5 border ${
                    chk.granted
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/5 text-amber-300'
                  }`}
                  title={chk.detail}
                >
                  {chk.granted ? (
                    <Check className="w-3 h-3 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 shrink-0 text-amber-400" />
                  )}
                  <span className="truncate">{chk.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleOneClickOAuth('supabase')}
            disabled={busyProvider !== null}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white px-3 py-2 text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {busyProvider === 'supabase-oauth' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <SupabaseLogo className="w-3.5 h-3.5" />
            )}
            {connections.supabase?.connected ? 'Reconnect Supabase (OAuth)' : 'Connect Supabase (OAuth)'}
          </button>

          <button
            type="button"
            onClick={() => setShowSbDirect((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 px-3 py-2 text-xs font-bold hover:opacity-90 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {showSbDirect ? 'Hide Database Input' : 'Direct Project URL & Key'}
          </button>

          <button
            type="button"
            onClick={() => void runPermissionCheck('supabase')}
            disabled={busyProvider !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Verify Connection
          </button>

          <button
            type="button"
            onClick={() => setShowOAuthConfigModal('supabase')}
            className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
            title="Configure Supabase OAuth App Client ID & Secret"
          >
            <Lock className="w-3.5 h-3.5" /> OAuth App
          </button>

          {connections.supabase?.connected && (
            <button
              type="button"
              onClick={() => void handleDisconnect('supabase')}
              disabled={busyProvider !== null}
              className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 cursor-pointer ml-auto"
            >
              <Unplug className="w-3.5 h-3.5" /> Disconnect
            </button>
          )}
        </div>

        {/* Supabase Direct Project URL & Key Drawer */}
        {showSbDirect && (
          <div className="rounded-xl border border-emerald-500/30 bg-[var(--surface)] p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                Supabase Project URL &amp; API Key সরাসরি কানেকশন
              </span>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1"
              >
                Supabase Dashboard <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
              আপনার Supabase Dashboard → Settings → API থেকে Project URL এবং anon/public key অথবা service_role key দিন।
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">
                  Project URL (https://xyz.supabase.co) *
                </label>
                <input
                  type="text"
                  value={sbUrlInput}
                  onChange={(e) => setSbUrlInput(e.target.value)}
                  placeholder="https://your-project-id.supabase.co"
                  className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-xs font-mono text-[var(--text)]"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">
                  API Key / Service Role Key *
                </label>
                <input
                  type="password"
                  value={sbKeyInput}
                  onChange={(e) => setSbKeyInput(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-xs font-mono text-[var(--text)]"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">
                  Management Access Token (Optional — sbp_...)
                </label>
                <input
                  type="password"
                  value={sbManagementTokenInput}
                  onChange={(e) => setSbManagementTokenInput(e.target.value)}
                  placeholder="sbp_xxxxxxxxxxxxxxxxxxxx (Supabase Access Token)"
                  className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 text-xs font-mono text-[var(--text)]"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowSbDirect(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConnectSupabaseDirect}
                disabled={busyProvider === 'supabase-direct' || (!sbUrlInput.trim() && !sbManagementTokenInput.trim())}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white px-3.5 py-1.5 text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {busyProvider === 'supabase-direct' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Connect Supabase
              </button>
            </div>
          </div>
        )}

        {statusMessage?.provider === 'supabase' && (
          <div
            className={`rounded-xl px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 ${
              statusMessage.ok
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {statusMessage.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            {!statusMessage.ok && (
              <button
                type="button"
                onClick={() => void handleOneClickOAuth('supabase')}
                className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/25 shrink-0 cursor-pointer"
              >
                Retry Authorization
              </button>
            )}
          </div>
        )}

        {/* ── SUPABASE INTERACTIVE WORKBENCH ───────────────────────────────── */}
        {activeWorkbench === 'supabase' && (
          <div className="rounded-xl border border-[var(--primary)]/40 bg-[var(--surface)] p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] pb-2">
              {(
                [
                  { id: 'schema', label: 'Schema & Table Explorer', icon: Layers },
                  { id: 'data', label: 'Table Data & CRUD', icon: Table },
                  { id: 'sql', label: 'SQL & Migration Assistant', icon: Terminal },
                  { id: 'projects', label: 'Orgs & Projects', icon: Globe },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSbTab(t.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer ${
                      sbTab === t.id
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>

            {sbTab === 'schema' && (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={loadSupabaseSchema}
                  className="rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  Inspect Database Schema &amp; Tables
                </button>
                {sbTables.length > 0 && (
                  <div className="max-h-52 overflow-y-auto space-y-2">
                    {sbTables.map((t) => (
                      <div
                        key={t.name}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[var(--text)]">
                            {t.schema || 'public'}.{t.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSbSelectedTable(t.name);
                              loadSupabaseTableData(t.name);
                              setSbTab('data');
                            }}
                            className="rounded bg-[var(--primary-soft)] text-[var(--primary)] px-2 py-0.5 text-[10.5px] font-semibold cursor-pointer"
                          >
                            Query Data →
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(t.columns || []).map((c: any) => (
                            <span
                              key={c.name}
                              className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--text-2)]"
                            >
                              {c.name}: {c.type}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {sbTab === 'data' && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={sbSelectedTable}
                    onChange={(e) => setSbSelectedTable(e.target.value)}
                    placeholder="Table name"
                    className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-mono text-[var(--text)]"
                  />
                  <button
                    type="button"
                    onClick={() => loadSupabaseTableData()}
                    className="rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                  >
                    Read Rows
                  </button>
                </div>

                {sbTableRows.length > 0 && (
                  <pre className="rounded-lg border border-[var(--border)] bg-black/40 p-2.5 text-[10.5px] font-mono max-h-44 overflow-auto text-[var(--text-2)]">
                    {JSON.stringify(sbTableRows, null, 2)}
                  </pre>
                )}

                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 space-y-2">
                  <div className="text-[11px] font-bold">Insert / Update / Delete Row (JSON)</div>
                  <textarea
                    rows={3}
                    value={sbRowJsonInput}
                    onChange={(e) => setSbRowJsonInput(e.target.value)}
                    className="w-full rounded bg-[var(--surface)] border border-[var(--border)] p-2 text-xs font-mono"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        let parsed = {};
                        try {
                          parsed = JSON.parse(sbRowJsonInput);
                        } catch {
                          notify('Invalid JSON');
                          return;
                        }
                        void runAction(
                          'supabase',
                          'insert_row',
                          {
                            projectUrl: connections.supabase?.projectUrl,
                            anonKey: connections.supabase?.anonKey,
                            serviceRoleKey: connections.supabase?.serviceRoleKey,
                            table: sbSelectedTable,
                            row: parsed,
                          },
                          () => loadSupabaseTableData()
                        );
                      }}
                      className="rounded bg-[var(--primary)] text-white px-2.5 py-1 text-xs font-semibold cursor-pointer"
                    >
                      Insert Row
                    </button>
                    <input
                      type="text"
                      value={sbMatchCol}
                      onChange={(e) => setSbMatchCol(e.target.value)}
                      placeholder="Match column (id)"
                      className="rounded bg-[var(--surface)] border border-[var(--border)] px-2 py-1 text-xs font-mono w-28"
                    />
                    <input
                      type="text"
                      value={sbMatchVal}
                      onChange={(e) => setSbMatchVal(e.target.value)}
                      placeholder="Match value"
                      className="rounded bg-[var(--surface)] border border-[var(--border)] px-2 py-1 text-xs font-mono w-32"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(
                          'supabase',
                          'delete_row',
                          {
                            projectUrl: connections.supabase?.projectUrl,
                            anonKey: connections.supabase?.anonKey,
                            serviceRoleKey: connections.supabase?.serviceRoleKey,
                            table: sbSelectedTable,
                            matchColumn: sbMatchCol,
                            matchValue: sbMatchVal,
                          },
                          () => loadSupabaseTableData()
                        )
                      }
                      disabled={!sbMatchVal}
                      className="rounded border border-rose-500/40 bg-rose-500/10 text-rose-400 px-2.5 py-1 text-xs font-semibold cursor-pointer"
                    >
                      Delete Row
                    </button>
                  </div>
                </div>
              </div>
            )}

            {sbTab === 'sql' && (
              <div className="space-y-2.5">
                <div className="text-[11px] text-[var(--text-3)]">
                  Create Table, Alter Table অথবা SQL Migration চালানোর আগে সর্বদা আপনার অনুমোদন নেওয়া হবে। (Core SMFTA tables সুরক্ষিত।)
                </div>
                <textarea
                  rows={5}
                  value={sbSqlInput}
                  onChange={(e) => setSbSqlInput(e.target.value)}
                  className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] p-2.5 text-xs font-mono text-[var(--text)]"
                />
                <button
                  type="button"
                  onClick={() =>
                    void runAction(
                      'supabase',
                      'execute_sql',
                      {
                        projectRef:
                          connections.supabase?.projectRef ||
                          connections.supabase?.projectUrl
                            ?.replace('https://', '')
                            .split('.')[0],
                        sql: sbSqlInput,
                      },
                      (data) => setSbSqlOutput(data),
                      {
                        title: 'Confirm SQL / Schema Migration Execution',
                        description: `নিম্নলিখিত SQL কোয়েরিটি আপনার Supabase প্রজেক্টে রান করা হবে:\n${sbSqlInput.slice(
                          0,
                          180
                        )}`,
                      }
                    )
                  }
                  className="rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  Execute Approved SQL Migration
                </button>
                {sbSqlOutput && (
                  <pre className="rounded-lg border border-[var(--border)] bg-black/40 p-2.5 text-[10.5px] font-mono max-h-40 overflow-auto text-emerald-300">
                    {JSON.stringify(sbSqlOutput, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {sbTab === 'projects' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void runAction('supabase', 'list_orgs', {}, (data) =>
                        setSbOrgs(data.organizations || [])
                      )
                    }
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs cursor-pointer"
                  >
                    Load Organizations
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void runAction('supabase', 'list_projects', {}, (data) =>
                        setSbMgmtProjects(data.projects || [])
                      )
                    }
                    className="rounded-lg bg-[var(--primary)] text-white px-2.5 py-1 text-xs font-semibold cursor-pointer"
                  >
                    Load Projects
                  </button>
                </div>
                {sbMgmtProjects.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold">{p.name}</span> ·{' '}
                      <span className="font-mono text-[10.5px]">{p.id}</span> ({p.region})
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateSupabase({
                          projectRef: p.id,
                          projectUrl: `https://${p.id}.supabase.co`,
                        })
                      }
                      className="rounded bg-[var(--primary-soft)] text-[var(--primary)] px-2 py-0.5 text-[10.5px] font-semibold cursor-pointer"
                    >
                      Select Project
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          CARD 4: GOOGLE — COMPLETE OAUTH INTEGRATION (DRIVE, DOCS, SHEETS)
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
              <GoogleLogo className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-[var(--text)]">Google</h4>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getStatusBadgeStyle(
                    ggStatus
                  )}`}
                >
                  {formatConnectionStatusLabel(ggStatus)}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-3)]">
                Google Account, Google Drive, Google Docs &amp; Google Sheets Integration
              </p>
            </div>
          </div>
          {connections.drive.connected && (
            <button
              type="button"
              onClick={() =>
                setActiveWorkbench(activeWorkbench === 'google' ? null : 'google')
              }
              className="rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/30 px-2.5 py-1.5 text-[11px] font-semibold hover:opacity-90 cursor-pointer"
            >
              {activeWorkbench === 'google' ? 'Close Workbench' : 'Open Google Workbench'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)] block">
              Connected Google Account
            </span>
            <span className="font-mono font-semibold text-[var(--text)]">
              {connections.drive.account || 'Not authenticated'}
            </span>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)] block">
              Available Services
            </span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {(
                verifications.google?.availableServices ||
                connections.drive.availableServices || [
                  'Google Account',
                  'Google Drive',
                  'Google Docs',
                  'Google Sheets',
                ]
              ).map((srv) => (
                <span
                  key={srv}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]"
                >
                  {srv}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Scope & Permission Checks */}
        {googleChecks.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)]">
                Verified Google OAuth Scopes
              </span>
              {ggStatus === 'permission_required' && (
                <button
                  type="button"
                  onClick={handleGoogleClientOAuth}
                  className="text-[10.5px] font-bold text-amber-400 hover:underline cursor-pointer"
                >
                  Reauthorize Missing Scopes →
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {googleChecks.map((chk) => (
                <div
                  key={chk.id}
                  className={`rounded-lg px-2 py-1 text-[10.5px] flex items-center gap-1.5 border ${
                    chk.granted
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/5 text-amber-300'
                  }`}
                  title={chk.detail}
                >
                  {chk.granted ? (
                    <Check className="w-3 h-3 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 shrink-0 text-amber-400" />
                  )}
                  <span className="truncate">{chk.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGoogleClientOAuth}
            disabled={busyProvider !== null}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--text)] text-[var(--bg)] px-3 py-2 text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {busyProvider === 'google-oauth' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <GoogleLogo className="w-3.5 h-3.5" />
            )}
            {connections.drive.connected ? 'Reauthorize Google (OAuth)' : 'Connect Google (OAuth)'}
          </button>

          <button
            type="button"
            onClick={() => void runPermissionCheck('google')}
            disabled={busyProvider !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Verify Connection
          </button>

          {connections.drive.connected && (
            <button
              type="button"
              onClick={() => void handleDisconnect('google')}
              disabled={busyProvider !== null}
              className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 cursor-pointer ml-auto"
            >
              <Unplug className="w-3.5 h-3.5" /> Disconnect
            </button>
          )}
        </div>

        {statusMessage?.provider === 'google' && (
          <div
            className={`rounded-xl px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 ${
              statusMessage.ok
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {statusMessage.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            {!statusMessage.ok && (
              <button
                type="button"
                onClick={handleGoogleClientOAuth}
                className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/25 shrink-0 cursor-pointer"
              >
                Retry Authorization
              </button>
            )}
          </div>
        )}

        {/* ── GOOGLE INTERACTIVE WORKBENCH ─────────────────────────────────── */}
        {activeWorkbench === 'google' && (
          <div className="rounded-xl border border-[var(--primary)]/40 bg-[var(--surface)] p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] pb-2">
              {(
                [
                  { id: 'drive', label: 'Google Drive Explorer', icon: FolderPlus },
                  { id: 'docs', label: 'Google Docs Read/Write', icon: FileText },
                  { id: 'sheets', label: 'Google Sheets Read/Write', icon: FileSpreadsheet },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setGgTab(t.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer ${
                      ggTab === t.id
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>

            {ggTab === 'drive' && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ggSearchQuery}
                    onChange={(e) => setGgSearchQuery(e.target.value)}
                    placeholder="Search Drive files..."
                    className="flex-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={loadGoogleDriveFiles}
                    className="rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                  >
                    List / Search Files
                  </button>
                </div>
                {ggFiles.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {ggFiles.map((f) => (
                      <div
                        key={f.id}
                        className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--text)] truncate">{f.name}</div>
                          <div className="font-mono text-[10px] text-[var(--text-3)]">
                            ID: {f.id} · {f.mimeType}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {f.mimeType?.includes('document') && (
                            <button
                              type="button"
                              onClick={() => {
                                setGgDocId(f.id);
                                setGgTab('docs');
                              }}
                              className="rounded bg-[var(--primary-soft)] text-[var(--primary)] px-2 py-0.5 text-[10px] font-semibold cursor-pointer"
                            >
                              Open in Docs
                            </button>
                          )}
                          {f.mimeType?.includes('spreadsheet') && (
                            <button
                              type="button"
                              onClick={() => {
                                setGgSheetId(f.id);
                                setGgTab('sheets');
                              }}
                              className="rounded bg-[var(--primary-soft)] text-[var(--primary)] px-2 py-0.5 text-[10px] font-semibold cursor-pointer"
                            >
                              Open in Sheets
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {ggTab === 'docs' && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={ggDocId}
                    onChange={(e) => setGgDocId(e.target.value)}
                    placeholder="Google Document ID"
                    className="flex-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        'google',
                        'read_document',
                        { documentId: ggDocId },
                        (data) => {
                          setGgDocTitle(data.title || '');
                          setGgDocContent(data.content || '');
                        }
                      )
                    }
                    disabled={!ggDocId}
                    className="rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                  >
                    Read Document
                  </button>
                </div>
                <input
                  type="text"
                  value={ggDocTitle}
                  onChange={(e) => setGgDocTitle(e.target.value)}
                  placeholder="Document Title (for creating new Doc)"
                  className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1.5 text-xs"
                />
                <textarea
                  rows={5}
                  value={ggDocContent}
                  onChange={(e) => setGgDocContent(e.target.value)}
                  placeholder="Document content..."
                  className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] p-2.5 text-xs"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        'google',
                        'create_document',
                        { title: ggDocTitle || 'SMFTA AI Pro Document', content: ggDocContent },
                        (data) => setGgDocId(data.documentId || '')
                      )
                    }
                    className="rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                  >
                    Create New Google Doc
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        'google',
                        'update_document',
                        { documentId: ggDocId, text: ggDocContent },
                        () => notify('Google Document updated.')
                      )
                    }
                    disabled={!ggDocId}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold cursor-pointer"
                  >
                    Append / Update Existing Doc
                  </button>
                </div>
              </div>
            )}

            {ggTab === 'sheets' && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={ggSheetId}
                    onChange={(e) => setGgSheetId(e.target.value)}
                    placeholder="Spreadsheet ID"
                    className="sm:col-span-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={ggSheetRange}
                    onChange={(e) => setGgSheetRange(e.target.value)}
                    placeholder="Sheet1!A1:E20"
                    className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void runAction(
                      'google',
                      'read_spreadsheet',
                      { spreadsheetId: ggSheetId, range: ggSheetRange },
                      (data) => setGgSheetValues(data.values || [])
                    )
                  }
                  disabled={!ggSheetId}
                  className="rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  Read Spreadsheet Values
                </button>
                {ggSheetValues.length > 0 && (
                  <pre className="rounded-lg border border-[var(--border)] bg-black/40 p-2 text-[10.5px] font-mono max-h-40 overflow-auto">
                    {JSON.stringify(ggSheetValues, null, 2)}
                  </pre>
                )}
                <textarea
                  rows={2}
                  value={ggSheetUpdateJson}
                  onChange={(e) => setGgSheetUpdateJson(e.target.value)}
                  className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] p-2 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    let vals: any[][] = [];
                    try {
                      vals = JSON.parse(ggSheetUpdateJson);
                    } catch {
                      notify('Invalid 2D JSON array');
                      return;
                    }
                    void runAction(
                      'google',
                      'update_spreadsheet',
                      { spreadsheetId: ggSheetId, range: ggSheetRange, values: vals },
                      () => notify('Spreadsheet updated.')
                    );
                  }}
                  disabled={!ggSheetId}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  Update Spreadsheet Cells
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          OAUTH APP CREDENTIALS CONFIGURATION MODAL
         ═══════════════════════════════════════════════════════════════════════ */}
      {showOAuthConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[var(--primary-soft)] border border-[var(--primary)]/30 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--text)]">
                    {showOAuthConfigModal.toUpperCase()} OAuth App Configuration
                  </h4>
                  <p className="text-[11px] text-[var(--text-3)]">
                    Configure your registered OAuth 2.0 App credentials
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOAuthConfigModal(null)}
                className="text-[var(--text-3)] hover:text-[var(--text)] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">
                  OAuth Client ID *
                </label>
                <input
                  type="text"
                  value={oauthAppClientId}
                  onChange={(e) => setOauthAppClientId(e.target.value)}
                  placeholder="Enter OAuth Client ID"
                  className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 font-mono text-[var(--text)]"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">
                  OAuth Client Secret {showOAuthConfigModal === 'google' ? '(Optional for Web Client)' : '*'}
                </label>
                <input
                  type="password"
                  value={oauthAppClientSecret}
                  onChange={(e) => setOauthAppClientSecret(e.target.value)}
                  placeholder="Enter OAuth Client Secret"
                  className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-1.5 font-mono text-[var(--text)]"
                />
              </div>
              <div className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] p-2.5 text-[10.5px] text-[var(--text-3)] space-y-1">
                <div>
                  <strong>Authorized Redirect URI:</strong>
                </div>
                <div className="font-mono text-[var(--primary)] break-all select-all">
                  {oauthConfig?.redirectUri || `${window.location.origin}/auth/callback`}
                </div>
                <p className="mt-1">
                  আপনার {showOAuthConfigModal.toUpperCase()} Developer Console-এ Redirect URI টি যোগ করুন।
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowOAuthConfigModal(null)}
                className="rounded-xl border border-[var(--border)] px-3.5 py-1.5 text-xs text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveOAuthAppConfig(showOAuthConfigModal)}
                disabled={busyProvider?.includes('app-cfg') || !oauthAppClientId.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--primary)] text-white px-4 py-1.5 text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {busyProvider?.includes('app-cfg') ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Save App Credentials
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MANDATORY CONFIRMATION MODAL FOR WRITE / DESTRUCTIVE OPERATIONS
         ═══════════════════════════════════════════════════════════════════════ */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-[var(--surface)] p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[var(--text)]">{pendingConfirm.title}</h4>
                <p className="text-xs text-[var(--text-2)] mt-1 whitespace-pre-wrap">
                  {pendingConfirm.description}
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-[11px] font-mono text-[var(--text-3)]">
              Provider: {pendingConfirm.provider.toUpperCase()} · Action: {pendingConfirm.action}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                disabled={confirmBusy}
                className="rounded-xl border border-[var(--border)] px-3.5 py-2 text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPendingAction}
                disabled={confirmBusy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white px-4 py-2 text-xs font-bold hover:bg-emerald-500 cursor-pointer"
              >
                {confirmBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Confirm &amp; Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VaultConnectionsPanel;
