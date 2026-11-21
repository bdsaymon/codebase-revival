import React, { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { oneDark } from '@codemirror/theme-one-dark';
import { Check, Copy, Download, History, Save } from 'lucide-react';
import { downloadSingleArtifactFile } from '../../utils/fileArtifacts';

export interface ArtifactCodeEditorProps {
  filename: string;
  lang: string;
  code: string;
  isDarkTheme?: boolean;
  versionCount?: number;
  showHistory?: boolean;
  onToggleHistory?: () => void;
  onSaveCode?: (nextCode: string) => void;
  onToast?: (msg: string) => void;
}

function resolveExtensions(filename: string, lang: string) {
  const lowerName = (filename || '').toLowerCase();
  const lowerLang = (lang || '').toLowerCase();

  if (lowerName.endsWith('.html') || lowerName.endsWith('.htm') || lowerLang === 'html') {
    return [html()];
  }
  if (lowerName.endsWith('.css') || lowerName.endsWith('.scss') || lowerLang === 'css') {
    return [css()];
  }
  if (lowerName.endsWith('.py') || lowerLang === 'py' || lowerLang === 'python') {
    return [python()];
  }
  if (lowerName.endsWith('.json') || lowerLang === 'json') {
    return [json()];
  }
  if (lowerName.endsWith('.md') || lowerLang === 'md' || lowerLang === 'markdown') {
    return [markdown()];
  }
  if (lowerName.endsWith('.svg') || lowerName.endsWith('.xml') || lowerLang === 'svg' || lowerLang === 'xml') {
    return [xml()];
  }
  if (
    lowerName.endsWith('.tsx') ||
    lowerName.endsWith('.jsx') ||
    lowerName.endsWith('.ts') ||
    lowerName.endsWith('.js') ||
    ['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx', 'react'].includes(lowerLang)
  ) {
    const isTs = lowerName.endsWith('.ts') || lowerName.endsWith('.tsx') || lowerLang === 'ts' || lowerLang === 'tsx' || lowerLang === 'typescript';
    const isJsx = lowerName.endsWith('.jsx') || lowerName.endsWith('.tsx') || lowerLang === 'jsx' || lowerLang === 'tsx' || lowerLang === 'react';
    return [javascript({ jsx: isJsx, typescript: isTs })];
  }
  return [];
}

export const ArtifactCodeEditor: React.FC<ArtifactCodeEditorProps> = ({
  filename,
  lang,
  code,
  isDarkTheme = true,
  versionCount = 1,
  showHistory = false,
  onToggleHistory,
  onSaveCode,
  onToast,
}) => {
  const [draft, setDraft] = useState(code);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDraft(code);
  }, [code, filename]);

  const isDirty = draft !== code;
  const extensions = useMemo(() => resolveExtensions(filename, lang), [filename, lang]);

  const handleSave = () => {
    if (!onSaveCode) return;
    onSaveCode(draft);
    onToast?.(`Saved ${filename}`);
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(draft);
    setCopied(true);
    onToast?.('Copied code to clipboard');
    setTimeout(() => setCopied(false), 1600);
  };

  const handleDownload = () => {
    downloadSingleArtifactFile({
      filename,
      lang,
      content: draft,
    });
    onToast?.(`Downloaded ${filename}`);
  };

  return (
    <div className="flex flex-col w-full h-full min-h-0" data-testid="artifact-codemirror-container">
      {/* Editor Toolbar */}
      <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)]/60 flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 text-xs">
          <span className="font-mono font-semibold text-[var(--ink)] truncate">{filename}</span>
          {isDirty && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 text-[10px] font-semibold">
              Unsaved
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {onToggleHistory && (
            <button
              type="button"
              data-testid="artifact-history-toggle-btn"
              onClick={onToggleHistory}
              className={`px-2 py-1 rounded-md text-[11px] font-medium inline-flex items-center gap-1 border cursor-pointer transition-colors ${
                showHistory
                  ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
              }`}
            >
              <History className="w-3 h-3" />
              <span>History ({versionCount})</span>
            </button>
          )}

          {onSaveCode && (
            <button
              type="button"
              data-testid="artifact-save-code-btn"
              onClick={handleSave}
              disabled={!isDirty}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                isDirty
                  ? 'bg-[var(--primary)] text-white hover:opacity-90'
                  : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--ink-dim)] opacity-60 cursor-default'
              }`}
            >
              <Save className="w-3 h-3" />
              <span>Save</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[11px] font-medium text-[var(--ink-dim)] hover:text-[var(--ink)] inline-flex items-center gap-1 cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[11px] font-medium text-[var(--ink-dim)] hover:text-[var(--ink)] inline-flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>Save File</span>
          </button>
        </div>
      </div>

      {/* CodeMirror 6 */}
      <div className="flex-1 min-h-0 overflow-auto text-[13px]">
        <CodeMirror
          value={draft}
          height="100%"
          theme={isDarkTheme ? oneDark : 'light'}
          extensions={extensions}
          onChange={(val) => setDraft(val)}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            foldGutter: true,
            autocompletion: true,
            bracketMatching: true,
          }}
          className="h-full"
        />
      </div>
    </div>
  );
};
