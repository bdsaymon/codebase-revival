import { i as isEncrypted, n as encryptSecret, t as decryptSecret } from "./secureKeystore-BznpBYUb.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/mcpClient-C7x9GZ2O.js
var MCP_STORAGE_KEY = "smfta_mcp_servers";
/**
* Classifies an MCP server transport and target endpoint for Cloudflare edge
* runtime compatibility. `stdio` spawns OS subprocesses, which are unsupported
* on stateless Web/Worker edge runtimes.
*/
function classifyMcpTransport(urlOrCommand, declaredTransport) {
	const raw = String(urlOrCommand || "").trim();
	const isHttpUrl = /^https?:\/\//i.test(raw);
	if (declaredTransport === "stdio" || !isHttpUrl && raw.length > 0) return {
		transport: "stdio",
		edgeSupported: false,
		reason: "Local stdio commands (e.g. npx / python / binary) cannot spawn OS subprocesses on the Cloudflare edge runtime. Wrap it with an HTTP/SSE bridge URL instead."
	};
	return {
		transport: declaredTransport === "sse" || /\/sse(\?|$)/i.test(raw) ? "sse" : "http",
		edgeSupported: true
	};
}
async function loadMcpServers() {
	if (typeof localStorage === "undefined") return [];
	try {
		const raw = localStorage.getItem(MCP_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const out = [];
		for (const item of parsed) {
			if (!item || typeof item !== "object") continue;
			const s = item;
			let authSecret = typeof s.authSecret === "string" ? s.authSecret : "";
			if (authSecret && isEncrypted(authSecret)) try {
				authSecret = await decryptSecret(authSecret);
			} catch {
				authSecret = "";
			}
			const urlOrCommand = String(s.urlOrCommand || "").trim();
			const analysis = classifyMcpTransport(urlOrCommand, s.transport);
			out.push({
				id: String(s.id || `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
				name: String(s.name || "Unnamed MCP Server").slice(0, 120),
				urlOrCommand,
				transport: s.transport || analysis.transport,
				authType: s.authType === "bearer" || s.authType === "header" ? s.authType : "none",
				authHeaderName: typeof s.authHeaderName === "string" ? s.authHeaderName.slice(0, 80) : void 0,
				authSecret,
				enabled: s.enabled !== false,
				lastTestedAt: typeof s.lastTestedAt === "number" ? s.lastTestedAt : void 0,
				status: s.status || (analysis.edgeSupported ? "untested" : "edge_blocked"),
				statusMessage: s.statusMessage,
				latencyMs: typeof s.latencyMs === "number" ? s.latencyMs : void 0,
				tools: Array.isArray(s.tools) ? s.tools : [],
				edgeLimited: !analysis.edgeSupported
			});
		}
		return out;
	} catch {
		return [];
	}
}
async function saveMcpServers(servers) {
	if (typeof localStorage === "undefined") return;
	const sealed = await Promise.all(servers.map(async (srv) => ({
		...srv,
		authSecret: srv.authSecret ? await encryptSecret(srv.authSecret) : ""
	})));
	localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(sealed));
}
function buildMcpPromptContext(servers) {
	const active = servers.filter((s) => s.enabled && !s.edgeLimited && s.tools && s.tools.length > 0);
	if (active.length === 0) return "";
	return `[CONNECTED MCP TOOLS]\n${active.map((srv) => {
		const toolsList = (srv.tools || []).slice(0, 12).map((t) => `${t.name}${t.description ? `: ${t.description.slice(0, 90)}` : ""}`).join("; ");
		return `- MCP Server "${srv.name}" (${srv.transport}): ${toolsList}`;
	}).join("\n")}`;
}
//#endregion
export { saveMcpServers as a, loadMcpServers as i, buildMcpPromptContext as n, classifyMcpTransport as r, MCP_STORAGE_KEY as t };
