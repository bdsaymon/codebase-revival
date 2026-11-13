import React from 'react';
import { Cpu, FileText, Info, Layers, Sparkles } from 'lucide-react';
import type { AppSettings, SavedProviderProfile } from '../../types';
import { getAllVerifiedModelChoices } from '../../utils/providers';
import {
  SettingSelect,
  SettingToggle,
  SettingsCard,
  SettingsGrid,
} from '../SettingsControls';

export interface ModelsSectionProps {
  draft: AppSettings;
  savedProfiles: SavedProviderProfile[];
  activeProfile: SavedProviderProfile;
  patch: (partial: Partial<AppSettings>) => void;
}

export const ModelsSection: React.FC<ModelsSectionProps> = ({
  draft,
  savedProfiles,
  activeProfile,
  patch,
}) => {
  const verifiedModels = getAllVerifiedModelChoices(savedProfiles);
  const slots = draft.modelSlots || {};

  const updateSlot = (
    slotKey: 'defaultModel' | 'fastModel' | 'reasoningModel' | 'visionModel',
    value: string
  ) => {
    patch({
      modelSlots: {
        ...slots,
        [slotKey]: value || undefined,
      },
    });
  };

  const renderSlotSelect = (
    label: string,
    slotKey: 'defaultModel' | 'fastModel' | 'reasoningModel' | 'visionModel',
    hint: string
  ) => {
    const current = slots[slotKey] || '';
    return (
      <label className="settings-control">
        <span>{label}</span>
        <span className="text-[11px] font-normal text-[var(--text-3)] -mt-1">{hint}</span>
        <select
          className="cs-input font-mono text-xs"
          aria-label={label}
          value={current}
          onChange={(e) => updateSlot(slotKey, e.target.value)}
        >
          <option value="">Use Active Profile Model ({activeProfile.externalModel || 'Auto'})</option>
          {verifiedModels.map((opt) => {
            const val = `${opt.profileId}::${opt.modelId}`;
            return (
              <option key={`${slotKey}-${val}`} value={val}>
                {opt.profileName} · {opt.modelId}
              </option>
            );
          })}
        </select>
      </label>
    );
  };

  const lowerModel = (activeProfile.externalModel || '').toLowerCase();
  const isVisionCapable =
    !activeProfile.capabilities ||
    activeProfile.capabilities.includes('vision') ||
    /gemini|gpt-4o|gpt-5|claude-3|claude-sonnet|claude-opus|vision|pixtral/i.test(lowerModel);
  const isAudioCapable = /gemini|gpt-4o-audio|whisper/i.test(lowerModel);
  const isVideoCapable = /gemini/i.test(lowerModel);
  const supportsStreaming = activeProfile.supportsStreaming !== false;

  const capabilityRows = [
    { name: 'Text Generation', supported: true, detail: 'Chat, Markdown, Code & JSON' },
    { name: 'Image Understanding', supported: isVisionCapable, detail: isVisionCapable ? 'Multimodal image attachment input' : 'Text-only or unverified on model' },
    { name: 'Audio Understanding / Voice', supported: isAudioCapable || Boolean(typeof window !== 'undefined' && 'speechSynthesis' in window), detail: isAudioCapable ? 'Native audio + Web Speech TTS/STT' : 'Browser Web Speech STT/TTS' },
    { name: 'Video Understanding', supported: isVideoCapable, detail: isVideoCapable ? 'Supported on Gemini multimodal profiles' : 'Requires Gemini multimodal model' },
    { name: 'File Understanding', supported: true, detail: `Up to ${draft.maxUploadMb ?? 10} MB docs, CSV, JSON & ZIP workspaces` },
    { name: 'Streaming SSE', supported: supportsStreaming, detail: supportsStreaming ? 'Real-time Server-Sent Events active' : 'Non-streaming mode configured' },
  ];

  const contextWindow =
    activeProfile.contextWindow ??
    (lowerModel.includes('gemini') ? 1_000_000 : 128_000);
  const maxOut = activeProfile.maxOutputTokens ?? draft.maxOutputTokens ?? 4096;

  return (
    <div className="space-y-4">
      {/* 1. Model Selection Slots */}
      <SettingsCard
        title="Model Selection by Role"
        description="Assign verified or built-in models to specialized routing slots. Only real configured models are listed."
        icon={<Layers className="w-4 h-4" />}
      >
        <SettingsGrid>
          {renderSlotSelect(
            'Default Model',
            'defaultModel',
            'Used for Balanced general conversations'
          )}
          {renderSlotSelect(
            'Fast Model',
            'fastModel',
            'Used when Quick / Fast mode is selected'
          )}
          {renderSlotSelect(
            'Reasoning Model',
            'reasoningModel',
            'Used when Power / Deep Thinking mode is active'
          )}
          {renderSlotSelect(
            'Vision Model',
            'visionModel',
            'Used automatically when images are attached'
          )}
        </SettingsGrid>
      </SettingsCard>

      {/* 2. Model Preferences */}
      <SettingsCard
        title="Model Preferences"
        description="Control thinking effort, live reasoning trace, response length, and output formatting."
        icon={<Sparkles className="w-4 h-4" />}
      >
        <SettingsGrid>
          <SettingSelect
            label="Default Processing Mode"
            value={draft.mode}
            options={[
              { value: 'fast', label: 'Fast (Low Latency)' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'power', label: 'Power (Deep Reasoning)' },
            ]}
            onChange={(v) => patch({ mode: v as AppSettings['mode'] })}
          />
          <SettingSelect
            label="Thinking Effort"
            value={draft.thinkingMode ?? 'medium'}
            options={[
              { value: 'off', label: 'Off (Direct Reply)' },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High (Deep Trace)' },
            ]}
            onChange={(v) => patch({ thinkingMode: v as AppSettings['thinkingMode'] })}
          />
          <SettingSelect
            label="Response Length"
            value={draft.style}
            options={[
              { value: 'concise', label: 'Concise & Direct' },
              { value: 'detailed', label: 'Detailed & Thorough' },
            ]}
            onChange={(v) => patch({ style: v as AppSettings['style'] })}
          />
          <SettingSelect
            label="Output Format"
            value={draft.outputFormat ?? 'markdown'}
            options={[
              { value: 'markdown', label: 'Markdown (Default)' },
              { value: 'plain', label: 'Clean Plain Text' },
              { value: 'json', label: 'Strict JSON' },
              { value: 'structured', label: 'Structured Sections' },
            ]}
            onChange={(v) => patch({ outputFormat: v as AppSettings['outputFormat'] })}
          />
        </SettingsGrid>
        <SettingToggle
          label="Live Thinking Summary"
          description="Stream and expand the live reasoning trace above assistant responses when supported."
          checked={draft.liveThinkingSummary !== false}
          onChange={(v) => patch({ liveThinkingSummary: v })}
        />
      </SettingsCard>

      {/* 3. Model Capabilities */}
      <SettingsCard
        title="Model Capabilities"
        description={`Runtime & modality inspection for active model (${activeProfile.externalModel || 'smfta-core'}).`}
        icon={<Cpu className="w-4 h-4" />}
      >
        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] overflow-hidden">
          {capabilityRows.map((row) => (
            <div
              key={row.name}
              className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-[var(--bg)] text-xs"
            >
              <div>
                <div className="font-semibold text-[var(--text)]">{row.name}</div>
                <div className="text-[11px] text-[var(--text-3)]">{row.detail}</div>
              </div>
              <span
                className={`px-2 py-0.5 rounded border text-[11px] font-medium ${
                  row.supported
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-[var(--accent-emerald)]'
                    : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)]'
                }`}
              >
                {row.supported ? 'Supported' : 'Limited'}
              </span>
            </div>
          ))}
        </div>
      </SettingsCard>

      {/* 4. Model Information */}
      <SettingsCard
        title="Active Model Metadata"
        description="Context window, token output limits, and verification state."
        icon={<Info className="w-4 h-4" />}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Active Profile</div>
            <div className="text-xs font-semibold text-[var(--text)] truncate mt-0.5">
              {activeProfile.name}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Context Window</div>
            <div className="text-sm font-semibold text-[var(--text)] tabular-nums mt-0.5">
              {contextWindow.toLocaleString()} tokens
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Max Output Tokens</div>
            <div className="text-sm font-semibold text-[var(--text)] tabular-nums mt-0.5">
              {maxOut.toLocaleString()} tokens
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="text-[11px] text-[var(--text-3)]">Verification Status</div>
            <div className="text-xs font-semibold text-[var(--text)] mt-0.5 capitalize">
              {activeProfile.isBuiltin
                ? 'Built-in Keyless'
                : activeProfile.verificationStatus || (activeProfile.verified ? 'verified' : 'untested')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-3)] pt-1">
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate font-mono">
            Model: {activeProfile.externalModel || 'Auto'} · Provider: {activeProfile.provider}
          </span>
        </div>
      </SettingsCard>
    </div>
  );
};
