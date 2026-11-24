globalThis.__nitro_main__ = import.meta.url;
import { i as serve, r as NodeResponse } from "./_libs/h3-v2+rou3+srvx.mjs";
import { i as toEventHandler, n as defineHandler, o as HTTPError, r as defineLazyEventHandler, t as H3Core } from "./_libs/h3+rou3+srvx.mjs";
import { i as withoutTrailingSlash, n as joinURL, r as withLeadingSlash, t as decodePath } from "./_libs/ufo.mjs";
import { promises } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
//#region #nitro-vite-setup
function lazyService(loader) {
	let promise, mod;
	return { fetch(req) {
		if (mod) return mod.fetch(req);
		if (!promise) promise = loader().then((_mod) => mod = _mod.default || _mod);
		return promise.then((mod) => mod.fetch(req));
	} };
}
var services = { ["ssr"]: lazyService(() => import("./_ssr/ssr.mjs")) };
globalThis.__nitro_vite_envs__ = services;
//#endregion
//#region node_modules/nitro/dist/runtime/internal/route-rules.mjs
var headers = ((m) => function headersRouteRule(event) {
	for (const [key, value] of Object.entries(m.options || {})) event.res.headers.set(key, value);
});
//#endregion
//#region #nitro/virtual/public-assets-data
var public_assets_data_default = {
	"/assets/AppEntry-CL4Rj43T.css": {
		"type": "text/css; charset=utf-8",
		"etag": "\"3f75-k5qjZefPXbSVZv+sBaJoMBc+uM4\"",
		"mtime": "2026-11-24T06:18:23.390Z",
		"size": 16245,
		"path": "../public/assets/AppEntry-CL4Rj43T.css"
	},
	"/assets/lib-CvrDHN_D.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"33cff-oSZSDOn3IaDYKZm8oe1T+cBzkUg\"",
		"mtime": "2026-11-24T06:18:23.389Z",
		"size": 212223,
		"path": "../public/assets/lib-CvrDHN_D.js"
	},
	"/robots.txt": {
		"type": "text/plain; charset=utf-8",
		"etag": "\"a0-CKGXSIe7TSsqDTmGm/nY1t/o5d0\"",
		"mtime": "2026-11-24T06:18:24.675Z",
		"size": 160,
		"path": "../public/robots.txt"
	},
	"/assets/pdf-BcZE4LbZ.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"6ca28-+E//J4MYcGdXBYdjES+QrlW3nTk\"",
		"mtime": "2026-11-24T06:18:23.389Z",
		"size": 444968,
		"path": "../public/assets/pdf-BcZE4LbZ.js"
	},
	"/assets/pdf-CB60jSCE.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"7a48c-hXbcAIOF1o8hxrvzlYbzGyoXtHU\"",
		"mtime": "2026-11-24T06:18:23.389Z",
		"size": 500876,
		"path": "../public/assets/pdf-CB60jSCE.js"
	},
	"/favicon.ico": {
		"type": "image/vnd.microsoft.icon",
		"etag": "\"507e7-OkTK9H1qtsn99uo26W5NbXHcXi4\"",
		"mtime": "2026-11-24T06:18:24.676Z",
		"size": 329703,
		"path": "../public/favicon.ico"
	},
	"/assets/pyodide.worker-DdmZ1fDW.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"380-SxQGEKw5nFDlyjEuv8QzJif4WnY\"",
		"mtime": "2026-11-24T06:18:23.390Z",
		"size": 896,
		"path": "../public/assets/pyodide.worker-DdmZ1fDW.js"
	},
	"/assets/xlsx-BivLitlN.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"67895-dC+M2iqlwnWyy5rqDFNMq/jNNIE\"",
		"mtime": "2026-11-24T06:18:23.390Z",
		"size": 424085,
		"path": "../public/assets/xlsx-BivLitlN.js"
	},
	"/assets/routes-CVfuuP1W.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"843-UYoK75BLVEYqQ9OlpLJOqvBa7eI\"",
		"mtime": "2026-11-24T06:18:23.389Z",
		"size": 2115,
		"path": "../public/assets/routes-CVfuuP1W.js"
	},
	"/assets/aistudio/45ef24a88e2b99cfb6ac0cbfd90672b4_61ab3f5b.jpg": {
		"type": "image/jpeg",
		"etag": "\"44f8-7bTFMuySXj0M1TMH74zkAUvx4/M\"",
		"mtime": "2026-11-24T06:18:24.674Z",
		"size": 17656,
		"path": "../public/assets/aistudio/45ef24a88e2b99cfb6ac0cbfd90672b4_61ab3f5b.jpg"
	},
	"/assets/aistudio/460x998bb_8d70cb6b.webp": {
		"type": "image/webp",
		"etag": "\"81ea-zFx/W4gFV4+BFfXcLNFwnZOugkQ\"",
		"mtime": "2026-11-24T06:18:24.674Z",
		"size": 33258,
		"path": "../public/assets/aistudio/460x998bb_8d70cb6b.webp"
	},
	"/assets/aistudio/03-model-picker_cfcc9a0f.webp": {
		"type": "image/webp",
		"etag": "\"a7e0-VnMs2kTLZsTEfpx9s2eTyjVvKHM\"",
		"mtime": "2026-11-24T06:18:24.674Z",
		"size": 42976,
		"path": "../public/assets/aistudio/03-model-picker_cfcc9a0f.webp"
	},
	"/assets/aistudio/SMFTA_AI_Pro___Combined_V1___V2_Small-Model_Upgrade_Prompt_757eb838.md": {
		"type": "text/markdown; charset=utf-8",
		"etag": "\"37b8-kpk21DOGaqh3fpdxDkr7kzaaY98\"",
		"mtime": "2026-11-24T06:18:24.674Z",
		"size": 14264,
		"path": "../public/assets/aistudio/SMFTA_AI_Pro___Combined_V1___V2_Small-Model_Upgrade_Prompt_757eb838.md"
	},
	"/assets/aistudio/05-settings_1e7f3968.webp": {
		"type": "image/webp",
		"etag": "\"b334-McC62Zc0GtCWVGWpJXPzts9Pcjc\"",
		"mtime": "2026-11-24T06:18:24.674Z",
		"size": 45876,
		"path": "../public/assets/aistudio/05-settings_1e7f3968.webp"
	},
	"/assets/aistudio/SMFTA_AI_Pro__________________________7b3fb692.md": {
		"type": "text/markdown; charset=utf-8",
		"etag": "\"43d2-PODQTm40SX+Vd0b/Q8bt9Bdt0J8\"",
		"mtime": "2026-11-24T06:18:24.675Z",
		"size": 17362,
		"path": "../public/assets/aistudio/SMFTA_AI_Pro__________________________7b3fb692.md"
	},
	"/assets/aistudio/460x998bb__1__4182cad2.webp": {
		"type": "image/webp",
		"etag": "\"690c-z1zT52999S9qpXlttoFcjwrMPNs\"",
		"mtime": "2026-11-24T06:18:24.674Z",
		"size": 26892,
		"path": "../public/assets/aistudio/460x998bb__1__4182cad2.webp"
	},
	"/assets/aistudio/Screenshot_20261113_190754_0049d345.jpg": {
		"type": "image/jpeg",
		"etag": "\"7341d-dA8ZzcWmqHJVcIhbTseRtQSfxtU\"",
		"mtime": "2026-11-24T06:18:24.675Z",
		"size": 472093,
		"path": "../public/assets/aistudio/Screenshot_20261113_190754_0049d345.jpg"
	},
	"/assets/aistudio/Screenshot_20261114_141151_b6e14b24.jpg": {
		"type": "image/jpeg",
		"etag": "\"66515-/w5VlccwSHRyECociFGyC6vlc6g\"",
		"mtime": "2026-11-24T06:18:24.676Z",
		"size": 419093,
		"path": "../public/assets/aistudio/Screenshot_20261114_141151_b6e14b24.jpg"
	},
	"/assets/styles-CwMepB0x.css": {
		"type": "text/css; charset=utf-8",
		"etag": "\"38db6-2RuHhBG4L8jWeH/57cxP6GyAOjc\"",
		"mtime": "2026-11-24T06:18:23.390Z",
		"size": 232886,
		"path": "../public/assets/styles-CwMepB0x.css"
	},
	"/assets/aistudio/Screenshot_20261114_001902_aa24b062.jpg": {
		"type": "image/jpeg",
		"etag": "\"68848-lHcwqEUh+bEjH1CyqWnWk6JwVY8\"",
		"mtime": "2026-11-24T06:18:24.676Z",
		"size": 428104,
		"path": "../public/assets/aistudio/Screenshot_20261114_001902_aa24b062.jpg"
	},
	"/assets/aistudio/Screenshot_20261114_001926_d5ed3606.jpg": {
		"type": "image/jpeg",
		"etag": "\"4bd50-+C+tJROp1o0XTGijbtWDAV34+WI\"",
		"mtime": "2026-11-24T06:18:24.675Z",
		"size": 310608,
		"path": "../public/assets/aistudio/Screenshot_20261114_001926_d5ed3606.jpg"
	},
	"/assets/index-XH5W_-qo.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"90fcd-6M9tnBuyR1h7qHxi3Imm5ikmQn8\"",
		"mtime": "2026-11-24T06:18:23.386Z",
		"size": 593869,
		"path": "../public/assets/index-XH5W_-qo.js"
	},
	"/assets/aistudio/Screenshot_20261116_022559_4c82bc21.jpg": {
		"type": "image/jpeg",
		"etag": "\"10843-WNpSqOxTLHFapL3LF4tCW7oS4XM\"",
		"mtime": "2026-11-24T06:18:24.675Z",
		"size": 67651,
		"path": "../public/assets/aistudio/Screenshot_20261116_022559_4c82bc21.jpg"
	},
	"/assets/aistudio/Screenshot_20261113_111831_7266810d.jpg": {
		"type": "image/jpeg",
		"etag": "\"81b3d-LncV8SCxoijt9Yik3XkgimDhL/8\"",
		"mtime": "2026-11-24T06:18:24.675Z",
		"size": 531261,
		"path": "../public/assets/aistudio/Screenshot_20261113_111831_7266810d.jpg"
	},
	"/assets/aistudio/a9257b3d7c6bed4a1df6e13f49780918_0a2566ad.jpg": {
		"type": "image/jpeg",
		"etag": "\"9e86-/PEkI0jpz8fyKvACb0GhjeOskdk\"",
		"mtime": "2026-11-24T06:18:24.676Z",
		"size": 40582,
		"path": "../public/assets/aistudio/a9257b3d7c6bed4a1df6e13f49780918_0a2566ad.jpg"
	},
	"/assets/aistudio/lovable-prompt-bn_fcc5f129.txt": {
		"type": "text/plain; charset=utf-8",
		"etag": "\"919-gXz9lnCTt3HOJbJdK2+QUZR/CFw\"",
		"mtime": "2026-11-24T06:18:24.675Z",
		"size": 2329,
		"path": "../public/assets/aistudio/lovable-prompt-bn_fcc5f129.txt"
	},
	"/assets/aistudio/robot-voice-fix-bn_d3815ea9.txt": {
		"type": "text/plain; charset=utf-8",
		"etag": "\"7c8-ATgMkL3aJOv6GTeilslueqy4Hlg\"",
		"mtime": "2026-11-24T06:18:24.676Z",
		"size": 1992,
		"path": "../public/assets/aistudio/robot-voice-fix-bn_d3815ea9.txt"
	},
	"/assets/AppEntry-BqMq2AzI.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"296b3e-bAVj0O7Pag2OKUGNvIOJTFIY9sA\"",
		"mtime": "2026-11-24T06:18:23.388Z",
		"size": 2714430,
		"path": "../public/assets/AppEntry-BqMq2AzI.js"
	},
	"/assets/aistudio/Screenshot_20261116_145328_8e107e18.jpg": {
		"type": "image/jpeg",
		"etag": "\"82815-mVY6/Tcf+ubB1efXgFhgM8MM9Kc\"",
		"mtime": "2026-11-24T06:18:24.676Z",
		"size": 534549,
		"path": "../public/assets/aistudio/Screenshot_20261116_145328_8e107e18.jpg"
	}
};
//#endregion
//#region #nitro/virtual/public-assets-node
function readAsset(id) {
	const serverDir = dirname(fileURLToPath(globalThis.__nitro_main__));
	return promises.readFile(resolve(serverDir, public_assets_data_default[id].path));
}
//#endregion
//#region #nitro/virtual/public-assets
var publicAssetBases = {};
function isPublicAssetURL(id = "") {
	if (public_assets_data_default[id]) return true;
	for (const base in publicAssetBases) if (id.startsWith(base)) return true;
	return false;
}
function getAsset(id) {
	return public_assets_data_default[id];
}
//#endregion
//#region node_modules/nitro/dist/runtime/internal/static.mjs
var METHODS = /* @__PURE__ */ new Set(["HEAD", "GET"]);
var EncodingMap = {
	gzip: ".gz",
	br: ".br",
	zstd: ".zst"
};
var static_default = defineHandler((event) => {
	if (event.req.method && !METHODS.has(event.req.method)) return;
	let id = decodePath(withLeadingSlash(withoutTrailingSlash(event.url.pathname)));
	let asset;
	const encodings = [...(event.req.headers.get("accept-encoding") || "").split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort(), ""];
	for (const encoding of encodings) for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
		const _asset = getAsset(_id);
		if (_asset) {
			asset = _asset;
			id = _id;
			break;
		}
	}
	if (!asset) {
		if (isPublicAssetURL(id)) {
			event.res.headers.delete("Cache-Control");
			throw new HTTPError({ status: 404 });
		}
		return;
	}
	if (encodings.length > 1) event.res.headers.append("Vary", "Accept-Encoding");
	if (event.req.headers.get("if-none-match") === asset.etag) {
		event.res.status = 304;
		event.res.statusText = "Not Modified";
		return "";
	}
	const ifModifiedSinceH = event.req.headers.get("if-modified-since");
	const mtimeDate = new Date(asset.mtime);
	if (ifModifiedSinceH && asset.mtime && new Date(ifModifiedSinceH) >= mtimeDate) {
		event.res.status = 304;
		event.res.statusText = "Not Modified";
		return "";
	}
	if (asset.type) event.res.headers.set("Content-Type", asset.type);
	if (asset.etag && !event.res.headers.has("ETag")) event.res.headers.set("ETag", asset.etag);
	if (asset.mtime && !event.res.headers.has("Last-Modified")) event.res.headers.set("Last-Modified", mtimeDate.toUTCString());
	if (asset.encoding && !event.res.headers.has("Content-Encoding")) event.res.headers.set("Content-Encoding", asset.encoding);
	if (asset.size > 0 && !event.res.headers.has("Content-Length")) event.res.headers.set("Content-Length", asset.size.toString());
	return readAsset(id);
});
//#endregion
//#region #nitro/virtual/routing
var findRouteRules = /* @__PURE__ */ (() => {
	const $0 = [{
		name: "headers",
		route: "/assets/**",
		handler: headers,
		options: { "cache-control": "public, max-age=31536000, immutable" }
	}];
	return (m, p) => {
		let r = [];
		if (p.charCodeAt(p.length - 1) === 47) p = p.slice(0, -1) || "/";
		let s = p.split("/");
		if (s.length > 1) {
			if (s[1] === "assets") r.unshift({
				data: $0,
				params: { "_": s.slice(2).join("/") }
			});
		}
		return r;
	};
})();
var _lazy_0jRgqU = defineLazyEventHandler(() => import("./_chunks/ssr-renderer.mjs"));
var findRoute = /* @__PURE__ */ (() => {
	const data = {
		route: "/**",
		handler: _lazy_0jRgqU
	};
	return ((_m, p) => {
		return {
			data,
			params: { "_": p.slice(1) }
		};
	});
})();
var globalMiddleware = [toEventHandler(static_default)].filter(Boolean);
//#endregion
//#region node_modules/nitro/dist/runtime/internal/error/prod.mjs
var errorHandler = (error, event) => {
	const res = defaultHandler(error, event);
	return new NodeResponse(typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2), res);
};
function defaultHandler(error, event) {
	const unhandled = error.unhandled ?? !HTTPError.isError(error);
	const { status = 500, statusText = "" } = unhandled ? {} : error;
	if (status === 404) {
		const url = event.url || new URL(event.req.url);
		const baseURL = "/";
		if (/^\/[^/]/.test(baseURL) && !url.pathname.startsWith(baseURL)) return {
			status: 302,
			headers: new Headers({ location: `${baseURL}${url.pathname.slice(1)}${url.search}` })
		};
	}
	const headers = new Headers(unhandled ? {} : error.headers);
	headers.set("content-type", "application/json; charset=utf-8");
	return {
		status,
		statusText,
		headers,
		body: {
			error: true,
			...unhandled ? {
				status,
				unhandled: true
			} : typeof error.toJSON === "function" ? error.toJSON() : {
				status,
				statusText,
				message: error.message
			}
		}
	};
}
//#endregion
//#region #nitro/virtual/error-handler
var errorHandlers = [errorHandler];
async function error_handler_default(error, event) {
	for (const handler of errorHandlers) try {
		const response = await handler(error, event, { defaultHandler });
		if (response) return response;
	} catch (error) {
		console.error(error);
	}
}
//#endregion
//#region #nitro/virtual/app
function createNitroApp() {
	const captureError = (error, errorCtx) => {
		if (errorCtx?.event) {
			const errors = errorCtx.event.req.context?.nitro?.errors;
			if (errors) errors.push({
				error,
				context: errorCtx
			});
		}
	};
	const h3App = createH3App({ onError(error, event) {
		return error_handler_default(error, event);
	} });
	let appHandler = (req) => {
		req.context ||= {};
		req.context.nitro = req.context.nitro || { errors: [] };
		return h3App.fetch(req);
	};
	return {
		fetch: appHandler,
		h3: h3App,
		hooks: void 0,
		captureError
	};
}
function createH3App(config) {
	const h3App = new H3Core(config);
	h3App["~findRoute"] = (event) => findRoute(event.req.method, event.url.pathname);
	h3App["~middleware"].push(...globalMiddleware);
	h3App["~getMiddleware"] = (event, route) => {
		const pathname = event.url.pathname;
		const method = event.req.method;
		const middleware = [];
		const routeRules = getRouteRules(method, pathname);
		event.context.routeRules = routeRules?.routeRules;
		if (routeRules?.routeRuleMiddleware.length) middleware.push(...routeRules.routeRuleMiddleware);
		middleware.push(...h3App["~middleware"]);
		if (route?.data?.middleware?.length) middleware.push(...route.data.middleware);
		return middleware;
	};
	return h3App;
}
//#endregion
//#region node_modules/nitro/dist/runtime/internal/app.mjs
var APP_ID = "default";
function useNitroApp() {
	let instance = useNitroApp._instance;
	if (instance) return instance;
	instance = useNitroApp._instance = createNitroApp();
	globalThis.__nitro__ = globalThis.__nitro__ || {};
	globalThis.__nitro__[APP_ID] = instance;
	return instance;
}
function getRouteRules(method, pathname) {
	const m = findRouteRules(method, pathname);
	if (!m?.length) return { routeRuleMiddleware: [] };
	const routeRules = {};
	for (const layer of m) for (const rule of layer.data) {
		const currentRule = routeRules[rule.name];
		if (currentRule) {
			if (rule.options === false) {
				delete routeRules[rule.name];
				continue;
			}
			if (typeof currentRule.options === "object" && typeof rule.options === "object") currentRule.options = {
				...currentRule.options,
				...rule.options
			};
			else currentRule.options = rule.options;
			currentRule.route = rule.route;
			currentRule.params = {
				...currentRule.params,
				...layer.params
			};
		} else if (rule.options !== false) routeRules[rule.name] = {
			...rule,
			params: layer.params
		};
	}
	const middleware = [];
	const orderedRules = Object.values(routeRules).sort((a, b) => (a.handler?.order || 0) - (b.handler?.order || 0));
	for (const rule of orderedRules) {
		if (rule.options === false || !rule.handler) continue;
		middleware.push(rule.handler(rule));
	}
	return {
		routeRules,
		routeRuleMiddleware: middleware
	};
}
//#endregion
//#region node_modules/nitro/dist/runtime/internal/error/hooks.mjs
function _captureError(error, type) {
	console.error(`[${type}]`, error);
	useNitroApp().captureError?.(error, { tags: [type] });
}
function trapUnhandledErrors() {
	process.on("unhandledRejection", (error) => _captureError(error, "unhandledRejection"));
	process.on("uncaughtException", (error) => _captureError(error, "uncaughtException"));
}
//#endregion
//#region #nitro/virtual/tracing
var tracingSrvxPlugins = [];
//#endregion
//#region node_modules/nitro/dist/presets/node/runtime/node-server.mjs
var _parsedPort = Number.parseInt(process.env.NITRO_PORT ?? process.env.PORT ?? "");
var port = Number.isNaN(_parsedPort) ? 3e3 : _parsedPort;
var host = process.env.NITRO_HOST || process.env.HOST;
var cert = process.env.NITRO_SSL_CERT;
var key = process.env.NITRO_SSL_KEY;
var nitroApp = useNitroApp();
serve({
	port,
	hostname: host,
	tls: cert && key ? {
		cert,
		key
	} : void 0,
	fetch: nitroApp.fetch,
	plugins: [...tracingSrvxPlugins]
});
trapUnhandledErrors();
var node_server_default = {};
//#endregion
export { node_server_default as default };
