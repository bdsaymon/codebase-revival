import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LONG_PASTE_CHAR_THRESHOLD,
  LONG_PASTE_LINE_THRESHOLD,
  USER_PROMPT_COLLAPSE_CHAR_LIMIT,
  USER_PROMPT_COLLAPSE_LINE_LIMIT,
  buildAttachmentCardMeta,
  evaluateLongPasteToFile,
  extractAttachedFilesFromMessage,
  shouldCollapseUserPrompt,
} from './chatDisplay';

test('evaluateLongPasteToFile respects 1500-char and 25-line thresholds and clipboard files guard', () => {
  assert.equal(LONG_PASTE_CHAR_THRESHOLD, 1500);
  assert.equal(LONG_PASTE_LINE_THRESHOLD, 25);

  const belowChar = evaluateLongPasteToFile('a'.repeat(1499), false, 1);
  assert.equal(belowChar.convertToFile, false);
  assert.equal(belowChar.charCount, 1499);
  assert.equal(belowChar.filename, 'Pasted text 1.txt');

  const exactChar = evaluateLongPasteToFile('a'.repeat(1500), false, 1);
  assert.equal(exactChar.convertToFile, false);

  const overChar = evaluateLongPasteToFile('a'.repeat(1501), false, 2);
  assert.equal(overChar.convertToFile, true);
  assert.equal(overChar.charCount, 1501);
  assert.equal(overChar.filename, 'Pasted text 2.txt');

  const lines25 = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join('\n');
  const exactLines = evaluateLongPasteToFile(lines25, false, 1);
  assert.equal(exactLines.convertToFile, false);
  assert.equal(exactLines.lineCount, 25);

  const lines26 = Array.from({ length: 26 }, (_, i) => `line ${i + 1}`).join('\n');
  const overLines = evaluateLongPasteToFile(lines26, false, 3);
  assert.equal(overLines.convertToFile, true);
  assert.equal(overLines.lineCount, 26);
  assert.equal(overLines.filename, 'Pasted text 3.txt');

  // If clipboard already contains files, do not convert text
  const withFiles = evaluateLongPasteToFile('a'.repeat(3000), true, 1);
  assert.equal(withFiles.convertToFile, false);
});

test('shouldCollapseUserPrompt uses 800-char / 12-line thresholds and never collapses when attachments exist', () => {
  assert.equal(USER_PROMPT_COLLAPSE_CHAR_LIMIT, 800);
  assert.equal(USER_PROMPT_COLLAPSE_LINE_LIMIT, 12);

  assert.equal(shouldCollapseUserPrompt('a'.repeat(800)), false);
  assert.equal(shouldCollapseUserPrompt('a'.repeat(801)), true);

  const twelveLines = Array.from({ length: 12 }, (_, i) => `L${i}`).join('\n');
  const thirteenLines = Array.from({ length: 13 }, (_, i) => `L${i}`).join('\n');
  assert.equal(shouldCollapseUserPrompt(twelveLines), false);
  assert.equal(shouldCollapseUserPrompt(thirteenLines), true);

  // Never collapse a bubble that has an attachment
  assert.equal(shouldCollapseUserPrompt('a'.repeat(2000), true), false);
  assert.equal(shouldCollapseUserPrompt(thirteenLines, true), false);
});

test('buildAttachmentCardMeta and extractAttachedFilesFromMessage produce accurate title, badge, and meta', () => {
  const code = '\n\nexport function solveMatrix(input: number[][]) { // very long first line over forty chars\n  return input;\n}';
  const meta = buildAttachmentCardMeta({
    name: 'Pasted text 1.txt',
    content: code,
  });
  assert.equal(meta.typeBadge, 'TXT');
  assert.equal(meta.title.length, 40);
  assert.equal(meta.title, 'export function solveMatrix(input: numbe');
  assert.equal(meta.lineCount, 5);
  assert.match(meta.metaLabel, /^5 lines · \d+\.\d KB$/);

  const emptyMeta = buildAttachmentCardMeta({
    name: 'notes.pdf',
    content: '   \n  ',
  });
  assert.equal(emptyMeta.typeBadge, 'PDF');
  assert.equal(emptyMeta.title, 'Pasted text');

  const rawMsg = 'Here is my file\n\n⟦FILE:Pasted text 1.txt⟧\nLine 1\nLine 2\nLine 3\n⟦/FILE⟧';
  const extracted = extractAttachedFilesFromMessage(rawMsg);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].name, 'Pasted text 1.txt');
  assert.equal(extracted[0].content, 'Line 1\nLine 2\nLine 3');
  assert.equal(extracted[0].lineCount, 3);
  assert.equal(extracted[0].title, 'Line 1');
});
