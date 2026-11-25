/**
 * Edge adapter for the original Express app: turns a Web `Request` into the
 * Express-like req/res pair, runs the same middleware chain as the source
 * `createBaseApp()` (security headers → request id → identity → rate limit →
 * routers → safe error handler) and streams the result back as a `Response`.
 */
import type { Request as XReq, Response as XRes, RouterImpl } from './express';
import { initSqlite } from './sqlite';

const MAX_BODY_BYTES = 50 * 1024 * 1024;

type AppChain = {
  root: RouterImpl;
  redactSecrets: (s: string) => string;
};

let appPromise: Promise<AppChain> | null = null;

async function buildApp(): Promise<AppChain> {
  await initSqlite();
  const [
    { Router },
    { chatRouter },
    { providerRouter },
    { toolsRouter },
    { healthRouter },
    { oauthRouter },
    { mcpRouter },
    { dbBridgeRouter },
    { v2Router },
    { previewRouter },
    { APP_VERSION },
    { createIpRateLimiter, parseTrustProxyHops },
    { createApiIdentityMiddleware, redactSecrets },
    { createSecurityHeadersMiddleware },
  ] = await Promise.all([
    import('./express'),
    import('../routes/chat'),
    import('../routes/provider'),
    import('../routes/tools'),
    import('../routes/health'),
    import('../routes/oauth'),
    import('../routes/mcp'),
    import('../routes/dbBridge'),
    import('../routes/v2'),
    import('../routes/preview'),
    import('../../src/version'),
    import('../rateLimit'),
    import('../engine/security'),
    import('../engine/securityHeaders'),
  ]);
  void parseTrustProxyHops;

  const root = Router();
  root.use(createSecurityHeadersMiddleware() as never);
  root.use((req: XReq, res: XRes, next) => {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && /^[\w.-]{8,128}$/.test(incoming.trim())
        ? incoming.trim()
        : `req_${crypto.randomUUID()}`;
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Powered-By', `SMFTA-Pro-Engine/${APP_VERSION}`);
    next();
  });
  root.use('/api', createApiIdentityMiddleware() as never);
  root.use(
    '/api',
    createIpRateLimiter({ windowMs: 60_000, maxRequests: 240, maxBuckets: 20_000 }) as never
  );
  root.use('/api', chatRouter as never);
  root.use('/api', providerRouter as never);
  root.use('/api', toolsRouter as never);
  root.use('/api', healthRouter as never);
  root.use('/api', mcpRouter as never);
  root.use('/api', dbBridgeRouter as never);
  root.use('/api', v2Router as never);
  root.use(previewRouter as never);
  root.use(oauthRouter as never);
  return { root, redactSecrets };
}

function getApp(): Promise<AppChain> {
  if (!appPromise) {
    appPromise = buildApp().catch((e) => {
      appPromise = null;
      throw e;
    });
  }
  return appPromise;
}

function lowerHeaders(h: Headers): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  h.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

async function readBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) {
    const e = new Error('request entity too large') as Error & { type: string };
    e.type = 'entity.too.large';
    throw e;
  }
  const type = request.headers.get('content-type') || '';
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    const e = new Error('request entity too large') as Error & { type: string };
    e.type = 'entity.too.large';
    throw e;
  }
  if (!text) return {};
  if (type.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      const e = new Error('Invalid JSON body') as Error & { status: number };
      e.status = 400;
      throw e;
    }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  return text;
}

function isInternalHost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(host);
}

export function resolvePublicOrigin(
  url: URL,
  headers: Record<string, string | undefined>
): URL {
  const candidates: string[] = [];
  const fwdHost = headers['x-forwarded-host']?.split(',')[0]?.trim();
  if (fwdHost) {
    const proto = headers['x-forwarded-proto']?.split(',')[0]?.trim() || 'https';
    candidates.push(`${proto}://${fwdHost}`);
  }
  if (headers['origin']) candidates.push(headers['origin']);
  if (headers['referer']) candidates.push(headers['referer']);
  for (const c of candidates) {
    try {
      const u = new URL(c);
      if (!isInternalHost(u.host)) return new URL(u.origin);
    } catch {
      /* ignore malformed */
    }
  }
  return new URL(url.origin);
}

