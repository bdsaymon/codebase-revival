import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  FileText,
  HelpCircle,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { APP_UPDATED, APP_VERSION } from '../../version';
import { SettingsCard } from '../SettingsControls';

export interface AboutSystemSectionProps {
  onOpenWhatsNew: () => void;
  keystoreEphemeral?: boolean;
  cloudConnected?: boolean;
}

interface HealthSnapshot {
  checkedAt: string;
  apiHealth: string;
  systemStatus: string;
  uptimeSec: number | null;
  cacheEntries: number | null;
  v2QuotaStatus: string;
  error?: string;
}

export const AboutSystemSection: React.FC<AboutSystemSectionProps> = ({
  onOpenWhatsNew,
  keystoreEphemeral,
  cloudConnected,
}) => {
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);

  const probeSystemHealth = async () => {
    setLoading(true);
    try {
      const [hRes, sRes, qRes] = await Promise.all([
        fetch('/api/health').catch(() => null),
        fetch('/api/system/status').catch(() => null),
        fetch('/api/v2/quota?userId=default-user').catch(() => null),
      ]);
      const hJson = hRes && hRes.ok ? ((await hRes.json().catch(() => null)) as Record<string, unknown> | null) : null;
      const sJson = sRes && sRes.ok ? ((await sRes.json().catch(() => null)) as Record<string, unknown> | null) : null;

      setSnapshot({
        checkedAt: new Date().toLocaleTimeString(),
        apiHealth: hJson?.ok ? String(hJson.status || 'online') : hRes ? `HTTP ${hRes.status}` : 'Unreachable',
        systemStatus: sJson?.ok ? `Operational (v${String(sJson.version || APP_VERSION)})` : sRes ? `HTTP ${sRes.status}` : 'Unreachable',
        uptimeSec: typeof sJson?.uptime === 'number' ? sJson.uptime : null,
        cacheEntries: typeof hJson?.cacheEntries === 'number' ? hJson.cacheEntries : null,
        v2QuotaStatus: qRes ? (qRes.ok ? 'Reachable' : `HTTP ${qRes.status}`) : 'Unreachable',
      });
    } catch (err) {
      setSnapshot({
        checkedAt: new Date().toLocaleTimeString(),
        apiHealth: 'Error',
        systemStatus: 'Error',
        uptimeSec: null,
        cacheEntries: null,
        v2QuotaStatus: 'Error',
        error: err instanceof Error ? err.message : 'Probe error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void probeSystemHealth();
  }, []);

  return (
    <div className="space-y-4">
      {/* 1. Application Information */}
      <SettingsCard
        title="Application Information"
        description="SMFTA AI Pro workspace release, runtime platform, and changelog."
        icon={<Info className="w-4 h-4" />}
        rightSlot={
          <button
            type="button"
            onClick={onOpenWhatsNew}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] cursor-pointer"
          >
            View Changelog
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Version</div>
            <div className="text-sm font-semibold font-mono text-[var(--text)] mt-0.5">
              v{APP_VERSION}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Release Date</div>
            <div className="text-sm font-semibold text-[var(--text)] mt-0.5">
              {APP_UPDATED}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Runtime Environment</div>
            <div className="text-xs font-semibold text-[var(--text)] mt-0.5">
              Web SPA + Edge Express Adapter
            </div>
          </div>
        </div>
      </SettingsCard>

      {/* 2. Live System Status & Service Health */}
      <SettingsCard
        title="System Status & Service Health"
        description="Real-time probe of /api/health, /api/system/status, WebCrypto keystore, and cloud persistence."
        icon={<Activity className="w-4 h-4" />}
        rightSlot={
          <button
            type="button"
            data-testid="system-health-refresh-btn"
            onClick={() => void probeSystemHealth()}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs font-semibold text-[var(--text)] inline-flex items-center gap-1.5 cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Probe Health
          </button>
        }
      >
        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] overflow-hidden text-xs">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg)]">
            <span className="text-[var(--text-2)]">Core API Engine (/api/health)</span>
            <span className="font-mono font-semibold text-[var(--accent-emerald)] inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {snapshot?.apiHealth || 'Checking…'}
            </span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg)]">
            <span className="text-[var(--text-2)]">System Status (/api/system/status)</span>
            <span className="font-mono text-[var(--text)]">
              {snapshot?.systemStatus || 'Checking…'}
            </span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg)]">
            <span className="text-[var(--text-2)]">WebCrypto AES-256-GCM Keystore</span>
            <span className="font-mono text-[var(--text)]">
              {keystoreEphemeral ? 'Active (Ephemeral Session)' : 'Active (IndexedDB Persistent)'}
            </span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg)]">
            <span className="text-[var(--text-2)]">Supabase RLS Persistence</span>
            <span className="font-mono text-[var(--text)]">
              {cloudConnected ? 'Authenticated Cloud Sync' : 'Local-Only Mode'}
            </span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg)]">
            <span className="text-[var(--text-2)]">V2 Quota Service</span>
            <span className="font-mono text-[var(--text)]">
              {snapshot?.v2QuotaStatus || 'Checking…'}
            </span>
          </div>
        </div>
        {snapshot && (
          <div className="text-[11px] text-[var(--text-3)] tabular-nums">
            Last checked at {snapshot.checkedAt}
            {snapshot.uptimeSec !== null ? ` · Process uptime ${snapshot.uptimeSec}s` : ''}
            {snapshot.cacheEntries !== null ? ` · Cache entries: ${snapshot.cacheEntries}` : ''}
          </div>
        )}
      </SettingsCard>

      {/* 3. Help, Edge Capabilities & Docs */}
      <SettingsCard
        title="Edge Runtime Guide & Support"
        description="Architecture capabilities and honest platform boundaries."
        icon={<HelpCircle className="w-4 h-4" />}
      >
        <div className="space-y-2 text-xs text-[var(--text-2)] leading-relaxed">
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
            <p>
              <strong>MCP & External Databases on Edge:</strong> HTTPS Streamable HTTP / SSE MCP servers and PostgREST / Firestore REST / Neon HTTP gateways work end-to-end. Local `stdio` child processes and raw TCP database sockets (`postgres://`, `mysql://`, `mongodb://`) are blocked on stateless edge workers unless fronted by an HTTPS gateway.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
            <p>
              <strong>Zero-Trust Local Key Vault:</strong> API keys, MCP auth headers, and DB secrets never leave your device in plain Supabase rows; they are encrypted locally in AES-256-GCM and forwarded only inside authenticated per-request API calls.
            </p>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
};
