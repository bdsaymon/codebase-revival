import React, { useState } from 'react';
import { Mic, Volume2, Play, Square } from 'lucide-react';
import { AppSettings } from '../../types';
import { bilingualSpeechPlayer } from '../../utils/voiceEngine';
import {
  SettingSelect,
  SettingToggle,
  SettingsCard,
} from '../SettingsControls';

interface VoiceAudioSectionProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
  notify?: (msg: string) => void;
}

const SPEED_PRESETS = [0.8, 1.0, 1.2, 1.5] as const;

export const VoiceAudioSection: React.FC<VoiceAudioSectionProps> = ({
  settings,
  onUpdate,
  notify,
}) => {
  const [testingSpeech, setTestingSpeech] = useState(false);

  const vlang = settings.vlang || 'bn-BD';
  const voiceSpeed =
    typeof settings.voiceSpeed === 'number' ? settings.voiceSpeed : 1.0;
  const ttsVoice = settings.ttsVoice || 'default';

  const handleTestVoice = () => {
    if (testingSpeech) {
      bilingualSpeechPlayer.stop();
      setTestingSpeech(false);
      return;
    }
    setTestingSpeech(true);
    const sample =
      vlang === 'en-US'
        ? 'Hello! SMFTA voice system is active and ready to assist you.'
        : 'হ্যালো! আপনার ভয়েস এবং লাইভ ক্যাপশন সিস্টেম সঠিকভাবে কাজ করছে।';
    bilingualSpeechPlayer.speak({
      text: sample,
      msgId: 'settings-voice-test',
      preferredLang: vlang === 'en-US' ? 'en-US' : 'bn-BD',
      voiceProfile: ttsVoice,
      rate: voiceSpeed,
      onDone: () => setTestingSpeech(false),
    });
    notify?.('ভয়েস টেস্ট চালু হয়েছে');
  };

  return (
    <div className="space-y-3" data-testid="settings-section-voice">
      <SettingsCard
        title="Speech Recognition & Live Input (STT)"
        rightSlot={
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--primary)]">
            <Mic className="w-3.5 h-3.5" />
            Hybrid STT + Cloud
          </span>
        }
      >
        <SettingSelect
          label="Voice Recognition Language"
          testId="voice-stt-lang-select"
          value={vlang}
          options={[
            { value: 'bn-BD', label: 'বাংলা (Bangladesh / Bilingual STT)' },
            { value: 'en-US', label: 'English (United States)' },
            { value: 'hi-IN', label: 'हिन्दी (India)' },
          ]}
          onChange={(val) =>
            onUpdate({ vlang: val as AppSettings['vlang'] })
          }
        />

        <SettingToggle
          label="Live Voice Captions Above Waveform"
          description="কথা বলার সাথে সাথে ওয়েভফর্মের উপরে রিয়েল-টাইম লেখা দেখাবে"
          checked={settings.voiceLiveCaptions !== false}
          testId="voice-live-captions-toggle"
          onChange={(v) => onUpdate({ voiceLiveCaptions: v })}
        />

        <SettingToggle
          label="Auto-Listen in Voice Mode"
          description="ভয়েস মোডে ঢোকার সাথে সাথে স্বয়ংক্রিয়ভাবে শোনা শুরু করবে"
          checked={Boolean(settings.autoVoice)}
          testId="voice-auto-listen-toggle"
          onChange={(v) => onUpdate({ autoVoice: v })}
        />
      </SettingsCard>

      <SettingsCard
        title="Text-to-Speech Playback (TTS)"
        rightSlot={
          <button
            type="button"
            data-testid="voice-test-play-btn"
            onClick={handleTestVoice}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-medium border border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          >
            {testingSpeech ? (
              <>
                <Square className="w-3 h-3 fill-current" />
                Stop Test
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                Test Voice
              </>
            )}
          </button>
        }
      >
        <SettingSelect
          label="TTS Voice Profile"
          testId="voice-tts-profile-select"
          value={ttsVoice}
          options={[
            { value: 'default', label: 'Default Neural Voice (Auto)' },
            { value: 'bengali_female', label: 'বাংলা Natural Female (Srabani)' },
            { value: 'bengali_male', label: 'বাংলা Deep Male (Tanvir)' },
            { value: 'english_us_female', label: 'English US Female (Ava)' },
            { value: 'english_us_male', label: 'English US Male (Andrew)' },
          ]}
          onChange={(val) =>
            onUpdate({ ttsVoice: val as AppSettings['ttsVoice'] })
          }
        />

        <div className="py-2.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[var(--primary)] shrink-0" />
              <span className="text-[13.5px] font-medium text-[var(--ink)]">
                Playback Speed
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {SPEED_PRESETS.map((spd) => (
                <button
                  key={spd}
                  type="button"
                  data-testid={`voice-speed-${spd}`}
                  onClick={() => onUpdate({ voiceSpeed: spd })}
                  className={`px-2 py-0.5 rounded-md text-[11.5px] font-mono border transition-colors cursor-pointer ${
                    Math.abs(voiceSpeed - spd) < 0.05
                      ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                      : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
                  }`}
                >
                  {spd.toFixed(1)}x
                </button>
              ))}
            </div>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            aria-label="Speech Playback Speed"
            data-testid="voice-speed-slider"
            value={voiceSpeed}
            onChange={(e) =>
              onUpdate({ voiceSpeed: parseFloat(e.target.value) })
            }
            className="w-full accent-[var(--primary)] cursor-pointer"
          />
        </div>
      </SettingsCard>
    </div>
  );
};
