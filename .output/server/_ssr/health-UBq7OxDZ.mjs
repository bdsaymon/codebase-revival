import { t as APP_VERSION } from "./version-DomTpKw0.mjs";
import { p as timingSafeTokenEqual } from "./security-BYIeBrUe.mjs";
import { Router } from "./express-DfD0yhJD.mjs";
import { _ as resolveGeminiApiKey } from "./keyResolver-CxRLsCWX.mjs";
import { a as getSharedHardenedEngine } from "./aiClient-eW2qmRky.mjs";
import { a as getNeuralStatus, o as getResponseCacheSize } from "./intentRules-h5lRGT_x.mjs";
import { uidSessionStore } from "./chat-DfRAz8i8.mjs";
import { r as isGeminiConfigured, t as GEMINI_TEXT_MODELS } from "./geminiService-D_ClHT8N.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/health-UBq7OxDZ.js
var healthRouter = Router();
var killSwitchAuditLog = [];
healthRouter.get("/health", (req, res) => {
	const engineHealth = getSharedHardenedEngine().getHealth();
	const neural = getNeuralStatus();
	const resolvedReqKey = resolveGeminiApiKey(req);
	const geminiConfigured = isGeminiConfigured() || Boolean(resolvedReqKey.apiKey);
	const adminTokenConfigured = Boolean(process.env.AI_ADMIN_TOKEN?.trim());
	const appUrlConfigured = Boolean(process.env.APP_URL?.trim());
	const envStatus = {
		geminiApiKey: geminiConfigured,
		appUrl: appUrlConfigured,
		aiAdminToken: adminTokenConfigured,
		supabaseUrl: Boolean(process.env.SUPABASE_URL?.trim()),
		supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
		viteSupabaseUrl: Boolean(process.env.VITE_SUPABASE_URL?.trim()),
		viteSupabasePublishableKey: Boolean(process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()),
		googleClientId: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
		googleClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
		githubClientId: Boolean(process.env.GITHUB_CLIENT_ID?.trim()),
		githubClientSecret: Boolean(process.env.GITHUB_CLIENT_SECRET?.trim())
	};
	return res.json({
		ok: true,
		status: engineHealth.killSwitchEnabled ? "online" : "maintenance",
		version: APP_VERSION,
		engine: `SMFTA Neural Core v${APP_VERSION}`,
		geminiConfigured,
		geminiServerKeyConfigured: geminiConfigured,
		keySource: resolvedReqKey.source,
		corsEnabled: true,
		vercelCompatible: true,
		adminTokenConfigured,
		appUrlConfigured,
		envStatus,
		geminiModels: GEMINI_TEXT_MODELS,
		killSwitchEnabled: engineHealth.killSwitchEnabled,
		serverKeyDailyCap: engineHealth.serverKeyDailyCap,
		serverKeyDailyCount: engineHealth.serverKeyDailyCount,
		serverKeyBudgetReached: engineHealth.serverKeyBudgetReached,
		cacheEntries: getResponseCacheSize(),
		activeUidSessions: uidSessionStore.size,
		trainedPairs: neural.weights.pairsLearned
	});
});
healthRouter.post("/health/live-check", async (req, res) => {
	const apiKey = resolveGeminiApiKey(req).apiKey;
	let geminiChatOk = false;
	let geminiChatMessage = "GEMINI_API_KEY সেট করা নেই";
	let geminiTtsOk = false;
	let geminiTtsMessage = "GEMINI_API_KEY সেট করা নেই";
	let supabaseOk = false;
	let supabaseMessage = "SUPABASE_URL বা VITE_SUPABASE_URL সেট করা নেই";
	if (apiKey) {
		try {
			const { GoogleGenAI, ThinkingLevel } = await import("../_libs/@google/genai.mjs").then((n) => n.i);
			const ai = new GoogleGenAI({
				apiKey,
				httpOptions: { headers: { "User-Agent": "aistudio-build" } }
			});
			const candidateModels = [
				"gemini-3.1-flash-lite",
				"gemini-4-hydrogen",
				"gemini-3-flash-preview",
				"gemini-flash-lite-latest"
			];
			let lastErrMsg = "";
			for (const candidateModel of candidateModels) try {
				const resp = await ai.models.generateContent({
					model: candidateModel,
					contents: "শুধু \"ঠিক\" শব্দটি লেখো।",
					config: {
						maxOutputTokens: 128,
						thinkingConfig: { thinkingLevel: candidateModel === "gemini-3.1-flash-lite" || candidateModel === "gemini-flash-lite-latest" ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW }
					}
				});
				if (resp?.text && resp.text.trim().length > 0) {
					geminiChatOk = true;
					geminiChatMessage = `Gemini generateContent (${candidateModel}) সফল (✓)`;
					break;
				}
			} catch (innerErr) {
				lastErrMsg = innerErr instanceof Error ? innerErr.message.slice(0, 80) : "Error";
			}
			if (!geminiChatOk) geminiChatMessage = lastErrMsg ? `Gemini কল ব্যর্থ (${lastErrMsg.replace(/AIza[\w-]+/g, "[REDACTED]")})` : "Gemini উত্তর খালি এসেছে";
		} catch (err) {
			geminiChatMessage = `Gemini কল ব্যর্থ (${(err instanceof Error ? err.message.slice(0, 80) : "Error").replace(/AIza[\w-]+/g, "[REDACTED]")})`;
		}
		try {
			const { GoogleGenAI, Modality } = await import("../_libs/@google/genai.mjs").then((n) => n.i);
			const ai = new GoogleGenAI({
				apiKey,
				httpOptions: { headers: { "User-Agent": "aistudio-build" } }
			});
			let livePcmBytes = 0;
			await new Promise((resolve, reject) => {
				const timer = setTimeout(() => reject(/* @__PURE__ */ new Error("Live TTS timeout")), 5500);
				let sessionRef = null;
				ai.live.connect({
					model: "gemini-3.8-live",
					config: {
						responseModalities: [Modality.AUDIO],
						systemInstruction: "Repeat the text verbatim."
					},
					callbacks: {
						onopen: () => {},
						onmessage: (msg) => {
							const parts = msg?.serverContent?.modelTurn?.parts;
							if (Array.isArray(parts)) {
								for (const p of parts) if (p?.inlineData?.data) livePcmBytes += p.inlineData.data.length;
							}
							if (livePcmBytes > 100 || msg?.serverContent?.turnComplete) {
								clearTimeout(timer);
								try {
									sessionRef?.close?.();
								} catch {}
								resolve();
							}
						},
						onerror: (e) => {
							clearTimeout(timer);
							reject(e instanceof Error ? e : /* @__PURE__ */ new Error("Live error"));
						},
						onclose: () => {
							clearTimeout(timer);
							resolve();
						}
					}
				}).then((s) => {
					sessionRef = s;
					s.sendClientContent({
						turns: [{
							role: "user",
							parts: [{ text: "হ্যালো" }]
						}],
						turnComplete: true
					});
				}).catch((e) => {
					clearTimeout(timer);
					reject(e);
				});
			});
			if (livePcmBytes > 0) {
				geminiTtsOk = true;
				geminiTtsMessage = "Gemini Live TTS (gemini-3.8-live) সচল (✓)";
			} else geminiTtsMessage = "Gemini TTS ০ বাইট অডিও দিয়েছে";
		} catch {
			geminiTtsMessage = "Gemini TTS সংযোগ পরীক্ষা ব্যর্থ";
		}
	}
	const sbUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
	const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
	if (sbUrl && sbKey) try {
		const cleanUrl = sbUrl.replace(/\/+$/, "");
		const sbRes = await fetch(`${cleanUrl}/rest/v1/`, {
			method: "GET",
			headers: {
				apikey: sbKey,
				Authorization: `Bearer ${sbKey}`
			}
		});
		if (sbRes.ok || sbRes.status === 200) {
			supabaseOk = true;
			supabaseMessage = "Supabase ডাটাবেস সংযোগ সচল (✓)";
		} else supabaseMessage = `Supabase HTTP ${sbRes.status}`;
	} catch {
		supabaseMessage = "Supabase সার্ভারে পৌঁছানো যায়নি";
	}
	return res.json({
		ok: true,
		checks: {
			geminiChat: {
				ok: geminiChatOk,
				message: geminiChatMessage
			},
			geminiTts: {
				ok: geminiTtsOk,
				message: geminiTtsMessage
			},
			supabase: {
				ok: supabaseOk,
				message: supabaseMessage
			}
		}
	});
});
healthRouter.get("/models/status", (_req, res) => {
	const geminiConfigured = isGeminiConfigured();
	return res.json({
		ok: true,
		geminiConfigured,
		models: GEMINI_TEXT_MODELS,
		message: geminiConfigured ? "Gemini API connected via server secret." : "Integration required: GEMINI_API_KEY is not configured in server secrets."
	});
});
healthRouter.get("/ai/health", (req, res) => {
	const adminToken = (process.env.AI_ADMIN_TOKEN || "").trim();
	{
		if (!adminToken) return res.status(503).json({
			ok: false,
			error: "AI_ADMIN_TOKEN is not configured; failing closed."
		});
		const provided = String(req.headers["x-admin-token"] || req.headers["authorization"]?.replace(/^Bearer\s+/i, "") || "").trim();
		if (!timingSafeTokenEqual(provided, adminToken)) return res.status(401).json({
			ok: false,
			error: "Unauthorized"
		});
	}
	const engine = getSharedHardenedEngine();
	return res.json({
		ok: true,
		persistence: engine.storage.persistenceMode,
		...engine.getHealth()
	});
});
healthRouter.post("/ai/kill-switch", (req, res) => {
	const adminToken = (process.env.AI_ADMIN_TOKEN || "").trim();
	{
		if (!adminToken) return res.status(503).json({
			ok: false,
			error: "AI_ADMIN_TOKEN is not configured; failing closed."
		});
		const provided = String(req.headers["x-admin-token"] || req.headers["authorization"]?.replace(/^Bearer\s+/i, "") || "").trim();
		if (!timingSafeTokenEqual(provided, adminToken)) return res.status(401).json({
			ok: false,
			error: "Unauthorized"
		});
	}
	const { enabled } = req.body || {};
	if (typeof enabled !== "boolean") return res.status(400).json({
		ok: false,
		error: "enabled (boolean) is required"
	});
	const engine = getSharedHardenedEngine();
	const previousState = engine.storage.isKillSwitchEnabled();
	engine.setGlobalKillSwitch(!enabled);
	const newState = engine.storage.isKillSwitchEnabled();
	const auditEntry = {
		actor: adminToken ? "authenticated-admin" : "local-dev",
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		previousState,
		newState
	};
	killSwitchAuditLog.push(auditEntry);
	if (killSwitchAuditLog.length > 200) killSwitchAuditLog.shift();
	return res.json({
		ok: true,
		engine_enabled: newState,
		killSwitchEnabled: newState,
		updatedAt: auditEntry.timestamp
	});
});
//#endregion
export { healthRouter, killSwitchAuditLog };
