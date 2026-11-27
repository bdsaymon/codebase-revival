import { o as __toESM } from "../_runtime.mjs";
import { n as buildCreatorAndSecurityDirective } from "./creatorIdentity-TTkWUL_b.mjs";
import { t as require_lib } from "../_libs/jszip+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/v2UsageLimits-CoUNIKES.js
var import_lib = /* @__PURE__ */ __toESM(require_lib());
var DEFAULT_IDLE_TIMEOUT_MS = 75e3;
var OPEN_BLOCKS = /⟦(?:SELF_UPDATE|NOTE|SELF_CODE)(?![^⟧]*⟧)/gi;
/** ``` fences that were opened but never closed. */
function unclosedFenceCount(text) {
	if (!text) return 0;
	const fences = text.match(/```/g);
	return fences ? fences.length % 2 : 0;
}
/** ⟦SELF_UPDATE⟧ / ⟦NOTE⟧ / ⟦SELF_CODE⟧ blocks that were opened but not closed. */
function hasUnclosedControlBlock(text) {
	if (!text) return false;
	const opens = (text.match(/⟦(?:SELF_UPDATE|NOTE|SELF_CODE)⟧/g) || []).length;
	const closes = (text.match(/⟦\/(?:SELF_UPDATE|NOTE|SELF_CODE)⟧/g) || []).length;
	if (opens > closes) return true;
	OPEN_BLOCKS.lastIndex = 0;
	return /⟦(?:SELF_UPDATE|NOTE|SELF_CODE)⟧[\s\S]*$/.test(text) && opens > closes;
}
function branchBalance(text) {
	const pairs = [
		["{", "}"],
		["(", ")"],
		["[", "]"]
	];
	let balance = 0;
	for (const [open, close] of pairs) {
		const o = text.split(open).length - 1;
		const c = text.split(close).length - 1;
		balance += Math.max(0, o - c);
	}
	return balance;
}
/**
* Heuristic: does this reply look cut off? Tuned to be *conservative* — a false
* positive costs one extra (cheap) continuation call, a false negative leaves
* the user with a broken answer.
*/
function looksTruncated(text) {
	const t = (text || "").trimEnd();
	if (!t) return false;
	if (unclosedFenceCount(t) > 0) return true;
	if (hasUnclosedControlBlock(t)) return true;
	if (t.length < 40) return false;
	const tail = t.slice(-240);
	if (/(:|：|,|、|;|=|\(|\[|\{|\+|\/|&|\||(?:\b(?:and|or|but|the|a|of|to|with|for|is|are|was)|কে|এবং|বা|আর)\s*)$/i.test(tail)) {
		if (branchBalance(t) > 0 || t.length > 320) return true;
	}
	if (branchBalance(t) > 0 && /[{([]/.test(tail)) return true;
	const lastLine = tail.split("\n").pop() || "";
	const isStructured = /^\s*(?:[-*•#>|]|\d+[.)])\s/.test(lastLine) || /\|\s*$/.test(lastLine);
	if (t.length > 160 && !isStructured && !/[.!?।…"'"”’`)\]}>*_~\-]\s*$/.test(t)) return true;
	return false;
}
/** Hidden instruction appended as the last user turn when continuing. */
function continuationDirective(tail) {
	return "SYSTEM CONTINUATION (auto-repair): আপনার আগের উত্তরটি হঠাৎ কেটে গেছে। ঠিক যেখানে থেমেছিলে সেখান থেকেই বাকিটা লিখতে থাকো, একটুও পুনরাবৃত্তি না করে। শুরুতে কোনো ভূমিকা/সারাংশ দিও না — শুধু বাকি অংশ। কোড ব্লক অসম্পূর্ণ হলে সেটি সম্পূর্ণ করো। উত্তরটি অবশ্যই শেষ বাক্য বা বন্ধ ব্র্যাকেট/কোড ফেন্স দিয়ে শেষ করবে।\n\n--- LAST LINES OF MY PREVIOUS ANSWER ---\n" + (tail || "").slice(-1200);
}
/**
* Merges a continuation chunk onto `existing` without duplicating overlapping
* prefixes, repeated full answers, or re-opened markdown code fences.
*/
function mergeContinuationText(existing, incoming) {
	const base = existing || "";
	if (!incoming || !incoming.trim()) return {
		merged: base,
		deltaToAppend: ""
	};
	if (!base) return {
		merged: incoming,
		deltaToAppend: incoming
	};
	let cont = incoming;
	cont = cont.replace(/^(?:sure[,!.]?\s*|certainly[,!.]?\s*|here(?:'s| is) the (?:rest|continuation)[^\n]*\n+|continuing from where[^\n]*\n+|নিচে বাকি অংশ[^\n]*\n+|বাকি অংশটুকু[^\n]*\n+)/i, "");
	const trimmedBase = base.trim();
	const trimmedCont = cont.trim();
	if (trimmedCont === trimmedBase || trimmedBase.length > 40 && trimmedBase.includes(trimmedCont)) return {
		merged: base,
		deltaToAppend: ""
	};
	if (trimmedBase.length > 30 && trimmedCont.startsWith(trimmedBase)) {
		const remainder = trimmedCont.slice(trimmedBase.length);
		return {
			merged: base + remainder,
			deltaToAppend: remainder
		};
	}
	if (unclosedFenceCount(base) > 0) {
		const reOpenedFence = cont.match(/^\s*```[a-zA-Z0-9_+-]*\r?\n([\s\S]*)$/);
		if (reOpenedFence && unclosedFenceCount(reOpenedFence[1]) > 0) cont = reOpenedFence[1];
	}
	const maxOverlapCheck = Math.min(base.length, cont.length, 800);
	let overlapLen = 0;
	for (let len = maxOverlapCheck; len >= 6; len--) if (base.slice(base.length - len) === cont.slice(0, len)) {
		overlapLen = len;
		break;
	}
	if (overlapLen > 0) cont = cont.slice(overlapLen);
	else {
		const contTrimStart = cont.trimStart();
		const maxTrimOverlap = Math.min(base.trimEnd().length, contTrimStart.length, 600);
		const baseTrimEnd = base.trimEnd();
		let trimOverlap = 0;
		for (let len = maxTrimOverlap; len >= 10; len--) if (baseTrimEnd.slice(baseTrimEnd.length - len) === contTrimStart.slice(0, len)) {
			trimOverlap = len;
			break;
		}
		if (trimOverlap > 0) cont = contTrimStart.slice(trimOverlap);
	}
	if (overlapLen === 0 && cont.trim()) {
		const baseLines = base.trimEnd().split(/\r?\n/);
		const contLines = cont.split(/\r?\n/);
		const tailWindow = baseLines.slice(-8).map((l) => l.trim()).filter(Boolean);
		let dropLines = 0;
		for (let i = 0; i < Math.min(4, contLines.length); i++) {
			const candidate = contLines[i].trim();
			if (!candidate) {
				if (dropLines > 0) dropLines++;
				continue;
			}
			if (candidate.length >= 8 && tailWindow.includes(candidate)) dropLines = i + 1;
			else break;
		}
		if (dropLines > 0) cont = contLines.slice(dropLines).join("\n");
	}
	if (!cont || !cont.trim()) return {
		merged: base,
		deltaToAppend: ""
	};
	const deltaToAppend = !base.endsWith("\n") && !base.endsWith(" ") && !cont.startsWith("\n") && !cont.startsWith(" ") && unclosedFenceCount(base) > 0 ? "\n" + cont : cont;
	return {
		merged: base + deltaToAppend,
		deltaToAppend
	};
}
function normalizeLine(line) {
	return line.toLowerCase().replace(/[\s\u00a0]+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
}
/**
* Removes model loops: the same paragraph or sentence emitted repeatedly, and
* triple-blank runs. Safe for normal text (only exact normalised duplicates die).
*/
function dedupeRepeats(text) {
	if (!text) return "";
	const paragraphs = text.split(/\n{2,}/);
	const seen = /* @__PURE__ */ new Set();
	const kept = [];
	for (const para of paragraphs) {
		const key = normalizeLine(para);
		if (key.length > 24) {
			if (seen.has(key)) continue;
			seen.add(key);
		}
		const sentences = para.split(/(?<=[.!?।])\s+/);
		const keptSentences = [];
		let prevKey = "";
		let run = 0;
		for (const s of sentences) {
			const sKey = normalizeLine(s);
			if (sKey && sKey === prevKey) {
				run += 1;
				if (run >= 1) continue;
			}
			prevKey = sKey;
			run = 0;
			keptSentences.push(s);
		}
		kept.push(keptSentences.join(" "));
	}
	return kept.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
var FILLER_PREFIXES = [
	/^(অবশ্যই|নিশ্চয়ই|অবশ্যই!|সার্ট|ঠিক আছে)[!,.।—-]?\s*/i,
	/^(ভালো প্রশ্ন|দারুণ প্রশ্ন|চমৎকার প্রশ্ন)[!,.।—-]?\s*/i,
	/^(sure|certainly|of course|absolutely|great question|good question)[!,.—-]?\s*/i,
	/^(here('| i)s|here you go|below is|নিচে দিচ্ছি)[^\n]{0,80}\n/i,
	/^(আমি (এখন|তাৎক্ষণিকভাবে) (আপনাকে|তোমাকে) (সাহায্য|উত্তর) (করব|দিচ্ছি))[^.\n]*[.।]\s*/i
];
var FILLER_SUFFIXES = [
	/\n{0,2}(আশা করি (এটি|এটা|উত্তরটি) (আপনার|তোমার)?\s*কাজে (আসবে|লাগবে)[^.\n]*[.।]?)\s*$/i,
	/\n{0,2}(আরও কিছু (জানতে|শিখতে) চাইলে (বলুন|জিজ্ঞেস করুন)[^.\n]*[.।]?)\s*$/i,
	/\n{0,2}(কোনো প্রশ্ন থাকলে (বলুন|জানাতে পারেন)[^.\n]*[.।]?)\s*$/i,
	/\n{0,2}(hope (this|that) helps[^.\n]*[.!]?)\s*$/i,
	/\n{0,2}(let me know if you (need|want)[^.\n]*[.!]?)\s*$/i,
	/\n{0,2}(feel free to ask[^.\n]*[.!]?)\s*$/i
];
/**
* Strips the obvious padding (hollow preamble / "hope this helps" tail) that
* makes a tiny question produce a bloated answer. Only used in concise mode.
*/
function stripPadding(text) {
	if (!text) return "";
	let out = text.trim();
	for (let i = 0; i < 3; i += 1) {
		const before = out;
		for (const rx of FILLER_PREFIXES) out = out.replace(rx, "").trimStart();
		if (before === out) break;
	}
	for (let i = 0; i < 3; i += 1) {
		const before = out;
		for (const rx of FILLER_SUFFIXES) out = out.replace(rx, "").trimEnd();
		if (before === out) break;
	}
	return out.trim();
}
var GREETING_ONLY_RX = /^(?:hi+|hello+|hey+|yo|hola|নমস্কার|হাই|হ্যালো|হেলো|সালাম|আসসালামু\s*আলাইকুম|আসসালামুআলাইকুম|শুভ\s*(?:সকাল|সন্ধ্যা|রাত|দুপুর)|good\s*(?:morning|afternoon|evening|night)|কেমন\s*আছো?|কেমন\s*আছেন|kemon\s*acho|how are you|nice to meet you)$/i;
/** Is this message nothing more than a greeting? */
function isGreetingMessage(text) {
	const clean = (text || "").toLowerCase().replace(/[?!।.,'"`]+/g, " ").replace(/\s+/g, " ").trim();
	if (!clean || clean.length > 40) return false;
	return GREETING_ONLY_RX.test(clean);
}
/** Code fences / control blocks — these must never be cut or restructured. */
function hasCodeContent(text) {
	return /```|⟦|<smfta_artifact\b|<!doctype\s+html|<html\b/i.test(text || "");
}
/** Cuts at the last sentence boundary inside `maxChars`. */
function clampToSentences(text, maxChars) {
	const t = (text || "").trim();
	if (t.length <= maxChars) return t;
	const window = t.slice(0, maxChars);
	const lastBreak = Math.max(window.lastIndexOf("।"), window.lastIndexOf(". "), window.lastIndexOf("!"), window.lastIndexOf("?"), window.lastIndexOf("\n"));
	if (lastBreak > maxChars * .45) return window.slice(0, lastBreak + 1).trim();
	const space = window.lastIndexOf(" ");
	return (space > maxChars * .5 ? window.slice(0, space) : window).trim() + " …";
}
/**
* Makes the final answer proportional to the question — without ever
* mutilating a real answer.
*
* v18.5.0: the old "short prompt → 480 characters" clamp was removed. It cut
* genuine answers in half (an 866-character diet plan became 431 characters,
* losing steps 7–12) because almost every real prompt is shorter than 70
* characters. Length is now guided by the MATCH-LENGTH prompt rule and the
* model itself; this guard only normalises greetings.
*
* - Greeting ("hi", "হ্যালো") → 1–2 short lines, no lists/headers.
* - Everything else is returned untouched (code, tables, steps, long answers).
*/
function matchAnswerLength(answer, prompt, opts = {}) {
	const text = (answer || "").trim();
	const question = (prompt || "").trim();
	if (!text) return text;
	if (hasCodeContent(text) || hasCodeContent(question)) return text;
	const greeting = isGreetingMessage(question);
	if (!greeting) return text;
	const greetingMax = opts.maxGreetingChars ?? 220;
	if (greeting) {
		let out = text.replace(/^#{1,6}\s.*$/gm, "").replace(/^\s*[-*•]\s+/gm, "").replace(/\n{2,}/g, "\n").trim();
		const sentences = out.replace(/\n+/g, " ").split(/(?<=[.!?।])\s+/).map((s) => s.trim()).filter(Boolean);
		out = (sentences.length > 0 ? sentences.slice(0, 2).join(" ") : out).trim();
		return clampToSentences(out, greetingMax);
	}
	return text;
}
/** Final presentation pass applied to every finished reply. */
function polishReply(text, opts = {}) {
	if (hasCodeContent(text)) return text;
	let out = dedupeRepeats(text);
	if (opts.concise) out = stripPadding(out);
	return out;
}
/**
* Fires `onIdle` once the stream has been silent for `idleMs`. Call `arm()`
* after every received chunk — a stalled provider can no longer freeze the app.
*/
function createIdleWatchdog(onIdle, idleMs = DEFAULT_IDLE_TIMEOUT_MS) {
	let timer = null;
	let fired = false;
	const disarm = () => {
		if (timer) clearTimeout(timer);
		timer = null;
	};
	return {
		arm() {
			disarm();
			if (fired) return;
			timer = setTimeout(() => {
				fired = true;
				onIdle();
			}, idleMs);
		},
		disarm() {
			disarm();
		}
	};
}
/** Words that must never appear as a stall excuse in a finished answer. */
var STALL_PHRASES = [
	"একটু অপেক্ষা করুন",
	"আরও লিখব",
	"চলমান আছে",
	"আমি পারি না",
	"সম্ভব নয়",
	"i cannot continue",
	"please wait"
];
function hasStallExcuse(text) {
	const lower = (text || "").toLowerCase();
	return STALL_PHRASES.some((p) => lower.includes(p.toLowerCase()));
}
/**
* Removes a trailing "wait a moment / I can't write more" excuse from a
* finished reply so a stalled-model apology never reaches the user.
*
* v18.5.0: only the **tail** is inspected. Dropping every matching sentence
* anywhere in the text used to delete real content — e.g. an honest answer such
* as "এটা এখনই সম্ভব নয়, কারণ…" lost that sentence from the middle of the
* answer. Content in the middle of a reply is never touched now.
*/
function dropStallSentences(text) {
	if (!text || hasCodeContent(text) || !hasStallExcuse(text)) return text;
	const sentences = text.split(/(?<=[.!?।\n])/);
	const isExcuse = (sentence) => {
		const lower = sentence.toLowerCase();
		if (!STALL_PHRASES.some((p) => lower.includes(p.toLowerCase()))) return false;
		return /(লিখ|লেখা|উত্তর|চলমান|আরও|অপেক্ষা|continue|answer|respon|wait)/i.test(lower);
	};
	return sentences.filter((sentence) => {
		if (!sentence.trim()) return false;
		if (sentence.trim().length >= 160) return true;
		return !isExcuse(sentence);
	}).join("").replace(/\n{3,}/g, "\n\n").trim() || text;
}
var FILE_ARTIFACT_SYSTEM_DIRECTIVE = `FILE ARTIFACT & EDITORIAL PRESENTATION PROTOCOL (CLAUDE-STYLE):
When producing code, apps, documents, data tables, or multi-file projects:
1. Wrap every complete deliverable file inside:
<file path="index.html" title="Interactive App" type="html">
...complete file content...
</file>
(Supported types/extensions: .md, .html, .css, .js, .ts, .tsx, .py, .json, .csv, .svg, .txt.)
Always include a concise, clear human-readable "title" attribute on <file> (e.g. title="Responsive Dashboard UI") alongside "path".
2. NEVER repeat or paste the same file contents again as raw inline markdown code blocks outside <file> — keep the chat message clean with only a brief, structured summary and clear section titles (## / ###).
3. For targeted edits to an EXISTING workspace file, prefer emitting ONLY the changed parts using:
<patch path="index.html">
<find>
exact existing lines
</find>
<replace>
updated lines
</replace>
</patch>
(You may include multiple <find>...</find><replace>...</replace> pairs inside one <patch>, and use <file_delete path="old-file.ts" /> to delete a file.)
4. Keep prose crisp, calm, and well-spaced (no bloated walls of redundant explanation). NEVER truncate or leave '// ... existing code' placeholders inside <file>.`;
function sanitizeArtifactFilename(rawName, fallbackExt = "txt") {
	const cleaned = String(rawName || "").trim().replace(/^["'`]+|["'`]+$/g, "").replace(/^\/+/, "").replace(/\.\.+/g, ".").replace(/[\\:*?"<>|]/g, "-");
	if (!cleaned) return `artifact.${fallbackExt}`;
	return cleaned;
}
function inferLanguageFromFilenameOrType(filename, explicitType) {
	const ext = filename.split(".").pop()?.toLowerCase() || "";
	if (ext === "md" || ext === "markdown") return "markdown";
	if (ext === "html" || ext === "htm") return "html";
	if (ext === "svg") return "svg";
	if (ext === "css" || ext === "scss") return "css";
	if (ext === "js" || ext === "mjs") return "javascript";
	if (ext === "ts") return "typescript";
	if (ext === "tsx") return "tsx";
	if (ext === "jsx") return "jsx";
	if (ext === "json") return "json";
	if (ext === "py") return "python";
	if (ext === "csv") return "csv";
	if (ext === "txt") return "text";
	if (explicitType) return explicitType.trim().toLowerCase();
	return "text";
}
function defaultExtForLang(lang) {
	const l = lang.toLowerCase();
	if (l === "markdown" || l === "md") return "md";
	if (l === "html" || l === "htm") return "html";
	if (l === "svg") return "svg";
	if (l === "css") return "css";
	if (l === "javascript" || l === "js") return "js";
	if (l === "typescript" || l === "ts") return "ts";
	if (l === "tsx") return "tsx";
	if (l === "jsx") return "jsx";
	if (l === "json") return "json";
	if (l === "python" || l === "py") return "py";
	if (l === "csv") return "csv";
	return "txt";
}
function parseAttributes(attrString) {
	const attrs = {};
	const attrRx = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
	let m;
	while ((m = attrRx.exec(attrString)) !== null) attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? "").trim();
	return attrs;
}
/**
* Parses `<smfta_artifact ...>...</smfta_artifact>` (including active streaming blocks),
* `⟦FILE:path⟧...⟦/FILE⟧`, and explicitly named fenced file blocks (e.g. ```markdown plan.md)
* into clean artifact descriptors + placeholder tokens (`[[SMFTA_ARTIFACT_0]]`) for inline Claude-style file cards.
*/
function extractFileArtifacts(rawText, options) {
	const source = String(rawText || "");
	const artifacts = [];
	let working = source;
	const pushArtifact = (item) => {
		const idx = artifacts.length;
		const id = `artifact-${idx}`;
		artifacts.push({
			id,
			...item
		});
		return `\n\n[[SMFTA_ARTIFACT_${idx}]]\n\n`;
	};
	working = working.replace(/<file\b([^>]*)>([\s\S]*?)<\/file>/gi, (_full, attrStr, inner) => {
		const attrs = parseAttributes(attrStr);
		const rawType = attrs.type || attrs.lang || "txt";
		const fallbackExt = defaultExtForLang(rawType);
		const filename = sanitizeArtifactFilename(attrs.path || attrs.filename || attrs.name || `file.${fallbackExt}`, fallbackExt);
		const lang = inferLanguageFromFilenameOrType(filename, rawType);
		const title = attrs.title || filename;
		const content = String(inner || "").replace(/^\r?\n/, "").replace(/\r?\n$/, "");
		return pushArtifact({
			filename,
			title,
			lang,
			content,
			isStreaming: false
		});
	});
	working = working.replace(/<smfta_artifact\b([^>]*)>([\s\S]*?)<\/smfta_artifact>/gi, (_full, attrStr, inner) => {
		const attrs = parseAttributes(attrStr);
		const rawType = attrs.type || attrs.lang || "markdown";
		const fallbackExt = defaultExtForLang(rawType);
		const filename = sanitizeArtifactFilename(attrs.filename || attrs.name || attrs.path || `document.${fallbackExt}`, fallbackExt);
		const lang = inferLanguageFromFilenameOrType(filename, rawType);
		const title = attrs.title || filename;
		const content = String(inner || "").replace(/^\r?\n/, "").replace(/\r?\n$/, "");
		return pushArtifact({
			filename,
			title,
			lang,
			content,
			isStreaming: false
		});
	});
	working = working.replace(/<file\b([^>]*)>([\s\S]*)$/i, (_full, attrStr, inner) => {
		const attrs = parseAttributes(attrStr);
		const rawType = attrs.type || attrs.lang || "txt";
		const fallbackExt = defaultExtForLang(rawType);
		const filename = sanitizeArtifactFilename(attrs.path || attrs.filename || attrs.name || `file.${fallbackExt}`, fallbackExt);
		const lang = inferLanguageFromFilenameOrType(filename, rawType);
		const title = attrs.title || filename;
		const content = String(inner || "").replace(/^\r?\n/, "");
		return pushArtifact({
			filename,
			title,
			lang,
			content,
			isStreaming: Boolean(options?.isStreaming)
		});
	});
	working = working.replace(/<smfta_artifact\b([^>]*)>([\s\S]*)$/i, (_full, attrStr, inner) => {
		const attrs = parseAttributes(attrStr);
		const rawType = attrs.type || attrs.lang || "markdown";
		const fallbackExt = defaultExtForLang(rawType);
		const filename = sanitizeArtifactFilename(attrs.filename || attrs.name || attrs.path || `document.${fallbackExt}`, fallbackExt);
		const lang = inferLanguageFromFilenameOrType(filename, rawType);
		const title = attrs.title || filename;
		const content = String(inner || "").replace(/^\r?\n/, "");
		return pushArtifact({
			filename,
			title,
			lang,
			content,
			isStreaming: Boolean(options?.isStreaming)
		});
	});
	working = working.replace(/⟦FILE:([^\n⟧]+)⟧\r?\n?([\s\S]*?)⟦\/FILE⟧/g, (_full, rawPath, rawContent) => {
		const filename = sanitizeArtifactFilename(rawPath, "txt");
		const content = String(rawContent || "").replace(/^```[^\n]*\r?\n/, "").replace(/\r?\n```\s*$/, "").trim();
		const lang = inferLanguageFromFilenameOrType(filename);
		return pushArtifact({
			filename,
			title: filename,
			lang,
			content,
			isStreaming: false
		});
	});
	working = working.replace(/```([^\n`]*)\r?\n([\s\S]*?)```/g, (full, header, body) => {
		const parts = header.trim().split(/\s+/).filter(Boolean);
		const langHint = parts[0] || "txt";
		let fileToken = parts.length >= 2 ? parts.slice(1).find((p) => /^[\w./-]+\.[a-z0-9]{1,8}$/i.test(p)) : void 0;
		let cleanBody = String(body || "").replace(/\n$/, "");
		if (!fileToken) {
			const firstLineMatch = cleanBody.match(/^\s*(?:\/\/|#|<!--|\/\*)\s*(?:file(?:name)?\s*[:=]\s*)?([\w./-]+\.(?:md|markdown|html|htm|svg|css|scss|js|mjs|ts|tsx|jsx|json|py|csv|sql|sh|yaml|yml|xml|txt))\s*(?:-->|\*\/)?\s*\r?\n/i);
			if (firstLineMatch?.[1]) {
				fileToken = firstLineMatch[1];
				cleanBody = cleanBody.slice(firstLineMatch[0].length);
			}
		}
		if (!fileToken) return full;
		const filename = sanitizeArtifactFilename(fileToken, defaultExtForLang(langHint));
		const lang = inferLanguageFromFilenameOrType(filename, langHint);
		return pushArtifact({
			filename,
			title: filename,
			lang,
			content: cleanBody,
			isStreaming: false
		});
	});
	if (options?.isStreaming) working = working.replace(/<(?:file|smfta_artifact)\b[^>]*$/i, "");
	return {
		artifacts,
		processedText: working.replace(/\n{3,}/g, "\n\n").trim()
	};
}
function mimeForFilename(filename) {
	const ext = filename.split(".").pop()?.toLowerCase() || "";
	if (ext === "md" || ext === "markdown") return "text/markdown;charset=utf-8";
	if (ext === "html" || ext === "htm") return "text/html;charset=utf-8";
	if (ext === "svg") return "image/svg+xml;charset=utf-8";
	if (ext === "json") return "application/json;charset=utf-8";
	if (ext === "csv") return "text/csv;charset=utf-8";
	if (ext === "css") return "text/css;charset=utf-8";
	if (ext === "js") return "application/javascript;charset=utf-8";
	return "text/plain;charset=utf-8";
}
function downloadSingleArtifactFile(artifact) {
	const ext = defaultExtForLang(artifact.lang || "text");
	const filename = sanitizeArtifactFilename(artifact.filename || `file.${ext}`, ext);
	const blob = new Blob([artifact.content], { type: mimeForFilename(filename) });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
async function downloadArtifactsAsZip(files, zipName = "smfta-files.zip") {
	if (!files || files.length === 0) return;
	const zip = new import_lib.default();
	const usedNames = /* @__PURE__ */ new Set();
	for (const f of files) {
		let name = sanitizeArtifactFilename(f.filename, "txt");
		if (usedNames.has(name)) {
			const dotIdx = name.lastIndexOf(".");
			const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
			const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
			let counter = 2;
			while (usedNames.has(`${base}-${counter}${ext}`)) counter++;
			name = `${base}-${counter}${ext}`;
		}
		usedNames.add(name);
		zip.file(name, f.content ?? "");
	}
	const blob = await zip.generateAsync({ type: "blob" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = zipName.endsWith(".zip") ? zipName : `${zipName}.zip`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
function formatArtifactSize(content) {
	const lines = content ? content.split(/\r?\n/).length : 0;
	const bytes = new Blob([content || ""]).size;
	return `${lines} lines · ${bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`}`;
}
var MASTER_PROFILE_NAME = "SAYMON HASAN";
var MASTER_PROFILE_FACTS = [
	"নাম: SAYMON HASAN",
	"পরিচয়: Full-Stack Web & Android Developer from Saudi Arabia",
	"ব্র্যান্ড: MSFTASHOP",
	"নিয়ম: Reply in the user language (clear Bengali for Bengali prompts). Deliver complete, thorough answers for detailed information, long writing, UI/web design, and code update requests without truncation, and never break existing systems."
];
var MASTER_PROFILE_PROMPT_BASELINE = [
	"PERMANENT MASTER USER PROFILE & CORE RULES (ALWAYS REMEMBER & FOLLOW):",
	"- User Name: SAYMON HASAN",
	"- Identity & Location: Full-Stack Web & Android Developer from Saudi Arabia (Brand: MSFTASHOP)",
	"- Reply Rule: Match the user language (clear Bengali for Bengali prompts). Deliver thorough, complete, richly structured answers whenever large writing, deep information, designs, builds, or code updates are requested.",
	"- Code & Design Rule: When asked to design, build, create, or update apps, websites, UI layouts, components, or code, provide complete, full-scale working code with zero truncation or placeholders. Omit code blocks only on purely non-technical questions.",
	"- Safety Rule: Never break existing systems or features."
].join("\n");
/**
* Ensures SAYMON HASAN's permanent master profile facts are pinned in the memory list
* without duplicating existing entries.
*/
function ensureMasterProfileMemory(raw) {
	const migrated = migrateMemory(raw).facts;
	const { facts: merged } = addFacts(migrated, MASTER_PROFILE_FACTS, { source: "user" });
	return factsToText(merged, 200);
}
var KEY_ALIASES = [
	["নাম", /^(?:আমার\s*)?(?:নাম|name|আমাকে\s*ডাকা)\s*[:：]\s*(.+)$/i],
	["পেশা", /^(?:আমার\s*)?(?:পেশা|কাজ|জব|profession|job|work)\s*[:：]\s*(.+)$/i],
	["শহর", /^(?:আমার\s*)?(?:শহর|এলাকা|city|location|থাকা)\s*[:：]\s*(.+)$/i],
	["দেশ", /^(?:আমার\s*)?(?:দেশ|country)\s*[:：]\s*(.+)$/i]
];
/** Lower-cases, trims punctuation and collapses spaces for comparison. */
function normalizeFact(text) {
	return (text || "").toLowerCase().replace(/[।.,!?;:"'“”‘’]/g, "").replace(/\s+/g, " ").trim();
}
/** Pulls the "key" out of a key:value fact ("পেশা: ডেভেলপার" → "পেশা"). */
function factKey(text) {
	const t = (text || "").trim();
	for (const [key, rx] of KEY_ALIASES) if (rx.test(t)) return key;
	const m = t.match(/^([^:：]{2,20})[:：]\s*\S/);
	return m ? normalizeFact(m[1]) : "";
}
/** Accepts either legacy string[] or the v2 object form. */
function migrateMemory(raw) {
	const now = Date.now();
	const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray(raw.facts) ? raw.facts : [];
	const facts = [];
	for (const item of list) {
		if (typeof item === "string") {
			const text = item.trim();
			if (text) facts.push({
				text,
				createdAt: now,
				updatedAt: now
			});
			continue;
		}
		if (item && typeof item === "object") {
			const o = item;
			const text = typeof o.text === "string" ? o.text.trim() : "";
			if (!text) continue;
			facts.push({
				text,
				createdAt: typeof o.createdAt === "number" ? o.createdAt : now,
				updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : now,
				pinned: o.pinned === true,
				hits: typeof o.hits === "number" ? o.hits : 0
			});
		}
	}
	return {
		facts: pruneFacts(facts),
		version: 2
	};
}
/**
* De-duplicates, merges same-key facts (newest wins), keeps pinned items and
* trims to MEMORY_MAX with unpinned/oldest evicted first.
*/
function pruneFacts(facts) {
	const byKey = /* @__PURE__ */ new Map();
	const byText = /* @__PURE__ */ new Map();
	for (const fact of facts) {
		const key = factKey(fact.text);
		if (key) {
			const prev = byKey.get(key);
			if (!prev || fact.updatedAt >= prev.updatedAt) byKey.set(key, {
				...fact,
				pinned: Boolean(fact.pinned || prev?.pinned),
				hits: Math.max(fact.hits || 0, prev?.hits || 0)
			});
			continue;
		}
		const n = normalizeFact(fact.text);
		const prev = byText.get(n);
		if (!prev || fact.updatedAt >= prev.updatedAt) byText.set(n, {
			...fact,
			pinned: Boolean(fact.pinned || prev?.pinned),
			hits: Math.max(fact.hits || 0, prev?.hits || 0)
		});
	}
	const merged = [...byKey.values(), ...byText.values()];
	merged.sort((a, b) => {
		if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
		return b.updatedAt - a.updatedAt;
	});
	if (merged.length <= 200) return merged;
	const pinned = merged.filter((f) => f.pinned);
	const rest = merged.filter((f) => !f.pinned).slice(0, Math.max(0, 200 - pinned.length));
	return [...pinned, ...rest];
}
/** Adds facts to the bank and reports which ones were genuinely new. */
function addFacts(facts, incoming, opts = {}) {
	const now = Date.now();
	const next = [...facts];
	const added = [];
	for (const raw of incoming) {
		const text = (raw || "").replace(/\s+/g, " ").trim().slice(0, 300);
		if (!text) continue;
		const key = factKey(text);
		const n = normalizeFact(text);
		const existingIndex = next.findIndex((f) => key ? factKey(f.text) === key : normalizeFact(f.text) === n);
		if (existingIndex >= 0) {
			const existing = next[existingIndex];
			if (normalizeFact(existing.text) === n) {
				next[existingIndex] = {
					...existing,
					updatedAt: now,
					hits: (existing.hits || 0) + 1
				};
				continue;
			}
			next[existingIndex] = {
				...existing,
				text,
				updatedAt: now,
				hits: existing.hits || 0
			};
			added.push(text);
			continue;
		}
		next.push({
			text,
			createdAt: now,
			updatedAt: now,
			pinned: opts.source === "user",
			hits: 0
		});
		added.push(text);
	}
	return {
		facts: pruneFacts(next),
		added
	};
}
/** Flat list for storage / request payloads (most relevant first). */
function factsToText(facts, limit = 200) {
	return facts.slice(0, limit).map((f) => f.text);
}
/**
* Deduplicates facts by normalized text and by structured `key: value` prefix
* so obsolete or conflicting facts (e.g. older `নাম: ...` entries) never pollute prompts.
*/
function deduplicateFactsList(facts) {
	const seenNorm = /* @__PURE__ */ new Set();
	const seenKeys = /* @__PURE__ */ new Set();
	const out = [];
	for (const fact of facts) {
		const cleanText = (fact.text || "").replace(/^📌\s*/, "").trim();
		if (!cleanText) continue;
		const norm = normalizeFact(cleanText);
		if (!norm || seenNorm.has(norm)) continue;
		const key = factKey(cleanText);
		const hasExplicitKeyValue = cleanText.includes(":") || cleanText.includes("—") || cleanText.includes("=");
		if (hasExplicitKeyValue && key && seenKeys.has(key)) continue;
		seenNorm.add(norm);
		if (hasExplicitKeyValue && key) seenKeys.add(key);
		out.push(fact);
	}
	return out;
}
/**
* Compact, context-aware prompt block. Filters facts against the current
* conversation topic (`activeQuery`) and prevents obsolete, duplicated, or
* conflicting facts from polluting the prompt.
*/
function buildMemoryPromptBlock(facts, opts = {}) {
	const limit = opts.limit ?? 120;
	const maxChars = opts.maxChars ?? 1400;
	const deduped = deduplicateFactsList(facts);
	let candidateTexts;
	if (typeof opts.activeQuery === "string" && opts.activeQuery.trim().length > 0) candidateTexts = retrieveRelevantMemories(opts.activeQuery, deduped, limit);
	else candidateTexts = [...deduped.filter((f) => f.pinned), ...deduped.filter((f) => !f.pinned).slice().sort((a, b) => (b.hits || 0) - (a.hits || 0) || b.updatedAt - a.updatedAt)].slice(0, Math.min(limit, 12)).map((f) => f.text);
	const lines = [];
	let used = 0;
	for (const text of candidateTexts.slice(0, limit)) {
		const line = `- ${text}`;
		if (used + line.length + 1 > maxChars) continue;
		lines.push(line);
		used += line.length + 1;
	}
	if (lines.length === 0 && !opts.userName) return "";
	return `\nMEMORY (context-relevant user facts — use naturally when relevant):` + (opts.userName ? `\n- ইউজারের নাম: ${opts.userName}` : "") + (lines.length ? `\n${lines.join("\n")}` : "");
}
/** Extra auto-detection patterns (name, job, city, likes, goals, birthday). */
function extractMemoryCandidates(text) {
	const clean = (text || "").trim();
	if (!clean || clean.length > 450 || clean.includes("\n") && clean.split("\n").length > 6 && clean.length > 260) return [];
	const out = [];
	const push = (key, value) => {
		const v = (value || "").trim().replace(/[।.,!?]+$/, "");
		if (v.length >= 2 && v.length <= 80) out.push(`${key}: ${v}`);
	};
	for (const { key, rx } of [
		{
			key: "নাম",
			rx: /(?:আমার\s*নাম|my name is|i am|i'm)\s+([^\n।.,!?]{2,40})/i
		},
		{
			key: "পেশা",
			rx: /(?:আমি\s*(?:একজন|একটি|পেশায়)|i\s*(?:work as|am a|am an)|my profession is)\s+([^\n।.,!?]{2,40})/i
		},
		{
			key: "শহর",
			rx: /(?:আমি|i)\s*(?:থাকি|live in|living in)\s+([^\n।.,!?]{2,40})/i
		},
		{
			key: "পছন্দ",
			rx: /(?:আমার\s*পছন্দ|আমি\s*ভালোবাসি|আমার\s*প্রিয়|i like|i love|my favorite)\s+([^\n।.,!?]{2,60})/i
		},
		{
			key: "লক্ষ্য",
			rx: /(?:আমার\s*লক্ষ্য|আমি\s*চাই|my goal is|i want to)\s+([^\n।.,!?]{3,60})/i
		},
		{
			key: "জন্মদিন",
			rx: /(?:আমার\s*জন্মদিন|my birthday is)\s+([^\n।.,!?]{2,40})/i
		},
		{
			key: "ভাষা",
			rx: /(?:আমি\s*বাংলায়|i speak|my language is)\s+([^\n।.,!?]{2,30})/i
		},
		{
			key: "ব্যবসা",
			rx: /(?:আমার\s*(?:ব্যবসা|দোকান|কোম্পানি)|my (?:business|shop|company) is)\s+([^\n।.,!?]{2,50})/i
		}
	]) {
		const m = clean.match(rx);
		if (m && m[1]) push(key, m[1]);
	}
	const nameDirect = clean.match(/^(?:আমার\s*নাম|my name is)\s+([A-Za-z\u0980-\u09FF ]{2,40})$/i);
	if (nameDirect) push("নাম", nameDirect[1]);
	return Array.from(new Set(out));
}
/**
* Rejects passwords, API keys, Bearer tokens, financial numbers, NID/passport IDs,
* and private health/sensitive details from being stored in memory.
*/
function isSensitiveFact(text) {
	if (!text) return false;
	return [
		/(?:password|passcode|passwd|secret_key|private_key|token|api_key|access_token|refresh_token|cvv|pin)\s*[:=]\s*[^\s]+/i,
		/\b(?:sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{20,}|gho_[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z-_]{35}|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})\b/,
		/\bBearer\s+[a-zA-Z0-9_\-\.]{20,}\b/i,
		/(?:পাসওয়ার্ড|সিক্রেট|পিন\s*কোড|গোপন\s*কোড|ব্যাংক\s*অ্যাকাউন্ট|কার্ড\s*নম্বর|ক্রেডিট\s*কার্ড|ডেবিট\s*কার্ড|পাসপোর্ট|এনআইডি|জাতীয়\s*পরিচয়পত্র)\s*[:=ঃ\-]/i,
		/\b(?:\d[ -]*?){13,19}\b/,
		/\b(?:IBAN|SWIFT|routing\s*(?:number|no)|account\s*(?:number|no)|nid|passport(?:\s*no|\s*number)?|ssn)\s*[:=#-]?\s*[a-zA-Z0-9-]{6,}/i,
		/(?:ব্লাড\s*গ্রুপ|ডায়াবেটিস|রোগ|চিকিৎসা|প্রেসক্রিপশন|হেলথ|মেডিকেল\s*রিপোর্ট|diagnosis|prescription|blood\s*pressure|medical\s*record|mental\s*health)/i
	].some((rx) => rx.test(text));
}
/**
* Parses an AI extraction response (strict JSON array or `{ facts: [...] }`) safely,
* rejecting any sensitive items and truncating overly long text.
*/
function parseExtractedMemoriesJson(rawText) {
	const raw = (rawText || "").trim();
	if (!raw) return [];
	const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
	let parsed = null;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		const arrMatch = cleaned.match(/\[[\s\S]*\]/);
		if (arrMatch) try {
			parsed = JSON.parse(arrMatch[0]);
		} catch {
			parsed = null;
		}
	}
	let items = [];
	if (Array.isArray(parsed)) items = parsed;
	else if (parsed && typeof parsed === "object") {
		const obj = parsed;
		if (Array.isArray(obj.facts)) items = obj.facts;
		else if (Array.isArray(obj.memories)) items = obj.memories;
		else if (Array.isArray(obj.items)) items = obj.items;
	}
	const out = [];
	for (const item of items) {
		let line = "";
		if (typeof item === "string") line = item.trim();
		else if (item && typeof item === "object") {
			const o = item;
			const k = typeof o.key === "string" ? o.key.trim() : typeof o.category === "string" ? o.category.trim() : "";
			const v = typeof o.value === "string" ? o.value.trim() : typeof o.fact === "string" ? o.fact.trim() : typeof o.text === "string" ? o.text.trim() : "";
			if (k && v && !v.includes(":")) line = `${k}: ${v}`;
			else line = v;
		}
		line = line.replace(/\s+/g, " ").trim().slice(0, 240);
		if (!line || line.length < 3 || isSensitiveFact(line)) continue;
		out.push(line);
	}
	return Array.from(new Set(out)).slice(0, 10);
}
/**
* Merges incoming AI-extracted facts into an existing flat `string[]` memory list,
* updating same-key entries rather than creating duplicates and preserving pins.
*/
function mergeExtractedMemories(existingFacts, incomingFacts, maxCount = 200) {
	const safeIncoming = (incomingFacts || []).filter((f) => f && !isSensitiveFact(f));
	if (safeIncoming.length === 0) return {
		updated: existingFacts,
		added: []
	};
	const migrated = migrateMemory(existingFacts).facts;
	const { facts, added } = addFacts(migrated, safeIncoming, { source: "ai" });
	return {
		updated: factsToText(facts, maxCount),
		added
	};
}
/**
* Smart semantic & token relevance ranking to inject only pertinent memory facts into context.
* Deduplicates conflicting/duplicate facts and filters out unrelated facts that do not match
* the active conversation topic (unless pinned or core identity).
*/
function retrieveRelevantMemories(query, rawFacts, limit = 8) {
	const q = (query || "").toLowerCase().trim();
	const seenNorm = /* @__PURE__ */ new Set();
	const seenKeys = /* @__PURE__ */ new Set();
	const normalizedFacts = [];
	for (const f of rawFacts) {
		const rawStr = typeof f === "string" ? f : f.pinned ? `📌 ${f.text}` : f.text;
		const isPinned = typeof f === "string" ? f.startsWith("📌 ") : Boolean(f.pinned) || f.text.startsWith("📌 ");
		const cleanText = (typeof f === "string" ? isPinned ? f.slice(3) : f : f.text.replace(/^📌\s*/, "")).trim();
		if (!cleanText || isSensitiveFact(cleanText)) continue;
		const norm = normalizeFact(cleanText);
		if (!norm || seenNorm.has(norm)) continue;
		const key = factKey(cleanText);
		const hasExplicitKeyValue = cleanText.includes(":") || cleanText.includes("—") || cleanText.includes("=");
		if (hasExplicitKeyValue && key && seenKeys.has(key)) continue;
		seenNorm.add(norm);
		if (hasExplicitKeyValue && key) seenKeys.add(key);
		normalizedFacts.push({
			text: cleanText,
			pinned: isPinned,
			raw: rawStr,
			key
		});
	}
	if (!q) return normalizedFacts.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).slice(0, limit).map((f) => f.raw);
	const isExplicitMemoryQuery = /(?:মনে|মেমোরি|memory|remember|know about me|আমার সম্পর্কে|who am i|what is my|আমার\s*(?:নাম|পেশা|শহর|দেশ|লক্ষ্য|পছন্দ|ব্যবসা))/i.test(q);
	const coreIdentityKeys = /* @__PURE__ */ new Set([
		"নাম",
		"পেশা",
		"ভাষা",
		"name",
		"profession",
		"language",
		"role"
	]);
	const stopWords = /* @__PURE__ */ new Set([
		"the",
		"and",
		"for",
		"are",
		"but",
		"not",
		"you",
		"all",
		"can",
		"had",
		"her",
		"was",
		"one",
		"our",
		"out",
		"day",
		"get",
		"has",
		"him",
		"his",
		"how",
		"man",
		"new",
		"now",
		"old",
		"see",
		"two",
		"way",
		"who",
		"boy",
		"did",
		"its",
		"let",
		"put",
		"say",
		"she",
		"too",
		"use",
		"what",
		"when",
		"where",
		"which",
		"with",
		"this",
		"that",
		"from",
		"have",
		"আমি",
		"তুমি",
		"আপনি",
		"আমার",
		"তোমার",
		"কী",
		"কি",
		"কেন",
		"কিভাবে",
		"কখন",
		"একটি",
		"একটা",
		"জন্য",
		"এবং",
		"করে",
		"করো"
	]);
	const qTokens = q.split(/[\s,।!?.:;'"()[\]{}\-_/]+/).map((t) => t.trim()).filter((t) => t.length >= 2 && !stopWords.has(t));
	return normalizedFacts.map((item) => {
		let score = 0;
		if (item.pinned) score += 6;
		if (coreIdentityKeys.has(item.key)) score += 2;
		if (isExplicitMemoryQuery) score += 4;
		const lower = item.text.toLowerCase();
		if (q.length >= 3 && lower.includes(q)) score += 12;
		for (const t of qTokens) if (lower.includes(t)) score += 4;
		return {
			item,
			score
		};
	}).filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item.raw);
}
/**
* Completely wipes both primary and backup memory keys from localStorage.
*/
function clearEntireMemoryBank() {
	try {
		localStorage.removeItem("smfta_memory");
		localStorage.removeItem("smfta_memory_backup");
	} catch (e) {
		console.warn("Failed to clear memory localStorage", e);
	}
}
/**
* User CRUD Helper: Add manual fact with sensitivity check.
*/
function addManualMemoryFact(facts, newFact) {
	const clean = (newFact || "").trim();
	if (!clean) return {
		updated: facts,
		error: "Empty fact cannot be saved"
	};
	if (isSensitiveFact(clean)) return {
		updated: facts,
		error: "Sensitive credentials or keys cannot be saved to memory"
	};
	const norm = normalizeFact(clean.startsWith("📌 ") ? clean.slice(3) : clean);
	if (facts.some((f) => normalizeFact(f.startsWith("📌 ") ? f.slice(3) : f) === norm)) return {
		updated: facts,
		error: "This fact is already in memory"
	};
	return { updated: [clean, ...facts] };
}
/**
* User CRUD Helper: Update existing fact with sensitivity check.
*/
function updateMemoryFact(facts, oldFact, newFact) {
	const clean = (newFact || "").trim();
	if (!clean) return {
		updated: facts,
		error: "Empty fact cannot be saved"
	};
	if (isSensitiveFact(clean)) return {
		updated: facts,
		error: "Sensitive credentials or keys cannot be saved to memory"
	};
	const index = facts.indexOf(oldFact);
	if (index === -1) return {
		updated: facts,
		error: "Original fact not found"
	};
	const next = [...facts];
	next[index] = clean;
	return { updated: next };
}
/**
* User CRUD Helper: Delete a single fact.
*/
function deleteMemoryFact(facts, factToDelete) {
	return facts.filter((f) => f !== factToDelete);
}
/**
* User CRUD Helper: Toggle pinned status on a fact.
*/
function toggleMemoryPin(facts, factText) {
	const index = facts.indexOf(factText);
	if (index === -1) return facts;
	const toggled = factText.startsWith("📌 ") ? factText.slice(3) : `📌 ${factText}`;
	const next = [...facts];
	next[index] = toggled;
	return next;
}
/**
* User CRUD Helper: Search memory facts by text keyword.
*/
function searchMemoryFacts(facts, query) {
	const q = (query || "").toLowerCase().trim();
	if (!q) return facts;
	return facts.filter((f) => f.toLowerCase().includes(q));
}
/**
* V2 – Special (Firebase AI System) Model Catalog, Capabilities, and
* Saudi Arabia (Asia/Riyadh, UTC+3) Daily Quota Engine.
*
* Keeps V1 – Natural (SMFTA Flash, SMFTA Pro, SMFTA Ultra) 100% untouched
* while providing independent routing, capabilities, and daily quota logic
* for V2 – Special (SMFTA V5, SMFTA Pro, SMFTA Max).
*/
var V2_SPECIAL_MODELS = [
	{
		id: "smfta-v5",
		label: "SMFTA V5",
		badge: "Fast · Everyday · Voice",
		desc: "Fast everyday Q&A, smart chat & bilingual voice",
		defaultDailyLimit: 100,
		serverGeminiModel: "gemini-3.5-flash-lite",
		firebaseAiModel: "gemini-3.5-flash-lite",
		temperature: .7,
		thinkingLevel: "LOW",
		maxOutputTokens: 8192,
		contextWindow: 256e3,
		useSearchGrounding: false,
		capabilities: [
			"Fast Everyday Responses",
			"Bilingual Voice Interaction",
			"Firestore Memory Sync",
			"Real-Time Streaming"
		],
		systemDirective: `You are operating as SMFTA V5 (V2 Special Fast Engine). Provide clear, helpful, complete answers in the user's language. When asked for detailed information, long writing, UI/web design, or code updates, provide complete, full-length results without truncating.\n\n${buildCreatorAndSecurityDirective("SMFTA V5")}\n\n${FILE_ARTIFACT_SYSTEM_DIRECTIVE}`
	},
	{
		id: "smfta-v2-pro",
		label: "SMFTA Pro",
		badge: "Coding · Structured",
		desc: "Coding, architecture & structured problem-solving",
		defaultDailyLimit: 40,
		serverGeminiModel: "gemini-3-flash-preview",
		firebaseAiModel: "gemini-3-flash-preview",
		temperature: .4,
		thinkingLevel: "MEDIUM",
		maxOutputTokens: 16384,
		contextWindow: 512e3,
		useSearchGrounding: false,
		capabilities: [
			"Programming & Architecture",
			"Structured Technical Output",
			"Problem Solving",
			"Firestore Memory Sync"
		],
		systemDirective: `You are operating as SMFTA Pro (V2 Special Technical Engine). Focus on programming accuracy, full UI/web design, complete code updates without placeholders, structured explanations, and clean production-ready implementations.\n\n${buildCreatorAndSecurityDirective("SMFTA Pro")}\n\n${FILE_ARTIFACT_SYSTEM_DIRECTIVE}`
	},
	{
		id: "smfta-max",
		label: "SMFTA Max",
		badge: "Deep Analysis · Search",
		desc: "Deep multi-step analysis & search-grounded answers",
		defaultDailyLimit: 15,
		serverGeminiModel: "gemini-3-flash-preview",
		firebaseAiModel: "gemini-3-flash-preview",
		temperature: .2,
		thinkingLevel: "HIGH",
		maxOutputTokens: 32768,
		contextWindow: 1e6,
		useSearchGrounding: true,
		capabilities: [
			"Deep Multi-Step Analysis",
			"Search-Grounded Answers",
			"Complex Task Decomposition",
			"Firestore Memory Sync"
		],
		systemDirective: `You are operating as SMFTA Max (V2 Special Deep-Analysis Engine). Prioritize comprehensive analytical depth, complete large-scale designs and code implementations, extensive writing, grounded factual accuracy, and well-structured detail for demanding tasks.\n\n${buildCreatorAndSecurityDirective("SMFTA Max")}\n\n${FILE_ARTIFACT_SYSTEM_DIRECTIVE}`
	}
];
var V2_MODEL_IDS = V2_SPECIAL_MODELS.map((m) => m.id);
var DEFAULT_V2_LIMITS = {
	"smfta-v5": 100,
	"smfta-v2-pro": 40,
	"smfta-max": 15
};
var V2_WARNING_THRESHOLD_RATIO = .8;
var ADMIN_EMAILS = ["msftashop@gmail.com"];
function isV2ModelId(model) {
	const m = (model || "").trim().toLowerCase();
	return m === "smfta-v5" || m === "smfta-v2-pro" || m === "smfta-max";
}
function getV2ModelSpec(model) {
	const m = (model || "").trim().toLowerCase();
	return V2_SPECIAL_MODELS.find((spec) => spec.id === m) || V2_SPECIAL_MODELS[0];
}
function getV2ModelLabel(model) {
	return getV2ModelSpec(model).label;
}
var V2_FLASH_FIRST_ORDER = {
	"smfta-v5": 0,
	"smfta-v2-pro": 1,
	"smfta-max": 2
};
function sortV2ModelsFlashFirst(models) {
	return [...models].sort((a, b) => (V2_FLASH_FIRST_ORDER[a.id] ?? 9) - (V2_FLASH_FIRST_ORDER[b.id] ?? 9));
}
/**
* Returns the current date string (YYYY-MM-DD) in Saudi Arabia time (Asia/Riyadh, UTC+3).
* Asia/Riyadh is permanently UTC+03:00 with no Daylight Saving Time.
*/
function getRiyadhDateKey(nowMs = Date.now()) {
	try {
		const formatted = new Intl.DateTimeFormat("en-CA", {
			timeZone: "Asia/Riyadh",
			year: "numeric",
			month: "2-digit",
			day: "2-digit"
		}).format(new Date(nowMs));
		if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
	} catch {}
	const riyadhDate = new Date(nowMs + 108e5);
	return `${riyadhDate.getUTCFullYear()}-${String(riyadhDate.getUTCMonth() + 1).padStart(2, "0")}-${String(riyadhDate.getUTCDate()).padStart(2, "0")}`;
}
/**
* Computes the next daily quota reset timestamp at 00:00:00 Asia/Riyadh (21:00:00 UTC).
*/
function getNextRiyadhResetInfo(nowMs = Date.now()) {
	const riyadhOffsetMs = 108e5;
	const riyadhNow = new Date(nowMs + riyadhOffsetMs);
	const nextRiyadhMidnightUtcMs = Date.UTC(riyadhNow.getUTCFullYear(), riyadhNow.getUTCMonth(), riyadhNow.getUTCDate() + 1, 0, 0, 0, 0) - riyadhOffsetMs;
	const msUntilReset = Math.max(0, nextRiyadhMidnightUtcMs - nowMs);
	const totalMinutes = Math.ceil(msUntilReset / 6e4);
	const hoursUntilReset = Math.floor(totalMinutes / 60);
	const minutesUntilReset = totalMinutes % 60;
	return {
		dateRiyadh: getRiyadhDateKey(nowMs),
		nextResetIso: new Date(nextRiyadhMidnightUtcMs).toISOString(),
		msUntilReset,
		hoursUntilReset,
		minutesUntilReset,
		label: `${hoursUntilReset}h ${minutesUntilReset}m (00:00 Asia/Riyadh)`
	};
}
var DEFAULT_V2_QUOTA_CONFIG = {
	v5Limit: DEFAULT_V2_LIMITS["smfta-v5"],
	proLimit: DEFAULT_V2_LIMITS["smfta-v2-pro"],
	maxLimit: DEFAULT_V2_LIMITS["smfta-max"],
	testingAllowance: 500,
	testingBypassEnabled: false
};
function sanitizeV2QuotaConfig(raw) {
	const clamp = (val, fallback, min = 1, max = 1e4) => {
		const n = Number(val);
		if (!Number.isFinite(n)) return fallback;
		return Math.max(min, Math.min(max, Math.round(n)));
	};
	return {
		v5Limit: clamp(raw?.v5Limit, DEFAULT_V2_LIMITS["smfta-v5"]),
		proLimit: clamp(raw?.proLimit, DEFAULT_V2_LIMITS["smfta-v2-pro"]),
		maxLimit: clamp(raw?.maxLimit, DEFAULT_V2_LIMITS["smfta-max"]),
		testingAllowance: clamp(raw?.testingAllowance, 500, 0, 1e4),
		testingBypassEnabled: Boolean(raw?.testingBypassEnabled)
	};
}
function getConfiguredLimitForModel(modelId, config) {
	const clean = sanitizeV2QuotaConfig(config);
	if (modelId === "smfta-v5") return clean.v5Limit;
	if (modelId === "smfta-v2-pro") return clean.proLimit;
	return clean.maxLimit;
}
function evaluateV2ModelQuota(params) {
	const spec = getV2ModelSpec(params.modelId);
	const cleanCfg = sanitizeV2QuotaConfig(params.config);
	const limit = getConfiguredLimitForModel(params.modelId, cleanCfg);
	const used = Math.max(0, Math.floor(Number(params.usedCount) || 0));
	const testingUsed = Math.max(0, Math.floor(Number(params.testingUsedCount) || 0));
	const dateRiyadh = getRiyadhDateKey(params.nowMs);
	const resetInfo = getNextRiyadhResetInfo(params.nowMs);
	const isUnlimitedAdmin = Boolean(params.isAuthorizedTester);
	const isTestingBypass = isUnlimitedAdmin || Boolean(params.isAuthorizedTester && cleanCfg.testingBypassEnabled);
	const testingAllowance = isUnlimitedAdmin ? 0 : cleanCfg.testingAllowance;
	const testingRemaining = isUnlimitedAdmin ? 999999 : Math.max(0, testingAllowance - testingUsed);
	const remaining = isUnlimitedAdmin ? 999999 : Math.max(0, limit - used);
	const percentUsed = isUnlimitedAdmin ? 0 : limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 100;
	const warningThreshold = Math.ceil(limit * V2_WARNING_THRESHOLD_RATIO);
	const isWarning = !isUnlimitedAdmin && !isTestingBypass && used >= warningThreshold && used < limit;
	const isBlocked = isUnlimitedAdmin ? false : isTestingBypass ? testingAllowance > 0 && testingUsed >= testingAllowance : used >= limit;
	let warningMessage = null;
	if (isWarning) warningMessage = `⚠️ ${spec.label} daily usage is at ${percentUsed}% (${used}/${limit} used, ${remaining} left). Resets in ${resetInfo.label}.`;
	let blockedMessage = null;
	if (isBlocked) blockedMessage = isTestingBypass ? `⛔ Testing allowance reached for ${spec.label} (${testingUsed}/${testingAllowance}). Increase testing allowance or wait for reset in ${resetInfo.label}.` : `⛔ Daily limit reached for ${spec.label} (${used}/${limit} requests used today). Quota resets at midnight Saudi Arabia time in ${resetInfo.label}.`;
	const statusText = isUnlimitedAdmin ? "Admin · Unlimited (Zero daily limit)" : isTestingBypass ? `Testing Mode · ${testingRemaining}/${testingAllowance} test reqs left` : `${remaining}/${limit} left today`;
	return {
		modelId: params.modelId,
		label: spec.label,
		dateRiyadh,
		used,
		limit,
		remaining,
		percentUsed,
		warningThreshold,
		isWarning,
		isBlocked,
		isTestingBypass,
		isUnlimited: isUnlimitedAdmin,
		testingUsed,
		testingAllowance,
		testingRemaining,
		statusText,
		warningMessage,
		blockedMessage
	};
}
//#endregion
export { isSensitiveFact as A, sanitizeV2QuotaConfig as B, extractMemoryCandidates as C, getRiyadhDateKey as D, getNextRiyadhResetInfo as E, mergeExtractedMemories as F, sortV2ModelsFlashFirst as H, migrateMemory as I, parseExtractedMemoriesJson as L, looksTruncated as M, matchAnswerLength as N, getV2ModelLabel as O, mergeContinuationText as P, polishReply as R, extractFileArtifacts as S, formatArtifactSize as T, toggleMemoryPin as U, searchMemoryFacts as V, updateMemoryFact as W, downloadArtifactsAsZip as _, MASTER_PROFILE_FACTS as a, ensureMasterProfileMemory as b, V2_MODEL_IDS as c, addManualMemoryFact as d, buildMemoryPromptBlock as f, deleteMemoryFact as g, createIdleWatchdog as h, FILE_ARTIFACT_SYSTEM_DIRECTIVE as i, isV2ModelId as j, getV2ModelSpec as k, V2_SPECIAL_MODELS as l, continuationDirective as m, DEFAULT_IDLE_TIMEOUT_MS as n, MASTER_PROFILE_NAME as o, clearEntireMemoryBank as p, DEFAULT_V2_QUOTA_CONFIG as r, MASTER_PROFILE_PROMPT_BASELINE as s, ADMIN_EMAILS as t, addFacts as u, downloadSingleArtifactFile as v, factsToText as w, evaluateV2ModelQuota as x, dropStallSentences as y, retrieveRelevantMemories as z };