export async function dispatchToLegacyApp(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers = lowerHeaders(request.headers);
  // Behind the hosting proxy the request URL can be an internal address
  // (e.g. localhost). Recover the public origin so OAuth return links and
  // preview URLs point at the real site, never at localhost.
  const publicOrigin = resolvePublicOrigin(url, headers);
  headers['host'] = publicOrigin.host;
  headers['x-forwarded-proto'] = publicOrigin.protocol.replace(':', '');
  const ip =
    headers['cf-connecting-ip'] ||
    (headers['x-forwarded-for'] || '').split(',')[0]?.trim() ||
    '127.0.0.1';

  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const closeListeners: Array<() => void> = [];
  const resHeaders = new Headers();
  const originHeader = headers['origin'];
  resHeaders.set('Access-Control-Allow-Origin', originHeader || '*');
  resHeaders.set('Vary', 'Origin');
  resHeaders.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  resHeaders.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Gemini-Key, X-Api-Key, X-Custom-Provider, X-Admin-Token, X-Request-Id, X-SMFTA-Client-Id'
  );
  resHeaders.set('Access-Control-Max-Age', '86400');

  if (request.method.toUpperCase() === 'OPTIONS') {
    return new Response(null, { status: 204, headers: resHeaders });
  }

  let statusCode = 200;
  let headersSent = false;
  let ended = false;
  let resolveResponse!: (r: Response) => void;
  const responsePromise = new Promise<Response>((r) => (resolveResponse = r));

  const flush = () => {
    if (headersSent) return;
    headersSent = true;
    resolveResponse(
      new Response(request.method === 'HEAD' ? null : stream.readable, {
        status: statusCode,
        headers: resHeaders,
      })
    );
  };

  const fireClose = () => {
    const list = closeListeners.splice(0);
    for (const cb of list) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  };
  request.signal?.addEventListener?.('abort', () => {
    fireClose();
  });

  const req = {
    method: request.method.toUpperCase(),
    url: url.pathname + url.search,
    originalUrl: url.pathname + url.search,
    path: url.pathname,
    headers,
    query: Object.fromEntries(url.searchParams),
    params: {},
    body: {},
    ip,
    socket: { remoteAddress: ip, encrypted: publicOrigin.protocol === 'https:' },
    signal: request.signal,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
    header(name: string) {
      return headers[name.toLowerCase()];
    },
    on(event: string, cb: () => void) {
      if (event === 'close' || event === 'aborted') closeListeners.push(cb);
      return req;
    },
  } as unknown as XReq;

  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(v: number) {
      statusCode = v;
    },
    get headersSent() {
      return headersSent;
    },
    get writableEnded() {
      return ended;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    setHeader(name: string, value: string | number | string[]) {
      if (headersSent) return res;
      if (Array.isArray(value)) {
        resHeaders.delete(name);
        value.forEach((v) => resHeaders.append(name, String(v)));
      } else resHeaders.set(name, String(value));
      return res;
    },
    set(name: string, value: string) {
      return res.setHeader(name, value);
    },
    getHeader(name: string) {
      return resHeaders.get(name) ?? undefined;
    },
    removeHeader(name: string) {
      resHeaders.delete(name);
    },
    type(t: string) {
      resHeaders.set('Content-Type', t.includes('/') ? t : `text/${t}`);
      return res;
    },
    json(body: unknown) {
      if (!resHeaders.has('Content-Type'))
        resHeaders.set('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
      return res;
    },
    send(body?: unknown) {
      if (body !== undefined && body !== null && typeof body === 'object' && !(body instanceof Uint8Array)) {
        return res.json(body);
      }
      if (!resHeaders.has('Content-Type') && typeof body === 'string')
        resHeaders.set('Content-Type', 'text/html; charset=utf-8');
      res.end(body as string | Uint8Array | undefined);
      return res;
    },
    redirect(a: number | string, b?: string) {
      const code = typeof a === 'number' ? a : 302;
      const loc = typeof a === 'string' ? a : b || '/';
      statusCode = code;
      resHeaders.set('Location', loc);
      res.end();
    },
    flushHeaders() {
      flush();
    },
    write(chunk: string | Uint8Array) {
      if (ended) return false;
      flush();
      void writer
        .write(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
        .catch(() => fireClose());
      return true;
    },
    end(chunk?: string | Uint8Array) {
      if (ended) return;
      if (chunk !== undefined && chunk !== null && chunk !== '') res.write(chunk);
      ended = true;
      flush();
      void writer.close().catch(() => undefined);
      fireClose();
    },
    on(event: string, cb: () => void) {
      if (event === 'close' || event === 'finish') closeListeners.push(cb);
      return res;
    },
    once(event: 'close' | 'finish', cb: () => void) {
      return res.on(event, cb);
    },
  } as unknown as XRes;

  const finalHandler = (app: AppChain | null, err: unknown) => {
    if (ended) return;
    if (err === undefined) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'Not found' });
      return;
    }
    console.error('[smfta-api-final]', err instanceof Error ? err.stack || err.message : err);
    const isTooLarge =
      !!err && typeof err === 'object' && (err as { type?: string }).type === 'entity.too.large';
    const explicit = (err as { status?: number } | null)?.status;
    const raw = err instanceof Error ? err.message : 'Internal server error';
    const safeMsg = app ? app.redactSecrets(raw) : 'Internal server error';
    if (!headersSent) {
      res.status(isTooLarge ? 413 : explicit && explicit < 500 ? explicit : 500).json({
        ok: false,
        code: isTooLarge ? 'PAYLOAD_TOO_LARGE' : 'SERVER_ERROR',
        error: safeMsg,
        requestId: req.requestId,
      });
    } else {
      const ct = resHeaders.get('content-type') || '';
      if (ct.includes('text/event-stream')) {
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            ok: false,
            code: 'SERVER_ERROR',
            message: safeMsg,
            text: safeMsg,
            delta: safeMsg,
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
      }
      res.end();
    }
  };

  void (async () => {
    let app: AppChain | null = null;
    try {
      app = await getApp();
      req.body = await readBody(request);
      await app.root.handle(req, res, (err) => finalHandler(app, err));
      // Handler returned without ending: leave stream open only if it is
      // streaming (headers flushed); otherwise close cleanly.
      if (!ended && !headersSent) finalHandler(app, undefined);
    } catch (err) {
      console.error('[smfta-api]', err instanceof Error ? err.message : err);
      finalHandler(app, err);
    }
  })();

  return responsePromise;
}
