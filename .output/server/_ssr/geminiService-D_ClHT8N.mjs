import { y as resolveServerEnvGeminiKey } from "./keyResolver-CxRLsCWX.mjs";
import { t as GoogleGenAI } from "../_libs/@google/genai.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/geminiService-D_ClHT8N.js
var GEMINI_TEXT_MODELS = [
	{
		id: "gemini-4-hydrogen",
		label: "Gemini 4 Hydrogen",
		tier: "free",
		description: "Fast general intelligence, reasoning, UI & code artifacts",
		supportsTemperature: false,
		defaultThinkingLevel: "MEDIUM",
		contextWindow: 1e6,
		maxOutputTokens: 32768
	},
	{
		id: "gemini-3.1-flash-lite",
		label: "Gemini 3.1 Flash Lite",
		tier: "free",
		description: "Ultra-fast lightweight model for quick tasks & summaries",
		supportsTemperature: true,
		defaultThinkingLevel: "LOW",
		contextWindow: 256e3,
		maxOutputTokens: 16384
	},
	{
		id: "gemini-4-neon",
		label: "Gemini 4 Neon",
		tier: "paid",
		description: "Balanced high-precision model for complex engineering (requires paid key)",
		supportsTemperature: false,
		defaultThinkingLevel: "MEDIUM",
		contextWindow: 1e6,
		maxOutputTokens: 32768
	},
	{
		id: "gemini-4-carbon",
		label: "Gemini 4 Carbon",
		tier: "paid",
		description: "Deep reasoning & architectural planning model (requires paid key)",
		supportsTemperature: false,
		defaultThinkingLevel: "HIGH",
		contextWindow: 1e6,
		maxOutputTokens: 32768
	}
];
function getServerGeminiApiKey() {
	return resolveServerEnvGeminiKey();
}
function isGeminiConfigured() {
	return getServerGeminiApiKey().length > 0;
}
function createGeminiClient(apiKeyOverride) {
	const apiKey = (apiKeyOverride || getServerGeminiApiKey()).trim();
	if (!apiKey) return null;
	return new GoogleGenAI({
		apiKey,
		httpOptions: { headers: { "User-Agent": "aistudio-build" } }
	});
}
function unwrapGeminiErrorMessage(err) {
	const raw = err instanceof Error ? err.message : String(err || "Unknown Gemini error");
	let httpStatus = Number(err?.status || err?.httpStatus || 0);
	let current = raw.trim();
	for (let depth = 0; depth < 4; depth += 1) {
		if (!current.startsWith("{") && !current.startsWith("[")) break;
		try {
			const parsed = JSON.parse(current);
			const nested = parsed && typeof parsed.error === "object" && parsed.error !== null ? parsed.error : parsed;
			const code = Number(nested?.code || nested?.statusCode || 0);
			if (code >= 100 && !httpStatus) httpStatus = code;
			if (typeof nested?.message === "string" && nested.message.trim()) {
				current = nested.message.trim();
				continue;
			}
			if (typeof parsed?.message === "string" && parsed.message.trim()) {
				current = parsed.message.trim();
				continue;
			}
			break;
		} catch {
			break;
		}
	}
	const inlineCodeMatch = raw.match(/"code"\s*:\s*(\d{3})/) || raw.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
	if (!httpStatus && inlineCodeMatch) httpStatus = Number(inlineCodeMatch[1]);
	const inlineMsgMatch = current.match(/"message"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/);
	if ((current.startsWith("{") || current.includes("{\\n") || current.includes("\"error\":")) && inlineMsgMatch?.[1]) current = inlineMsgMatch[1].replace(/\\n/g, " ").replace(/\\"/g, "\"").trim();
	return {
		cleanText: current.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim(),
		httpStatus
	};
}
function classifyGeminiError(err) {
	if (err instanceof Error && (err.name === "AbortError" || /\babort(?:ed)?\b|\bcancel(?:led)?\b/i.test(err.message))) return {
		code: "ABORTED",
		httpStatus: 499,
		retryable: false,
		message: "Generation stopped."
	};
	const raw = err instanceof Error ? err.message : String(err || "Unknown Gemini error");
	const { cleanText, httpStatus: status } = unwrapGeminiErrorMessage(err);
	const haystack = `${raw} ${cleanText}`;
	if (status === 429 || /rate limit|quota|resource_exhausted|too many requests/i.test(haystack)) return {
		code: "RATE_LIMITED",
		httpStatus: 429,
		retryable: true,
		message: "Rate limit reached on Gemini API (HTTP 429). Please wait a moment and try again."
	};
	if (status === 401 || status === 403 || /api key|permission_denied|unauthenticated/i.test(haystack)) return {
		code: "INTEGRATION_REQUIRED",
		httpStatus: status || 403,
		retryable: false,
		message: `Integration required: Valid Gemini API access is needed (${cleanText.slice(0, 140)}).`
	};
	if (status === 400 || /invalid_argument/i.test(haystack)) return {
		code: "BAD_REQUEST",
		httpStatus: 400,
		retryable: false,
		message: `Gemini API rejected request parameters: ${cleanText.slice(0, 180)}`
	};
	if (/fetch failed|econn|enotfound|etimedout|network|socket|timed out|stalled/i.test(haystack)) return {
		code: "NETWORK_ERROR",
		httpStatus: 504,
		retryable: true,
		message: "Connection to Gemini AI timed out. Please try again."
	};
	if (status === 503 || /unavailable|high demand|overloaded/i.test(haystack)) return {
		code: "SERVER_ERROR",
		httpStatus: 503,
		retryable: true,
		message: "AI server is temporarily busy (HTTP 503). Please try again in a few seconds."
	};
	return {
		code: "SERVER_ERROR",
		httpStatus: status || 502,
		retryable: status >= 500 || status === 404 || status === 0,
		message: (cleanText || "Temporary AI service error. Please retry.").slice(0, 220)
	};
}
async function generateOrEditGeminiImage(params) {
	const ai = createGeminiClient();
	const modelId = params.model || "gemini-3.1-flash-lite-image";
	if (!ai) return {
		ok: false,
		error: {
			code: "INTEGRATION_REQUIRED",
			httpStatus: 503,
			retryable: false,
			message: "Integration required: GEMINI_API_KEY is required on the server for Gemini Image Generation & Editing."
		}
	};
	try {
		const parts = [{ text: params.prompt }];
		if (params.referenceImageBase64) {
			const cleanB64 = params.referenceImageBase64.includes(",") ? params.referenceImageBase64.split(",")[1] || "" : params.referenceImageBase64;
			if (cleanB64) parts.push({ inlineData: {
				mimeType: params.referenceImageMimeType || "image/png",
				data: cleanB64
			} });
		}
		const respParts = (await ai.models.generateContent({
			model: modelId,
			contents: [{
				role: "user",
				parts
			}],
			config: {
				responseModalities: ["IMAGE"],
				...params.aspectRatio ? { imageConfig: { aspectRatio: params.aspectRatio } } : {}
			}
		})).candidates?.[0]?.content?.parts || [];
		for (const part of respParts) if (part?.inlineData?.data) return {
			ok: true,
			url: `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`,
			modelUsed: modelId
		};
		return {
			ok: false,
			error: {
				code: "EMPTY_RESPONSE",
				httpStatus: 502,
				retryable: true,
				message: "Gemini image model did not return an image payload."
			}
		};
	} catch (err) {
		return {
			ok: false,
			error: classifyGeminiError(err)
		};
	}
}
//#endregion
export { generateOrEditGeminiImage as n, isGeminiConfigured as r, GEMINI_TEXT_MODELS as t };
