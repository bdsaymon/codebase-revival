import { o as __toESM } from "../_runtime.mjs";
import { n as require_jsx_runtime, r as require_react } from "../_libs/react+tanstack__react-query.mjs";
import { i as shouldAttemptChunkReload, n as isDynamicImportError, r as loadWithRetry, t as clearChunkReloadGuard } from "./dynamicImportRecovery-BoPXERDS.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-DOrHDn_L.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function Index() {
	const [LoadedApp, setLoadedApp] = (0, import_react.useState)(null);
	const [loadError, setLoadError] = (0, import_react.useState)(null);
	const [attemptSeq, setAttemptSeq] = (0, import_react.useState)(0);
	const retryLoad = (0, import_react.useCallback)(() => {
		setLoadError(null);
		setAttemptSeq((n) => n + 1);
	}, []);
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		setLoadError(null);
		loadWithRetry(() => import("./AppEntry-C2uNihK4.mjs"), {
			retries: 3,
			delayMs: 300,
			isCancelled: () => cancelled
		}).then((mod) => {
			if (cancelled) return;
			clearChunkReloadGuard(typeof window !== "undefined" ? window.sessionStorage : null);
			setLoadedApp(() => mod.default);
		}).catch((err) => {
			if (cancelled) return;
			if (typeof window !== "undefined" && isDynamicImportError(err) && shouldAttemptChunkReload(window.sessionStorage)) {
				window.location.reload();
				return;
			}
			setLoadError(err);
		});
		return () => {
			cancelled = true;
		};
	}, [attemptSeq]);
	if (loadError) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		id: "root",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex min-h-screen items-center justify-center bg-background px-4",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "max-w-md text-center",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "text-xl font-semibold tracking-tight text-foreground",
						children: "This page didn't load"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-muted-foreground",
						children: "অ্যাপের মডিউল লোড হতে সাময়িক সমস্যা হয়েছে। নিচের বাটনে ক্লিক করে আবার চেষ্টা করুন।"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-6 flex flex-wrap justify-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: retryLoad,
							className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer",
							children: "Try again"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => window.location.reload(),
							className: "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent cursor-pointer",
							children: "Reload page"
						})]
					})
				]
			})
		})
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		id: "root",
		children: LoadedApp ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadedApp, {}) : null
	});
}
//#endregion
export { Index as component };
