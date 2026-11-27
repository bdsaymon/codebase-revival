import { i as isEncrypted, n as encryptSecret, t as decryptSecret } from "./secureKeystore-BznpBYUb.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/dbBridge-CysaMxOA.js
var DB_CONNECTIONS_STORAGE_KEY = "smfta_db_connections";
var DB_BRIDGE_CONFIG_STORAGE_KEY = "smfta_db_bridge_config";
/**
* Classifies a database endpoint or connection URI for Cloudflare edge runtime
* compatibility. HTTP/HTTPS REST endpoints (PostgREST, Supabase REST, Neon HTTP,
* Firestore REST, custom REST bridges) work cleanly; raw TCP protocols
* (`postgres://`, `mysql://`, `mongodb://`) require a gateway on Workers.
*/
function classifyDbTransport(endpointOrUri, kind) {
	const raw = String(endpointOrUri || "").trim();
	if (/^https?:\/\//i.test(raw)) return {
		transportMode: "http_rest",
		edgeSupported: true
	};
	if (/^(postgres(ql)?|mysql|mariadb|mongodb(\+srv)?|redis):\/\//i.test(raw)) return {
		transportMode: "direct_tcp",
		edgeSupported: false,
		reason: `Direct TCP connections (${kind || "SQL/NoSQL"} URI) are blocked on Cloudflare Workers edge runtime. Provide an HTTPS REST / PostgREST / Data API gateway URL instead.`
	};
	return {
		transportMode: "http_rest",
		edgeSupported: Boolean(raw),
		reason: raw ? void 0 : "Endpoint URL is required."
	};
}
/**
* Pure deterministic field mapper & transformer for Data Bridge record synchronization.
*/
function mapBridgeRecord(sourceRecord, mappings) {
	if (!mappings || mappings.length === 0) return { ...sourceRecord };
	const result = {};
	for (const mapping of mappings) {
		const src = mapping.sourceField.trim();
		const dst = mapping.targetField.trim();
		if (!src || !dst) continue;
		let val = sourceRecord[src];
		switch (mapping.transform) {
			case "trim":
				if (typeof val === "string") val = val.trim();
				break;
			case "lowercase":
				if (typeof val === "string") val = val.trim().toLowerCase();
				break;
			case "uppercase":
				if (typeof val === "string") val = val.trim().toUpperCase();
				break;
			case "string":
				val = val === void 0 || val === null ? "" : String(val);
				break;
			case "number":
				val = typeof val === "number" ? val : Number(val ?? 0);
				if (!Number.isFinite(val)) val = 0;
		}
		result[dst] = val;
	}
	return result;
}
async function loadDbConnections() {
	if (typeof localStorage === "undefined") return [];
	try {
		const raw = localStorage.getItem(DB_CONNECTIONS_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const list = [];
		for (const item of parsed) {
			if (!item || typeof item !== "object") continue;
			const conn = item;
			let secret = typeof conn.secret === "string" ? conn.secret : "";
			if (secret && isEncrypted(secret)) try {
				secret = await decryptSecret(secret);
			} catch {
				secret = "";
			}
			const endpointOrUri = String(conn.endpointOrUri || "").trim();
			const analysis = classifyDbTransport(endpointOrUri, conn.kind);
			list.push({
				id: String(conn.id || `db-${Date.now()}`),
				name: String(conn.name || "Database").slice(0, 120),
				kind: conn.kind || "supabase",
				endpointOrUri,
				authHeaderOrKeyName: conn.authHeaderOrKeyName || void 0,
				secret,
				enabled: conn.enabled !== false,
				transportMode: analysis.transportMode,
				status: conn.status || (analysis.edgeSupported ? "untested" : "edge_blocked"),
				statusMessage: conn.statusMessage || analysis.reason,
				lastTestedAt: typeof conn.lastTestedAt === "number" ? conn.lastTestedAt : void 0,
				latencyMs: typeof conn.latencyMs === "number" ? conn.latencyMs : void 0,
				tables: Array.isArray(conn.tables) ? conn.tables : []
			});
		}
		return list;
	} catch {
		return [];
	}
}
async function saveDbConnections(connections) {
	if (typeof localStorage === "undefined") return;
	const sealed = await Promise.all(connections.map(async (conn) => ({
		...conn,
		secret: conn.secret ? await encryptSecret(conn.secret) : ""
	})));
	localStorage.setItem(DB_CONNECTIONS_STORAGE_KEY, JSON.stringify(sealed));
}
function loadDataBridgeConfig() {
	const fallback = {
		sourceConnectionId: "",
		destinationConnectionId: "",
		sourceTable: "",
		destinationTable: "",
		syncMode: "upsert",
		fieldMappings: []
	};
	if (typeof localStorage === "undefined") return fallback;
	try {
		const raw = localStorage.getItem(DB_BRIDGE_CONFIG_STORAGE_KEY);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw);
		return {
			sourceConnectionId: String(parsed.sourceConnectionId || ""),
			destinationConnectionId: String(parsed.destinationConnectionId || ""),
			sourceTable: String(parsed.sourceTable || ""),
			destinationTable: String(parsed.destinationTable || ""),
			syncMode: parsed.syncMode === "append" ? "append" : "upsert",
			fieldMappings: Array.isArray(parsed.fieldMappings) ? parsed.fieldMappings : [],
			lastSyncAt: typeof parsed.lastSyncAt === "number" ? parsed.lastSyncAt : void 0,
			lastSyncStatus: typeof parsed.lastSyncStatus === "string" ? parsed.lastSyncStatus : void 0,
			lastSyncCount: typeof parsed.lastSyncCount === "number" ? parsed.lastSyncCount : void 0
		};
	} catch {
		return fallback;
	}
}
function saveDataBridgeConfig(config) {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(DB_BRIDGE_CONFIG_STORAGE_KEY, JSON.stringify(config));
	} catch {}
}
//#endregion
export { loadDbConnections as a, saveDbConnections as c, loadDataBridgeConfig as i, DB_CONNECTIONS_STORAGE_KEY as n, mapBridgeRecord as o, classifyDbTransport as r, saveDataBridgeConfig as s, DB_BRIDGE_CONFIG_STORAGE_KEY as t };
