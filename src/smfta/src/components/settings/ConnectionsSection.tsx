import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
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
  fetchOAuthConfigStatus,
  loadVaultConnections,
  persistVaultConnections,
  storeEncryptedProviderSession,
  verifyProviderPermissions,
  type OAuthConfigStatusResponse,
  type VaultConnections,
} from '../../utils/cloudVault';
import { ProvidersApiSection, type ProvidersApiSectionProps } from './ProvidersApiSection';

export interface ConnectionsSectionProps extends ProvidersApiSectionProps {
  connections?: VaultConnections;
  onUpdateConnections?: (next: VaultConnections) => void;
  notify?: (msg: string) => void;
  defaultOpenAdvanced?: boolean;
}

type DirectProviderId = 'github' | 'supabase' | 'vercel';

interface DirectProviderMeta {
  id: DirectProviderId;
  name: string;
  scopesLabel: string;
  defaultScopes: string[];
  tokenPlaceholder: string;
}

const DIRECT_PROVIDERS: DirectProviderMeta[] = [
  {
    id: 'github',
    name: 'GitHub',
    scopesLabel: 'প্রোফাইল দেখা ও রিপোজিটরি লিস্ট পড়া (read:user, user:email, public_repo)',
    defaultScopes: ['read:user', 'user:email', 'public_repo'],
    tokenPlaceholder: 'GitHub Personal Access Token (ghp_...)',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    scopesLabel: 'অর্গানাইজেশন ও প্রজেক্ট লিস্ট পড়া (organizations:read, projects:read, database:read)',
    defaultScopes: ['organizations:read', 'projects:read', 'database:read'],
    tokenPlaceholder: 'Supabase Access Token (sbp_...)',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    scopesLabel: 'অ্যাকাউন্ট ও প্রজেক্ট লিস্ট পড়া (user:read, projects:read, deployments:read)',
    defaultScopes: ['user:read', 'projects:read', 'deployments:read'],
    tokenPlaceholder: 'Vercel Access Token',
  },
];

