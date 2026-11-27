//#region node_modules/.nitro/vite/services/ssr/assets/express-DfD0yhJD.js
function compilePath(path) {
	const keys = [];
	const src = (path.replace(/\/+$/, "") || "/").split("/").map((seg) => {
		if (seg.startsWith(":")) {
			keys.push(seg.slice(1));
			return "([^/]+)";
		}
		if (seg.startsWith("*")) {
			keys.push(seg.slice(1) || "splat");
			return "(.*)";
		}
		return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}).join("/");
	return {
		pattern: new RegExp(`^${src}/?$`),
		keys
	};
}
var RouterImpl = class RouterImpl {
	layers = [];
	add(method, path, handlers) {
		const { pattern, keys } = compilePath(path);
		this.layers.push({
			method,
			pattern,
			keys,
			prefix: null,
			handlers
		});
		return this;
	}
	get(path, ...handlers) {
		return this.add("GET", path, handlers);
	}
	post(path, ...handlers) {
		return this.add("POST", path, handlers);
	}
	put(path, ...handlers) {
		return this.add("PUT", path, handlers);
	}
	patch(path, ...handlers) {
		return this.add("PATCH", path, handlers);
	}
	delete(path, ...handlers) {
		return this.add("DELETE", path, handlers);
	}
	all(path, ...handlers) {
		return this.add("*", path, handlers);
	}
	use(pathOrHandler, ...rest) {
		let prefix = "";
		let list;
		if (typeof pathOrHandler === "string") {
			prefix = pathOrHandler.replace(/\/+$/, "");
			list = rest;
		} else list = [pathOrHandler, ...rest];
		const handlers = list.map((h) => h instanceof RouterImpl ? h.handle.bind(h) : h);
		this.layers.push({
			method: null,
			pattern: null,
			keys: [],
			prefix,
			handlers
		});
		return this;
	}
	/** Runs this router's layers; calls `out` when nothing ended the response. */
	async handle(req, res, out) {
		const basePath = req.path;
		let idx = 0;
		const layers = this.layers;
		const runHandlers = async (handlers, err) => {
			for (let i = 0; i < handlers.length; i++) {
				const h = handlers[i];
				let calledNext = false;
				let nextErr;
				const isErrorHandler = h.length === 4;
				if (err !== void 0 && !isErrorHandler) continue;
				if (err === void 0 && isErrorHandler) continue;
				const next = (e) => {
					calledNext = true;
					nextErr = e;
				};
				try {
					if (isErrorHandler) await h(err, req, res, next);
					else await h(req, res, next);
				} catch (e) {
					return { error: e };
				}
				if (!calledNext) return { stopped: true };
				if (nextErr !== void 0 && nextErr !== "route") err = nextErr;
			}
			return err !== void 0 ? { error: err } : { stopped: false };
		};
		let pendingErr;
		while (idx < layers.length) {
			const layer = layers[idx++];
			if (layer.method === null) {
				const prefix = layer.prefix || "";
				if (prefix && !(basePath === prefix || basePath.startsWith(prefix + "/"))) continue;
				const savedPath = req.path;
				req.path = prefix ? basePath.slice(prefix.length) || "/" : basePath;
				const result = await runHandlers(layer.handlers, pendingErr);
				req.path = savedPath;
				if (result.error !== void 0) {
					pendingErr = result.error;
					continue;
				}
				if (result.stopped) return;
				continue;
			}
			if (pendingErr !== void 0) continue;
			if (layer.method !== "*" && layer.method !== req.method) {
				if (!(layer.method === "GET" && req.method === "HEAD")) continue;
			}
			const m = layer.pattern.exec(basePath);
			if (!m) continue;
			const params = {};
			layer.keys.forEach((k, i) => {
				params[k] = decodeURIComponent(m[i + 1] ?? "");
			});
			req.params = params;
			const result = await runHandlers(layer.handlers);
			if (result.error !== void 0) {
				pendingErr = result.error;
				continue;
			}
			if (result.stopped) return;
		}
		out(pendingErr);
	}
};
function Router() {
	return new RouterImpl();
}
var express = { Router };
//#endregion
export { Router, RouterImpl, express as default };
