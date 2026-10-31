/**
 * SMFTA Pro — Centralized Security Headers (v18.9.0 hardening)
 *
 * Every response (API + static document) now ships a strict, browser-enforced
 * defense layer. The rules are built as pure functions (`buildContentSecurityPolicy`,
 * `buildSecurityHeaders`) so they are fully unit-testable without an Express
 * request object, then exposed as `createSecurityHeadersMiddleware`.
 *
 * Design constraints baked into the policy:
 *  - Live Preview / Code Workspace render inside `blob:` iframes → frame-src +
 *    worker-src must allow `blob:`.
 *  - Google Identity Services loads a script from accounts.google.com and opens
 *    a login popup → script-src/frame-src allow that origin; COOP uses
 *    `same-origin-allow-popups` instead of `same-origin` so the popup keeps working.
 *  - Google Fonts are loaded from fonts.googleapis.com / fonts.gstatic.com.
 *  - The standalone APK fallback calls keyless HTTPS providers directly from the
 *    WebView, and users can configure any HTTPS custom endpoint → connect-src
 *    allows `https:` broadly (no insecure http: upgrade path).
 *  - Vite's dev server injects inline module preambles and uses HMR, so the
 *    enforcing CSP is emitted only in production. In development the remaining
 *    hardening headers are still sent.
 */

import type { Request, Response, NextFunction } from '../runtime/express';

export interface SecurityHeadersConfig {
  /** Defaults to NODE_ENV === 'production'. CSP is only enforced when true. */
  isProduction?: boolean;
  /** Whether the current request arrived over HTTPS (enables HSTS). */
  isHttps?: boolean;
  /** Emit Content-Security-Policy-Report-Only instead of enforcing it. */
  reportOnly?: boolean;
  /** Extra origins appended to connect-src (custom gateways, tunnels…). */
  extraConnectSrc?: string[];
  /** Extra origins appended to script-src. */
  extraScriptSrc?: string[];
  /** Extra origins appended to frame-src. */
  extraFrameSrc?: string[];
}

export const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  // Never let browsers MIME-sniff a response into an executable type.
  'X-Content-Type-Options': 'nosniff',
  // Clickjacking: this page must never be framed by anyone.
  'X-Frame-Options': 'DENY',
  // Do not leak full URLs (query strings, paths) to third-party origins.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // No Adobe Flash/PDF cross-domain policy files may be loaded for us.
  'X-Permitted-Cross-Domain-Policies': 'none',
  // Do not prefetch DNS for hostnames the user has not explicitly used.
  'X-DNS-Prefetch-Control': 'off',
  // Lock down powerful device APIs. Microphone stays available (voice input);
  // everything else is off by default.
  'Permissions-Policy':
    'accelerometer=(), autoplay=(self), camera=(), display-capture=(), ' +
    'encrypted-media=(self), fullscreen=(self), geolocation=(), gyroscope=(), ' +
    'magnetometer=(), microphone=(self), midi=(), payment=(), usb=()',
  // Keep window references isolated while still allowing the Google login popup.
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
});

export const HSTS_HEADER = 'Strict-Transport-Security';
export const HSTS_VALUE = 'max-age=63072000; includeSubDomains';

const CSP_BASE_DIRECTIVES: Readonly<Record<string, string[]>> = Object.freeze({
  'default-src': ["'self'"],
  'script-src': ["'self'", 'https://accounts.google.com'],
  'style-src': [
    "'self'",
    "'unsafe-inline'",
    'https://fonts.googleapis.com',
  ],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
  // 'self'            → our own /api SSE + assets
  // https:            → APK keyless fallback + user-configured HTTPS providers
  // data:/blob:       → local packaged requests and generated payloads
  'connect-src': ["'self'", 'https:', 'data:', 'blob:'],
  // blob: is required: Live Preview and Code Workspace render blob: iframes.
  'frame-src': ["'self'", 'blob:', 'https://accounts.google.com'],
  'worker-src': ["'self'", 'blob:'],
  'media-src': ["'self'", 'blob:', 'data:'],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
});

/**
 * Only quoted CSP keywords or http(s) origins may enter a directive. This
 * blocks `javascript:`, data exfiltration hosts or broken syntax injected via
 * caller arguments or environment variables.
 */
