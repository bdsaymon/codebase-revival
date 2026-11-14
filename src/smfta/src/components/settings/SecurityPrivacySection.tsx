import React, { useState } from 'react';
import {
  AlertTriangle,
  Download,
  KeyRound,
  Lock,
  RefreshCw,
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
  savedProfiles,
  mcpServers,
  dbConnections,
  keystoreEphemeral,
  onRotateKeystoreKey,
  onExportBackup,
  onClearChatHistory,
  onClearAllData,
}) => {
  const [rotating, setRotating] = useState(false);
  // 2-step confirmation states (0 = idle, 1 = step 1, 2 = step 2 final)
  const [clearChatsStep, setClearChatsStep] = useState<0 | 1 | 2>(0);
  const [deleteAllStep, setDeleteAllStep] = useState<0 | 1 | 2>(0);

  const meta = getKeystoreMetadata();
  const providerKeyCount = savedProfiles.filter(
    (p) => !isBuiltinProviderId(p.provider) && Boolean(p.externalKeys?.trim())
  ).length;
  const mcpSecretCount = mcpServers.filter((s) =>
    Boolean(s.authSecret?.trim())
  ).length;
  const dbSecretCount = dbConnections.filter((d) =>
    Boolean(d.secret?.trim())
  ).length;

  const handleRotateKey = async () => {
    setRotating(true);
    try {
      await onRotateKeystoreKey();
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="settings-section-data">
      {/* ১. সব ডেটা এক্সপোর্ট (JSON) */}
      <SettingsCard
        title="সব ডেটা এক্সপোর্ট (JSON)"
        description="আপনার চ্যাট হিস্ট্রি, মেমোরি, প্রজেক্ট এবং সেটিংস একটি JSON ফাইলে ডাউনলোড করে ব্যাকআপ রাখুন।"
        icon={<Download className="w-4 h-4" />}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 py-1">
          <div className="text-xs text-[var(--text-2)]">
            JSON ফরম্যাটে সম্পূর্ণ ডেটা এক্সপোর্ট করুন (গোপন API কী ছাড়া)।
          </div>
          <button
            type="button"
            data-testid="export-all-data-json-btn"
            onClick={onExportBackup}
            className="px-3.5 py-2 rounded-lg bg-[var(--primary)] text-[var(--settings-on-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            সব ডেটা এক্সপোর্ট (JSON)
          </button>
        </div>
      </SettingsCard>

      {/* ২. চ্যাট হিস্ট্রি ও সব ডেটা মুছে ফেলো (দুই ধাপে কনফার্মেশন) */}
      <SettingsCard
        title="ডেটা মুছে ফেলা (দুই ধাপে কনফার্মেশন)"
        description="চ্যাট ডিলিট করলে লোকাল স্টোরেজ ও ডাটাবেস উভয় জায়গা থেকে স্থায়ীভাবে মুছে যাবে — রিলোড দিলেও আর ফিরে আসবে না।"
        icon={<Lock className="w-4 h-4 text-[var(--settings-danger)]" />}
      >
        <div className="space-y-4">
          {/* চ্যাট হিস্ট্রি মুছে ফেলো */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-1">
            <div>
              <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
                চ্যাট হিস্ট্রি মুছে ফেলো
              </div>
              <div className="text-[11px] text-[var(--text-3)]">
                সব কথোপকথন লোকাল ও ক্লাউড ডাটাবেস থেকে স্থায়ীভাবে মুছে ফেলবে (সেটিংস ও মেমোরি অক্ষত থাকবে)।
              </div>
            </div>

            {clearChatsStep === 0 && (
              <button
                type="button"
                data-testid="clear-chat-history-btn"
                onClick={() => setClearChatsStep(1)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs font-semibold text-[var(--text)] hover:border-red-500/40 cursor-pointer"
              >
                চ্যাট হিস্ট্রি মুছে ফেলো
              </button>
            )}

            {clearChatsStep === 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="clear-chat-history-step1-btn"
                  onClick={() => setClearChatsStep(2)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold cursor-pointer"
                >
                  ধাপ ১: নিশ্চিত? (পরবর্তী ধাপ)
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="confirm-clear-chat-history-btn"
                  onClick={() => {
                    onClearChatHistory();
                    setClearChatsStep(0);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[var(--settings-danger)] text-[var(--settings-on-accent)] text-xs font-semibold cursor-pointer"
                >
                  চূড়ান্ত নিশ্চিতকরণ: সব চ্যাট মুছে ফেলুন
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

          {/* সব ডেটা মুছে ফেলো */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border)]">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--settings-danger)] shrink-0 mt-0.5" />
              <div>
                <div className="text-xs sm:text-sm font-semibold text-[var(--settings-danger)]">
                  সব ডেটা মুছে ফেলো
                </div>
                <div className="text-[11px] text-[var(--text-3)]">
                  চ্যাট, মেমোরি, প্রজেক্ট, কানেকশন এবং সব সেটিংস স্থায়ীভাবে মুছে ফেলবে।
                </div>
              </div>
            </div>

            {deleteAllStep === 0 && (
              <button
                type="button"
                data-testid="delete-all-data-btn"
                onClick={() => setDeleteAllStep(1)}
                className="px-3 py-1.5 rounded-lg border border-red-500/45 bg-red-500/10 text-xs font-semibold text-[var(--settings-danger)] inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                সব ডেটা মুছে ফেলো
              </button>
            )}

            {deleteAllStep === 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="delete-all-data-step1-btn"
                  onClick={() => setDeleteAllStep(2)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold cursor-pointer"
                >
                  ধাপ ১: সত্যিই সব মুছবেন? (পরবর্তী ধাপ)
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="confirm-delete-all-data-btn"
                  onClick={() => {
                    onClearAllData();
                    setDeleteAllStep(0);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[var(--settings-danger)] text-[var(--settings-on-accent)] text-xs font-semibold cursor-pointer"
                >
                  চূড়ান্ত নিশ্চিতকরণ: সব ডেটা মুছে ফেলুন
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
        </div>
      </SettingsCard>

      {/* ৩. এনক্রিপশন ও কী-স্টোর সুরক্ষা (বিদ্যমান ফিচার অক্ষত) */}
      <SettingsCard
        title="এনক্রিপশন ও API কী সুরক্ষা (AES-256-GCM)"
        description="আপনার API কী ডিভাইসে এনক্রিপ্টেড অবস্থায় সংরক্ষিত থাকে।"
        icon={<KeyRound className="w-4 h-4" />}
        rightSlot={
          <button
            type="button"
            data-testid="rotate-keystore-btn"
            onClick={handleRotateKey}
            disabled={rotating || !meta.available}
            className="px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${rotating ? 'animate-spin' : ''}`}
            />
            {rotating ? 'Rotating…' : 'Rotate Key'}
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Algorithm</div>
            <div className="font-semibold font-mono text-[var(--text)] mt-0.5">
              {meta.algorithm} ({keystoreEphemeral || meta.ephemeral ? 'Session' : 'IndexedDB'})
            </div>
          </div>
          <div className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Sealed Secrets</div>
            <div className="font-semibold tabular-nums text-[var(--text)] mt-0.5">
              {providerKeyCount} Provider · {mcpSecretCount} MCP · {dbSecretCount} DB
            </div>
          </div>
          <div className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Key Status</div>
            <div
              data-testid="keystore-last-rotated"
              className="font-semibold tabular-nums text-[var(--text)] mt-0.5"
            >
              {meta.lastRotatedAt
                ? `Rotated #${meta.rotationCount}`
                : 'Active Master Key'}
            </div>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
};
