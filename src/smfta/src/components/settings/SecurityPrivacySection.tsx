import React, { useState } from 'react';
import {
  AlertTriangle,
  Download,
  KeyRound,
  Lock,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type {
  AppSettings,
  DbConnectionConfig,
  McpServerConfig,
  SavedProviderProfile,
} from '../../types';
import { getKeystoreMetadata } from '../../utils/secureKeystore';
import { isBuiltinProviderId } from '../../utils/providers';
import { SettingNumber, SettingToggle, SettingsCard } from '../SettingsControls';

export interface SecurityPrivacySectionProps {
  draft: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
  savedProfiles: SavedProviderProfile[];
  mcpServers: McpServerConfig[];
  dbConnections: DbConnectionConfig[];
  keystoreEphemeral?: boolean;
  onRotateKeystoreKey: () => Promise<void>;
  onExportBackup: () => void;
  onClearChatHistory: () => void;
  onDeleteCloudData?: () => Promise<void>;
  onResetSettings?: () => void;
  onClearAllData: () => void;
  cloudConnected?: boolean;
  cloudUserEmail?: string;
}

export const SecurityPrivacySection: React.FC<SecurityPrivacySectionProps> = ({
  draft,
  patch,
  savedProfiles,
  mcpServers,
  dbConnections,
  keystoreEphemeral,
  onRotateKeystoreKey,
  onExportBackup,
  onClearChatHistory,
  onDeleteCloudData,
  onResetSettings,
  onClearAllData,
  cloudConnected,
  cloudUserEmail,
}) => {
  const [rotating, setRotating] = useState(false);
  const [confirmClearChats, setConfirmClearChats] = useState(false);
  const [confirmDeleteCloud, setConfirmDeleteCloud] = useState(false);
  const [confirmNukeAll, setConfirmNukeAll] = useState(false);
  const [deletingCloud, setDeletingCloud] = useState(false);

  const meta = getKeystoreMetadata();
  const providerKeyCount = savedProfiles.filter(
    (p) => !isBuiltinProviderId(p.provider) && Boolean(p.externalKeys?.trim())
  ).length;
  const mcpSecretCount = mcpServers.filter((s) => Boolean(s.authSecret?.trim())).length;
  const dbSecretCount = dbConnections.filter((d) => Boolean(d.secret?.trim())).length;

  const handleRotateKey = async () => {
    setRotating(true);
    try {
      await onRotateKeystoreKey();
    } finally {
      setRotating(false);
    }
  };

  const handleDeleteCloud = async () => {
    if (!onDeleteCloudData) return;
    setDeletingCloud(true);
    try {
      await onDeleteCloudData();
      setConfirmDeleteCloud(false);
    } finally {
      setDeletingCloud(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. API Security & Keystore Encryption */}
      <SettingsCard
        title="API Security & Master Key Rotation"
        description="Secrets are sealed on-device with non-extractable AES-256-GCM keys stored in IndexedDB and are never synced in plaintext."
        icon={<KeyRound className="w-4 h-4" />}
        rightSlot={
          <button
            type="button"
            data-testid="rotate-keystore-btn"
            onClick={handleRotateKey}
            disabled={rotating || !meta.available}
            className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rotating ? 'animate-spin' : ''}`} />
            {rotating ? 'Rotating…' : 'Rotate Encryption Key'}
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Cipher Algorithm</div>
            <div className="text-xs font-semibold font-mono text-[var(--text)] mt-0.5">
              {meta.algorithm} ({keystoreEphemeral || meta.ephemeral ? 'Ephemeral' : 'IndexedDB Bound'})
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Sealed Secrets On Device</div>
            <div className="text-xs font-semibold tabular-nums text-[var(--text)] mt-0.5">
              {providerKeyCount} Provider · {mcpSecretCount} MCP · {dbSecretCount} DB
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Last Key Rotation</div>
            <div
              data-testid="keystore-last-rotated"
              className="text-xs font-semibold tabular-nums text-[var(--text)] mt-0.5"
            >
              {meta.lastRotatedAt
                ? `${new Date(meta.lastRotatedAt).toLocaleString()} (#${meta.rotationCount})`
                : 'Initial master key'}
            </div>
          </div>
        </div>
      </SettingsCard>

      {/* 2. Privacy Controls */}
      <SettingsCard
        title="Privacy Controls"
        description="Control conversation persistence, request telemetry collection, retention, and data export."
        icon={<Shield className="w-4 h-4" />}
      >
        <SettingToggle
          label="Conversation Privacy Mode (Ephemeral Session)"
          description="Keep new chat turns in memory only — skip saving to localStorage and skip syncing chats to Supabase cloud."
          checked={draft.conversationPrivacyMode === true}
          testId="conversation-privacy-toggle"
          onChange={(v) => patch({ conversationPrivacyMode: v })}
        />
        <SettingToggle
          label="Opt Out of Request Telemetry Logging"
          description="Disable recording latency/token entries in the local API Request History panel."
          checked={draft.telemetryOptOut === true}
          onChange={(v) => patch({ telemetryOptOut: v })}
        />
        <SettingNumber
          label="Chat Retention Window (Days, 0 = Keep Forever)"
          value={draft.retentionDays ?? 0}
          min={0}
          max={3650}
          onChange={(v) => patch({ retentionDays: v })}
        />
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onExportBackup}
            className="px-3.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Full User Data Archive
          </button>
        </div>
      </SettingsCard>

      {/* 3. Access Control & Session Info */}
      <SettingsCard
        title="Access Control & Connected Session"
        description="Active runtime identity, cloud session status, and browser environment."
        icon={<ShieldCheck className="w-4 h-4" />}
      >
        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] overflow-hidden text-xs">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg)]">
            <span className="text-[var(--text-2)]">Cloud Session Status</span>
            <span className="font-semibold text-[var(--text)]">
              {cloudConnected ? `Signed in (${cloudUserEmail || 'Supabase Auth'})` : 'Local Guest Workspace'}
            </span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg)]">
            <span className="text-[var(--text-2)]">Tool Execution Policy</span>
            <span className="font-mono text-[var(--text-3)]">
              Write actions confirmation-gated
            </span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg)]">
            <span className="text-[var(--text-2)]">Current Device Context</span>
            <span className="font-mono text-[var(--text-3)] truncate max-w-[260px]">
              {typeof navigator !== 'undefined' ? navigator.platform || 'Web Browser' : 'Web'}
            </span>
          </div>
        </div>
      </SettingsCard>

      {/* 4. Data Management & Danger Zone */}
      <SettingsCard
        title="Data Management"
        description="Granular cleanup controls for chat history, cloud synced data, preferences, or a complete device wipe."
        icon={<Lock className="w-4 h-4 text-[var(--settings-danger)]" />}
      >
        <div className="space-y-3">
          {/* Clear Chat History */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-1">
            <div>
              <div className="text-xs font-semibold text-[var(--text)]">Clear Chat History</div>
              <div className="text-[11px] text-[var(--text-3)]">
                Delete all conversations while keeping API providers, settings, and memory.
              </div>
            </div>
            {!confirmClearChats ? (
              <button
                type="button"
                data-testid="clear-chat-history-btn"
                onClick={() => setConfirmClearChats(true)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs font-semibold text-[var(--text)] hover:border-red-500/40 cursor-pointer"
              >
                Clear Chat History
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="confirm-clear-chat-history-btn"
                  onClick={() => {
                    onClearChatHistory();
                    setConfirmClearChats(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[var(--settings-danger)] text-[var(--settings-on-accent)] text-xs font-semibold cursor-pointer"
                >
                  Confirm Clear Chats
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearChats(false)}
                  className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Delete Cloud Data */}
          {cloudConnected && onDeleteCloudData && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
              <div>
                <div className="text-xs font-semibold text-[var(--text)]">
                  Delete Cloud Account Data
                </div>
                <div className="text-[11px] text-[var(--text-3)]">
                  Erase your stored settings state and chat sessions from Supabase RLS tables.
                </div>
              </div>
              {!confirmDeleteCloud ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteCloud(true)}
                  className="px-3 py-1.5 rounded-lg border border-red-500/40 text-xs font-semibold text-[var(--settings-danger)] cursor-pointer"
                >
                  Delete Cloud Data
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={deletingCloud}
                    onClick={handleDeleteCloud}
                    className="px-3 py-1.5 rounded-lg bg-[var(--settings-danger)] text-[var(--settings-on-accent)] text-xs font-semibold cursor-pointer"
                  >
                    {deletingCloud ? 'Deleting…' : 'Confirm Cloud Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteCloud(false)}
                    className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Reset Preferences */}
          {onResetSettings && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
              <div>
                <div className="text-xs font-semibold text-[var(--text)]">Reset Preferences</div>
                <div className="text-[11px] text-[var(--text-3)]">
                  Restore default settings while preserving chats and provider profiles.
                </div>
              </div>
              <button
                type="button"
                onClick={onResetSettings}
                className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs font-semibold text-[var(--text)] cursor-pointer"
              >
                Reset Preferences
              </button>
            </div>
          )}

          {/* Complete Wipe */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--settings-danger)] shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-[var(--settings-danger)]">
                  Delete All Data (Factory Reset)
                </div>
                <div className="text-[11px] text-[var(--text-3)]">
                  Irreversibly erase all chats, memory, knowledge docs, MCP/DB configs, and profiles on this device.
                </div>
              </div>
            </div>
            {!confirmNukeAll ? (
              <button
                type="button"
                onClick={() => setConfirmNukeAll(true)}
                className="px-3 py-1.5 rounded-lg border border-red-500/45 bg-red-500/10 text-xs font-semibold text-[var(--settings-danger)] inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete All Data
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClearAllData();
                    setConfirmNukeAll(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[var(--settings-danger)] text-[var(--settings-on-accent)] text-xs font-semibold cursor-pointer"
                >
                  Confirm Factory Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmNukeAll(false)}
                  className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </SettingsCard>
    </div>
  );
};
