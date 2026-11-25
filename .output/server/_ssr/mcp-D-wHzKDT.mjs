import { r as classifyMcpTransport } from "./mcpClient-C7x9GZ2O.mjs";
import { Router } from "./express-DfD0yhJD.mjs";
import { c as verifyConnectionTargetSafe } from "./storage-DysOPz1L.mjs";
import { c as sanitizeErrorMsg } from "./aiClient-Bkf37C6D.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/mcp-D-wHzKDT.js
var mcpRouter = Router();
function buildAuthHeaders(body) {
	const headers = {
		"Content-Type": "application/json",
		Accept: "application/json, text/event-stream"
	};
	const authType = String(body.authType || "none");
	const authSecret = String(body.authSecret || "").trim();
	const authHeaderName = String(body.authHeaderName || "X-API-Key").trim();
	if (!authSecret) return headers;
	if (authType === "bearer") headers["Authorization"] = `Bearer ${authSecret}`;
	else if (authType === "header" && /^[A-Za-z0-9-]+$/.test(authHeaderName)) headers[authHeaderName] = authSecret;
	return headers;
}
async function parseMcpResponseBody(res) {
	const contentType = res.headers.get("content-type") || "";
	const text = await res.text();
	if (contentType.includes("text/event-stream") || text.trimStart().startsWith("data:") || text.trimStart().startsWith("event:")) {
		const lines = text.split("\n");
		for (const line of lines) if (line.startsWith("data:")) {
			const jsonPart = line.slice(5).trim();
			if (jsonPart && jsonPart !== "[DONE]") try {
				return JSON.parse(jsonPart);
			} catch {}
		}
	}
	try {
		return JSON.parse(text);
	} catch {
		return { rawText: text.slice(0, 400) };
	}
}
/**
* POST /api/mcp/test
* Probes an HTTP/SSE MCP server via real JSON-RPC 2.0 `initialize` + `tools/list`.
* Explicitly rejects `stdio` commands with EDGE_STDIO_UNSUPPORTED on Cloudflare Workers.
*/
mcpRouter.post("/mcp/test", async (req, res) => {
	const body = req.body || {};
	const urlOrCommand = String(body.urlOrCommand || "").trim();
	const declaredTransport = body.transport === "sse" || body.transport === "stdio" || body.transport === "http" ? body.transport : void 0;
	if (!urlOrCommand) return res.status(400).json({
		ok: false,
		errorCode: "MISSING_ENDPOINT",
		message: "MCP server URL or command is required."
	});
	const analysis = classifyMcpTransport(urlOrCommand, declaredTransport);
	if (!analysis.edgeSupported) return res.status(400).json({
		ok: false,
		errorCode: "EDGE_STDIO_UNSUPPORTED",
		message: analysis.reason || "Local stdio MCP processes cannot run on Cloudflare Workers edge runtime."
	});
	const ssrf = await verifyConnectionTargetSafe(urlOrCommand, {
		isCustomProvider: true,
		allowInsecureLocalhost: process.env.ALLOW_INSECURE_LOCALHOST === "true"
	});
	if (!ssrf.safe) return res.status(400).json({
		ok: false,
		errorCode: "SSRF_BLOCKED",
		message: `Blocked target URL: ${ssrf.reason || "unsafe destination"}`
	});
	const startedAt = Date.now();
	const headers = buildAuthHeaders(body);
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 12e3);
	try {
		const initRes = await fetch(urlOrCommand, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: {
						name: "smfta-ai-pro",
						version: "20.0.0"
					}
				}
			}),
			signal: ctrl.signal
		});
		const latencyMs = Math.max(1, Date.now() - startedAt);
		const sessionHeader = initRes.headers.get("mcp-session-id");
		const nextHeaders = sessionHeader ? {
			...headers,
			"Mcp-Session-Id": sessionHeader
		} : headers;
		if (!initRes.ok) {
			const errBody = await initRes.text().catch(() => "");
			return res.status(502).json({
				ok: false,
				errorCode: `HTTP_${initRes.status}`,
				latencyMs,
				message: `MCP initialize failed (HTTP ${initRes.status}): ${errBody.slice(0, 160) || initRes.statusText}`
			});
		}
		const serverInfo = ((await parseMcpResponseBody(initRes)).result || {}).serverInfo || {};
		await fetch(urlOrCommand, {
			method: "POST",
			headers: nextHeaders,
			body: JSON.stringify({
				jsonrpc: "2.0",
				method: "notifications/initialized"
			}),
			signal: ctrl.signal
		}).catch(() => {});
		let tools = [];
		const toolsRes = await fetch(urlOrCommand, {
			method: "POST",
			headers: nextHeaders,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {}
			}),
			signal: ctrl.signal
		}).catch(() => null);
		if (toolsRes && toolsRes.ok) {
			const rawTools = (await parseMcpResponseBody(toolsRes)).result?.tools;
			if (Array.isArray(rawTools)) tools = rawTools.filter((t) => Boolean(t && typeof t === "object" && "name" in t)).slice(0, 50).map((t) => ({
				name: String(t.name),
				description: typeof t.description === "string" ? t.description.slice(0, 200) : void 0,
				inputSchema: t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : void 0
			}));
		}
		return res.json({
			ok: true,
			latencyMs,
			serverInfo,
			tools,
			message: `Connected to ${serverInfo.name || "MCP Server"} (${latencyMs}ms) · ${tools.length} tool(s) discovered.`
		});
	} catch (err) {
		const latencyMs = Math.max(1, Date.now() - startedAt);
		return res.status(502).json({
			ok: false,
			errorCode: "MCP_CONNECTION_ERROR",
			latencyMs,
			message: sanitizeErrorMsg(err)
		});
	} finally {
		clearTimeout(timer);
	}
});
/**
* POST /api/mcp/call-tool
* Invokes a discovered tool on an HTTP/SSE MCP endpoint via JSON-RPC `tools/call`.
*/
mcpRouter.post("/mcp/call-tool", async (req, res) => {
	const body = req.body || {};
	const urlOrCommand = String(body.urlOrCommand || "").trim();
	const toolName = String(body.toolName || "").trim();
	const toolArgs = body.arguments && typeof body.arguments === "object" ? body.arguments : {};
	if (!urlOrCommand || !toolName) return res.status(400).json({
		ok: false,
		error: "urlOrCommand and toolName are required"
	});
	const analysis = classifyMcpTransport(urlOrCommand, body.transport);
	if (!analysis.edgeSupported) return res.status(400).json({
		ok: false,
		errorCode: "EDGE_STDIO_UNSUPPORTED",
		error: analysis.reason
	});
	const ssrf = await verifyConnectionTargetSafe(urlOrCommand, {
		isCustomProvider: true,
		allowInsecureLocalhost: process.env.ALLOW_INSECURE_LOCALHOST === "true"
	});
	if (!ssrf.safe) return res.status(400).json({
		ok: false,
		error: ssrf.reason || "Blocked target URL"
	});
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 15e3);
	try {
		const headers = buildAuthHeaders(body);
		const rpcRes = await fetch(urlOrCommand, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: Date.now(),
				method: "tools/call",
				params: {
					name: toolName,
					arguments: toolArgs
				}
			}),
			signal: ctrl.signal
		});
		const parsed = await parseMcpResponseBody(rpcRes);
		if (!rpcRes.ok || parsed.error) return res.status(502).json({
			ok: false,
			error: parsed.error ? JSON.stringify(parsed.error) : `HTTP ${rpcRes.status}`
		});
		return res.json({
			ok: true,
			result: parsed.result ?? parsed
		});
	} catch (err) {
		return res.status(502).json({
			ok: false,
			error: sanitizeErrorMsg(err)
		});
	} finally {
		clearTimeout(timer);
	}
});
//#endregion
export { mcpRouter };
