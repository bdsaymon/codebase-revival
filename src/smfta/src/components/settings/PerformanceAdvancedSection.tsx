import React, { useState } from 'react';
import {
  Activity,
  Cpu,
  Gauge,
  Layers,
  Loader2,
  Sliders,
  Trash2,
} from 'lucide-react';
import type { AppSettings, TelemetryRequestLog } from '../../types';
import {
  type SystemDiagnosticsReport,
  runSystemDiagnostics,
} from '../../utils/systemDiagnostics';
import {
  SettingNumber,
  SettingSelect,
  SettingText,
  SettingToggle,
  SettingsCard,
  SettingsGrid,
} from '../SettingsControls';

export interface PerformanceAdvancedSectionProps {
  draft: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
  telemetryLogs: TelemetryRequestLog[];
  onClearTelemetryLogs: () => void;
  notify?: (msg: string) => void;
}

export const PerformanceAdvancedSection: React.FC<PerformanceAdvancedSectionProps> = ({
  draft,
  patch,
  telemetryLogs,
  onClearTelemetryLogs,
  notify,
}) => {
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagReport, setDiagReport] = useState<SystemDiagnosticsReport | null>(null);

  const stopSeqText = (draft.stopSequences || []).join(', ');

  const handleStopSeqChange = (raw: string) => {
    const list = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    patch({ stopSequences: list });
  };

  const handleClearResponseCache = () => {
    try {
      const removed: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && (k.includes('cache_') || k.includes('temp_'))) removed.push(k);
      }
      removed.forEach((k) => localStorage.removeItem(k));
      notify?.(`Cleared ${removed.length} temporary cache entries.`);
    } catch {
      notify?.('Cache cleanup complete.');
    }
  };

  const handleRunDiagnostics = async () => {
    setDiagRunning(true);
    try {
      const res = await runSystemDiagnostics();
      if (res.success && res.report) {
        setDiagReport(res.report);
        notify?.(`Diagnostics finished: ${res.report.status}`);
      } else {
        notify?.(res.error || 'Diagnostics failed.');
      }
    } finally {
      setDiagRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Generation Parameters */}
      <SettingsCard
        title="Generation Parameters"
        description="Precision sampling controls forwarded to OpenAI, Gemini Native, and Anthropic protocol adapters."
        icon={<Sliders className="w-4 h-4" />}
      >
        <SettingsGrid>
          <SettingNumber
            label="Temperature (0.1 – 1.2)"
            value={draft.weightTemp ?? 0.7}
            min={0.1}
            max={1.2}
            step={0.1}
            onChange={(v) => patch({ weightTemp: v })}
          />
          <SettingNumber
            label="Top P (0.1 – 1.0)"
            value={draft.topP ?? 0.9}
            min={0.1}
            max={1.0}
            step={0.05}
            onChange={(v) => patch({ topP: v })}
          />
          <SettingNumber
            label="Top K (1 – 200)"
            value={draft.topK ?? 40}
            min={1}
            max={200}
            step={1}
            onChange={(v) => patch({ topK: v })}
          />
          <SettingNumber
            label="Max Output Tokens"
            value={draft.maxOutputTokens ?? 4096}
            min={256}
            max={32768}
            step={256}
            onChange={(v) => patch({ maxOutputTokens: v })}
          />
        </SettingsGrid>
        <SettingText
          label="Stop Sequences (Comma-Separated)"
          value={stopSeqText}
          mono
          placeholder="e.g. END_JSON, ###STOP###"
          onChange={handleStopSeqChange}
        />
      </SettingsCard>

      {/* 2. Performance & Concurrency */}
      <SettingsCard
        title="Performance, Concurrency & Caching"
        description="Tune timeouts, retry budget, simultaneous request queue limit, and response caching."
        icon={<Gauge className="w-4 h-4" />}
      >
        <SettingsGrid>
          <SettingNumber
            label="Request Timeout (seconds)"
            value={draft.requestTimeoutSec ?? 120}
            min={30}
            max={240}
            step={10}
            onChange={(v) => patch({ requestTimeoutSec: v })}
          />
          <SettingNumber
            label="Max Retry Attempts"
            value={draft.maxRetries ?? 2}
            min={0}
            max={4}
            onChange={(v) => patch({ maxRetries: v })}
          />
          <SettingNumber
            label="Concurrent Requests Limit"
            value={draft.concurrentRequests ?? 2}
            min={1}
            max={6}
            onChange={(v) => patch({ concurrentRequests: v })}
          />
        </SettingsGrid>
        <SettingToggle
          label="High-Speed Response Caching"
          description="Serve identical single-turn non-tool queries from the user-scoped SHA-256 server cache."
          checked={draft.memoryCache !== false}
          onChange={(v) => patch({ memoryCache: v })}
        />
        <SettingToggle
          label="Fast Decision Classifier"
          description="Adjust reasoning token budget dynamically for simple vs complex queries."
          checked={draft.fastDecision !== false}
          onChange={(v) => patch({ fastDecision: v })}
        />
        <SettingToggle
          label="Hardware / Smooth UI Acceleration"
          checked={draft.gpuAccel !== false}
          onChange={(v) => patch({ gpuAccel: v })}
        />
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            onClick={handleClearResponseCache}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs font-semibold text-[var(--text)] hover:border-[var(--primary-border)] cursor-pointer"
          >
            Clear Temporary Browser Cache
          </button>
        </div>
      </SettingsCard>

      {/* 3. Context Management */}
      <SettingsCard
        title="Context Management & Compression"
        description="Manage long conversation history trimming, rolling summary compression, and token budgeting."
        icon={<Layers className="w-4 h-4" />}
      >
        <SettingToggle
          label="Conversation Context Compression"
          description="Compress older turns into a dense rolling summary once conversations grow long."
          checked={draft.contextCompressionEnabled !== false}
          onChange={(v) => patch({ contextCompressionEnabled: v })}
        />
        <SettingsGrid>
          <SettingNumber
            label="Compression Threshold (messages)"
            value={draft.contextCompressionThreshold ?? 24}
            min={8}
            max={100}
            onChange={(v) => patch({ contextCompressionThreshold: v })}
          />
          <SettingSelect
            label="Auto Context Handling Strategy"
            value={draft.autoContextMode ?? 'balanced'}
            options={[
              { value: 'balanced', label: 'Balanced (Recent Turns + Rolling Summary)' },
              { value: 'aggressive', label: 'Aggressive (Minimize Tokens)' },
              { value: 'minimal', label: 'Minimal (Keep Raw Messages Longer)' },
            ]}
            onChange={(v) =>
              patch({ autoContextMode: v as AppSettings['autoContextMode'] })
            }
          />
        </SettingsGrid>
      </SettingsCard>

      {/* 4. Developer Options & Live Diagnostics */}
      <SettingsCard
        title="Developer Options & API Logs"
        description="Inspect device-local request telemetry and run real system health diagnostics."
        icon={<Cpu className="w-4 h-4" />}
        rightSlot={
          <button
            type="button"
            onClick={handleRunDiagnostics}
            disabled={diagRunning}
            className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            {diagRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Activity className="w-3.5 h-3.5" />
            )}
            Run Diagnostics
          </button>
        }
      >
        <SettingToggle
          label="Developer Diagnostics Mode"
          description="Display latency, TTFT, and active provider routing details during streaming."
          checked={draft.diagnosticsEnabled === true}
          onChange={(v) => patch({ diagnosticsEnabled: v })}
        />

        {diagReport && (
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs space-y-1">
            <div className="font-semibold text-[var(--text)]">
              Diagnostics Status: {diagReport.status} ({new Date(diagReport.checkedAt).toLocaleTimeString()})
            </div>
            <div className="text-[var(--text-3)]">
              Storage: {diagReport.localStorageStatus} ({diagReport.localKeysCount} keys, {diagReport.cacheSize} KB) · Backend: {diagReport.backendStatus}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-[var(--border)]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-semibold text-[var(--text)]">
              Live API Request Logs ({telemetryLogs.length})
            </span>
            {telemetryLogs.length > 0 && (
              <button
                type="button"
                onClick={onClearTelemetryLogs}
                className="text-xs text-[var(--text-3)] hover:text-[var(--settings-danger)] inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Clear Logs
              </button>
            )}
          </div>
          {telemetryLogs.length === 0 ? (
            <div className="text-xs text-[var(--text-3)] py-3 px-3 rounded-lg border border-dashed border-[var(--border)]">
              No API logs recorded yet.
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
              {telemetryLogs.map((entry) => (
                <div
                  key={entry.id}
                  className="px-3 py-2 bg-[var(--bg)] text-[11px] font-mono flex flex-wrap items-center justify-between gap-2"
                >
                  <span
                    className={
                      entry.status === 'success'
                        ? 'text-[var(--accent-emerald)]'
                        : 'text-[var(--settings-danger)]'
                    }
                  >
                    [{entry.status.toUpperCase()}] {entry.provider}/{entry.model}
                  </span>
                  <span className="text-[var(--text-3)] tabular-nums">
                    {entry.latencyMs ? `${entry.latencyMs}ms` : ''}
                    {entry.errorCode ? ` · ${entry.errorCode}` : ''} ·{' '}
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingsCard>
    </div>
  );
};
