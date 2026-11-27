//#region node_modules/.nitro/vite/services/ssr/assets/securityHeaders-CK3nkcE9.js
var STATIC_SECURITY_HEADERS = Object.freeze({
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"X-Permitted-Cross-Domain-Policies": "none",
	"X-DNS-Prefetch-Control": "off",
	"Permissions-Policy": "accelerometer=(), autoplay=(self), camera=(), display-capture=(), encrypted-media=(self), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(self), midi=(), payment=(), usb=()",
	"Cross-Origin-Opener-Policy": "same-origin-allow-popups"
});
var HSTS_HEADER = "Strict-Transport-Security";
var HSTS_VALUE = "max-age=63072000; includeSubDomains";
var CSP_BASE_DIRECTIVES = Object.freeze({
	"default-src": ["'self'"],
	"script-src": [
		"'self'",
		"https://accounts.google.com",
		"https://cdn.jsdelivr.net",
		"https://cdn.tailwindcss.com"
	],
	"style-src": [
		"'self'",
		"'unsafe-inline'",
		"https://fonts.googleapis.com"
	],
	"img-src": [
		"'self'",
		"data:",
		"blob:",
		"https:"
	],
	"font-src": [
		"'self'",
		"data:",
		"https://fonts.gstatic.com"
	],
	"connect-src": [
		"'self'",
		"https:",
		"data:",
		"blob:"
	],
	"frame-src": [
		"'self'",
		"blob:",
		"https://accounts.google.com"
	],
	"worker-src": [
		"'self'",
		"blob:",
		"https://cdn.jsdelivr.net"
	],
	"media-src": [
		"'self'",
		"blob:",
		"data:"
	],
	"manifest-src": ["'self'"],
	"object-src": ["'none'"],
	"base-uri": ["'self'"],
	"form-action": ["'self'"],
	"frame-ancestors": ["'none'"]
});
/**
* Only quoted CSP keywords or http(s) origins may enter a directive. This
* blocks `javascript:`, data exfiltration hosts or broken syntax injected via
* caller arguments or environment variables.
*/
function isAllowedCspOrigin(value) {
	const origin = String(value || "").trim();
	return origin === "'self'" || origin === "blob:" || origin === "data:" || origin === "https:" || origin === "http:" || /^https?:\/\/[^\s/'"]+$/i.test(origin);
}
function appendUnique(values, extras) {
	if (!extras || extras.length === 0) return values;
	const merged = [...values];
	for (const raw of extras) {
		const origin = String(raw || "").trim();
		if (isAllowedCspOrigin(origin) && !merged.includes(origin)) merged.push(origin);
	}
	return merged;
}
/**
* Builds the serialized Content-Security-Policy header value. Extra origins are
* validated loosely (they must be an http(s) origin or a quoted CSP keyword) so
* a malformed env value can never inject a broken directive.
*/
function buildContentSecurityPolicy(config = {}) {
	const directives = {};
	for (const [name, values] of Object.entries(CSP_BASE_DIRECTIVES)) directives[name] = [...values];
	directives["connect-src"] = appendUnique(directives["connect-src"], config.extraConnectSrc);
	directives["script-src"] = appendUnique(directives["script-src"], config.extraScriptSrc);
	directives["frame-src"] = appendUnique(directives["frame-src"], config.extraFrameSrc);
	return Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}
function parseOriginList(raw) {
	if (!raw) return [];
	return raw.split(",").map((part) => part.trim()).filter((part) => isAllowedCspOrigin(part));
}
/**
* Full header set for one response. The CSP is included only in production;
* HSTS only when the request is actually on HTTPS.
*/
function buildSecurityHeaders(config = {}) {
	const headers = { ...STATIC_SECURITY_HEADERS };
	if (config.isHttps) headers[HSTS_HEADER] = HSTS_VALUE;
	if (config.isProduction) {
		const csp = buildContentSecurityPolicy(config);
		const headerName = config.reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
		headers[headerName] = csp;
	}
	return headers;
}
function requestIsHttps(req) {
	if (req.socket?.encrypted) return true;
	const proto = req.headers?.["x-forwarded-proto"];
	const value = Array.isArray(proto) ? proto[0] : proto;
	return typeof value === "string" && value.split(",")[0].trim() === "https";
}
/**
* Express middleware: attaches the full hardened header set to every response
* before any route handler runs. Environment overrides:
*   CSP_REPORT_ONLY=true       → observe, do not block
*   CSP_EXTRA_CONNECT_SRC=...  → comma-separated extra connect origins
*   CSP_EXTRA_SCRIPT_SRC=...   → comma-separated extra script origins
*   CSP_EXTRA_FRAME_SRC=...    → comma-separated extra frame origins
*/
function createSecurityHeadersMiddleware(options) {
	const isProduction = options?.isProduction ?? true;
	const reportOnly = process.env.CSP_REPORT_ONLY === "true";
	const extraConnectSrc = parseOriginList(process.env.CSP_EXTRA_CONNECT_SRC);
	const extraScriptSrc = parseOriginList(process.env.CSP_EXTRA_SCRIPT_SRC);
	const extraFrameSrc = parseOriginList(process.env.CSP_EXTRA_FRAME_SRC);
	return (req, res, next) => {
		const headers = buildSecurityHeaders({
			isProduction,
			isHttps: requestIsHttps(req),
			reportOnly,
			extraConnectSrc,
			extraScriptSrc,
			extraFrameSrc
		});
		req.headers["sec-fetch-dest"] === "iframe" || req.headers["sec-fetch-mode"] === "nested-navigate" || typeof req.headers["referer"] === "string" && /google\.com|run\.app|aistudio|cloud/i.test(req.headers["referer"]);
		const isEmbedAllowed = process.env.ALLOW_EMBED === "true" || false;
		for (const [name, value] of Object.entries(headers)) {
			if (name === "X-Frame-Options" && isEmbedAllowed) continue;
			res.setHeader(name, value);
		}
		if (isEmbedAllowed && typeof res.removeHeader === "function") res.removeHeader("X-Frame-Options");
		next();
	};
}
//#endregion
export { HSTS_HEADER, HSTS_VALUE, STATIC_SECURITY_HEADERS, buildContentSecurityPolicy, buildSecurityHeaders, createSecurityHeadersMiddleware, isAllowedCspOrigin };
