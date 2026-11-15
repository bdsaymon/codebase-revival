import React from 'react';
import { Mic, Volume2, Globe, Sparkles } from 'lucide-react';
import { AppSettings } from '../../types';

interface VoiceAudioSectionProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
}

export const VoiceAudioSection: React.FC<VoiceAudioSectionProps> = ({
  settings,
  onUpdate,
}) => {
  const vlang = settings.vlang || 'bn-BD';
  const voiceSpeed = typeof settings.voiceSpeed === 'number' ? settings.voiceSpeed : 1.0;
  const ttsVoice = settings.externalModel || 'default';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-foreground tracking-tight flex items-center gap-2">
          <Mic className="w-5 h-5 text-indigo-500" />
          Voice & Audio Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure bilingual speech recognition (STT) and text-to-speech (TTS) voice preferences for immersive voice interactions.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-6 shadow-sm">
        {/* Bilingual Speech Recognition Language */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            Speech Recognition Language (STT)
          </label>
          <p className="text-xs text-muted-foreground">
            Select the primary language model for voice input transcription. Supports bilingual auto-switching between Bengali and English.
          </p>
          <select
            value={vlang}
            onChange={(e) => onUpdate({ vlang: e.target.value as AppSettings['vlang'] })}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="bn-BD">বাংলা (Bangladesh / India) - Bilingual STT</option>
            <option value="en-US">English (United States)</option>
            <option value="hi-IN">हिन्दी (India)</option>
          </select>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-foreground block">Auto-Listen / Voice Activation</span>
              <span className="text-xs text-muted-foreground">Automatically start listening when entering voice mode</span>
            </div>
            <button
              type="button"
              onClick={() => onUpdate({ autoVoice: !settings.autoVoice })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.autoVoice ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.autoVoice ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* TTS Voice Selector */}
        <div className="border-t border-border pt-4 space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-emerald-500" />
            Text-to-Speech (TTS) Voice Profile
          </label>
          <p className="text-xs text-muted-foreground">
            Choose the synthetic voice profile used when reading AI responses aloud.
          </p>
          <select
            value={ttsVoice}
            onChange={(e) => onUpdate({ externalModel: e.target.value })}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="default">Default System Voice (Natural Neural)</option>
            <option value="bengali_female">Bengali Neural - Natural Female (Srabani)</option>
            <option value="bengali_male">Bengali Neural - Deep Male (Tanvir)</option>
            <option value="english_us_female">English US - Professional Female (Ava)</option>
            <option value="english_us_male">English US - Authoritative Male (Andrew)</option>
          </select>
        </div>

        {/* Voice Playback Speed */}
        <div className="border-t border-border pt-4 space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-foreground">Speech Playback Speed</label>
            <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">
              {voiceSpeed.toFixed(1)}x
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={voiceSpeed}
            onChange={(e) => onUpdate({ voiceSpeed: parseFloat(e.target.value) })}
            className="w-full accent-primary cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>0.5x (Slow)</span>
            <span>1.0x (Normal)</span>
            <span>2.0x (Fast)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
