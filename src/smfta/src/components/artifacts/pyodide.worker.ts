// Web Worker running real Python via Pyodide (v0.27.4)

interface RunRequest {
  type: 'run';
  runId: string;
  code: string;
}

type PyodideInstance = {
  runPythonAsync: (code: string) => Promise<unknown>;
  setStdout: (opts: { batched: (msg: string) => void }) => void;
  setStderr: (opts: { batched: (msg: string) => void }) => void;
};

let pyodidePromise: Promise<PyodideInstance> | null = null;

async function ensurePyodide(): Promise<PyodideInstance> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const mod = (await import(
        /* @vite-ignore */
        // @ts-expect-error Remote Pyodide ESM URL resolved in Web Worker at runtime
        'https://cdn.jsdelivr.net/pyodide/v0.27.4/full/pyodide.mjs'
      )) as {
        loadPyodide: (cfg: { indexURL: string }) => Promise<PyodideInstance>;
      };
      return mod.loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.4/full/',
      });
    })();
  }
  return pyodidePromise;
}

self.addEventListener('message', async (event: MessageEvent<RunRequest>) => {
  const payload = event.data;
  if (!payload || payload.type !== 'run') return;
  const { runId, code } = payload;

  try {
    self.postMessage({ type: 'status', runId, message: 'Loading Pyodide runtime…' });
    const pyodide = await ensurePyodide();

    pyodide.setStdout({
      batched: (text: string) => {
        self.postMessage({ type: 'stdout', runId, text });
      },
    });
    pyodide.setStderr({
      batched: (text: string) => {
        self.postMessage({ type: 'stderr', runId, text });
      },
    });

    self.postMessage({ type: 'status', runId, message: 'Executing Python…' });
    const result = await pyodide.runPythonAsync(code);
    if (result !== undefined && result !== null) {
      self.postMessage({ type: 'result', runId, text: String(result) });
    }
    self.postMessage({ type: 'done', runId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'error', runId, error: message });
  }
});
