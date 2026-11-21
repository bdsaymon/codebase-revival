import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Play, Sparkles, Terminal, Trash2 } from 'lucide-react';

export interface PyodideConsoleProps {
  filename: string;
  code: string;
  onFixWithAi?: (payload: { filename: string; code: string; error: string }) => void;
}

interface ConsoleLine {
  kind: 'status' | 'stdout' | 'stderr' | 'result' | 'error';
  text: string;
}

export const PyodideConsole: React.FC<PyodideConsoleProps> = ({
  filename,
  code,
  onFixWithAi,
}) => {
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef<string>('');
  const [running, setRunning] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string>('Ready (Pyodide Web Worker)');
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [lastError, setLastError] = useState<string>('');

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const ensureWorker = (): Worker => {
    if (!workerRef.current) {
      const worker = new Worker(
        new URL('./pyodide.worker.ts', import.meta.url),
        { type: 'module' }
      );
      worker.addEventListener('message', (ev: MessageEvent) => {
        const msg = ev.data as {
          type: string;
          runId: string;
          text?: string;
          message?: string;
          error?: string;
        };
        if (!msg || msg.runId !== runIdRef.current) return;
        if (msg.type === 'status' && msg.message) {
          setStatusLabel(msg.message);
        } else if (msg.type === 'stdout' && msg.text) {
          setLines((prev) => [...prev, { kind: 'stdout', text: msg.text! }]);
        } else if (msg.type === 'stderr' && msg.text) {
          setLines((prev) => [...prev, { kind: 'stderr', text: msg.text! }]);
        } else if (msg.type === 'result' && msg.text) {
          setLines((prev) => [...prev, { kind: 'result', text: `=> ${msg.text!}` }]);
        } else if (msg.type === 'error') {
          const errStr = msg.error || 'Python execution error';
          setLastError(errStr);
          setLines((prev) => [...prev, { kind: 'error', text: errStr }]);
          setStatusLabel('Execution failed');
          setRunning(false);
        } else if (msg.type === 'done') {
          setStatusLabel('Completed');
          setRunning(false);
        }
      });
      workerRef.current = worker;
    }
    return workerRef.current;
  };

  const handleRun = () => {
    const runId = `py-${Date.now()}`;
    runIdRef.current = runId;
    setRunning(true);
    setLastError('');
    setLines([{ kind: 'status', text: `▶ Running ${filename}…` }]);
    const worker = ensureWorker();
    worker.postMessage({ type: 'run', runId, code });
  };

  return (
    <div
      className="flex flex-col w-full h-full min-h-0 bg-[#0f1115] text-slate-100"
      data-testid="pyodide-console"
    >
      <div className="px-3 py-2 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 bg-[#161920]">
        <div className="flex items-center gap-2 text-xs">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold">Python Sandbox (Pyodide Worker)</span>
          <span className="text-[11px] text-slate-400">{statusLabel}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {lastError && onFixWithAi && (
            <button
              type="button"
              data-testid="pyodide-fix-ai-btn"
              onClick={() => onFixWithAi({ filename, code, error: lastError })}
              className="px-2.5 py-1 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Fix with AI
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setLines([]);
              setLastError('');
            }}
            className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 text-xs inline-flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
          <button
            type="button"
            data-testid="pyodide-run-btn"
            disabled={running}
            onClick={handleRun}
            className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{running ? 'Running…' : 'Run Python'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3.5 font-mono text-[12.5px] leading-relaxed space-y-1">
        {lines.length === 0 ? (
          <div className="text-slate-400 text-xs">
            Click <strong className="text-slate-200">Run Python</strong> to execute{' '}
            <code>{filename}</code> inside a sandboxed Web Worker.
          </div>
        ) : (
          lines.map((line, i) => (
            <pre
              key={i}
              className={`m-0 whitespace-pre-wrap break-words ${
                line.kind === 'error'
                  ? 'text-rose-400 bg-rose-950/40 px-2 py-1 rounded border border-rose-500/30'
                  : line.kind === 'stderr'
                    ? 'text-amber-300'
                    : line.kind === 'result'
                      ? 'text-emerald-300'
                      : line.kind === 'status'
                        ? 'text-slate-400 text-[11px]'
                        : 'text-slate-100'
              }`}
            >
              {line.text}
            </pre>
          ))
        )}
      </div>
    </div>
  );
};
