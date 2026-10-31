/**
 * Minimal Express-compatible surface used by the original API routers, so the
 * route code runs unchanged on the edge runtime. Only what the routers use is
 * implemented: Router#get/post/use with `:param` paths, req.body/query/params/
 * headers/get(), and res.status/json/send/setHeader/write/end/on('close').
 */

export type NextFunction = (err?: unknown) => void;

export interface Request {
  method: string;
  url: string;
  originalUrl: string;
  path: string;
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  params: Record<string, string>;
  body: any;
  ip: string;
  socket: { remoteAddress?: string; encrypted?: boolean };
  requestId?: string;
  userId?: string;
  signal: AbortSignal;
  get(name: string): string | undefined;
  header(name: string): string | undefined;
  [key: string]: any;
}

export interface Response {
  statusCode: number;
  headersSent: boolean;
  writableEnded: boolean;
  status(code: number): Response;
  json(body: unknown): Response;
  send(body?: unknown): Response;
  setHeader(name: string, value: string | number | string[]): Response;
  getHeader(name: string): string | undefined;
  removeHeader(name: string): void;
  set(name: string, value: string): Response;
  type(t: string): Response;
  redirect(statusOrUrl: number | string, url?: string): void;
  write(chunk: string | Uint8Array): boolean;
  end(chunk?: string | Uint8Array): void;
  flushHeaders(): void;
  on(event: 'close' | 'finish', cb: () => void): Response;
  once(event: 'close' | 'finish', cb: () => void): Response;
  [key: string]: any;
}

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
type ErrorHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => unknown;

interface Layer {
  method: string | null; // null = use()
  pattern: RegExp | null;
  keys: string[];
  prefix: string | null;
  handlers: Handler[];
}

function compilePath(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const clean = path.replace(/\/+$/, '') || '/';
  const src = clean
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      if (seg.startsWith('*')) {
        keys.push(seg.slice(1) || 'splat');
        return '(.*)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { pattern: new RegExp(`^${src}/?$`), keys };
}

export class RouterImpl {
  private layers: Layer[] = [];

  private add(method: string, path: string, handlers: Handler[]) {
    const { pattern, keys } = compilePath(path);
    this.layers.push({ method, pattern, keys, prefix: null, handlers });
    return this;
  }

  get(path: string, ...handlers: Handler[]) {
    return this.add('GET', path, handlers);
  }
  post(path: string, ...handlers: Handler[]) {
    return this.add('POST', path, handlers);
  }
  put(path: string, ...handlers: Handler[]) {
    return this.add('PUT', path, handlers);
  }
  patch(path: string, ...handlers: Handler[]) {
    return this.add('PATCH', path, handlers);
  }
  delete(path: string, ...handlers: Handler[]) {
    return this.add('DELETE', path, handlers);
  }
  all(path: string, ...handlers: Handler[]) {
    return this.add('*', path, handlers);
  }

  use(pathOrHandler: string | Handler | RouterImpl, ...rest: Array<Handler | RouterImpl>) {
    let prefix = '';
    let list: Array<Handler | RouterImpl>;
    if (typeof pathOrHandler === 'string') {
      prefix = pathOrHandler.replace(/\/+$/, '');
      list = rest;
    } else {
      list = [pathOrHandler, ...rest];
    }
    const handlers = list.map((h) =>
      h instanceof RouterImpl ? (h.handle.bind(h) as Handler) : h
    );
    this.layers.push({ method: null, pattern: null, keys: [], prefix, handlers });
    return this;
  }

  /** Runs this router's layers; calls `out` when nothing ended the response. */
  async handle(req: Request, res: Response, out: NextFunction): Promise<void> {
    const basePath = req.path;
    let idx = 0;
    const layers = this.layers;

    const runHandlers = async (handlers: Handler[], err?: unknown): Promise<unknown> => {
      for (let i = 0; i < handlers.length; i++) {
        const h = handlers[i]!;
        let calledNext = false;
        let nextErr: unknown;
        const isErrorHandler = h.length === 4;
        if (err !== undefined && !isErrorHandler) continue;
        if (err === undefined && isErrorHandler) continue;
        const next: NextFunction = (e) => {
          calledNext = true;
          nextErr = e;
        };
        try {
          if (isErrorHandler) await (h as unknown as ErrorHandler)(err, req, res, next);
          else await h(req, res, next);
        } catch (e) {
          return { error: e };
        }
        if (!calledNext) return { stopped: true };
        if (nextErr !== undefined && nextErr !== 'route') {
          err = nextErr;
        }
      }
      return err !== undefined ? { error: err } : { stopped: false };
    };

    let pendingErr: unknown;
    while (idx < layers.length) {
      const layer = layers[idx++]!;
      if (layer.method === null) {
        const prefix = layer.prefix || '';
        if (prefix && !(basePath === prefix || basePath.startsWith(prefix + '/'))) continue;
        const savedPath = req.path;
        req.path = prefix ? basePath.slice(prefix.length) || '/' : basePath;
        const result = (await runHandlers(layer.handlers, pendingErr)) as {
          stopped?: boolean;
          error?: unknown;
        };
        req.path = savedPath;
        if (result.error !== undefined) {
          pendingErr = result.error;
          continue;
        }
        if (result.stopped) return;
        continue;
      }
      if (pendingErr !== undefined) continue;
      if (layer.method !== '*' && layer.method !== req.method) {
        if (!(layer.method === 'GET' && req.method === 'HEAD')) continue;
      }
      const m = layer.pattern!.exec(basePath);
      if (!m) continue;
      const params: Record<string, string> = {};
      layer.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1] ?? '');
      });
      req.params = params;
      const result = (await runHandlers(layer.handlers)) as {
        stopped?: boolean;
        error?: unknown;
      };
      if (result.error !== undefined) {
        pendingErr = result.error;
        continue;
      }
      if (result.stopped) return;
    }
    out(pendingErr);
  }
}

export function Router(): RouterImpl {
  return new RouterImpl();
}

export type { RouterImpl as RouterType };

const express = { Router };
export default express;
