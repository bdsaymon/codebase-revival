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
    </div>
  );
};
