import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { interpretSelfCommand, isPureSelfCommand } from './selfCommand';

describe('selfCommand false-positive & explicit-order behavior', () => {
  it('never hijacks normal English or Bengali conversational prompts', () => {
    const normalPrompts = [
      'Say hello in one short sentence.',
      'Give me a brief summary of Japan.',
      'Tell me a dark short story.',
      'Explain how GitHub Actions work.',
      'How do I drive safely in heavy rain?',
      'What color is the sky at sunset?',
      'Write a detailed article on photosynthesis.',
      'বাংলায় একটি ছোট গল্প লেখো',
      'সংক্ষেপে বাংলাদেশের ইতিহাস বলো',
      'একটি index.html কাউন্টার অ্যাপ তৈরি করো',
    ];

    for (const prompt of normalPrompts) {
      const actions = interpretSelfCommand(prompt);
      assert.equal(
        isPureSelfCommand(prompt, actions),
        false,
        `Prompt "${prompt}" must NOT be treated as pure self-command (actions: ${JSON.stringify(actions)})`
      );
      assert.equal(
        actions.length,
        0,
        `Prompt "${prompt}" should not mutate app settings unexpectedly (got: ${JSON.stringify(actions)})`
      );
    }
  });

  it('still executes genuine explicit self-update commands', () => {
    const darkCmd = interpretSelfCommand('থিম ডার্ক করো');
    assert.ok(darkCmd.some((a) => a.patch?.theme === 'dark'));
    assert.equal(isPureSelfCommand('থিম ডার্ক করো', darkCmd), true);

    const styleCmd = interpretSelfCommand('make your answers concise');
    assert.ok(styleCmd.some((a) => a.patch?.style === 'concise'));
    assert.equal(isPureSelfCommand('make your answers concise', styleCmd), true);

    const memCmd = interpretSelfCommand('মনে রাখো আমি ঢাকায় থাকি');
    assert.ok(memCmd.some((a) => a.kind === 'memory' && a.memory?.[0]?.includes('ঢাকা')));
    assert.equal(isPureSelfCommand('মনে রাখো আমি ঢাকায় থাকি', memCmd), true);
  });
});
