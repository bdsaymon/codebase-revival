import { n as initSqlite } from "./sqlite-vxxGym0h.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/dispatch-C0uqoDbF.js
var MAX_BODY_BYTES = 52428800;
var appPromise = null;
async function buildApp() {
	await initSqlite();
	const [{ Router }, { chatRouter }, { providerRouter }, { toolsRouter }, { healthRouter }, { oauthRouter }, { mcpRouter }, { dbBridgeRouter }, { v2Router }, { previewRouter }, { APP_VERSION }, { createIpRateLimiter, parseTrustProxyHops }, { createApiIdentityMiddleware, redactSecrets }, { createSecurityHeadersMiddleware }] = await Promise.all([
		import("./express-DfD0yhJD.mjs"),
		import("./chat-BFsFu_-_.mjs"),
		import("./provider-Dds2P7Xc.mjs"),
		import("./tools-BD5ytSEP.mjs"),
		import("./health-Do34NVQk.mjs"),
		import("./oauth-9NCWFMlA.mjs"),
		import("./mcp-Colyhrq8.mjs"),
		import("./dbBridge-D1eLneGL.mjs"),
		import("./v2-gb1oE1jp.mjs"),
		import("./preview-BAc7ChVQ.mjs"),
		import("./version-DomTpKw0.mjs").then((n) => n.n),
		import("./rateLimit-N72zsxxS.mjs"),
		import("./security-lsE4uyVm.mjs").then((n) => n.f).then((n) => n.c),
		import("./securityHeaders-CK3nkcE9.mjs")
	]);
	const root = Router();
	root.use(createSecurityHeadersMiddleware());
	root.use((req, res, next) => {
		const incoming = req.headers["x-request-id"];
		const requestId = typeof incoming === "string" && /^[\w.-]{8,128}$/.test(incoming.trim()) ? incoming.trim() : `req_${crypto.randomUUID()}`;
		req.requestId = requestId;
		res.setHeader("X-Request-Id", requestId);
		res.setHeader("X-Powered-By", `SMFTA-Pro-Engine/${APP_VERSION}`);
		next();
	});
	root.use("/api", createApiIdentityMiddleware());
	root.use("/api", createIpRateLimiter({
		windowMs: 6e4,
		maxRequests: 240,
		maxBuckets: 2e4
	}));
	root.use("/api", chatRouter);
	root.use("/api", providerRouter);
	root.use("/api", toolsRouter);
	root.use("/api", healthRouter);
	root.use("/api", mcpRouter);
	root.use("/api", dbBridgeRouter);
	root.use("/api", v2Router);
	root.use(previewRouter);
	root.use(oauthRouter);
	return {
		root,
		redactSecrets
	};
}
function getApp() {
	if (!appPromise) appPromise = buildApp().catch((e) => {
		appPromise = null;
		throw e;
	});
	return appPromise;
}
function lowerHeaders(h) {
	const out = {};
	h.forEach((v, k) => {
		out[k.toLowerCase()] = v;
	});
	return out;
}
async function readBody(request) {
	if (request.method === "GET" || request.method === "HEAD") return {};
	if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
		const e = /* @__PURE__ */ new Error("request entity too large");
		e.type = "entity.too.large";
		throw e;
	}
	const type = request.headers.get("content-type") || "";
	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) {
		const e = /* @__PURE__ */ new Error("request entity too large");
		e.type = "entity.too.large";
		throw e;
	}
	if (!text) return {};
	if (type.includes("application/json")) try {
		return JSON.parse(text);
	} catch {
		const e = /* @__PURE__ */ new Error("Invalid JSON body");
		e.status = 400;
		throw e;
	}
	if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(text));
	return text;
}
function isInternalHost(host) {
	return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(host);
}
function resolvePublicOrigin(url, headers) {
	const candidates = [];
	const fwdHost = headers["x-forwarded-host"]?.split(",")[0]?.trim();
	if (fwdHost) {
		const proto = headers["x-forwarded-proto"]?.split(",")[0]?.trim() || "https";
		candidates.push(`${proto}://${fwdHost}`);
	}
	if (headers["origin"]) candidates.push(headers["origin"]);
	if (headers["referer"]) candidates.push(headers["referer"]);
	for (const c of candidates) try {
		const u = new URL(c);
		if (!isInternalHost(u.host)) return new URL(u.origin);
	} catch {}
	return new URL(url.origin);
}
async function dispatchToLegacyApp(request) {
	const url = new URL(request.url);
	const headers = lowerHeaders(request.headers);
	const publicOrigin = resolvePublicOrigin(url, headers);
	headers["host"] = publicOrigin.host;
	headers["x-forwarded-proto"] = publicOrigin.protocol.replace(":", "");
	const ip = headers["cf-connecting-ip"] || (headers["x-forwarded-for"] || "").split(",")[0]?.trim() || "127.0.0.1";
	const encoder = new TextEncoder();
	const stream = new TransformStream();
	const writer = stream.writable.getWriter();
	const closeListeners = [];
	const resHeaders = new Headers();
	let statusCode = 200;
	let headersSent = false;
	let ended = false;
	let resolveResponse;
	const responsePromise = new Promise((r) => resolveResponse = r);
	const flush = () => {
		if (headersSent) return;
		headersSent = true;
		resolveResponse(new Response(request.method === "HEAD" ? null : stream.readable, {
			status: statusCode,
			headers: resHeaders
		}));
	};
	const fireClose = () => {
		const list = closeListeners.splice(0);
		for (const cb of list) try {
			cb();
		} catch {}
	};
	request.signal?.addEventListener?.("abort", () => {
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
		socket: {
			remoteAddress: ip,
			encrypted: publicOrigin.protocol === "https:"
		},
		signal: request.signal,
		get(name) {
			return headers[name.toLowerCase()];
		},
		header(name) {
			return headers[name.toLowerCase()];
		},
		on(event, cb) {
			if (event === "close" || event === "aborted") closeListeners.push(cb);
			return req;
		}
	};
	const res = {
		get statusCode() {
			return statusCode;
		},
		set statusCode(v) {
			statusCode = v;
		},
		get headersSent() {
			return headersSent;
		},
		get writableEnded() {
			return ended;
		},
		status(code) {
			statusCode = code;
			return res;
		},
		setHeader(name, value) {
			if (headersSent) return res;
			if (Array.isArray(value)) {
				resHeaders.delete(name);
				value.forEach((v) => resHeaders.append(name, String(v)));
			} else resHeaders.set(name, String(value));
			return res;
		},
		set(name, value) {
			return res.setHeader(name, value);
		},
		getHeader(name) {
			return resHeaders.get(name) ?? void 0;
		},
		removeHeader(name) {
			resHeaders.delete(name);
		},
		type(t) {
			resHeaders.set("Content-Type", t.includes("/") ? t : `text/${t}`);
			return res;
		},
		json(body) {
			if (!resHeaders.has("Content-Type")) resHeaders.set("Content-Type", "application/json; charset=utf-8");
			res.end(JSON.stringify(body));
			return res;
		},
		send(body) {
			if (body !== void 0 && body !== null && typeof body === "object" && !(body instanceof Uint8Array)) return res.json(body);
			if (!resHeaders.has("Content-Type") && typeof body === "string") resHeaders.set("Content-Type", "text/html; charset=utf-8");
			res.end(body);
			return res;
		},
		redirect(a, b) {
			const code = typeof a === "number" ? a : 302;
			const loc = typeof a === "string" ? a : b || "/";
			statusCode = code;
			resHeaders.set("Location", loc);
			res.end();
		},
		flushHeaders() {
			flush();
		},
		write(chunk) {
			if (ended) return false;
			flush();
			writer.write(typeof chunk === "string" ? encoder.encode(chunk) : chunk).catch(() => fireClose());
			return true;
		},
		end(chunk) {
			if (ended) return;
			if (chunk !== void 0 && chunk !== null && chunk !== "") res.write(chunk);
			ended = true;
			flush();
			writer.close().catch(() => void 0);
			fireClose();
		},
		on(event, cb) {
			if (event === "close" || event === "finish") closeListeners.push(cb);
			return res;
		},
		once(event, cb) {
			return res.on(event, cb);
		}
	};
	const finalHandler = (app, err) => {
		if (ended) return;
		if (err === void 0) {
			res.status(404).json({
				ok: false,
				code: "NOT_FOUND",
				error: "Not found"
			});
			return;
		}
		console.error("[smfta-api-final]", err instanceof Error ? err.stack || err.message : err);
		const isTooLarge = !!err && typeof err === "object" && err.type === "entity.too.large";
		const explicit = err?.status;
		const raw = err instanceof Error ? err.message : "Internal server error";
		const safeMsg = app ? app.redactSecrets(raw) : "Internal server error";
		if (!headersSent) res.status(isTooLarge ? 413 : explicit && explicit < 500 ? explicit : 500).json({
			ok: false,
			code: isTooLarge ? "PAYLOAD_TOO_LARGE" : "SERVER_ERROR",
			error: safeMsg,
			requestId: req.requestId
		});
		else {
			if ((resHeaders.get("content-type") || "").includes("text/event-stream")) {
				res.write(`data: ${JSON.stringify({
					type: "error",
					ok: false,
					code: "SERVER_ERROR",
					message: safeMsg,
					text: safeMsg,
					delta: safeMsg
				})}\n\n`);
				res.write("data: [DONE]\n\n");
			}
			res.end();
		}
	};
	(async () => {
		let app = null;
		try {
			app = await getApp();
			req.body = await readBody(request);
			await app.root.handle(req, res, (err) => finalHandler(app, err));
			if (!ended && !headersSent) finalHandler(app, void 0);
		} catch (err) {
			console.error("[smfta-api]", err instanceof Error ? err.message : err);
			finalHandler(app, err);
		}
	})();
	return responsePromise;
}
//#endregion
export { dispatchToLegacyApp };
