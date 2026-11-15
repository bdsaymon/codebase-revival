import { describe, expect, it, beforeEach } from 'vitest';
import {
  deriveSimpleUserId,
  hashSimpleSecret,
  saveSimpleEntryCredentials,
  loadSimpleEntryCredentials,
  verifySimpleEntryLogin,
  clearSimpleEntryCredentials,
} from '../simpleEntryAuth';
import {
  buildArtifactSrcDoc,
  looksLikeReactOrJsxCode,
  normalizePreviewLang,
  transpileReactArtifactCode,
} from '../../components/ClaudeArtifactPanel';
import { buildXrahatPrompt } from '../../../server/providers';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../settings';

describe('Turn 10 Upgrades — Simple Entry Auth, Live Preview Engine & Cross-Model Memory', () => {
  beforeEach(() => {
    clearSimpleEntryCredentials();
  });

  it('derives a deterministic local userId and verifies Name + Password without registration', () => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    const uid1 = deriveSimpleUserId('রাহাত আহমেদ');
    const uid2 = deriveSimpleUserId('রাহাত আহমেদ');
    expect(uid1).toBe(uid2);
    expect(uid1.startsWith('local_')).toBe(true);

    const saved = saveSimpleEntryCredentials('রাহাত আহমেদ', 'secret123', mockStorage);
    expect(saved.name).toBe('রাহাত আহমেদ');
    expect(saved.passwordHash).toBe(hashSimpleSecret('secret123'));

    const loaded = loadSimpleEntryCredentials(mockStorage);
    expect(loaded?.userId).toBe(saved.userId);

    const wrong = verifySimpleEntryLogin(saved, 'রাহাত আহমেদ', 'wrongpass');
    expect(wrong.ok).toBe(false);

    const right = verifySimpleEntryLogin(saved, 'রাহাত আহমেদ', 'secret123');
    expect(right.ok).toBe(true);
    expect(right.credentials?.name).toBe('রাহাত আহমেদ');
  });

  it('merges sibling HTML + CSS + JS bundle files into a single live preview srcDoc', () => {
    const srcDoc = buildArtifactSrcDoc(
      '<div id="card">Hello Live</div>',
      'html',
      [
        {
          id: '1',
          filename: 'index.html',
          lang: 'html',
          title: 'HTML',
          content: '<div id="card">Hello Live</div>',
          isStreaming: false,
        },
        {
          id: '2',
          filename: 'styles.css',
          lang: 'css',
          title: 'CSS',
          content: '#card { color: rgb(16, 185, 129); font-weight: 700; }',
          isStreaming: false,
        },
        {
          id: '3',
          filename: 'script.js',
          lang: 'javascript',
          title: 'JS',
          content: 'document.getElementById("card").dataset.ready = "true";',
          isStreaming: false,
        },
      ]
    );

    expect(srcDoc.toLowerCase()).toContain('<!doctype html>');
    expect(srcDoc).toContain('#card { color: rgb(16, 185, 129); font-weight: 700; }');
    expect(srcDoc).toContain('document.getElementById("card").dataset.ready = "true";');
  });

  it('detects and transpiles React/JSX/TSX components into an executable zero-CDN live preview', () => {
    const tsxCode = `
import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';

export default function CounterCard() {
  const [count, setCount] = useState(5);
  return (
    <div className="p-6 rounded-xl shadow">
      <h1>Count: {count}</h1>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}
`;
    expect(looksLikeReactOrJsxCode(tsxCode, 'tsx')).toBe(true);
    expect(normalizePreviewLang('tsx')).toBe('tsx');

    const transpiled = transpileReactArtifactCode(tsxCode);
    expect(transpiled.componentName).toBe('CounterCard');
    expect(transpiled.executableJs).toContain('function CounterCard()');
    expect(transpiled.executableJs).toContain('window.__SMFTA_ICONS__');

    const srcDoc = buildArtifactSrcDoc(tsxCode, 'tsx');
    expect(srcDoc).toContain('id="root"');
    expect(srcDoc).toContain('CounterCard');
    expect(srcDoc).toContain('compileSimpleJsx');
  });

  it('retains prior Bengali conversation turns in buildXrahatPrompt across mid-thread model switches', () => {
    const longSystemHeader =
      'SMFTA AI Pro v22 · configured tier: SMFTA-3 Ultra.\nReply only in clear, natural Bengali.\n' +
      'PERSISTENT USER MEMORY:\n- User name is তানভীর\n- Loves building React dashboards\n' +
      'LIVE REAL-TIME WEB & BROWSER GROUNDING:\n' +
      'Some long grounding text '.repeat(30);

    const history = [
      { role: 'user', content: 'আমার প্রজেক্টের নাম আলফা ড্যাশবোর্ড এবং এতে ৩টি চার্ট থাকবে।' },
      { role: 'assistant', content: 'দারুণ! আলফা ড্যাশবোর্ডে ৩টি চার্ট যোগ করার পরিকল্পনাটি মনে রাখলাম।' },
      { role: 'user', content: 'এখন বলো আমার প্রজেক্টের নাম কী ছিল এবং কয়টি চার্ট থাকবে?' },
    ];

    const prompt = buildXrahatPrompt(longSystemHeader, history, 1800);
    expect(prompt).toContain('আলফা ড্যাশবোর্ড');
    expect(prompt).toContain('৩টি চার্ট');
    expect(prompt).toContain('User: এখন বলো আমার প্রজেক্টের নাম কী ছিল এবং কয়টি চার্ট থাকবে?');
  });

  it('defaults showHomeStarters to false and enables autoOpenLivePreview & crossModelMemoryCarryover', () => {
    expect(DEFAULT_SETTINGS.showHomeStarters).toBe(false);
    expect(DEFAULT_SETTINGS.autoOpenLivePreview).toBe(true);
    expect(DEFAULT_SETTINGS.crossModelMemoryCarryover).toBe(true);

    const sanitized = sanitizeSettings({
      autoOpenLivePreview: false,
      crossModelMemoryCarryover: true,
      simpleEntryRequireOnLoad: true,
    });
    expect(sanitized.autoOpenLivePreview).toBe(false);
    expect(sanitized.crossModelMemoryCarryover).toBe(true);
    expect(sanitized.simpleEntryRequireOnLoad).toBe(true);
  });
});
