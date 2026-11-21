import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

interface JsonNodeProps {
  name?: string;
  value: unknown;
  depth: number;
  defaultOpenDepth: number;
  keyPrefix: string;
}

const JsonNode: React.FC<JsonNodeProps> = ({
  name,
  value,
  depth,
  defaultOpenDepth,
  keyPrefix,
}) => {
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const [expanded, setExpanded] = useState(depth < defaultOpenDepth);

  if (!isObject) {
    const valColor =
      typeof value === 'string'
        ? 'text-emerald-600 dark:text-emerald-400'
        : typeof value === 'number'
          ? 'text-sky-600 dark:text-sky-400'
          : typeof value === 'boolean'
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-[var(--ink-dim)]';
    return (
      <div
        className="font-mono text-[12.5px] leading-6 py-0.5"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {name !== undefined && (
          <span className="text-[var(--primary)] mr-1.5">"{name}":</span>
        )}
        <span className={valColor}>
          {typeof value === 'string' ? JSON.stringify(value) : String(value)}
        </span>
      </div>
    );
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';

  return (
    <div className="font-mono text-[12.5px] leading-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{ paddingLeft: `${depth * 14}px` }}
        className="inline-flex items-center gap-1 py-0.5 text-left hover:bg-[var(--surface-2)] rounded px-1 -ml-1 cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-[var(--ink-dim)] shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[var(--ink-dim)] shrink-0" />
        )}
        {name !== undefined && (
          <span className="text-[var(--primary)] mr-1">"{name}":</span>
        )}
        <span className="text-[var(--ink)]">{openBracket}</span>
        {!expanded && (
          <span className="text-[var(--ink-dim)] text-[11px] px-1">
            {entries.length} {isArray ? 'items' : 'keys'} {closeBracket}
          </span>
        )}
      </button>
      {expanded && (
        <div>
          {entries.map(([k, v]) => (
            <JsonNode
              key={`${keyPrefix}.${k}`}
              name={isArray ? undefined : k}
              value={v}
              depth={depth + 1}
              defaultOpenDepth={defaultOpenDepth}
              keyPrefix={`${keyPrefix}.${k}`}
            />
          ))}
          <div
            className="text-[var(--ink)]"
            style={{ paddingLeft: `${depth * 14 + 14}px` }}
          >
            {closeBracket}
          </div>
        </div>
      )}
    </div>
  );
};

export const JsonTreePreview: React.FC<{ content: string }> = ({ content }) => {
  const [defaultOpenDepth, setDefaultOpenDepth] = useState(3);
  const [renderVersion, setRenderVersion] = useState(0);
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(content) };
    } catch (err: unknown) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Invalid JSON',
      };
    }
  }, [content]);

  if (!parsed.ok) {
    return (
      <div className="p-4 space-y-2" data-testid="json-tree-error">
        <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-500 text-xs font-mono">
          JSON Parse Error: {parsed.error}
        </div>
        <pre className="p-3 rounded-xl bg-[var(--surface-2)] text-xs font-mono whitespace-pre-wrap text-[var(--ink)]">
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full min-h-0 bg-[var(--surface)]" data-testid="json-tree-preview">
      <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setDefaultOpenDepth(10);
              setRenderVersion((v) => v + 1);
            }}
            className="px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[11px] font-medium text-[var(--ink)] cursor-pointer"
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={() => {
              setDefaultOpenDepth(1);
              setRenderVersion((v) => v + 1);
            }}
            className="px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[11px] font-medium text-[var(--ink)] cursor-pointer"
          >
            Collapse All
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(JSON.stringify(parsed.value, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          className="px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[11px] font-medium text-[var(--ink-dim)] hover:text-[var(--ink)] inline-flex items-center gap-1 cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Format & Copy'}</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        <JsonNode
          key={renderVersion}
          value={parsed.value}
          depth={0}
          defaultOpenDepth={defaultOpenDepth}
          keyPrefix="root"
        />
      </div>
    </div>
  );
};
