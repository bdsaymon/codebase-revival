import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  ExternalLink,
  GitBranch,
  Globe,
  KeyRound,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import {
  disconnectProviderSession,
  loadVaultConnections,
  persistVaultConnections,
  storeEncryptedProviderSession,
  verifyProviderPermissions,
  type VaultConnections,
} from '../../utils/cloudVault';
import { SettingsCard } from '../SettingsControls';
import type { ProvidersApiSectionProps } from './ProvidersApiSection';

export interface ConnectionsSectionProps extends Partial<ProvidersApiSectionProps> {
  connections?: VaultConnections;
  onUpdateConnections?: (next: VaultConnections) => void;
  notify?: (msg: string) => void;
  defaultOpenAdvanced?: boolean;
}

type DirectProviderId = 'github' | 'supabase' | 'vercel';

interface DirectProviderMeta {
  id: DirectProviderId;
  name: string;
  tokenPlaceholder: string;
}

const DIRECT_PROVIDERS: DirectProviderMeta[] = [
  {
    id: 'github',
    name: 'GitHub',
    tokenPlaceholder: 'ghp_...',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    tokenPlaceholder: 'sbp_...',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    tokenPlaceholder: 'Vercel Token',
  },
];

export const ConnectionsSection: React.FC<ConnectionsSectionProps> = ({
  connections: externalConnections,
  onUpdateConnections,
  notify,
}) => {
  const [localConn, setLocalConn] = useState<VaultConnections>(() =>
    externalConnections || loadVaultConnections()
  );
  const [connectingProvider, setConnectingProvider] =
    useState<DirectProviderId | null>(null);
  const [providerErrors, setProviderErrors] = useState<
    Partial<Record<DirectProviderId, string>>
  >({});
  const [tokenInputs, setTokenInputs] = useState<
    Record<DirectProviderId, string>
  >({
    github: '',
    supabase: '',
    vercel: '',
  });
  const [openPatFallback, setOpenPatFallback] = useState<
    Partial<Record<DirectProviderId, boolean>>
  >({});

  useEffect(() => {
    if (externalConnections) {
      setLocalConn(externalConnections);
    }
  }, [externalConnections]);

  const syncConnections = (next: VaultConnections) => {
    setLocalConn(next);
    persistVaultConnections(next);
    onUpdateConnections?.(next);
  };

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'OAUTH_AUTH_SUCCESS' && data.type !== 'OAUTH_AUTH_ERROR') {
        return;
      }
      const provider = data.provider as DirectProviderId | undefined;
      if (
        provider !== 'github' &&
        provider !== 'supabase' &&
        provider !== 'vercel'
      ) {
        return;
      }
      setConnectingProvider(null);
      if (data.type === 'OAUTH_AUTH_ERROR' || data.error) {
        const errMsg = String(data.error || 'OAuth ব্যর্থ হয়েছে');
        setProviderErrors((prev) => ({ ...prev, [provider]: errMsg }));
        return;
      }

      const verifyRes = await verifyProviderPermissions({ provider });
      if (verifyRes.ok) {
        const next: VaultConnections = {
          ...localConn,
          [provider]: {
            ...localConn[provider],
            connected: true,
            status: 'connected',
            account: verifyRes.account || provider,
            verifiedAt: Date.now(),
            grantedScopes: verifyRes.grantedScopes,
            permissions: verifyRes.permissions,
          },
        };
        syncConnections(next);
        setProviderErrors((prev) => ({ ...prev, [provider]: undefined }));
        notify?.(`✅ ${provider.toUpperCase()} Connected`);
      } else {
        setProviderErrors((prev) => ({
          ...prev,
          [provider]: verifyRes.message || 'Verification failed',
        }));
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localConn]);

  const handleConnectOAuth = async (provider: DirectProviderId) => {
    setConnectingProvider(provider);
    setProviderErrors((prev) => ({ ...prev, [provider]: undefined }));
    try {
      const res = await fetch(
        `/api/oauth/url?provider=${encodeURIComponent(provider)}`
      );
      const data = await res.json();
      if (!data.ok || !data.url) {
        setOpenPatFallback((prev) => ({ ...prev, [provider]: true }));
        setConnectingProvider(null);
        return;
      }

      const popup = window.open(
        data.url,
        `smfta_oauth_${provider}`,
        'width=600,height=720,menubar=no,toolbar=no,location=no,status=no'
      );
      if (!popup) {
        setOpenPatFallback((prev) => ({ ...prev, [provider]: true }));
        setConnectingProvider(null);
      }
    } catch {
      setOpenPatFallback((prev) => ({ ...prev, [provider]: true }));
      setConnectingProvider(null);
    }
  };

  const handleTestAndSaveToken = async (provider: DirectProviderId) => {
    const rawToken = tokenInputs[provider].trim();
    if (!rawToken) return;
    setConnectingProvider(provider);
    setProviderErrors((prev) => ({ ...prev, [provider]: undefined }));
    try {
      const verifyRes = await verifyProviderPermissions({
        provider,
        token: rawToken,
        managementToken: provider === 'supabase' ? rawToken : undefined,
      });
      if (!verifyRes.ok) {
        setProviderErrors((prev) => ({
          ...prev,
          [provider]: verifyRes.message || 'Invalid token',
        }));
        return;
      }
      await storeEncryptedProviderSession({
        provider,
        token: rawToken,
        account: verifyRes.account,
      });
      const next: VaultConnections = {
        ...localConn,
        [provider]: {
          ...localConn[provider],
          connected: true,
          status: 'connected',
          token: rawToken,
          ...(provider === 'supabase' ? { managementToken: rawToken } : {}),
          account: verifyRes.account || provider,
          verifiedAt: Date.now(),
          grantedScopes: verifyRes.grantedScopes,
          permissions: verifyRes.permissions,
        },
      };
      syncConnections(next);
      setTokenInputs((prev) => ({ ...prev, [provider]: '' }));
      setOpenPatFallback((prev) => ({ ...prev, [provider]: false }));
      notify?.(`✅ ${provider.toUpperCase()} Connected`);
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleDisconnect = async (provider: DirectProviderId) => {
    const currentAccount =
      (localConn[provider] as { account?: string }).account || '';
    await disconnectProviderSession(provider, currentAccount);
    const next: VaultConnections = {
      ...localConn,
      [provider]: {
        ...localConn[provider],
        connected: false,
        status: 'not_connected',
        token: '',
        ...(provider === 'supabase' ? { managementToken: '', anonKey: '' } : {}),
        account: '',
        verifiedAt: undefined,
      },
    };
    syncConnections(next);
    setProviderErrors((prev) => ({ ...prev, [provider]: undefined }));
    notify?.(`${provider.toUpperCase()} Disconnected`);
  };

  const renderProviderIcon = (id: DirectProviderId) => {
    if (id === 'github') return <GitBranch className="w-4 h-4" />;
    if (id === 'supabase') return <Database className="w-4 h-4" />;
    return <Globe className="w-4 h-4" />;
  };

  return (
    <div className="space-y-3" data-testid="settings-section-connections">
      <SettingsCard>
        <div className="divide-y divide-[var(--border)]" data-testid="oauth-connection-cards">
          {DIRECT_PROVIDERS.map((meta) => {
            const state = localConn[meta.id] as {
              connected?: boolean;
              status?: string;
              account?: string;
            };
            const errText = providerErrors[meta.id];
            const isConnected = Boolean(
              state?.connected || state?.status === 'connected'
            );
            const statusLabel: 'Connected' | 'Not connected' | 'Error' = errText
              ? 'Error'
              : isConnected
              ? 'Connected'
              : 'Not connected';
            const isBusy = connectingProvider === meta.id;

            return (
              <div
                key={meta.id}
                data-testid={`connection-card-${meta.id}`}
                className="py-3 first:pt-1 last:pb-1 space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="p-2 rounded-lg bg-[var(--surface-2)] text-[var(--text)] shrink-0">
                      {renderProviderIcon(meta.id)}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-[13.5px] font-semibold text-[var(--ink)]">
                        {meta.name}
                      </span>
                      <span
                        data-testid={`connection-status-${meta.id}`}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1 border ${
                          statusLabel === 'Connected'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-[var(--accent-emerald)]'
                            : statusLabel === 'Error'
                            ? 'border-rose-500/40 bg-rose-500/10 text-[var(--settings-danger)]'
                            : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)]'
                        }`}
                      >
                        {statusLabel === 'Connected' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : statusLabel === 'Error' ? (
                          <XCircle className="w-3 h-3" />
                        ) : null}
                        {isConnected && state.account ? state.account : statusLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isConnected && (
                      <button
                        type="button"
                        data-testid={`toggle-pat-${meta.id}`}
                        onClick={() =>
                          setOpenPatFallback((prev) => ({
                            ...prev,
                            [meta.id]: !prev[meta.id],
                          }))
                        }
                        title="Use Access Token"
                        className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-medium text-[var(--text-2)] hover:text-[var(--text)] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Token</span>
                      </button>
                    )}

                    {isConnected ? (
                      <button
                        type="button"
                        data-testid={`disconnect-btn-${meta.id}`}
                        onClick={() => handleDisconnect(meta.id)}
                        className="px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs font-semibold text-[var(--settings-danger)] cursor-pointer"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid={`connect-btn-${meta.id}`}
                        disabled={isBusy}
                        onClick={() => handleConnectOAuth(meta.id)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isBusy ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="w-3.5 h-3.5" />
                        )}
                        Connect
                      </button>
                    )}
                  </div>
                </div>

                {errText && (
                  <div
                    data-testid={`connection-error-${meta.id}`}
                    className="text-xs text-[var(--settings-danger)]"
                  >
                    {errText}
                  </div>
                )}

                {!isConnected && openPatFallback[meta.id] && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="password"
                      data-testid={`pat-input-${meta.id}`}
                      value={tokenInputs[meta.id]}
                      onChange={(e) =>
                        setTokenInputs((prev) => ({
                          ...prev,
                          [meta.id]: e.target.value,
                        }))
                      }
                      placeholder={meta.tokenPlaceholder}
                      className="cs-input flex-1 text-xs font-mono py-1.5"
                    />
                    <button
                      type="button"
                      data-testid={`test-connect-pat-${meta.id}`}
                      disabled={isBusy}
                      onClick={() => handleTestAndSaveToken(meta.id)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold cursor-pointer shrink-0"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SettingsCard>

      <DeploymentConnectionDiagnosticsCard />
    </div>
  );
};

interface HealthEnvStatus {
  geminiApiKey?: boolean;
  appUrl?: boolean;
  aiAdminToken?: boolean;
  supabaseUrl?: boolean;
  supabaseServiceRoleKey?: boolean;
  viteSupabaseUrl?: boolean;
  viteSupabasePublishableKey?: boolean;
  googleClientId?: boolean;
  googleClientSecret?: boolean;
  githubClientId?: boolean;
  githubClientSecret?: boolean;
}

interface LiveCheckResult {
  geminiChat: { ok: boolean; message: string };
  geminiTts: { ok: boolean; message: string };
  supabase: { ok: boolean; message: string };
}

const DeploymentConnectionDiagnosticsCard: React.FC = () => {
  const [envStatus, setEnvStatus] = useState<HealthEnvStatus | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [liveCheck, setLiveCheck] = useState<LiveCheckResult | null>(null);
  const [runningLiveCheck, setRunningLiveCheck] = useState(false);

  const clientViteSupabaseUrl = Boolean(
    typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL
  );
  const clientViteSupabaseKey = Boolean(
    typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string> }).env
        ?.VITE_SUPABASE_PUBLISHABLE_KEY
  );

  const fetchEnvStatus = async () => {
    setLoadingHealth(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data && typeof data === 'object') {
        setEnvStatus(
          data.envStatus || {
            geminiApiKey: Boolean(data.geminiConfigured),
            appUrl: Boolean(data.appUrlConfigured),
            aiAdminToken: Boolean(data.adminTokenConfigured),
          }
        );
      }
    } catch {
      setEnvStatus(null);
    } finally {
      setLoadingHealth(false);
    }
  };

  const runLiveDiagnostics = async () => {
    setRunningLiveCheck(true);
    try {
      const res = await fetch('/api/health/live-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data?.checks) {
        setLiveCheck(data.checks as LiveCheckResult);
      }
    } catch {
      setLiveCheck({
        geminiChat: { ok: false, message: 'সার্ভারের সাথে সংযোগ করা যায়নি' },
        geminiTts: { ok: false, message: 'সার্ভারের সাথে সংযোগ করা যায়নি' },
        supabase: { ok: false, message: 'সার্ভারের সাথে সংযোগ করা যায়নি' },
      });
    } finally {
      setRunningLiveCheck(false);
    }
  };

  useEffect(() => {
    void fetchEnvStatus();
  }, []);

  const items: Array<{
    id: string;
    label: string;
    ok: boolean;
    fixBn: string;
  }> = [
    {
      id: 'GEMINI_API_KEY',
      label: 'GEMINI_API_KEY (সার্ভার AI ও ভয়েস)',
      ok: Boolean(envStatus?.geminiApiKey),
      fixBn:
        'হোস্টিং/সার্ভার ড্যাশবোর্ডের Environment Variables / Secrets-এ GEMINI_API_KEY সেট করুন।',
    },
    {
      id: 'APP_URL',
      label: 'APP_URL (ডেপ্লয় ডোমেইন ও OAuth রিডাইরেক্ট)',
      ok: Boolean(envStatus?.appUrl),
      fixBn:
        'সার্ভার Environment Variables-এ APP_URL (যেমন https://your-site.app) সেট করুন যাতে OAuth কলব্যাক সঠিক ঠিকানায় ফেরে।',
    },
    {
      id: 'AI_ADMIN_TOKEN',
      label: 'AI_ADMIN_TOKEN (প্রোডাকশন অ্যাডমিন সুরক্ষা)',
      ok: Boolean(envStatus?.aiAdminToken),
      fixBn:
        'প্রোডাকশনে /api/ai/health ও kill-switch সুরক্ষিত রাখতে সার্ভার Secrets-এ AI_ADMIN_TOKEN সেট করুন।',
    },
    {
      id: 'SUPABASE_URL',
      label: 'SUPABASE_URL ও SUPABASE_SERVICE_ROLE_KEY (সার্ভার প্রিভিউ ও ডাটাবেস)',
      ok: Boolean(envStatus?.supabaseUrl && envStatus?.supabaseServiceRoleKey),
      fixBn:
        'শেয়ার্ড ওয়েবসাইট প্রিভিউ (/preview/:id) এবং সার্ভার ডাটাবেস কাজের জন্য SUPABASE_URL ও SUPABASE_SERVICE_ROLE_KEY সেট করুন।',
    },
    {
      id: 'VITE_SUPABASE',
      label: 'VITE_SUPABASE_URL ও VITE_SUPABASE_PUBLISHABLE_KEY (ক্লায়েন্ট ক্লাউড সিঙ্ক)',
      ok: Boolean(
        (clientViteSupabaseUrl && clientViteSupabaseKey) ||
          (envStatus?.viteSupabaseUrl && envStatus?.viteSupabasePublishableKey)
      ),
      fixBn:
        'VITE_SUPABASE_URL ও VITE_SUPABASE_PUBLISHABLE_KEY বিল্ডের সময় বান্ডেলে ঢুকে—সেট করার পর অবশ্যই নতুন করে বিল্ড ও রিডেপ্লয় (Redeploy) করুন।',
    },
    {
      id: 'GOOGLE_OAUTH',
      label: 'GOOGLE_CLIENT_ID ও GOOGLE_CLIENT_SECRET (Google OAuth)',
      ok: Boolean(envStatus?.googleClientId && envStatus?.googleClientSecret),
      fixBn:
        'Google লগইন/ড্রাইভ সংযোগের জন্য সার্ভার Secrets-এ GOOGLE_CLIENT_ID ও GOOGLE_CLIENT_SECRET দিন এবং Google Console-এ কলব্যাক URL যোগ করুন।',
    },
    {
      id: 'GITHUB_OAUTH',
      label: 'GITHUB_CLIENT_ID ও GITHUB_CLIENT_SECRET (GitHub OAuth)',
      ok: Boolean(envStatus?.githubClientId && envStatus?.githubClientSecret),
      fixBn:
        'GitHub OAuth-এর জন্য সার্ভার Secrets-এ GITHUB_CLIENT_ID ও GITHUB_CLIENT_SECRET দিন এবং GitHub OAuth App-এ /api/auth/github/callback যোগ করুন।',
    },
  ];

  return (
    <SettingsCard>
      <div
        data-testid="settings-connection-check"
        className="space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--ink)]">
              সংযোগ পরীক্ষা (Deployment & Server Diagnostics)
            </h3>
            <p className="text-[11.5px] text-[var(--ink-dim)]">
              সার্ভার ও ডেপ্লয় এনভায়রনমেন্ট ভেরিয়েবল এবং লাইভ সার্ভিস স্ট্যাটাস (কোনো গোপন কী দেখানো হয় না — শুধু ✓ / ✗)
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="connection-check-refresh-btn"
              disabled={loadingHealth}
              onClick={() => void fetchEnvStatus()}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-medium text-[var(--text-2)] hover:text-[var(--text)] inline-flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHealth ? 'animate-spin' : ''}`} />
              <span>রিফ্রেশ</span>
            </button>
            <button
              type="button"
              data-testid="connection-check-live-btn"
              disabled={runningLiveCheck}
              onClick={() => void runLiveDiagnostics()}
              className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {runningLiveCheck ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : null}
              <span>লাইভ সংযোগ পরীক্ষা চালান</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface-2)]/40">
          {items.map((item) => (
            <div
              key={item.id}
              data-testid={`diag-env-${item.id}`}
              className="px-3 py-2.5 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-[var(--ink)]">
                  {item.label}
                </span>
                <span
                  data-testid={`diag-status-${item.id}`}
                  className={`px-2 py-0.5 rounded-md text-xs font-bold inline-flex items-center gap-1 ${
                    item.ok
                      ? 'bg-emerald-500/15 text-[var(--accent-emerald)] border border-emerald-500/30'
                      : 'bg-rose-500/15 text-[var(--settings-danger)] border border-rose-500/30'
                  }`}
                >
                  {item.ok ? '✓ সংযুক্ত' : '✗ অনুপস্থিত'}
                </span>
              </div>
              {!item.ok && (
                <p className="text-[11.5px] text-amber-400/90 leading-snug">
                  করণীয়: {item.fixBn}
                </p>
              )}
            </div>
          ))}
        </div>

        {liveCheck && (
          <div
            data-testid="connection-live-results"
            className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] space-y-2"
          >
            <div className="text-xs font-semibold text-[var(--ink)]">
              লাইভ সার্ভিস পরীক্ষার ফলাফল:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-2">
                <span className="font-medium">Gemini Chat:</span>
                <span
                  data-testid="live-check-gemini-chat"
                  className={
                    liveCheck.geminiChat.ok
                      ? 'text-[var(--accent-emerald)] font-bold'
                      : 'text-[var(--settings-danger)] font-bold'
                  }
                >
                  {liveCheck.geminiChat.ok ? '✓ সচল' : '✗ ব্যর্থ'}
                </span>
              </div>
              <div className="p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-2">
                <span className="font-medium">Gemini TTS ভয়েস:</span>
                <span
                  data-testid="live-check-gemini-tts"
                  className={
                    liveCheck.geminiTts.ok
                      ? 'text-[var(--accent-emerald)] font-bold'
                      : 'text-[var(--settings-danger)] font-bold'
                  }
                >
                  {liveCheck.geminiTts.ok ? '✓ সচল' : '✗ ব্যর্থ'}
                </span>
              </div>
              <div className="p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-2">
                <span className="font-medium">Supabase DB:</span>
                <span
                  data-testid="live-check-supabase"
                  className={
                    liveCheck.supabase.ok
                      ? 'text-[var(--accent-emerald)] font-bold'
                      : 'text-[var(--settings-danger)] font-bold'
                  }
                >
                  {liveCheck.supabase.ok ? '✓ সচল' : '✗ ব্যর্থ'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </SettingsCard>
  );
};

