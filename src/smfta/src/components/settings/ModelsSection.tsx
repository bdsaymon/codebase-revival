import React, { useEffect, useState } from 'react';
import type { AppSettings, SavedProviderProfile } from '../../types';
import {
  GEMINI_ACTIVE_MODELS,
  getAllVerifiedModelChoices,
} from '../../utils/providers';
import { SettingToggle, SettingsCard } from '../SettingsControls';

export interface ModelsSectionProps {
  draft: AppSettings;
  savedProfiles: SavedProviderProfile[];
  activeProfile: SavedProviderProfile;
  onActivateProfile?: (profile: SavedProviderProfile) => void;
  onUpdateProfileModel?: (profileId: string, modelId: string) => void;
  patch: (partial: Partial<AppSettings>) => void;
}

export const ModelsSection: React.FC<ModelsSectionProps> = ({
  draft,
  savedProfiles,
  activeProfile,
  onActivateProfile,
  onUpdateProfileModel,
  patch,
}) => {
  const [geminiStatus, setGeminiStatus] = useState<{
    checked: boolean;
    configured: boolean;
    message?: string;
  }>({ checked: false, configured: false });

  useEffect(() => {
    let active = true;
    fetch('/api/models/status')
      .then((r) => r.json())
      .then((data: { configured?: boolean; message?: string }) => {
        if (!active) return;
        setGeminiStatus({
          checked: true,
          configured: Boolean(data?.configured),
          message: data?.message,
        });
      })
      .catch(() => {
        if (active) setGeminiStatus({ checked: true, configured: false });
      });
    return () => {
      active = false;
    };
  }, []);

  const verifiedModels = getAllVerifiedModelChoices(savedProfiles);
  const thinkingEnabled =
    draft.thinkingEnabled !== undefined
      ? draft.thinkingEnabled
      : draft.thinkingMode !== 'off';
  const currentEffort: 'low' | 'medium' | 'high' =
    draft.thinkingMode === 'low' ||
    draft.thinkingMode === 'medium' ||
    draft.thinkingMode === 'high'
      ? draft.thinkingMode
      : 'medium';
  const currentLength: 'short' | 'medium' | 'detailed' =
    draft.responseLength ??
    (draft.style === 'concise' ? 'short' : 'detailed');
  const currentStyle = draft.responseStyle || 'normal';
  const currentMaxTokens = draft.maxOutputTokens || 16384;
  const activeModelId =
    activeProfile.externalModel || draft.externalModel || 'gemini-4-hydrogen';
  const isGemini4Model = /gemini-4/i.test(activeModelId);
  const currentTemp =
    typeof draft.weightTemp === 'number' ? draft.weightTemp : 0.7;

  const currentSelectValue = `${activeProfile.id}::${activeModelId}`;

  const handleModelSelectionChange = (encoded: string) => {
    const [profId, modId] = encoded.split('::');
    const targetProf = savedProfiles.find((p) => p.id === profId);
    if (targetProf && modId) {
      onUpdateProfileModel?.(targetProf.id, modId);
      onActivateProfile?.({ ...targetProf, externalModel: modId });
      patch({
        activeProfileId: targetProf.id,
        provider: targetProf.provider,
        externalModel: modId,
      });
    }
  };

  return (
    <div className="space-y-3" data-testid="settings-section-models">
      {/* Live Server Gemini Status Banner */}
      {geminiStatus.checked && (
        <div
          data-testid="gemini-server-status-banner"
          className={`px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            geminiStatus.configured
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400'
          }`}
        >
          <span className="font-medium">
            {geminiStatus.configured
              ? 'Gemini API Integration Active (Server-side @google/genai)'
              : 'Integration required: GEMINI_API_KEY is not configured in server Secrets.'}
          </span>
          <span className="font-mono text-[10px] uppercase shrink-0">
            {geminiStatus.configured ? 'Connected' : 'Missing Key'}
          </span>
        </div>
      )}

      <SettingsCard>
        {/* Active Model */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <div>
            <span className="text-[13.5px] font-medium text-[var(--ink)] block">
              Active Model
            </span>
            <span className="text-[11.5px] text-[var(--ink-dim)]">
              Select Gemini model or connected custom provider profile
            </span>
          </div>
          <select
            data-testid="current-model-selector"
            aria-label="Current model selector"
            value={currentSelectValue}
            onChange={(e) => handleModelSelectionChange(e.target.value)}
            className="cs-input font-mono text-xs sm:text-[13px] py-1.5 px-2.5 max-w-[260px]"
          >
            {verifiedModels.map((opt) => {
              const val = `${opt.profileId}::${opt.modelId}`;
              return (
                <option key={val} value={val}>
                  {opt.profileName} · {opt.modelId}
                </option>
              );
            })}
            {!verifiedModels.some((v) =>
              GEMINI_ACTIVE_MODELS.includes(v.modelId as typeof GEMINI_ACTIVE_MODELS[number])
            ) &&
              GEMINI_ACTIVE_MODELS.map((gm) => (
                <option key={`gemini-${gm}`} value={`${activeProfile.id}::${gm}`}>
                  Gemini · {gm}
                </option>
              ))}
          </select>
        </div>

        {/* System Prompt */}
        <div className="py-2.5 border-b border-[var(--border)] space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-medium text-[var(--ink)]">
              System Prompt (Custom Instructions)
            </span>
            <span className="text-[11px] font-mono text-[var(--ink-dim)]">
              {(draft.globalInstructions || '').length} chars
            </span>
          </div>
          <textarea
            rows={3}
            data-testid="models-system-prompt-textarea"
            value={draft.globalInstructions ?? draft.customInst ?? ''}
            onChange={(e) =>
              patch({
                globalInstructions: e.target.value,
                customInst: e.target.value,
              })
            }
            placeholder="Define system persona, coding rules, formatting preferences, or tone…"
            className="cs-textarea w-full text-xs"
          />
        </div>

        {/* Temperature (Disabled on Gemini 4.* per official SDK policy) */}
        <div className="py-2.5 border-b border-[var(--border)] space-y-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-[13.5px] font-medium text-[var(--ink)] block">
                Temperature ({isGemini4Model ? 'Default 1.0 locked on Gemini 4' : currentTemp.toFixed(1)})
              </span>
              <span className="text-[11.5px] text-[var(--ink-dim)]">
                {isGemini4Model
                  ? 'Gemini 4 models use optimal native sampling; temperature override is disabled.'
                  : 'Lower values make output deterministic; higher values increase creativity.'}
              </span>
            </div>
            <input
              type="range"
              data-testid="models-temperature-slider"
              min={0}
              max={1.5}
              step={0.1}
              disabled={isGemini4Model}
              value={isGemini4Model ? 1.0 : currentTemp}
              onChange={(e) => patch({ weightTemp: Number(e.target.value) })}
              className="w-36 accent-[var(--primary)] disabled:opacity-40 cursor-pointer"
            />
          </div>
        </div>

        {/* Extended Thinking Toggle */}
        <SettingToggle
          label="Extended Thinking (Claude-Style Reasoning)"
          description="Enable Gemini native thinking trace above the response"
          checked={thinkingEnabled}
          testId="thinking-enabled-toggle"
          onChange={(enabled) =>
            patch({
              thinkingEnabled: enabled,
              thinkingMode: enabled ? currentEffort : 'off',
            })
          }
        />

        {/* Thinking Level */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <div>
            <span className="text-[13.5px] font-medium text-[var(--ink)] block">
              Thinking Budget / Level
            </span>
            <span className="text-[11.5px] text-[var(--ink-dim)]">
              Low (fast) · Medium (balanced) · High (deep coding & reasoning)
            </span>
          </div>
          <div className="cs-seg" data-testid="thinking-effort-selector">
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                key={level}
                type="button"
                disabled={!thinkingEnabled}
                data-testid={`thinking-effort-${level}`}
                onClick={() =>
                  patch({
                    thinkingEnabled: true,
                    thinkingMode: level,
                  })
                }
                className={`cs-seg-btn capitalize ${
                  thinkingEnabled && currentEffort === level
                    ? 'is-active'
                    : ''
                } disabled:opacity-40`}
              >
                {level === 'low'
                  ? 'Low'
                  : level === 'medium'
                  ? 'Medium'
                  : 'High'}
              </button>
            ))}
          </div>
        </div>

        {/* Live Thinking */}
        <SettingToggle
          label="Live Thinking Card Auto-Expand"
          description="চিন্তা করার সময় লাইভ টাইমার ও ধাপগুলো সরাসরি খোলা দেখাবে"
          checked={draft.liveThinkingSummary !== false}
          testId="live-thinking-toggle"
          onChange={(v) => patch({ liveThinkingSummary: v })}
        />

        {/* Thinking Subject Preview Up Front */}
        <SettingToggle
          label="Show Thinking Subject Up Front (শুরুতেই বিষয় দেখানো)"
          description="থিংকিং শুরুতেই কোন বিষয়ে ভাবছে তা হেডার ও কার্ডের শুরুতে দেখাবে"
          checked={draft.showThinkingTopic !== false}
          testId="show-thinking-topic-toggle"
          onChange={(v) => patch({ showThinkingTopic: v })}
        />

        {/* Auto-collapse Thinking on Final Answer */}
        <SettingToggle
          label="Auto-Collapse Thinking on Reply"
          description="মূল উত্তর শুরু হলে থিংকিং কার্ড স্বয়ংক্রিয়ভাবে ভাঁজ হয়ে পরিষ্কার দেখাবে"
          checked={draft.autoCollapseThinking !== false}
          testId="auto-collapse-thinking-toggle"
          onChange={(v) => patch({ autoCollapseThinking: v })}
        />

        {/* Smooth Pen-Like Typewriter Streaming */}
        <SettingToggle
          label="Smooth Typewriter Streaming (কলমের মতো লেখা)"
          description="উত্তর একসাথে না এসে কলমের মতো মসৃণভাবে লাইন বাই লাইন টাইপ হবে"
          checked={draft.streamingReveal !== false}
          testId="streaming-reveal-toggle"
          onChange={(v) => patch({ streamingReveal: v })}
        />

        {/* Claude Writing Style */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <div>
            <span className="text-[13.5px] font-medium text-[var(--ink)] block">
              Writing Style (Claude Preset)
            </span>
            <span className="text-[11.5px] text-[var(--ink-dim)]">
              উত্তরের ধরন ও উপস্থাপনার স্টাইল নির্বাচন করুন
            </span>
          </div>
          <div className="cs-seg" data-testid="models-style-selector">
            {(
              [
                { id: 'normal', label: 'Normal' },
                { id: 'concise', label: 'Concise' },
                { id: 'explanatory', label: 'Explanatory' },
                { id: 'formal', label: 'Formal' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                data-testid={`models-style-${st.id}`}
                onClick={() =>
                  patch({
                    responseStyle: st.id,
                    style: st.id === 'concise' ? 'concise' : 'detailed',
                  })
                }
                className={`cs-seg-btn ${
                  currentStyle === st.id ? 'is-active' : ''
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Response Length */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <div>
            <span className="text-[13.5px] font-medium text-[var(--ink)] block">
              Response Length
            </span>
            <span className="text-[11.5px] text-[var(--ink-dim)]">
              সংক্ষিপ্ত, মাঝারি অথবা সম্পূর্ণ বিস্তারিত উত্তর ও বড় কোড
            </span>
          </div>
          <div className="cs-seg" data-testid="response-length-selector">
            <button
              type="button"
              data-testid="response-length-short"
              onClick={() =>
                patch({ responseLength: 'short', style: 'concise' })
              }
              className={`cs-seg-btn ${
                currentLength === 'short' ? 'is-active' : ''
              }`}
            >
              ছোট
            </button>
            <button
              type="button"
              data-testid="response-length-medium"
              onClick={() =>
                patch({ responseLength: 'medium', style: 'detailed' })
              }
              className={`cs-seg-btn ${
                currentLength === 'medium' ? 'is-active' : ''
              }`}
            >
              মাঝারি
            </button>
            <button
              type="button"
              data-testid="response-length-detailed"
              onClick={() =>
                patch({ responseLength: 'detailed', style: 'detailed' })
              }
              className={`cs-seg-btn ${
                currentLength === 'detailed' ? 'is-active' : ''
              }`}
            >
              বিস্তারিত
            </button>
          </div>
        </div>

        {/* Cross-Model Context Memory Carryover */}
        <SettingToggle
          label="Cross-Model Memory Carryover (মডেল চেঞ্জ করলেও আগের কথা মনে রাখা)"
          description="একই পেজে বা চ্যাটে মডেল পরিবর্তন করলেও আগের সব কথোপকথন ও প্রেক্ষাপট নতুন মডেলে অক্ষুণ্ণ রাখবে"
          checked={draft.crossModelMemoryCarryover !== false}
          testId="cross-model-memory-toggle"
          onChange={(v) => patch({ crossModelMemoryCarryover: v, includeHistory: true })}
        />

        {/* Conversation History Memory Depth */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
          <div>
            <span className="text-[13.5px] font-medium text-[var(--ink)] block">
              Conversation Memory Depth (কতগুলো মেসেজ মনে রাখবে)
            </span>
            <span className="text-[11.5px] text-[var(--ink-dim)]">
              একই চ্যাটে মডেল চেঞ্জ বা দীর্ঘ আলোচনায় যতগুলো আগের মেসেজ সরাসরি মনে রাখবে
            </span>
          </div>
          <div className="cs-seg" data-testid="history-depth-selector">
            {(
              [
                { count: 12, label: '12 Turns' },
                { count: 24, label: '24 Turns' },
                { count: 40, label: '40 Max' },
              ] as const
            ).map((opt) => {
              const curDepth = draft.maxHistoryMessages ?? 24;
              return (
                <button
                  key={opt.count}
                  type="button"
                  data-testid={`history-depth-${opt.count}`}
                  onClick={() =>
                    patch({
                      includeHistory: true,
                      maxHistoryMessages: opt.count,
                    })
                  }
                  className={`cs-seg-btn ${
                    curDepth === opt.count ? 'is-active' : ''
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Max Output Capacity for Large Code & Design */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
          <div>
            <span className="text-[13.5px] font-medium text-[var(--ink)] block">
              Max Output Capacity (বড় কোড ও ডিজাইন)
            </span>
            <span className="text-[11.5px] text-[var(--ink-dim)]">
              বড় ওয়েবসাইট, কোড আপডেট বা বিস্তারিত লেখার সর্বোচ্চ টোকেন সীমা
            </span>
          </div>
          <div className="cs-seg" data-testid="max-tokens-selector">
            {(
              [
                { tokens: 4096, label: '4K' },
                { tokens: 8192, label: '8K' },
                { tokens: 16384, label: '16K' },
                { tokens: 32768, label: '32K Max' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.tokens}
                type="button"
                data-testid={`max-tokens-${opt.tokens}`}
                onClick={() => patch({ maxOutputTokens: opt.tokens })}
                className={`cs-seg-btn ${
                  currentMaxTokens >= opt.tokens &&
                  (opt.tokens === 32768 || currentMaxTokens < opt.tokens * 2)
                    ? 'is-active'
                    : ''
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </SettingsCard>
    </div>
  );
};