export const ConnectionsSection: React.FC<ConnectionsSectionProps> = ({
  connections: externalConnections,
  onUpdateConnections,
  notify,
  defaultOpenAdvanced = false,
  ...providerProps
}) => {
  const [localConn, setLocalConn] = useState<VaultConnections>(() =>
    externalConnections || loadVaultConnections()
  );
  const [oauthConfig, setOauthConfig] = useState<OAuthConfigStatusResponse | null>(
    null
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
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(defaultOpenAdvanced);

  useEffect(() => {
    if (externalConnections) {
      setLocalConn(externalConnections);
    }
  }, [externalConnections]);

  useEffect(() => {
    void fetchOAuthConfigStatus().then((cfg) => {
      if (cfg) setOauthConfig(cfg);
    });
  }, []);

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
        const errMsg = String(data.error || 'OAuth অনুমোদন ব্যর্থ হয়েছে।');
        setProviderErrors((prev) => ({ ...prev, [provider]: errMsg }));
        notify?.(`⚠️ ${provider.toUpperCase()}: ${errMsg}`);
        return;
      }

      const verifyRes = await verifyProviderPermissions({ provider });
      const now = Date.now();
      if (verifyRes.ok) {
        const next: VaultConnections = {
          ...localConn,
          [provider]: {
            ...localConn[provider],
            connected: true,
            status: 'connected',
            account: verifyRes.account || provider,
            verifiedAt: now,
            grantedScopes: verifyRes.grantedScopes,
            permissions: verifyRes.permissions,
          },
        };
        syncConnections(next);
        setProviderErrors((prev) => ({ ...prev, [provider]: undefined }));
        notify?.(`✅ ${provider.toUpperCase()} সংযুক্ত হয়েছে (${verifyRes.account || 'Connected'})`);
      } else {
        setProviderErrors((prev) => ({
          ...prev,
          [provider]: verifyRes.message || 'কানেকশন যাচাই করা যায়নি।',
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
        const msg =
          data.message ||
          `সার্ভারে ${provider.toUpperCase()} OAuth কী কনফিগার করা নেই। নিচে Access Token দিয়ে সরাসরি সংযুক্ত হতে পারেন।`;
        setProviderErrors((prev) => ({ ...prev, [provider]: msg }));
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
        setProviderErrors((prev) => ({
          ...prev,
          [provider]:
            'ব্রাউজারে পপআপ ব্লক করা হয়েছে। অনুগ্রহ করে পপআপ অনুমতি দিন অথবা নিচে Access Token ব্যবহার করুন।',
        }));
        setOpenPatFallback((prev) => ({ ...prev, [provider]: true }));
        setConnectingProvider(null);
      }
    } catch (err: unknown) {
      setProviderErrors((prev) => ({
        ...prev,
        [provider]:
          err instanceof Error ? err.message : 'OAuth শুরু করা যায়নি।',
      }));
      setConnectingProvider(null);
    }
  };

  const handleTestAndSaveToken = async (provider: DirectProviderId) => {
    const rawToken = tokenInputs[provider].trim();
    if (!rawToken) {
      setProviderErrors((prev) => ({
        ...prev,
        [provider]: 'অনুগ্রহ করে একটি বৈধ Access Token দিন।',
      }));
      return;
    }
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
          [provider]: verifyRes.message || 'টোকেন যাচাই ব্যর্থ হয়েছে।',
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
      notify?.(`✅ ${provider.toUpperCase()} সংযুক্ত হয়েছে (${verifyRes.account || 'Connected'})`);
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
    notify?.(`${provider.toUpperCase()} সংযোগ বিচ্ছিন্ন করা হয়েছে`);
  };

  const renderProviderIcon = (id: DirectProviderId) => {
    if (id === 'github') return <GitBranch className="w-4 h-4" />;
    if (id === 'supabase') return <Database className="w-4 h-4" />;
    return <Globe className="w-4 h-4" />;
  };

  return (
    <div className="space-y-4" data-testid="settings-section-connections">
      {/* ১. তিনটি সরাসরি কানেকশন কার্ড: GitHub, Supabase, Vercel */}
      <div className="grid grid-cols-1 gap-3" data-testid="oauth-connection-cards">
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
          const cfgProvider = oauthConfig?.providers?.[meta.id];
          const callbackUrl =
            cfgProvider?.callbackUrl ||
            `${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/${meta.id}/callback`;
          const scopes = cfgProvider?.scopes || meta.defaultScopes;

          return (
            <div
              key={meta.id}
              data-testid={`connection-card-${meta.id}`}
              className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="p-2 rounded-lg bg-[var(--surface-2)] text-[var(--text)] shrink-0">
                    {renderProviderIcon(meta.id)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[var(--text)]">
                        {meta.name}
                      </span>
                      <span
                        data-testid={`connection-status-${meta.id}`}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 border ${
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
                        {statusLabel}
                      </span>
                    </div>
                    {isConnected && state.account && (
                      <div
                        data-testid={`connection-account-${meta.id}`}
                        className="text-xs font-mono text-[var(--primary)] mt-0.5 truncate"
                      >
                        অ্যাকাউন্ট: {state.account}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isConnected ? (
                    <button
                      type="button"
                      data-testid={`disconnect-btn-${meta.id}`}
                      onClick={() => handleDisconnect(meta.id)}
                      className="px-3.5 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-xs font-semibold text-[var(--settings-danger)] cursor-pointer min-h-[40px]"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid={`connect-btn-${meta.id}`}
                      disabled={isBusy}
                      onClick={() => handleConnectOAuth(meta.id)}
                      className="px-3.5 py-2 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[40px]"
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

              {/* কানেক্ট করার আগে স্পষ্ট পারমিশন ও স্কোপ প্রকাশ */}
              <div className="text-[11px] text-[var(--text-3)] bg-[var(--bg)] px-3 py-2 rounded-lg border border-[var(--border)] space-y-1">
                <div>
                  <strong className="text-[var(--text-2)]">যে অ্যাক্সেস নেওয়া হবে:</strong>{' '}
                  {meta.scopesLabel}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {scopes.map((sc) => (
                    <span
                      key={sc}
                      className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] font-mono text-[10px] text-[var(--text-2)]"
                    >
                      {sc}
                    </span>
                  ))}
                  <span className="text-[10px] text-[var(--text-3)] font-mono truncate">
                    · Callback: {callbackUrl}
                  </span>
                </div>
              </div>

              {errText && (
                <div
                  data-testid={`connection-error-${meta.id}`}
                  className="text-xs text-[var(--settings-danger)] bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2"
                >
                  {errText}
                </div>
              )}

              {/* টোকেন / টেস্ট কানেকশন বিকল্প (যদি OAuth কী কনফিগার না থাকে বা পপআপ ব্লক হয়) */}
              {!isConnected && (
                <div className="pt-1">
                  <button
                    type="button"
                    data-testid={`toggle-pat-${meta.id}`}
                    onClick={() =>
                      setOpenPatFallback((prev) => ({
                        ...prev,
                        [meta.id]: !prev[meta.id],
                      }))
                    }
                    className="text-[11px] font-medium text-[var(--text-3)] hover:text-[var(--text)] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <KeyRound className="w-3 h-3" />
                    {openPatFallback[meta.id]
                      ? 'Access Token অপশন লুকান'
                      : 'অথবা সরাসরি Access Token দিয়ে টেস্ট ও কানেক্ট করুন'}
                  </button>

                  {openPatFallback[meta.id] && (
                    <div className="mt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
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
                        className="cs-input flex-1 text-xs font-mono"
                      />
                      <button
                        type="button"
                        data-testid={`test-connect-pat-${meta.id}`}
                        disabled={isBusy}
                        onClick={() => handleTestAndSaveToken(meta.id)}
                        className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] cursor-pointer shrink-0"
                      >
                        Test Connection & Save
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ২. Advanced: প্রোভাইডার ও API কী সেটিংস (অক্ষত) */}
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
        data-testid="connections-advanced-wrapper"
      >
        <button
          type="button"
          data-testid="connections-advanced-toggle"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((prev) => !prev)}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left bg-[var(--surface-2)]/50 hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Cpu className="w-4 h-4 text-[var(--primary)] shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-[var(--text)]">
                Advanced — প্রোভাইডার ও API কী সেটিংস
              </div>
              <div className="text-xs text-[var(--text-3)] truncate">
                কাস্টম প্রোভাইডার, API কী, মডেল তালিকা, প্রায়োরিটি এবং কানেকশন টেস্ট
              </div>
            </div>
          </div>
          {advancedOpen ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-3)] shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-3)] shrink-0" />
          )}
        </button>

        {advancedOpen && (
          <div className="p-4 border-t border-[var(--border)]">
            <ProvidersApiSection {...providerProps} />
          </div>
        )}
      </div>
    </div>
  );
};
