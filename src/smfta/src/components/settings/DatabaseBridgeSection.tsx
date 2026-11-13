import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Database,
  Download,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AppSettings,
  DataBridgeConfig,
  DbConnectionConfig,
  DbFieldMapping,
  DbProviderKind,
} from '../../types';
import {
  type BrowserStorageBreakdown,
  classifyDbTransport,
  estimateBrowserStorageUsage,
  runDataBridgeSync,
  testDbConnection,
} from '../../utils/dbBridge';
import {
  SettingNumber,
  SettingSelect,
  SettingText,
  SettingToggle,
  SettingsCard,
  SettingsGrid,
} from '../SettingsControls';

export interface DatabaseBridgeSectionProps {
  draft: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
  dbConnections: DbConnectionConfig[];
  onUpdateDbConnections: (next: DbConnectionConfig[]) => void;
  dataBridgeConfig: DataBridgeConfig;
  onUpdateDataBridgeConfig: (next: DataBridgeConfig) => void;
  onExportBackup: () => void;
  onImportBackup: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveRollbackPoint?: () => void;
  onRollback?: () => void;
  hasRollbackPoint?: boolean;
  onBackupToGithub?: () => void;
  cloudConnected?: boolean;
  notify?: (msg: string) => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const DatabaseBridgeSection: React.FC<DatabaseBridgeSectionProps> = ({
  draft,
  patch,
  dbConnections,
  onUpdateDbConnections,
  dataBridgeConfig,
  onUpdateDataBridgeConfig,
  onExportBackup,
  onImportBackup,
  onSaveRollbackPoint,
  onRollback,
  hasRollbackPoint,
  onBackupToGithub,
  cloudConnected,
  notify,
}) => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<DbProviderKind>('supabase');
  const [endpointOrUri, setEndpointOrUri] = useState('');
  const [authHeaderOrKeyName, setAuthHeaderOrKeyName] = useState('');
  const [secret, setSecret] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [storageInfo, setStorageInfo] = useState<BrowserStorageBreakdown | null>(null);

  const [newSrcField, setNewSrcField] = useState('');
  const [newDstField, setNewDstField] = useState('');
  const [newTransform, setNewTransform] = useState<DbFieldMapping['transform']>('none');

  const refreshStorage = async () => {
    const breakdown = await estimateBrowserStorageUsage();
    setStorageInfo(breakdown);
  };

  useEffect(() => {
    void refreshStorage();
  }, []);

  const transportAnalysis = classifyDbTransport(endpointOrUri, kind);

