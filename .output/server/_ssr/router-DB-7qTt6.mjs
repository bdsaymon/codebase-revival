import { o as __toESM } from "../_runtime.mjs";
import { n as require_jsx_runtime, r as require_react, t as QueryClientProvider } from "../_libs/react+tanstack__react-query.mjs";
import { _ as createFileRoute, b as useRouter, d as Scripts, f as HeadContent, g as lazyRouteComponent, h as Outlet, m as createRouter, v as createRootRouteWithContext, y as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { i as shouldAttemptChunkReload, n as isDynamicImportError } from "./dynamicImportRecovery-BoPXERDS.mjs";
import { t as QueryClient } from "../_libs/tanstack__query-core.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router-DB-7qTt6.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var styles_default = "/assets/styles-BGw0QO1h.css";
function reportLovableError(error, context = {}) {
	if (typeof window === "undefined") return;
	window.__lovableEvents?.captureException?.(error, {
		source: "react_error_boundary",
		route: window.location.pathname,
		...context
	}, {
		mechanism: "react_error_boundary",
		handled: false,
		severity: "error"
	});
	const stack = error instanceof Error ? error.stack : void 0;
	window.__lovableReportRuntimeError?.({
		message: describeThrown(error),
		...stack !== void 0 && { stack },
		filename: window.location.pathname
	});
}
var MAX_SERIALIZED_LENGTH = 2e3;
function describeThrown(error) {
	if (error instanceof Response) return `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`;
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	const { message } = error ?? {};
	if (typeof message === "string" && message.length > 0) return message;
	try {
		return JSON.stringify(error)?.slice(0, MAX_SERIALIZED_LENGTH) ?? String(error);
	} catch {
		return String(error);
	}
}
function NotFoundComponent() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-w-md text-center",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-7xl font-bold text-foreground",
					children: "404"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-4 text-xl font-semibold text-foreground",
					children: "Page not found"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "The page you're looking for doesn't exist or has been moved."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-6",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/",
						className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
						children: "Go home"
					})
				})
			]
		})
	});
}
function ErrorComponent({ error, reset }) {
	console.error(error);
	const router = useRouter();
	const isModuleFetchError = isDynamicImportError(error);
	(0, import_react.useEffect)(() => {
		if (isModuleFetchError && typeof window !== "undefined" && shouldAttemptChunkReload(window.sessionStorage)) {
			window.location.reload();
			return;
		}
		reportLovableError(error, { boundary: "tanstack_root_error_component" });
	}, [error, isModuleFetchError]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
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
					children: isModuleFetchError ? "A module update or temporary network hiccup interrupted loading. Reload to fetch the latest version." : "Something went wrong on our end. You can try refreshing or head back home."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-6 flex flex-wrap justify-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => {
							if (isModuleFetchError && typeof window !== "undefined") {
								window.location.reload();
								return;
							}
							router.invalidate();
							reset();
						},
						className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
						children: "Try again"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "/",
						className: "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent",
						children: "Go home"
					})]
				})
			]
		})
	});
}
var Route$4 = createRootRouteWithContext()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: "SMFTA AI Pro" },
			{
				name: "description",
				content: "Bilingual AI assistant with a self-control engine."
			}
		],
		links: [
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com"
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous"
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..600&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+Bengali:wght@400;500;600;700&family=Hind+Siliguri:wght@400;500;600;700&display=swap"
			},
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "icon",
				href: "/favicon.ico"
			},
			{
				rel: "apple-touch-icon",
				href: "/favicon.ico"
			}
		]
	}),
	shellComponent: RootShell,
	component: RootComponent,
	notFoundComponent: NotFoundComponent,
	errorComponent: ErrorComponent
});
function RootShell({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "en",
		"data-theme": "dark",
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", { children: [children, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})] })]
	});
}
function RootComponent() {
	const { queryClient } = Route$4.useRouteContext();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueryClientProvider, {
		client: queryClient,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {})
	});
}
var $$splitComponentImporter = () => import("./routes-U7gT8BeM.mjs");
var Route$3 = createFileRoute("/")({
	head: () => ({ meta: [
		{ title: "SMFTA AI Pro" },
		{
			name: "description",
			content: "SMFTA AI: direct answers, Mercury and custom providers, code editing, Notebook and persistent on-device memory."
		},
		{
			property: "og:title",
			content: "SMFTA AI Pro"
		},
		{
			property: "og:description",
			content: "SMFTA AI: direct answers, Mercury and custom providers, code editing, Notebook and persistent on-device memory."
		},
		{
			property: "og:type",
			content: "website"
		},
		{
			name: "twitter:card",
			content: "summary_large_image"
		}
	] }),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
var handle = async ({ request }) => {
	const { dispatchToLegacyApp } = await import("./dispatch-mdjaAYxy.mjs");
	return dispatchToLegacyApp(request);
};
var Route$2 = createFileRoute("/api/$")({ server: { handlers: {
	GET: handle,
	POST: handle,
	PUT: handle,
	PATCH: handle,
	DELETE: handle,
	OPTIONS: handle
} } });
var Route$1 = createFileRoute("/auth/callback")({ server: { handlers: { GET: async ({ request }) => {
	const { dispatchToLegacyApp } = await import("./dispatch-mdjaAYxy.mjs");
	return dispatchToLegacyApp(request);
} } } });
var Route = createFileRoute("/preview/$projectId")({ server: { handlers: { GET: async ({ request }) => {
	const { dispatchToLegacyApp } = await import("./dispatch-mdjaAYxy.mjs");
	return dispatchToLegacyApp(request);
} } } });
var rootRouteChildren = {
	IndexRoute: Route$3.update({
		id: "/",
		path: "/",
		getParentRoute: () => Route$4
	}),
	ApiSplatRoute: Route$2.update({
		id: "/api/$",
		path: "/api/$",
		getParentRoute: () => Route$4
	}),
	AuthCallbackRoute: Route$1.update({
		id: "/auth/callback",
		path: "/auth/callback",
		getParentRoute: () => Route$4
	}),
	PreviewProjectIdRoute: Route.update({
		id: "/preview/$projectId",
		path: "/preview/$projectId",
		getParentRoute: () => Route$4
	})
};
var routeTree = Route$4._addFileChildren(rootRouteChildren)._addFileTypes();
var getRouter = () => {
	const queryClient = new QueryClient();
	return createRouter({
		routeTree,
		context: { queryClient },
		scrollRestoration: true,
		defaultPreloadStaleTime: 0
	});
};
//#endregion
export { getRouter };