export function isAllowedCspOrigin(value: string): boolean {
  const origin = String(value || '').trim();
  return (
    origin === "'self'" ||
    origin === 'blob:' ||
    origin === 'data:' ||
    origin === 'https:' ||
    origin === 'http:' ||
    /^https?:\/\/[^\s/'"]+$/i.test(origin)
  );
}

function appendUnique(values: string[], extras: string[] | undefined): string[] {
  if (!extras || extras.length === 0) return values;
  const merged = [...values];
  for (const raw of extras) {
    const origin = String(raw || '').trim();
    if (isAllowedCspOrigin(origin) && !merged.includes(origin)) {
      merged.push(origin);
    }
  }
  return merged;
}

/**
 * Builds the serialized Content-Security-Policy header value. Extra origins are
 * validated loosely (they must be an http(s) origin or a quoted CSP keyword) so
 * a malformed env value can never inject a broken directive.
 */
export function buildContentSecurityPolicy(
  config: SecurityHeadersConfig = {}
): string {
  const directives: Record<string, string[]> = {};
  for (const [name, values] of Object.entries(CSP_BASE_DIRECTIVES)) {
    directives[name] = [...values];
  }
  directives['connect-src'] = appendUnique(
    directives['connect-src'],
    config.extraConnectSrc
  );
  directives['script-src'] = appendUnique(
    directives['script-src'],
    config.extraScriptSrc
  );
  directives['frame-src'] = appendUnique(
    directives['frame-src'],
    config.extraFrameSrc
  );

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

function parseOriginList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => isAllowedCspOrigin(part));
}

/**
 * Full header set for one response. The CSP is included only in production;
 * HSTS only when the request is actually on HTTPS.
 */
export function buildSecurityHeaders(
  config: SecurityHeadersConfig = {}
): Record<string, string> {
  const headers: Record<string, string> = { ...STATIC_SECURITY_HEADERS };

  if (config.isHttps) {
    headers[HSTS_HEADER] = HSTS_VALUE;
  }

  if (config.isProduction) {
    const csp = buildContentSecurityPolicy(config);
    const headerName = config.reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';
    headers[headerName] = csp;
  }

  return headers;
}

function requestIsHttps(req: {
  headers?: Record<string, string | string[] | undefined>;
  socket?: unknown;
}): boolean {
  const socket = req.socket as { encrypted?: boolean } | undefined;
  if (socket?.encrypted) return true;
  const proto = req.headers?.['x-forwarded-proto'];
  const value = Array.isArray(proto) ? proto[0] : proto;
  return typeof value === 'string' && value.split(',')[0].trim() === 'https';
}

/**
 * Express middleware: attaches the full hardened header set to every response
 * before any route handler runs. Environment overrides:
 *   CSP_REPORT_ONLY=true       → observe, do not block
 *   CSP_EXTRA_CONNECT_SRC=...  → comma-separated extra connect origins
 *   CSP_EXTRA_SCRIPT_SRC=...   → comma-separated extra script origins
 *   CSP_EXTRA_FRAME_SRC=...    → comma-separated extra frame origins
 */
export function createSecurityHeadersMiddleware(options?: {
  isProduction?: boolean;
}) {
  const isProduction =
    options?.isProduction ?? process.env.NODE_ENV === 'production';
  const reportOnly = process.env.CSP_REPORT_ONLY === 'true';
  const extraConnectSrc = parseOriginList(process.env.CSP_EXTRA_CONNECT_SRC);
  const extraScriptSrc = parseOriginList(process.env.CSP_EXTRA_SCRIPT_SRC);
  const extraFrameSrc = parseOriginList(process.env.CSP_EXTRA_FRAME_SRC);

  return (req: Request, res: Response, next: NextFunction): void => {
    const headers = buildSecurityHeaders({
      isProduction,
      isHttps: requestIsHttps(req),
      reportOnly,
      extraConnectSrc,
      extraScriptSrc,
      extraFrameSrc,
    });
    const isIframeRequest =
      req.headers['sec-fetch-dest'] === 'iframe' ||
      req.headers['sec-fetch-mode'] === 'nested-navigate' ||
      (typeof req.headers['referer'] === 'string' &&
        /google\.com|run\.app|aistudio|cloud/i.test(req.headers['referer']));
    const isEmbedAllowed =
      process.env.ALLOW_EMBED === 'true' ||
      (process.env.NODE_ENV === 'development' && isIframeRequest);
    for (const [name, value] of Object.entries(headers)) {
      if (name === 'X-Frame-Options' && isEmbedAllowed) {
        // In AI Studio preview / dev environment, dev server runs inside an iframe.
        // X-Frame-Options: DENY causes the browser to block the iframe (ERR_BLOCKED_BY_RESPONSE).
        continue;
      }
      res.setHeader(name, value);
    }
    if (isEmbedAllowed && typeof res.removeHeader === 'function') {
      res.removeHeader('X-Frame-Options');
    }
    next();
  };
}
