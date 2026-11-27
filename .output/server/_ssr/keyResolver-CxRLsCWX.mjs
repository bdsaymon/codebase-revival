import { r as maskAndNormalizeIdentityOutput, t as CREATOR_NAME } from "./creatorIdentity-TTkWUL_b.mjs";
import crypto from "node:crypto";
//#region node_modules/.nitro/vite/services/ssr/assets/keyResolver-CxRLsCWX.js
/**
* Multi-Provider OpenAI-Compatible & Keyless Router Registry
* Supports all providers from Phase 3.1 & 3.2 with real model IDs and
* URL-safe keyless prompt construction.
*/
var POLLINATIONS_OPENAI_URL = "https://text.pollinations.ai/openai";
var POLLINATIONS_TEXT_BASE_URL = "https://text.pollinations.ai/";
var CODECRAFT_BASE_URL = "https://codecraftapi.com/v1";
var CODECRAFT_CHAT_URL = `${CODECRAFT_BASE_URL}/chat/completions`;
`${CODECRAFT_BASE_URL}`;
var CODECRAFT_FALLBACK_MODELS = [
	"gemini-3.8-flash",
	"deepseek-v4-flash-0731",
	"claude-sonnet-5",
	"claude-opus-4.8"
];
function resolveGroqModel(requestedModel) {
	const clean = (requestedModel || "").trim();
	if (!clean) return "llama-3.3-70b-versatile";
	const lower = clean.toLowerCase();
	if (lower.startsWith("llama-") || lower.startsWith("llama3") || lower.startsWith("mixtral-") || lower.startsWith("gemma") || lower.startsWith("qwen") || lower.startsWith("deepseek-r1-distill") || lower.startsWith("whisper-") || lower.startsWith("openai/gpt-oss-") || lower.startsWith("meta-llama/") || lower.startsWith("moonshotai/")) return clean;
	if (/\b(flash|fast|lite|mini|nano|instant)\b/i.test(lower) || lower === "smfta-v5") return "llama-3.1-8b-instant";
	return "llama-3.3-70b-versatile";
}
var PROVIDER_ENDPOINTS = {
	xrahat: {
		id: "xrahat",
		name: "SMFTA Core Engine (Built-in Keyless)",
		url: POLLINATIONS_OPENAI_URL,
		defaultModel: "openai",
		keyless: true
	},
	unorouter: {
		id: "unorouter",
		name: "UnoRouter",
		url: "https://api.unorouter.com/v1/chat/completions",
		defaultModel: "google/gemini-3.8-flash",
		fallbackModels: ["openai/gpt-4o-mini", "deepseek/deepseek-chat"]
	},
	codecraft: {
		id: "codecraft",
		name: "CodeCraft API",
		url: CODECRAFT_CHAT_URL,
		defaultModel: "gemini-3.8-flash",
		fallbackModels: [...CODECRAFT_FALLBACK_MODELS]
	},
	openrouter: {
		id: "openrouter",
		name: "OpenRouter",
		url: "https://openrouter.ai/api/v1/chat/completions",
		defaultModel: "google/gemini-3.8-flash",
		fallbackModels: ["openai/gpt-4o-mini", "deepseek/deepseek-chat"],
		headers: {
			"HTTP-Referer": "https://smfta.local",
			"X-Title": "SMFTA AI Pro"
		}
	},
	groq: {
		id: "groq",
		name: "Groq Cloud",
		url: "https://api.groq.com/openai/v1/chat/completions",
		defaultModel: "llama-3.3-70b-versatile",
		fallbackModels: [
			"llama-3.3-70b-versatile",
			"llama-3.1-8b-instant",
			"llama-3.3-70b-specdec"
		]
	},
	deepseek: {
		id: "deepseek",
		name: "DeepSeek",
		url: "https://api.deepseek.com/v1/chat/completions",
		defaultModel: "deepseek-chat",
		fallbackModels: ["deepseek-reasoner"]
	},
	openai: {
		id: "openai",
		name: "OpenAI",
		url: "https://api.openai.com/v1/chat/completions",
		defaultModel: "gpt-4o-mini",
		fallbackModels: ["gpt-4o"]
	},
	anthropic: {
		id: "anthropic",
		name: "Anthropic Claude",
		url: "https://api.anthropic.com/v1/messages",
		defaultModel: "claude-sonnet-4-20250514",
		fallbackModels: ["claude-3-5-haiku-latest"],
		protocol: "anthropic_native"
	},
	gemini_custom: {
		id: "gemini_custom",
		name: "Google Gemini (Native)",
		url: "https://generativelanguage.googleapis.com/v1beta",
		defaultModel: "gemini-3-flash-preview",
		fallbackModels: [
			"gemini-3-flash-preview",
			"gemini-3.1-flash-lite",
			"gemini-3.5-flash-lite"
		],
		protocol: "gemini_native"
	},
	gemini_openai: {
		id: "gemini_openai",
		name: "Google Gemini (OpenAI Endpoint)",
		url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
		defaultModel: "gemini-3-flash-preview",
		fallbackModels: [
			"gemini-3-flash-preview",
			"gemini-3.1-flash-lite",
			"gemini-3.5-flash-lite"
		]
	},
	mistral: {
		id: "mistral",
		name: "Mistral AI",
		url: "https://api.mistral.ai/v1/chat/completions",
		defaultModel: "mistral-small-latest",
		fallbackModels: ["mistral-large-latest"]
	},
	fireworks: {
		id: "fireworks",
		name: "Fireworks AI",
		url: "https://api.fireworks.ai/inference/v1/chat/completions",
		defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct"
	},
	together: {
		id: "together",
		name: "Together AI",
		url: "https://api.together.xyz/v1/chat/completions",
		defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo"
	},
	perplexity: {
		id: "perplexity",
		name: "Perplexity Sonar",
		url: "https://api.perplexity.ai/chat/completions",
		defaultModel: "sonar",
		fallbackModels: ["sonar-pro"]
	},
	xai: {
		id: "xai",
		name: "xAI (Grok)",
		url: "https://api.x.ai/v1/chat/completions",
		defaultModel: "grok-2-latest"
	},
	cerebras: {
		id: "cerebras",
		name: "Cerebras",
		url: "https://api.cerebras.ai/v1/chat/completions",
		defaultModel: "llama-3.3-70b"
	},
	sambanova: {
		id: "sambanova",
		name: "SambaNova",
		url: "https://api.sambanova.ai/v1/chat/completions",
		defaultModel: "Meta-Llama-3.3-70B-Instruct"
	},
	nvidia: {
		id: "nvidia",
		name: "NVIDIA NIM",
		url: "https://integrate.api.nvidia.com/v1/chat/completions",
		defaultModel: "meta/llama-3.3-70b-instruct"
	},
	github: {
		id: "github",
		name: "GitHub Models",
		url: "https://models.inference.ai.azure.com/chat/completions",
		defaultModel: "gpt-4o-mini",
		fallbackModels: ["gpt-4o"]
	},
	huggingface: {
		id: "huggingface",
		name: "Hugging Face Inference",
		url: "https://router.huggingface.co/v1/chat/completions",
		defaultModel: "Qwen/Qwen2.5-72B-Instruct"
	},
	novita: {
		id: "novita",
		name: "Novita AI",
		url: "https://api.novita.ai/v3/openai/chat/completions",
		defaultModel: "deepseek/deepseek-r1"
	},
	hyperbolic: {
		id: "hyperbolic",
		name: "Hyperbolic",
		url: "https://api.hyperbolic.xyz/v1/chat/completions",
		defaultModel: "meta-llama/Llama-3.3-70B-Instruct"
	},
	chutes: {
		id: "chutes",
		name: "Chutes AI",
		url: "https://llm.chutes.ai/v1/chat/completions",
		defaultModel: "deepseek-ai/DeepSeek-V3"
	},
	scaleway: {
		id: "scaleway",
		name: "Scaleway Generative APIs",
		url: "https://api.scaleway.ai/v1/chat/completions",
		defaultModel: "llama-3.3-70b-instruct"
	},
	nebius: {
		id: "nebius",
		name: "Nebius AI Studio",
		url: "https://api.studio.nebius.ai/v1/chat/completions",
		defaultModel: "meta-llama/Llama-3.3-70B-Instruct"
	},
	cohere: {
		id: "cohere",
		name: "Cohere Compatibility API",
		url: "https://api.cohere.ai/compatibility/v1/chat/completions",
		defaultModel: "command-r-plus-08-2024",
		fallbackModels: ["command-r-08-2024"]
	},
	cloudflare: {
		id: "cloudflare",
		name: "Cloudflare Workers AI",
		url: "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1/chat/completions",
		defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
	},
	mercury: {
		id: "mercury",
		name: "Mercury (Inception Labs)",
		url: "https://api.inceptionlabs.ai/v1/chat/completions",
		defaultModel: "mercury-3",
		fallbackModels: [
			"mercury-3",
			"mercury",
			"mercury-coder",
			"mercury-2"
		]
	},
	inceptionlabs: {
		id: "inceptionlabs",
		name: "Inception Labs (Mercury)",
		url: "https://api.inceptionlabs.ai/v1/chat/completions",
		defaultModel: "mercury-3",
		fallbackModels: [
			"mercury-3",
			"mercury",
			"mercury-coder",
			"mercury-2"
		]
	},
	lmstudio: {
		id: "lmstudio",
		name: "LM Studio (Local Keyless)",
		url: "http://localhost:1234/v1/chat/completions",
		defaultModel: "local-model",
		keyless: true
	},
	ollama: {
		id: "ollama",
		name: "Ollama (Local Keyless)",
		url: "http://localhost:11434/v1/chat/completions",
		defaultModel: "llama3.2",
		keyless: true
	}
};
function isKeylessProvider(provider) {
	if (!provider) return false;
	return Boolean(PROVIDER_ENDPOINTS[provider]?.keyless) || provider === "custom";
}
/**
* Inspect an API key's well-known prefix to figure out which provider issued it.
* Returns null when the key format is ambiguous or unknown.
*/
function detectProviderFromKey(apiKey) {
	const key = (apiKey || "").trim();
	if (!key) return null;
	if (key.startsWith("AIza") || key.startsWith("AQ.")) return "gemini_custom";
	if (key.startsWith("sk-ant-")) return "anthropic";
	if (key.startsWith("gsk_")) return "groq";
	if (key.startsWith("sk-or-")) return "openrouter";
	if (key.startsWith("nvapi-")) return "nvidia";
	if (key.startsWith("ghp_") || key.startsWith("github_pat_")) return "github";
	if (key.startsWith("xai-")) return "xai";
	if (key.startsWith("csk-")) return "cerebras";
	if (key.startsWith("fw_")) return "fireworks";
	if (key.startsWith("pplx-")) return "perplexity";
	if (key.startsWith("hf_")) return "huggingface";
	if (key.startsWith("cc_")) return "codecraft";
	if (key.startsWith("sk-proj-") || key.startsWith("sk-svcacct-")) return "openai";
	return null;
}
function detectProviderFromBaseUrl(baseUrl) {
	const cleanBase = (baseUrl || "").trim().toLowerCase();
	if (!cleanBase) return null;
	if (cleanBase.includes("codecraftapi.com")) return "codecraft";
	if (cleanBase.includes("inceptionlabs.ai")) return "custom";
	if (cleanBase.includes("openrouter.ai")) return "openrouter";
	if (cleanBase.includes("unorouter.com")) return "unorouter";
	if (cleanBase.includes("api.groq.com")) return "groq";
	if (cleanBase.includes("api.deepseek.com")) return "deepseek";
	if (cleanBase.includes("api.openai.com")) return "openai";
	if (cleanBase.includes("generativelanguage.googleapis.com")) return cleanBase.includes("/openai") ? "gemini_openai" : "gemini_custom";
	if (cleanBase.includes("api.anthropic.com")) return "anthropic";
	if (cleanBase.includes("api.cerebras.ai")) return "cerebras";
	if (cleanBase.includes("api.mistral.ai")) return "mistral";
	if (cleanBase.includes("api.together.xyz")) return "together";
	if (cleanBase.includes("api.fireworks.ai")) return "fireworks";
	if (cleanBase.includes("api.perplexity.ai")) return "perplexity";
	if (cleanBase.includes("api.sambanova.ai")) return "sambanova";
	if (cleanBase.includes("api.x.ai")) return "xai";
	if (cleanBase.includes("models.inference.ai.azure.com")) return "github";
	if (cleanBase.includes("integrate.api.nvidia.com")) return "nvidia";
	if (cleanBase.includes("router.huggingface.co")) return "huggingface";
	if (cleanBase.includes("api.novita.ai")) return "novita";
	if (cleanBase.includes("api.hyperbolic.xyz")) return "hyperbolic";
	if (cleanBase.includes("llm.chutes.ai")) return "chutes";
	if (cleanBase.includes("api.scaleway.ai")) return "scaleway";
	if (cleanBase.includes("api.studio.nebius.ai")) return "nebius";
	if (cleanBase.includes("api.cohere.ai")) return "cohere";
	if (cleanBase.includes("api.cloudflare.com")) return "cloudflare";
	if (cleanBase.includes("11434")) return "ollama";
	if (cleanBase.includes("1234")) return "lmstudio";
	return null;
}
function resolveEffectiveProvider(requestedProvider, keys, baseUrl) {
	const cleanProvider = (requestedProvider || "").trim();
	const firstKey = (keys[0] || "").trim();
	const cleanBase = (baseUrl || "").trim().toLowerCase();
	if (cleanBase.includes("codecraftapi.com") || cleanProvider === "custom" && !cleanBase && firstKey.startsWith("cc_")) return "codecraft";
	if (firstKey.startsWith("gsk_") && cleanProvider !== "ollama" && cleanProvider !== "lmstudio" && (cleanProvider !== "custom" || !cleanBase || cleanBase.includes("api.groq.com"))) return "groq";
	if ((firstKey.startsWith("AIza") || firstKey.startsWith("AQ.")) && cleanProvider !== "ollama" && cleanProvider !== "lmstudio" && (cleanProvider !== "custom" || !cleanBase || cleanBase.includes("generativelanguage.googleapis.com"))) {
		if (cleanProvider === "gemini_openai" || cleanBase.includes("/openai")) return "gemini_openai";
		if (!cleanBase || cleanBase.includes("generativelanguage.googleapis.com")) return "gemini_custom";
	}
	if (cleanProvider === "custom" || cleanProvider === "ollama" || cleanProvider === "lmstudio" || cleanProvider === "gemini_openai") return cleanProvider;
	const detectedFromUrl = detectProviderFromBaseUrl(cleanBase);
	const detected = detectProviderFromKey(firstKey);
	if (!cleanProvider || cleanProvider === "smfta_cloud" || cleanProvider === "xrahat") {
		if (detected) return detected;
		if (detectedFromUrl) return detectedFromUrl;
		if (firstKey) return cleanBase ? "custom" : "openai";
		return cleanProvider || "xrahat";
	}
	return cleanProvider;
}
function buildXrahatUrl(promptText, _uid, _stream) {
	const clipped = (promptText || "").trim().slice(0, 1800);
	return `${POLLINATIONS_TEXT_BASE_URL}${encodeURIComponent(clipped)}?model=openai`;
}
function compactXrahatSystemHeader(rawSystemInstruction, hasBengaliUserText = true) {
	const raw = (rawSystemInstruction || "").trim();
	if (!raw) return "System: You are SMFTA AI Pro (SMFTA Pro), the dedicated AI assistant of the SMFTA AI Pro platform.";
	if (raw.length <= 260) return `System: ${raw}`;
	const lines = [/Reply strictly in clear, warm, natural conversational English|Reply ONLY in clear, natural English/i.test(raw) || !hasBengaliUserText && !/Reply in pure, natural everyday colloquial Bengali|ONLY in natural, fluent Bengali/i.test(raw) ? `System: You are SMFTA AI Pro, created by ${CREATOR_NAME}. NEVER mention Google, Gemini, OpenAI, Anthropic, Claude, or third-party vendors as your creator/model. Speak naturally and warmly like a real human expert friend. STRICTLY FORBIDDEN robotic phrases: "As an AI language model", "Certainly!", "Sure!", "How may I assist you today?". Reply strictly in clear, natural conversational English.` : `System: You are SMFTA AI Pro, created by ${CREATOR_NAME}. NEVER mention Google, Gemini, OpenAI, Anthropic, Claude, or third-party vendors as your creator/model. Speak naturally and warmly like a real human expert friend in natural everyday colloquial Bengali (স্বাভাবিক চলিত বাংলা) while keeping technical terms (API, key, token, server, code, database) in English. STRICTLY FORBIDDEN robotic phrases: "আমি একটি এআই ভাষা মডেল", "অবশ্যই!", "নিশ্চিতভাবে", "আপনাকে কীভাবে সাহায্য করতে পারি?", "আমি খুব ভালো আছি, ধন্যবাদ।", "As an AI language model", "Certainly!", "Sure!", "How may I assist you today?". Do NOT start replies with "# আমি SMFTA Pro".`];
	const memMatch = raw.match(/USER MEMORY(?:\s*—\s*FULL\s*BANK|\s+BANK)[\s\S]*?(?=\n[A-Z0-9★]|$)/i) || raw.match(/MEMORY\s*\(authoritative[\s\S]*?(?=\n[A-Z0-9★]|$)/i);
	if (memMatch) {
		const bulletLines = memMatch[0].split("\n").map((l) => l.trim()).filter((l) => l.startsWith("- ") || l.startsWith("• ")).slice(0, 5).map((l) => l.slice(0, 80));
		if (bulletLines.length > 0) lines.push(`Memory: ${bulletLines.join(" | ")}`);
	}
	const webGroundingMatch = raw.match(/LIVE REAL-TIME WEB & BROWSER GROUNDING[^\n]*\n([\s\S]*?)(?=\n(?:[A-Z]{3,}[\s_A-Z]*:)|$)/i);
	if (webGroundingMatch && webGroundingMatch[1]) {
		const webDigest = webGroundingMatch[1].trim().replace(/\s+/g, " ").slice(0, 620);
		if (webDigest) lines.push(`LIVE WEB GROUNDING (cite URLs): ${webDigest}`);
	} else {
		const webStatusMatch = raw.match(/LIVE WEB SEARCH STATUS:[^\n]+/i);
		if (webStatusMatch) lines.push(webStatusMatch[0].trim().slice(0, 260));
	}
	const projMatch = raw.match(/(?:LOADED ZIP PROJECT WORKSPACE|ACTIVE PROJECT CONTEXT)[^\n]*\n([\s\S]*)$/i);
	if (projMatch && projMatch[1]) {
		const projDigest = projMatch[1].trim().replace(/\s+/g, " ").slice(0, 380);
		if (projDigest) lines.push(`Project Context: ${projDigest}`);
	}
	return lines.join(" ");
}
/**
* Condenses system rules + recent conversation turns into a URL-safe prompt
* for the GET-based Xrahat endpoint (Phase 2.4):
* - Default charBudget: 1,800 characters
* - Encoded URL cap: 3,500 characters
* - Keeps compact identity + language + up to 5 memory items (max 80 chars each),
*   up to the last 6 messages (max 280 chars each), and the current user message.
*/
function buildXrahatPrompt(systemInstruction, history, charBudget = 1800) {
	const cleanHistory = history.filter((m) => (m.content || "").trim());
	if (cleanHistory.length === 0) return "";
	const lastTurn = cleanHistory[cleanHistory.length - 1];
	const rawHeader = compactXrahatSystemHeader(systemInstruction, /[\u0980-\u09FF]/.test(lastTurn.content || ""));
	const priorTurns = cleanHistory.slice(0, -1).slice(-6);
	const header = priorTurns.length > 0 && rawHeader.length > 360 ? `${rawHeader.slice(0, 360)}…` : rawHeader;
	const maxPerPriorTurn = charBudget > 1800 ? 600 : 280;
	const maxEncodedUrlLen = 6500;
	let latestContent = lastTurn.content.trim();
	const latestReserve = priorTurns.length > 0 ? Math.max(220, Math.floor(charBudget * .45)) : Math.max(240, charBudget - 200);
	if (latestContent.length > latestReserve) {
		const headLen = Math.floor(latestReserve * .7);
		const tailLen = Math.max(50, latestReserve - headLen - 20);
		latestContent = `${latestContent.slice(0, headLen)}\n…\n${latestContent.slice(-tailLen)}`;
	}
	const buildWithLines = (middleLines, currentLatest) => {
		const transcript = [...middleLines, `User: ${currentLatest}`].join("\n");
		return header ? `${header}\n\n${transcript}` : transcript;
	};
	while (latestContent.length > 40 && (buildWithLines([], latestContent).length > charBudget + 150 || buildXrahatUrl(buildWithLines([], latestContent), "u_00000000", true).length > maxEncodedUrlLen)) {
		const nextLen = Math.max(40, Math.floor(latestContent.length * .82));
		const headLen = Math.floor(nextLen * .72);
		const tailLen = Math.max(10, nextLen - headLen - 5);
		latestContent = `${latestContent.slice(0, headLen)}…${latestContent.slice(-tailLen)}`;
	}
	const selectedPriorLines = [];
	for (let i = priorTurns.length - 1; i >= 0; i--) {
		const m = priorTurns[i];
		const tag = m.role === "user" ? "User" : "Assistant";
		let clipped = m.content.trim().length > maxPerPriorTurn ? `${m.content.trim().slice(0, maxPerPriorTurn)}…` : m.content.trim();
		let line = `${tag}: ${clipped}`;
		let candidateLines = [line, ...selectedPriorLines];
		let candidatePrompt = buildWithLines(candidateLines, latestContent);
		if (candidatePrompt.length > charBudget && m.content.trim().length > 100) {
			clipped = `${m.content.trim().slice(0, 110)}…`;
			line = `${tag}: ${clipped}`;
			candidateLines = [line, ...selectedPriorLines];
			candidatePrompt = buildWithLines(candidateLines, latestContent);
		}
		if (candidatePrompt.length > charBudget) break;
		if (charBudget <= 1800 && buildXrahatUrl(candidatePrompt, "u_00000000", true).length > maxEncodedUrlLen) break;
		selectedPriorLines.unshift(line);
	}
	return buildWithLines(selectedPriorLines, latestContent);
}
var PROPRIETARY_LEAK_REPLACEMENTS = [
	[/https?:\/\/xrahat-worm-ai\.vercel\.app[^\s)"'\]]*/gi, "[redacted-internal-endpoint]"],
	[/https?:\/\/(?:t\.me|telegram\.me)\/education_of_purpose[^\s)"'\]]*/gi, ""],
	[/\bt\.me\/education_of_purpose[^\s)"'\]]*/gi, ""],
	[/🔰\s*𝐗ʀᴀʜᴀᴛ-ᴅᴇᴠ\s*🔰/gi, "SMFTA AI Pro"],
	[/𝐗ʀᴀʜᴀᴛ-ᴅᴇᴠ/gi, "SMFTA AI Pro"],
	[/🧠\s*Xrahat-Ai/gi, "SMFTA AI Pro"],
	[/\bXrahat-Ai\b/gi, "SMFTA Pro"],
	[/\bXrahat-Dev\b/gi, "SMFTA Pro"],
	[/\bXrahat\s*AI\b/gi, "SMFTA Pro"],
	[/\bWormGPT\b/gi, "SMFTA Pro"],
	[/\bXrahat\b/gi, "SMFTA Pro"],
	[/\n*---\n*\*\*Support Pollinations\.AI:\*\*[\s\S]*$/i, ""],
	[/\n*Support Pollinations\.AI:[\s\S]*$/i, ""],
	[/https?:\/\/(?:text\.|image\.)?pollinations\.ai[^\s)"'\]]*/gi, ""],
	[/\bPollinations\.AI\b/gi, "SMFTA Pro"],
	[/\bPollinations\b/gi, "SMFTA Pro"],
	[/(?:আমাকে|এই সিস্টেমটি)\s+(?:OpenAI|Google|Anthropic|Meta|DeepSeek|Mistral|Xrahat|SMFTA\s*(?:AI\s*)?Pro)\s+(?:তৈরি করেছে|বানিয়েছে|বানিয়েছে)/gi, `আমাকে **${CREATOR_NAME}** (**SMFTA AI Pro**) তৈরি করেছেন`],
	[/\bI was (?:created|built|developed|made|trained) by (?:OpenAI|Google|Anthropic|Meta|DeepSeek|Mistral|Xrahat[^\s.,;]*)/gi, `I was created by **${CREATOR_NAME}** (**SMFTA AI Pro**)`],
	[/\bI am a large language model,? trained by (?:Google|OpenAI|Anthropic)/gi, `I am the core AI assistant of **SMFTA AI Pro**, developed by **${CREATOR_NAME}**`],
	[/\bAIza[0-9A-Za-z_-]{8,}\b/g, "[REDACTED_KEY]"],
	[/\bAQ\.[0-9A-Za-z._-]{12,}\b/g, "[REDACTED_KEY]"],
	[/\bsk-(?:proj-|or-|ant-)?[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_KEY]"],
	[/\bgsk_[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_KEY]"]
];
var BROKEN_UNICODE_SYMBOLS_REGEX = /[\u{1F5B0}-\u{1F5FF}]/gu;
var ORPHAN_SURROGATE_REGEX = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|\uFFFD+/g;
function sanitizeProprietaryOutput(text) {
	if (!text) return "";
	let out = text.replace(BROKEN_UNICODE_SYMBOLS_REGEX, "📌 ").replace(ORPHAN_SURROGATE_REGEX, "");
	for (const [pattern, replacement] of PROPRIETARY_LEAK_REPLACEMENTS) out = out.replace(pattern, replacement);
	return maskAndNormalizeIdentityOutput(out);
}
function parseXrahatSseEvent(dataStr) {
	if (!dataStr || dataStr === "[DONE]") return {
		delta: "",
		reset: null
	};
	try {
		const parsed = JSON.parse(dataStr);
		if (typeof parsed.delta === "string") return {
			delta: sanitizeProprietaryOutput(parsed.delta),
			reset: null
		};
		if (typeof parsed.reply === "string") return {
			delta: sanitizeProprietaryOutput(parsed.reply),
			reset: null
		};
		if (typeof parsed.text === "string") return {
			delta: sanitizeProprietaryOutput(parsed.text),
			reset: null
		};
		if (typeof parsed.reset === "string" && parsed.reset.trim()) return {
			delta: "",
			reset: sanitizeProprietaryOutput(parsed.reset)
		};
	} catch {}
	return {
		delta: "",
		reset: null
	};
}
function extractXrahatReply(payload) {
	if (typeof payload === "string" && payload.trim()) return sanitizeProprietaryOutput(payload);
	if (!payload || typeof payload !== "object") return "";
	const data = payload;
	if (typeof data.reply === "string" && data.reply.trim()) return sanitizeProprietaryOutput(data.reply);
	if (typeof data.response === "string" && data.response.trim()) return sanitizeProprietaryOutput(data.response);
	if (typeof data.text === "string" && data.text.trim()) return sanitizeProprietaryOutput(data.text);
	return extractTextFromOpenAIJson(payload);
}
var ROUTER_FALLBACK_MODELS = [
	"google/gemini-3.8-flash",
	"openai/gpt-4o-mini",
	"deepseek/deepseek-chat"
];
function normalizeEndpointUrl(provider, customBaseUrl, options) {
	if (provider === "xrahat" || provider === "smfta_cloud") return POLLINATIONS_OPENAI_URL;
	if (provider === "cloudflare") {
		const cfAccountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
		if (cfAccountId && !(options?.respectCustomBaseUrl && (customBaseUrl || "").trim())) return `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/v1/chat/completions`;
	}
	let raw = (customBaseUrl || "").trim();
	const hasExplicitCustomUrl = Boolean(options?.respectCustomBaseUrl && raw);
	if (!hasExplicitCustomUrl && provider && provider !== "custom" && provider !== "lmstudio" && provider !== "ollama" && PROVIDER_ENDPOINTS[provider]) raw = PROVIDER_ENDPOINTS[provider].url;
	else if (!raw && PROVIDER_ENDPOINTS[provider]) raw = PROVIDER_ENDPOINTS[provider].url;
	if (!raw) raw = PROVIDER_ENDPOINTS.unorouter.url;
	raw = raw.replace(/\s+/g, "");
	if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
	raw = raw.replace(/^https?:\/\/(www\.)?unorouter\.com(?=\/|$)/i, "https://api.unorouter.com");
	if (/^https?:\/\/((?:www|api)\.)?codecraftapi\.com(?=\/|$)/i.test(raw)) return CODECRAFT_CHAT_URL;
	raw = raw.replace(/\/+$/, "");
	if (provider === "gemini_custom") return raw;
	if (provider === "anthropic") {
		if (hasExplicitCustomUrl) return raw.endsWith("/v1/messages") ? raw : `${raw.replace(/\/v1$/i, "")}/v1/messages`;
		return raw.endsWith("/v1/messages") ? raw : "https://api.anthropic.com/v1/messages";
	}
	if (/\/chat\/completions$/i.test(raw)) return raw;
	if (/\/v1\/messages$/i.test(raw)) return raw;
	if (/generativelanguage\.googleapis\.com/i.test(raw)) {
		if (/\/openai\/chat\/completions$/i.test(raw)) return raw;
		return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
	}
	if (/api\.anthropic\.com/i.test(raw)) return "https://api.anthropic.com/v1/messages";
	if (/openrouter\.ai/i.test(raw)) {
		if (/\/chat\/completions$/i.test(raw)) return raw;
		return "https://openrouter.ai/api/v1/chat/completions";
	}
	if (/api\.groq\.com/i.test(raw)) {
		if (/\/chat\/completions$/i.test(raw)) return raw;
		return "https://api.groq.com/openai/v1/chat/completions";
	}
	if (/api\.deepseek\.com/i.test(raw)) {
		if (/\/chat\/completions$/i.test(raw)) return raw;
		return "https://api.deepseek.com/v1/chat/completions";
	}
	if (/api\.openai\.com/i.test(raw)) {
		if (/\/chat\/completions$/i.test(raw)) return raw;
		return "https://api.openai.com/v1/chat/completions";
	}
	if (/models\.inference\.ai\.azure\.com$/i.test(raw)) return `${raw}/chat/completions`;
	if (/api\.perplexity\.ai$/i.test(raw)) return `${raw}/chat/completions`;
	if (/\/(v1|v2|v3|v1beta\/openai|v3\/openai|api\/v1|openai\/v1)$/i.test(raw)) return `${raw}/chat/completions`;
	if (/\/chat$/i.test(raw)) return `${raw}/completions`;
	return `${raw}/v1/chat/completions`;
}
function inferModelForCustomBaseUrl(baseUrl) {
	if (!baseUrl) return "gpt-4o-mini";
	const u = baseUrl.toLowerCase();
	if (u.includes("codecraft")) return "gemini-3.8-flash";
	if (u.includes("inceptionlabs") || u.includes("mercury")) return "mercury-3";
	if (u.includes("generativelanguage.googleapis.com")) return "gemini-3.8-flash";
	if (u.includes("groq.com")) return "llama-3.3-70b-versatile";
	if (u.includes("deepseek.com")) return "deepseek-chat";
	if (u.includes("anthropic.com")) return "claude-sonnet-4-20250514";
	if (u.includes("openrouter.ai")) return "google/gemini-3.8-flash";
	if (u.includes("cerebras.ai")) return "llama-3.3-70b";
	if (u.includes("mistral.ai")) return "mistral-small-latest";
	if (u.includes("together.xyz") || u.includes("together.ai")) return "meta-llama/Llama-3.3-70B-Instruct-Turbo";
	if (u.includes("x.ai")) return "grok-2-latest";
	if (u.includes("perplexity.ai")) return "sonar";
	return "gpt-4o-mini";
}
function expandModelCandidates(provider, requestedModel, defaultModel) {
	const candidates = [];
	const add = (m) => {
		const clean = (m || "").trim();
		if (clean && !candidates.includes(clean)) candidates.push(clean);
	};
	const addWithVariants = (m) => {
		const clean = (m || "").trim();
		if (!clean) return;
		add(clean);
		if (provider === "codecraft") return;
		if (clean.includes("/")) {
			const bare = clean.split("/").pop();
			add(bare);
		} else if (provider === "unorouter" || provider === "openrouter" || provider === "custom") {
			const lower = clean.toLowerCase();
			if (lower.startsWith("gemini")) add(`google/${clean}`);
			else if (lower.startsWith("gpt-") || lower.startsWith("o1") || lower.startsWith("o3")) add(`openai/${clean}`);
			else if (lower.startsWith("claude")) add(`anthropic/${clean}`);
			else if (lower.startsWith("deepseek")) add(`deepseek/${clean}`);
			else if (lower.startsWith("llama")) add(`meta-llama/${clean}`);
			else if (lower.startsWith("mistral")) add(`mistralai/${clean}`);
			else if (lower.startsWith("qwen")) add(`qwen/${clean}`);
		}
	};
	if (provider === "groq") {
		add(resolveGroqModel(requestedModel));
		add(defaultModel || "llama-3.3-70b-versatile");
		for (const fb of PROVIDER_ENDPOINTS.groq.fallbackModels || []) add(fb);
		return candidates;
	}
	addWithVariants(requestedModel);
	addWithVariants(defaultModel);
	const presetFallbacks = PROVIDER_ENDPOINTS[provider]?.fallbackModels;
	if (Array.isArray(presetFallbacks) && provider !== "codecraft") for (const fb of presetFallbacks) add(fb);
	if (provider === "unorouter" || provider === "openrouter") for (const fb of ROUTER_FALLBACK_MODELS) add(fb);
	return candidates;
}
function buildProviderModelCandidates(provider, requestedModel, defaultModel, discoveredModels = [], options) {
	const candidates = [];
	const add = (model) => {
		const clean = (model || "").trim();
		if (clean && !candidates.includes(clean)) candidates.push(clean);
	};
	const cleanReq = (requestedModel || "").trim();
	if (options?.exactOnly && cleanReq) return [cleanReq];
	if (provider === "custom") {
		if (cleanReq && cleanReq !== "gpt-4o-mini") {
			add(cleanReq);
			if (cleanReq.includes("/")) add(cleanReq.split("/").pop());
		}
		if (defaultModel && defaultModel !== "gpt-4o-mini") add(defaultModel);
		for (const model of discoveredModels) add(model);
		if (cleanReq) {
			add(cleanReq);
			if (cleanReq.includes("/")) add(cleanReq.split("/").pop());
		}
		if (/mercury/i.test(cleanReq)) {
			add("mercury");
			add("mercury-coder");
			add("mercury-2");
		}
		for (const fallback of [
			"gemini-3.8-flash",
			"gemini-3.5-flash-lite",
			"deepseek-v4-flash-0731",
			"claude-sonnet-5",
			"gpt-4o-mini",
			"gpt-4o",
			"deepseek-chat",
			"deepseek-ai/DeepSeek-V3",
			"meta-llama/Llama-3.3-70B-Instruct",
			"llama-3.3-70b-versatile",
			"llama3.2",
			"qwen-2.5-coder",
			"default"
		]) add(fallback);
		return candidates.length > 0 ? candidates : ["gpt-4o-mini"];
	}
	const baseCandidates = expandModelCandidates(provider, requestedModel, defaultModel);
	for (const c of baseCandidates) add(c);
	for (const model of discoveredModels) add(model);
	if (provider === "codecraft") for (const fallback of CODECRAFT_FALLBACK_MODELS) add(fallback);
	return candidates;
}
function extractTextFromOpenAIJson(data) {
	if (!data || typeof data !== "object") return "";
	const obj = data;
	if (Array.isArray(obj.choices) && obj.choices.length > 0) {
		const first = obj.choices[0];
		const msg = first?.message || first?.delta;
		if (typeof msg?.content === "string" && msg.content.trim()) return sanitizeProprietaryOutput(msg.content);
		if (Array.isArray(msg?.content)) {
			const joined = msg.content.map((part) => {
				if (typeof part === "string") return part;
				if (part && typeof part === "object") return String(part.text || "");
				return "";
			}).join("");
			if (joined.trim()) return sanitizeProprietaryOutput(joined);
		}
		if (typeof msg?.reasoning_content === "string" && msg.reasoning_content.trim()) return sanitizeProprietaryOutput(msg.reasoning_content);
		if (typeof first?.text === "string" && first.text.trim()) return sanitizeProprietaryOutput(first.text);
	}
	if (Array.isArray(obj.candidates) && obj.candidates.length > 0) {
		const content = obj.candidates[0]?.content;
		if (Array.isArray(content?.parts)) {
			const text = content.parts.map((p) => p && typeof p === "object" ? String(p.text || "") : "").join("");
			if (text.trim()) return sanitizeProprietaryOutput(text);
		}
	}
	if (typeof obj.output_text === "string" && obj.output_text.trim()) return sanitizeProprietaryOutput(obj.output_text);
	if (typeof obj.response === "string" && obj.response.trim()) return sanitizeProprietaryOutput(obj.response);
	if (typeof obj.text === "string" && obj.text.trim()) return sanitizeProprietaryOutput(obj.text);
	if (typeof obj.content === "string" && obj.content.trim()) return sanitizeProprietaryOutput(obj.content);
	return "";
}
var SEALED_PREFIX = "enc:v1:";
var SEALED_PBKDF2_SALT = "smfta-keystore-v1";
/**
* Splits a string/array of API keys separated by newlines, commas, or semicolons,
* stripping surrounding quotes and whitespace.
*/
function extractApiKeyList(raw) {
	const parts = [];
	if (Array.isArray(raw)) {
		for (const item of raw) if (typeof item === "string") parts.push(item);
	} else if (typeof raw === "string") parts.push(raw);
	const out = [];
	for (const chunk of parts) for (const piece of chunk.split(/[\n,;]+/)) {
		const clean = piece.trim().replace(/^["']+|["']+$/g, "").trim();
		if (clean) out.push(clean);
	}
	return out;
}
function isSealedCiphertext(value) {
	return String(value || "").trim().startsWith(SEALED_PREFIX);
}
/**
* Decrypts client-sealed `enc:v1:<iv_b64>:<ct_b64>` tokens when a symmetric
* server keystore secret (`SMFTA_KEYSTORE_SECRET` / `KEY_ENCRYPTION_SECRET`) is set.
* Raw plaintext keys are sanitized and returned immediately.
*/
function decryptKeyPayloadIfSupported(rawInput) {
	const clean = String(rawInput || "").trim().replace(/^["']+|["']+$/g, "").trim();
	if (!clean) return {
		ok: false,
		key: "",
		sealedDetected: false
	};
	if (!isSealedCiphertext(clean)) return {
		ok: true,
		key: clean,
		sealedDetected: false
	};
	const secret = (process.env.SMFTA_KEYSTORE_SECRET || process.env.KEY_ENCRYPTION_SECRET || "").trim();
	if (!secret) return {
		ok: false,
		key: "",
		sealedDetected: true,
		errorCode: "KEY_DECRYPT_FAILED",
		errorBn: "এই ব্রাউজারে সেভ করা এনক্রিপ্টেড API কী ডিক্রিপ্ট করা যায়নি। অনুগ্রহ করে Settings → Custom Providers থেকে আপনার API Key পুনরায় সেভ করুন।"
	};
	try {
		const rest = clean.slice(7);
		const sepIdx = rest.indexOf(":");
		if (sepIdx <= 0) throw new Error("Malformed sealed token");
		const iv = Buffer.from(rest.slice(0, sepIdx), "base64");
		const cipherAndTag = Buffer.from(rest.slice(sepIdx + 1), "base64");
		if (iv.length < 12 || cipherAndTag.length <= 16) throw new Error("Invalid AES-GCM payload");
		const authTag = cipherAndTag.subarray(cipherAndTag.length - 16);
		const ciphertext = cipherAndTag.subarray(0, cipherAndTag.length - 16);
		const derivedKey = crypto.pbkdf2Sync(secret, SEALED_PBKDF2_SALT, 1e5, 32, "sha256");
		const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, iv);
		decipher.setAuthTag(authTag);
		const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8").trim();
		if (!plain) throw new Error("Empty decrypted key");
		return {
			ok: true,
			key: plain,
			sealedDetected: true
		};
	} catch {
		return {
			ok: false,
			key: "",
			sealedDetected: true,
			errorCode: "KEY_DECRYPT_FAILED",
			errorBn: "এনক্রিপ্টেড API কী পড়া যায়নি (KEY_DECRYPT_FAILED)। Settings → Custom Providers থেকে সঠিক কী পুনরায় দিন।"
		};
	}
}
function readHeaderValue(headers, name) {
	if (!headers) return "";
	const direct = headers[name] ?? headers[name.toLowerCase()];
	if (Array.isArray(direct)) return String(direct[0] || "").trim();
	return typeof direct === "string" ? direct.trim() : "";
}
function isLikelyNonGeminiThirdPartyKey(k) {
	const clean = k.trim();
	if (!clean) return false;
	return /^(sk-|gsk_|nvapi-|ghp_|github_pat_|xai-|csk-|fw_|pplx-|hf_|cc_)/i.test(clean);
}
/**
* Universal API Key Detection Chain (Vercel Serverless + Local Express compatible):
* 1. Headers: `x-gemini-key`, `x-api-key`, `authorization` (Bearer)
* 2. Body: `req.body.geminiApiKey`, `req.body.apiKey`, `req.body.externalKeys.gemini`, `req.body.externalKeys`
* 3. Server Env: `GEMINI_API_KEY`, `AI_MASTER_KEY`, `VITE_GEMINI_API_KEY`, `GOOGLE_API_KEY`, `API_KEY`
*/
function resolveGeminiApiKey(req) {
	const headers = req?.headers;
	const body = req?.body && typeof req.body === "object" ? req.body : {};
	let sealedDetected = false;
	let sealedErrorCode;
	let sealedErrorBn;
	const tryCandidate = (rawVal, source, requireGeminiPrefix = false) => {
		for (const candidate of extractApiKeyList(rawVal)) {
			const dec = decryptKeyPayloadIfSupported(candidate);
			if (dec.sealedDetected && !dec.ok) {
				sealedDetected = true;
				sealedErrorCode = dec.errorCode;
				sealedErrorBn = dec.errorBn;
				continue;
			}
			if (!dec.ok || !dec.key) continue;
			if (requireGeminiPrefix) {
				if (isLikelyNonGeminiThirdPartyKey(dec.key)) continue;
				if (!dec.key.startsWith("AIza") && !dec.key.startsWith("AQ.")) continue;
			} else if (isLikelyNonGeminiThirdPartyKey(dec.key)) continue;
			return {
				apiKey: dec.key,
				source,
				sealedDetected
			};
		}
		return null;
	};
	const xGeminiKey = readHeaderValue(headers, "x-gemini-key");
	if (xGeminiKey) {
		const res = tryCandidate(xGeminiKey, "header:x-gemini-key");
		if (res) return res;
	}
	const xApiKey = readHeaderValue(headers, "x-api-key");
	if (xApiKey) {
		const res = tryCandidate(xApiKey, "header:x-api-key");
		if (res) return res;
	}
	const authHeader = readHeaderValue(headers, "authorization");
	if (/^Bearer\s+/i.test(authHeader)) {
		const res = tryCandidate(authHeader.replace(/^Bearer\s+/i, "").trim(), "header:authorization");
		if (res) return res;
	}
	if (typeof body.geminiApiKey === "string" && body.geminiApiKey.trim()) {
		const res = tryCandidate(body.geminiApiKey, "body:geminiApiKey");
		if (res) return res;
	}
	if (typeof body.apiKey === "string" && body.apiKey.trim()) {
		const res = tryCandidate(body.apiKey, "body:apiKey");
		if (res) return res;
	}
	const extKeys = body.externalKeys;
	if (extKeys && typeof extKeys === "object" && !Array.isArray(extKeys)) {
		const nestedGem = extKeys.gemini;
		if (typeof nestedGem === "string" && nestedGem.trim()) {
			const res = tryCandidate(nestedGem, "body:externalKeys.gemini");
			if (res) return res;
		}
	} else if (typeof extKeys === "string" || Array.isArray(extKeys)) {
		const list = extractApiKeyList(extKeys);
		for (const item of list) {
			const res = tryCandidate(item, "body:externalKeys", true);
			if (res) return res;
		}
	}
	const envChain = [
		[process.env.GEMINI_API_KEY, "env:GEMINI_API_KEY"],
		[process.env.AI_MASTER_KEY, "env:AI_MASTER_KEY"],
		[process.env.VITE_GEMINI_API_KEY, "env:VITE_GEMINI_API_KEY"],
		[process.env.GOOGLE_API_KEY, "env:GOOGLE_API_KEY"],
		[process.env.API_KEY, "env:API_KEY"]
	];
	for (const [envVal, source] of envChain) if (typeof envVal === "string" && envVal.trim()) {
		const res = tryCandidate(envVal, source);
		if (res) return res;
	}
	return {
		apiKey: "",
		source: "none",
		sealedDetected,
		...sealedErrorCode ? {
			errorCode: sealedErrorCode,
			errorBn: sealedErrorBn
		} : {}
	};
}
/**
* Convenience helper for server modules without an active HTTP request.
*/
function resolveServerEnvGeminiKey() {
	return resolveGeminiApiKey(null).apiKey;
}
//#endregion
export { resolveGeminiApiKey as _, buildXrahatPrompt as a, sanitizeProprietaryOutput as b, detectProviderFromKey as c, extractXrahatReply as d, inferModelForCustomBaseUrl as f, resolveEffectiveProvider as g, parseXrahatSseEvent as h, buildProviderModelCandidates as i, extractApiKeyList as l, normalizeEndpointUrl as m, POLLINATIONS_OPENAI_URL as n, buildXrahatUrl as o, isKeylessProvider as p, PROVIDER_ENDPOINTS as r, decryptKeyPayloadIfSupported as s, CODECRAFT_FALLBACK_MODELS as t, extractTextFromOpenAIJson as u, resolveGroqModel as v, resolveServerEnvGeminiKey as y };
