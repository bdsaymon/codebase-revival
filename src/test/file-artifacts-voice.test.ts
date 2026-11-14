import { describe, it, expect } from 'vitest';
import {
  extractFileArtifacts,
  inferLanguageFromFilenameOrType,
} from '../smfta/src/utils/fileArtifacts';
import { buildArtifactSrcDoc } from '../smfta/src/components/ClaudeArtifactPanel';

describe('Claude-style File Artifact & Markdown/ZIP Engine', () => {
  it('extracts <smfta_artifact> .md files cleanly with inline placeholder tokens', () => {
    const input = `এখানে আপনার প্রজেক্ট প্ল্যান দেওয়া হলো:\n\n<smfta_artifact filename="roadmap.md" title="প্রজেক্ট রোডম্যাপ" type="markdown">\n# ধাপ ১\n- কাজ শুরু করুন\n- ডেপ্লয় করুন\n</smfta_artifact>\n\nপ্রয়োজনে ডাউনলোড করে নিন।`;
    const res = extractFileArtifacts(input);

    expect(res.artifacts).toHaveLength(1);
    expect(res.artifacts[0].filename).toBe('roadmap.md');
    expect(res.artifacts[0].title).toBe('প্রজেক্ট রোডম্যাপ');
    expect(res.artifacts[0].lang).toBe('markdown');
    expect(res.artifacts[0].content).toContain('# ধাপ ১');
    expect(res.processedText).toContain('[[SMFTA_ARTIFACT_0]]');
    expect(res.processedText).not.toContain('<smfta_artifact');
  });

  it('extracts multi-file bundles from <smfta_artifact> and named code fences', () => {
    const input = `<smfta_artifact filename="index.html" title="Landing Page" type="html">\n<h1>Hello</h1>\n</smfta_artifact>\n\n\`\`\`css styles.css\nbody { color: #222; }\n\`\`\``;
    const res = extractFileArtifacts(input);

    expect(res.artifacts).toHaveLength(2);
    expect(res.artifacts[0].filename).toBe('index.html');
    expect(res.artifacts[0].lang).toBe('html');
    expect(res.artifacts[1].filename).toBe('styles.css');
    expect(res.artifacts[1].lang).toBe('css');
  });

  it('handles active streaming unclosed <smfta_artifact> tags gracefully', () => {
    const partial = `তৈরি হচ্ছে:\n<smfta_artifact filename="spec.md" title="স্পেসিফিকেশন" type="markdown">\n# শিরোনাম\nচলমান টেক্সট...`;
    const res = extractFileArtifacts(partial, { isStreaming: true });

    expect(res.artifacts).toHaveLength(1);
    expect(res.artifacts[0].isStreaming).toBe(true);
    expect(res.artifacts[0].filename).toBe('spec.md');
    expect(res.artifacts[0].content).toContain('চলমান টেক্সট...');
  });

  it('renders Markdown artifacts into formatted HTML preview instead of raw text', () => {
    const md = `# প্রজেক্ট প্ল্যান\n\n- [x] ভয়েস ওয়েভফর্ম\n- [ ] জিপ ডাউনলোড\n\n| নাম | স্ট্যাটাস |\n| --- | --- |\n| MD | রেডি |`;
    const html = buildArtifactSrcDoc(md, 'markdown');

    expect(html).toContain('<h1>প্রজেক্ট প্ল্যান</h1>');
    expect(html).toContain('<input type="checkbox" disabled checked />');
    expect(html).toContain('<th>নাম</th>');
    expect(html).toContain('<th>স্ট্যাটাস</th>');
  });

  it('infers file language accurately from filename extensions', () => {
    expect(inferLanguageFromFilenameOrType('plan.md')).toBe('markdown');
    expect(inferLanguageFromFilenameOrType('app.html')).toBe('html');
    expect(inferLanguageFromFilenameOrType('data.json')).toBe('json');
    expect(inferLanguageFromFilenameOrType('script.py')).toBe('python');
  });
});
