import React from 'react';
import {
  Code2,
  FileSearch,
  Globe,
  Image,
  Mic,
  Video,
  Wrench,
} from 'lucide-react';
import type { AppSettings } from '../../types';
import {
  DEFAULT_ENABLED_TOOLS,
  TOOL_CAPABILITY_REGISTRY,
  WORKSPACE_RUNTIME_CAPABILITIES,
} from '../../utils/capabilityRegistry';
import {
  SettingNumber,
  SettingSelect,
  SettingToggle,
  SettingsCard,
  SettingsGrid,
} from '../SettingsControls';

export interface ToolsCapabilitiesSectionProps {
  draft: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
}

export const ToolsCapabilitiesSection: React.FC<ToolsCapabilitiesSectionProps> = ({
  draft,
  patch,
}) => {
  const enabledTools = { ...DEFAULT_ENABLED_TOOLS, ...(draft.enabledTools || {}) };
  const imagePrefs = draft.imageGenPrefs || { defaultStyle: 'photorealistic', defaultSize: 1024 };

  const toggleTool = (id: string, nextVal: boolean) => {
    patch({
      enabledTools: {
        ...enabledTools,
        [id]: nextVal,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* 1. Web Search & Understanding */}
      <SettingsCard
        title="Web Search & Understanding"
        description="Configure default live web grounding, file upload limits, and multimodal input handling."
        icon={<Globe className="w-4 h-4" />}
      >
        <SettingToggle
          label="Enable Web Search by Default"
          description="Attach DuckDuckGo / live HTTPS page grounding automatically for new prompts."
          checked={draft.webSearchDefault === true}
          onChange={(v) => patch({ webSearchDefault: v })}
        />
        <SettingsGrid>
          <SettingNumber
            label="Max File Upload Size (MB)"
            value={draft.maxUploadMb ?? 10}
            min={1}
            max={25}
            onChange={(v) => patch({ maxUploadMb: v })}
          />
          <SettingSelect
            label="Creativity / Grounding Bias"
            value={draft.creativity}
            options={[
              { value: 'precise', label: 'Precise (Factual)' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'creative', label: 'Creative' },
            ]}
            onChange={(v) => patch({ creativity: v as AppSettings['creativity'] })}
          />
        </SettingsGrid>
        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text-2)]">
          <FileSearch className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
          <div>
            <strong>File & Image Understanding:</strong> Supports PNG/JPG/WebP image vision attachments plus PDF/Markdown/JSON/CSV/ZIP workspace analysis up to {draft.maxUploadMb ?? 10} MB.
          </div>
        </div>
      </SettingsCard>

      {/* 2. Image Generation */}
      <SettingsCard
        title="Image Generation Preferences"
        description="Default resolution and aesthetic style passed to /api/generate-image."
        icon={<Image className="w-4 h-4" />}
      >
        <SettingsGrid>
          <SettingSelect
            label="Default Image Style"
            value={imagePrefs.defaultStyle || 'photorealistic'}
            options={[
              { value: 'photorealistic', label: 'Photorealistic' },
              { value: 'editorial', label: 'Minimal Editorial' },
              { value: 'digital-art', label: 'Digital Illustration' },
              { value: 'technical-diagram', label: 'Technical / Architectural' },
              { value: '3d-render', label: 'Clean 3D Studio Render' },
            ]}
            onChange={(v) =>
              patch({
                imageGenPrefs: { ...imagePrefs, defaultStyle: v },
              })
            }
          />
          <SettingSelect
            label="Default Output Resolution"
            value={String(imagePrefs.defaultSize || 1024)}
            options={[
              { value: '512', label: '512 x 512 (Fast)' },
              { value: '768', label: '768 x 768' },
              { value: '1024', label: '1024 x 1024 (HD Default)' },
              { value: '1536', label: '1536 x 1536 (High Res)' },
            ]}
            onChange={(v) =>
              patch({
                imageGenPrefs: { ...imagePrefs, defaultSize: Number(v) },
              })
            }
          />
        </SettingsGrid>
      </SettingsCard>

      {/* 3. Voice, Audio & Video */}
      <SettingsCard
        title="Voice, Audio & Video"
        description="Speech synthesis language, playback speed, and multimodal video notes."
        icon={<Mic className="w-4 h-4" />}
      >
        <SettingToggle
          label="Auto-Speak AI Responses"
          description="Automatically read new replies aloud via browser speech synthesis."
          checked={draft.autoVoice === true}
          onChange={(v) => patch({ autoVoice: v })}
        />
        <SettingsGrid>
          <SettingSelect
            label="Voice Recognition / TTS Language"
            value={draft.vlang}
            options={[
              { value: 'bn-BD', label: 'বাংলা (bn-BD)' },
              { value: 'en-US', label: 'English (en-US)' },
              { value: 'hi-IN', label: 'हिन्दी (hi-IN)' },
            ]}
            onChange={(v) => patch({ vlang: v as AppSettings['vlang'] })}
          />
          <SettingNumber
            label="Voice Playback Speed"
            value={draft.voiceSpeed ?? 1.0}
            min={0.5}
            max={2.0}
            step={0.1}
            onChange={(v) => patch({ voiceSpeed: v })}
          />
        </SettingsGrid>
        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text-2)]">
          <Video className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
          <div>
            <strong>Video Understanding:</strong> Available when an active Gemini multimodal profile (`gemini-3.8-flash` / `gemini-4-hydrogen`) is selected.
          </div>
        </div>
      </SettingsCard>

      {/* 4. Code Interpreter & Runtime Matrix */}
      <SettingsCard
        title="Code Interpreter & Execution Runtimes"
        description="Honest runtime capabilities for browser sandboxing vs static workspace tools."
        icon={<Code2 className="w-4 h-4" />}
      >
        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] overflow-hidden">
          {WORKSPACE_RUNTIME_CAPABILITIES.map((rt) => (
            <div
              key={rt.language}
              className="flex items-start justify-between gap-3 px-3.5 py-2.5 bg-[var(--bg)] text-xs"
            >
              <div>
                <div className="font-semibold text-[var(--text)] font-mono uppercase">
                  {rt.aliases.join(', ')}
                </div>
                <div className="text-[11px] text-[var(--text-3)] mt-0.5">{rt.description}</div>
              </div>
              <span
                className={`px-2 py-0.5 rounded border text-[10px] font-medium shrink-0 ${
                  rt.executableInBrowser
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-[var(--accent-emerald)]'
                    : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)]'
                }`}
              >
                {rt.executableInBrowser ? rt.mode : 'Edit/Download Only'}
              </span>
            </div>
          ))}
        </div>
      </SettingsCard>

      {/* 5. Per-Tool Execution Toggles */}
      <SettingsCard
        title="Tool Execution Controls"
        description="Enable or disable individual server & assistant tools."
        icon={<Wrench className="w-4 h-4" />}
      >
        <div className="divide-y divide-[var(--border)]">
          {TOOL_CAPABILITY_REGISTRY.map((tool) => (
            <SettingToggle
              key={tool.id}
              label={tool.name}
              description={`${tool.description} (${tool.executionTarget})`}
              checked={enabledTools[tool.id] !== false}
              onChange={(v) => toggleTool(tool.id, v)}
            />
          ))}
        </div>
      </SettingsCard>
    </div>
  );
};