  const handleAddConnection = () => {
    const cleanEndpoint = endpointOrUri.trim();
    if (!cleanEndpoint) {
      notify?.('Database endpoint URL or connection URI is required.');
      return;
    }
    const analysis = classifyDbTransport(cleanEndpoint, kind);
    const created: DbConnectionConfig = {
      id: `db-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || `${kind.toUpperCase()} Database`,
      kind,
      endpointOrUri: cleanEndpoint,
      authHeaderOrKeyName: authHeaderOrKeyName.trim() || undefined,
      secret: secret.trim(),
      enabled: true,
      transportMode: analysis.transportMode,
      status: analysis.edgeSupported ? 'untested' : 'edge_blocked',
      statusMessage: analysis.reason,
      tables: [],
    };
    onUpdateDbConnections([...dbConnections, created]);
    setName('');
    setEndpointOrUri('');
    setAuthHeaderOrKeyName('');
    setSecret('');
    notify?.(
      analysis.edgeSupported
        ? `Added "${created.name}". Click Test to probe endpoint.`
        : `Saved "${created.name}" with Cloudflare Edge TCP limit notice.`
    );
  };

  const handleTestDb = async (conn: DbConnectionConfig) => {
    setTestingId(conn.id);
    try {
      const res = await testDbConnection(conn);
      const next = dbConnections.map((c) =>
        c.id === conn.id
          ? {
              ...c,
              lastTestedAt: Date.now(),
              latencyMs: res.latencyMs,
              tables: res.tables || c.tables,
              status: res.ok
                ? ('connected' as const)
                : res.errorCode === 'EDGE_TCP_UNSUPPORTED'
                ? ('edge_blocked' as const)
                : ('error' as const),
              statusMessage: res.message,
            }
          : c
      );
      onUpdateDbConnections(next);
      notify?.(res.message);
    } finally {
      setTestingId(null);
    }
  };

  const handleAddMapping = () => {
    if (!newSrcField.trim() || !newDstField.trim()) return;
    const mapping: DbFieldMapping = {
      id: `map-${Date.now()}`,
      sourceField: newSrcField.trim(),
      targetField: newDstField.trim(),
      transform: newTransform || 'none',
    };
    onUpdateDataBridgeConfig({
      ...dataBridgeConfig,
      fieldMappings: [...dataBridgeConfig.fieldMappings, mapping],
    });
    setNewSrcField('');
    setNewDstField('');
  };

  const handleRunBridgeSync = async () => {
    const source = dbConnections.find((c) => c.id === dataBridgeConfig.sourceConnectionId);
    const destination = dbConnections.find(
      (c) => c.id === dataBridgeConfig.destinationConnectionId
    );
    if (!source || !destination) {
      notify?.('Select both Source and Destination database connections first.');
      return;
    }
    if (!dataBridgeConfig.sourceTable.trim() || !dataBridgeConfig.destinationTable.trim()) {
      notify?.('Enter both Source Table and Destination Table names.');
      return;
    }
    setIsSyncing(true);
    try {
      const res = await runDataBridgeSync({
        source,
        destination,
        sourceTable: dataBridgeConfig.sourceTable.trim(),
        destinationTable: dataBridgeConfig.destinationTable.trim(),
        syncMode: dataBridgeConfig.syncMode,
        fieldMappings: dataBridgeConfig.fieldMappings,
      });
      onUpdateDataBridgeConfig({
        ...dataBridgeConfig,
        lastSyncAt: Date.now(),
        lastSyncStatus: res.message,
        lastSyncCount: res.syncedCount,
      });
      notify?.(res.message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Database Connections */}
      <SettingsCard
        title="Database Connections"
        description="Connect Supabase PostgREST, Firebase REST, Neon HTTP, PostgreSQL/MySQL/MongoDB REST gateways. Credentials are AES-256-GCM encrypted locally."
        icon={<Database className="w-4 h-4" />}
      >
        <SettingsGrid>
          <SettingText
            label="Connection Name"
            value={name}
            placeholder="e.g. Production Supabase"
            onChange={setName}
          />
          <SettingSelect
            label="Database Type"
            value={kind}
            options={[
              { value: 'supabase', label: 'Supabase (PostgREST HTTPS)' },
              { value: 'firebase', label: 'Firebase Firestore REST' },
              { value: 'postgresql', label: 'PostgreSQL (Neon/PostgREST HTTP)' },
              { value: 'mysql', label: 'MySQL (PlanetScale / REST Gateway)' },
              { value: 'mongodb', label: 'MongoDB (Atlas Data API / REST)' },
              { value: 'custom_rest', label: 'Custom REST Database Gateway' },
            ]}
            onChange={(v) => setKind(v as DbProviderKind)}
          />
        </SettingsGrid>

        <SettingText
          label="HTTPS REST Endpoint or URI"
          value={endpointOrUri}
          mono
          testId="db-endpoint-input"
          placeholder="https://xyzcompany.supabase.co"
          onChange={setEndpointOrUri}
        />

        {endpointOrUri.trim() && !transportAnalysis.edgeSupported && (
          <div
            data-testid="db-tcp-edge-warning"
            className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-[var(--accent-amber)]"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Cloudflare Edge Runtime Limit (Direct TCP)</div>
              <p className="mt-0.5 opacity-90">{transportAnalysis.reason}</p>
            </div>
          </div>
        )}

        <SettingsGrid>
          <SettingText
            label="Auth Header Name (Optional)"
            value={authHeaderOrKeyName}
            mono
            placeholder="apikey or Authorization"
            onChange={setAuthHeaderOrKeyName}
          />
          <SettingText
            label="API Key / Bearer Secret"
            type="password"
            mono
            value={secret}
            placeholder="Encrypted locally"
            onChange={setSecret}
          />
        </SettingsGrid>

        <div className="flex justify-end">
          <button
            type="button"
            data-testid="db-add-btn"
            onClick={handleAddConnection}
            className="px-3.5 py-2 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Database Connection
          </button>
        </div>

        <div className="pt-2 border-t border-[var(--border)] space-y-2">
          {dbConnections.length === 0 ? (
            <div className="text-xs text-[var(--text-3)] py-4 text-center rounded-lg border border-dashed border-[var(--border)]">
              No external database connectors added yet.
            </div>
          ) : (
            dbConnections.map((conn) => (
              <div
                key={conn.id}
                className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text)]">
                      <span>{conn.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--surface-2)] border border-[var(--border)] uppercase">
                        {conn.kind}
                      </span>
                      {conn.status === 'connected' && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--accent-emerald)]">
                          <CheckCircle2 className="w-3 h-3" />
                          Connected ({conn.latencyMs}ms)
                        </span>
                      )}
                      {conn.status === 'edge_blocked' && (
                        <span className="text-[10px] text-[var(--accent-amber)]">
                          Edge TCP blocked
                        </span>
                      )}
                      {conn.status === 'error' && (
                        <span className="text-[10px] text-[var(--settings-danger)]">Error</span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-3)] truncate">
                      {conn.endpointOrUri}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleTestDb(conn)}
                      disabled={testingId === conn.id}
                      className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--text)] inline-flex items-center gap-1 cursor-pointer"
                    >
                      {testingId === conn.id && <Loader2 className="w-3 h-3 animate-spin" />}
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateDbConnections(dbConnections.filter((c) => c.id !== conn.id))
                      }
                      className="p-1.5 rounded text-[var(--text-3)] hover:text-[var(--settings-danger)] cursor-pointer"
                      title="Delete connection"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {conn.statusMessage && (
                  <div className="text-[11px] text-[var(--text-3)]">{conn.statusMessage}</div>
                )}
              </div>
            ))
          )}
        </div>
      </SettingsCard>

      {/* 2. Data Bridge */}
      <SettingsCard
        title="Data Bridge & Field Mapping"
        description="Synchronize records between HTTP/REST database connectors with field mapping and transforms."
        icon={<ArrowRightLeft className="w-4 h-4" />}
      >
        <SettingsGrid>
          <SettingSelect
            label="Source Database"
            value={dataBridgeConfig.sourceConnectionId}
            options={[
              { value: '', label: 'Select source database…' },
              ...dbConnections.map((c) => ({ value: c.id, label: `${c.name} (${c.kind})` })),
            ]}
            onChange={(v) =>
              onUpdateDataBridgeConfig({ ...dataBridgeConfig, sourceConnectionId: v })
            }
          />
          <SettingSelect
            label="Destination Database"
            value={dataBridgeConfig.destinationConnectionId}
            options={[
              { value: '', label: 'Select destination database…' },
              ...dbConnections.map((c) => ({ value: c.id, label: `${c.name} (${c.kind})` })),
            ]}
            onChange={(v) =>
              onUpdateDataBridgeConfig({ ...dataBridgeConfig, destinationConnectionId: v })
            }
          />
          <SettingText
            label="Source Table / Collection"
            value={dataBridgeConfig.sourceTable}
            mono
            placeholder="e.g. customers"
            onChange={(v) => onUpdateDataBridgeConfig({ ...dataBridgeConfig, sourceTable: v })}
          />
          <SettingText
            label="Destination Table / Collection"
            value={dataBridgeConfig.destinationTable}
            mono
            placeholder="e.g. crm_contacts"
            onChange={(v) =>
              onUpdateDataBridgeConfig({ ...dataBridgeConfig, destinationTable: v })
            }
          />
        </SettingsGrid>

        <SettingSelect
          label="Synchronization Mode"
          value={dataBridgeConfig.syncMode}
          options={[
            { value: 'upsert', label: 'Upsert (Merge Duplicates)' },
            { value: 'append', label: 'Append Only' },
          ]}
          onChange={(v) =>
            onUpdateDataBridgeConfig({
              ...dataBridgeConfig,
              syncMode: v as 'append' | 'upsert',
            })
          }
        />

        {/* Field Mappings */}
        <div className="pt-2 border-t border-[var(--border)] space-y-2">
          <div className="text-xs font-semibold text-[var(--text)]">Field Mappings</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text"
              value={newSrcField}
              onChange={(e) => setNewSrcField(e.target.value)}
              placeholder="Source field"
              className="cs-input font-mono text-xs"
            />
            <input
              type="text"
              value={newDstField}
              onChange={(e) => setNewDstField(e.target.value)}
              placeholder="Target field"
              className="cs-input font-mono text-xs"
            />
            <select
              value={newTransform || 'none'}
              onChange={(e) => setNewTransform(e.target.value as DbFieldMapping['transform'])}
              className="cs-input text-xs"
            >
              <option value="none">No transform</option>
              <option value="trim">Trim whitespace</option>
              <option value="lowercase">Lowercase</option>
              <option value="uppercase">Uppercase</option>
              <option value="string">Cast to String</option>
              <option value="number">Cast to Number</option>
            </select>
            <button
              type="button"
              onClick={handleAddMapping}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] cursor-pointer"
            >
              Add Mapping
            </button>
          </div>
          {dataBridgeConfig.fieldMappings.length > 0 && (
            <div className="space-y-1">
              {dataBridgeConfig.fieldMappings.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--bg)] text-xs font-mono"
                >
                  <span>
                    {m.sourceField} → {m.targetField}{' '}
                    <span className="text-[var(--text-3)]">({m.transform || 'none'})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateDataBridgeConfig({
                        ...dataBridgeConfig,
                        fieldMappings: dataBridgeConfig.fieldMappings.filter(
                          (item) => item.id !== m.id
                        ),
                      })
                    }
                    className="text-[var(--text-3)] hover:text-[var(--settings-danger)] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
          <div className="text-xs text-[var(--text-3)]">
            {dataBridgeConfig.lastSyncStatus
              ? `Last Sync: ${dataBridgeConfig.lastSyncStatus}`
              : 'Ready to execute REST sync'}
          </div>
          <button
            type="button"
            onClick={handleRunBridgeSync}
            disabled={isSyncing}
            className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            {isSyncing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Run Data Bridge Sync
          </button>
        </div>
      </SettingsCard>

      {/* 3. Storage Usage Inspector */}
      <SettingsCard
        title="Storage Inspector"
        description="Real browser localStorage breakdown and origin storage quota."
        icon={<HardDrive className="w-4 h-4" />}
        rightSlot={
          <button
            type="button"
            onClick={() => void refreshStorage()}
            className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text-2)] hover:text-[var(--text)] inline-flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Local Storage Total</div>
            <div className="text-sm font-semibold tabular-nums mt-0.5">
              {storageInfo ? formatBytes(storageInfo.totalLocalStorageBytes) : 'Measuring…'}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Chat Sessions</div>
            <div className="text-sm font-semibold tabular-nums mt-0.5">
              {storageInfo ? formatBytes(storageInfo.chatsBytes) : '—'}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Memory & Knowledge</div>
            <div className="text-sm font-semibold tabular-nums mt-0.5">
              {storageInfo ? formatBytes(storageInfo.knowledgeAndCacheBytes) : '—'}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Supabase Cloud Sync</div>
            <div className="text-xs font-semibold mt-0.5">
              {cloudConnected ? 'Authenticated Sync' : 'Local-Only Session'}
            </div>
          </div>
        </div>
        {storageInfo && storageInfo.browserQuotaBytes !== null && (
          <div className="text-[11px] text-[var(--text-3)] tabular-nums">
            Browser Origin Quota: {formatBytes(storageInfo.browserUsageBytes || 0)} used of{' '}
            {formatBytes(storageInfo.browserQuotaBytes)} available
          </div>
        )}
      </SettingsCard>

      {/* 4. Backup & Restore */}
      <SettingsCard
        title="Backup & Restore"
        description="Create encrypted-safe JSON backups (API keys are automatically stripped unless local encrypted), restore snapshots, or schedule automatic backups."
        icon={<Download className="w-4 h-4" />}
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onExportBackup}
            className="px-3.5 py-2 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Create Backup (Export JSON)
          </button>
          <label className="settings-import px-3.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] inline-flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Restore Backup (Import)
            <input type="file" accept=".json,application/json" onChange={onImportBackup} />
          </label>
          {onSaveRollbackPoint && (
            <button
              type="button"
              onClick={onSaveRollbackPoint}
              className="px-3.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs font-semibold text-[var(--text)] inline-flex items-center gap-1.5 cursor-pointer"
            >
              Save Rollback Point
            </button>
          )}
          {hasRollbackPoint && onRollback && (
            <button
              type="button"
              onClick={onRollback}
              className="px-3.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs font-semibold text-[var(--accent-amber)] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restore Rollback Point
            </button>
          )}
          {onBackupToGithub && (
            <button
              type="button"
              onClick={onBackupToGithub}
              className="px-3.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs font-semibold text-[var(--text)] cursor-pointer"
            >
              Backup Notes to GitHub
            </button>
          )}
        </div>

        <div className="pt-2 border-t border-[var(--border)] space-y-2">
          <SettingToggle
            label="Automatic Periodic Backup"
            description="Periodically save a local recovery snapshot to IndexedDB/localStorage."
            checked={draft.autoBackupEnabled === true}
            onChange={(v) => patch({ autoBackupEnabled: v })}
          />
          {draft.autoBackupEnabled && (
            <SettingNumber
              label="Backup Interval (Hours)"
              value={draft.autoBackupIntervalHours ?? 24}
              min={1}
              max={168}
              onChange={(v) => patch({ autoBackupIntervalHours: v })}
            />
          )}
        </div>
      </SettingsCard>
    </div>
  );
};
