import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BUILTIN_PROFILE,
  computeSelectModelTransition,
  normalizeProviderProfile,
  resolveActiveProfile,
} from './providers';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';
import { getV2ServerFallbackModels } from '../../server/v2FirebaseAi';
import { getV2ModelSpec } from './v2UsageLimits';
import {
  normalizeActiveGeminiModel,
  buildGeminiModelFallbackChain,
} from '../../server/services/geminiService';
import type { SavedProviderProfile } from '../types';

test('computeSelectModelTransition switches cleanly from a broken custom profile to any V1/V2 built-in model without mutating the custom profile', () => {
  const brokenCustomProfile: SavedProviderProfile = {
    id: 'custom-broken-1',
    name: 'Broken Custom API',
    provider: 'custom',
    externalKeys: 'sk-invalid-custom-key',
    externalModel: 'my-custom-model',
    externalBaseUrl: 'https://invalid.example.com/v1',
    decryptionFailed: true,
    verified: false,
  };
  const savedProfiles: SavedProviderProfile[] = [
    { ...DEFAULT_BUILTIN_PROFILE },
    brokenCustomProfile,
  ];
  const baseSettings = sanitizeSettings({
    ...DEFAULT_SETTINGS,
    activeProfileId: brokenCustomProfile.id,
    provider: 'custom',
    externalKeys: 'sk-invalid-custom-key',
    externalModel: 'my-custom-model',
    externalBaseUrl: 'https://invalid.example.com/v1',
  });

  for (const modelId of [
    'smfta-v5',
    'smfta-v2-pro',
    'smfta-max',
    'smfta-flash',
    'smfta-pro',
    'smfta-ultra',
  ]) {
    const res = computeSelectModelTransition({
      modelId,
      settings: baseSettings,
      savedProfiles,
      activeProfile: brokenCustomProfile,
    });

    assert.equal(res.isBuiltinOrV2, true, `${modelId} must be built-in/V2`);
    assert.equal(res.nextSettingsPatch.activeProfileId, DEFAULT_BUILTIN_PROFILE.id);
    assert.equal(res.nextSettingsPatch.provider, 'smfta_cloud');
    assert.equal(res.nextSettingsPatch.externalKeys, '');
    assert.equal(res.nextSettingsPatch.externalBaseUrl, '');
    assert.equal(res.nextSettingsPatch.externalModel, modelId);

    const untouchedCustom = res.nextProfiles.find((p) => p.id === brokenCustomProfile.id);
    assert.ok(untouchedCustom, 'custom profile must still exist');
    assert.equal(untouchedCustom.provider, 'custom');
    assert.equal(untouchedCustom.externalModel, 'my-custom-model');
    assert.equal(untouchedCustom.externalKeys, 'sk-invalid-custom-key');

    const nextSettings = sanitizeSettings({
      ...baseSettings,
      ...res.nextSettingsPatch,
    });
    const resolvedAfterSwitch = resolveActiveProfile(nextSettings, res.nextProfiles);
    assert.equal(resolvedAfterSwitch.id, DEFAULT_BUILTIN_PROFILE.id);
    assert.equal(resolvedAfterSwitch.provider, 'smfta_cloud');
    assert.equal(resolvedAfterSwitch.externalModel, modelId);
    assert.equal(resolvedAfterSwitch.externalKeys, '');
  }
});

test('sanitizeSettings and normalizeProviderProfile auto-heal stalled keyless gemini-4-hydrogen and gemini-3.8-flash models', () => {
  const healedHydrogen = sanitizeSettings({
    provider: 'gemini_custom',
    externalKeys: '',
    externalModel: 'gemini-4-hydrogen',
  });
  assert.equal(healedHydrogen.externalModel, 'gemini-3-flash-preview');

  const healed38 = sanitizeSettings({
    provider: 'smfta_cloud',
    externalKeys: '',
    externalModel: 'gemini-3.8-flash',
  });
  assert.equal(healed38.externalModel, 'gemini-3-flash-preview');

  const userWithCustomKey = sanitizeSettings({
    provider: 'gemini_custom',
    externalKeys: 'AIzaSyUserSuppliedKey12345678901234567890',
    externalModel: 'gemini-4-hydrogen',
  });
  assert.equal(userWithCustomKey.externalModel, 'gemini-4-hydrogen');

  const healedProfile = normalizeProviderProfile({
    ...DEFAULT_BUILTIN_PROFILE,
    externalModel: 'gemini-4-hydrogen',
    externalKeys: '',
  });
  assert.equal(healedProfile.externalModel, 'gemini-3-flash-preview');
});

test('all 6 UI models route first to responsive verified Gemini models, never stalled gemini-3.8-flash or gemini-4-hydrogen', () => {
  const stalledPrimary = new Set(['gemini-3.8-flash', 'gemini-4-hydrogen']);

  for (const m of [
    'smfta-v5',
    'smfta-v2-pro',
    'smfta-max',
    'smfta-flash',
    'smfta-pro',
    'smfta-ultra',
    '',
  ]) {
    const normalized = normalizeActiveGeminiModel(m);
    assert.equal(
      stalledPrimary.has(normalized),
      false,
      `normalizeActiveGeminiModel(${m}) should not return stalled ${normalized}`
    );
    const chain = buildGeminiModelFallbackChain(m);
    assert.ok(chain.length >= 2);
    assert.equal(
      stalledPrimary.has(chain[0]!),
      false,
      `fallback chain primary for ${m} should not be stalled (${chain[0]})`
    );
  }

  for (const v2 of ['smfta-v5', 'smfta-v2-pro', 'smfta-max'] as const) {
    const spec = getV2ModelSpec(v2);
    assert.equal(stalledPrimary.has(spec.serverGeminiModel), false);
    const chain = getV2ServerFallbackModels(v2);
    assert.ok(chain.length >= 3);
    assert.equal(
      stalledPrimary.has(chain[0]!),
      false,
      `V2 primary for ${v2} must not be stalled (${chain[0]})`
    );
  }
});
