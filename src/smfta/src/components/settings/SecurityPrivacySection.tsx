import React, { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import type {
  AppSettings,
  DbConnectionConfig,
  McpServerConfig,
  SavedProviderProfile,
} from '../../types';
import { SettingsCard } from '../SettingsControls';

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
  onExportBackup,
  onClearChatHistory,
  onClearAllData,
}) => {
  const [clearChatsStep, setClearChatsStep] = useState<0 | 1 | 2>(0);
  const [deleteAllStep, setDeleteAllStep] = useState<0 | 1 | 2>(0);

  return (
    <div className="space-y-3" data-testid="settings-section-data">
      <SettingsCard>
        {/* Export JSON */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <span className="text-[13.5px] font-medium text-[var(--ink)]">
            Export Backup (JSON)
          </span>
          <button
            type="button"
            data-testid="export-all-data-json-btn"
            onClick={onExportBackup}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>

        {/* Clear Chat History */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <span className="text-[13.5px] font-medium text-[var(--ink)]">
            Clear Chat History
          </span>

          {clearChatsStep === 0 && (
            <button
              type="button"
              data-testid="clear-chat-history-btn"
              onClick={() => setClearChatsStep(1)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] hover:border-red-500/40 cursor-pointer"
            >
              Clear Chats
            </button>
          )}

          {clearChatsStep === 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="clear-chat-history-step1-btn"
                onClick={() => setClearChatsStep(2)}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold cursor-pointer"
              >
                নিশ্চিত?
              </button>
              <button
                type="button"
                onClick={() => setClearChatsStep(0)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs cursor-pointer"
              >
                বাতিল
              </button>
            </div>
          )}

          {clearChatsStep === 2 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="confirm-clear-chat-history-btn"
                onClick={() => {
                  onClearChatHistory();
                  setClearChatsStep(0);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-[var(--settings-danger)] text-[var(--settings-on-accent)] text-xs font-semibold cursor-pointer"
              >
                সব চ্যাট মুছুন
              </button>
              <button
                type="button"
                onClick={() => setClearChatsStep(0)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs cursor-pointer"
              >
                বাতিল
              </button>
            </div>
          )}
        </div>

        {/* Delete All Data */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
          <span className="text-[13.5px] font-medium text-[var(--settings-danger)]">
            Reset All Data
          </span>

          {deleteAllStep === 0 && (
            <button
              type="button"
              data-testid="delete-all-data-btn"
              onClick={() => setDeleteAllStep(1)}
              className="px-3 py-1.5 rounded-lg border border-red-500/45 bg-red-500/10 text-xs font-semibold text-[var(--settings-danger)] inline-flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset All
            </button>
          )}

          {deleteAllStep === 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="delete-all-data-step1-btn"
                onClick={() => setDeleteAllStep(2)}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold cursor-pointer"
              >
                নিশ্চিত?
              </button>
              <button
                type="button"
                onClick={() => setDeleteAllStep(0)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs cursor-pointer"
              >
                বাতিল
              </button>
            </div>
          )}

          {deleteAllStep === 2 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="confirm-delete-all-data-btn"
                onClick={() => {
                  onClearAllData();
                  setDeleteAllStep(0);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-[var(--settings-danger)] text-[var(--settings-on-accent)] text-xs font-semibold cursor-pointer"
              >
                সব ডেটা মুছুন
              </button>
              <button
                type="button"
                onClick={() => setDeleteAllStep(0)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs cursor-pointer"
              >
                বাতিল
              </button>
            </div>
          )}
        </div>
      </SettingsCard>
    </div>
  );
};
