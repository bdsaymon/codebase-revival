import { o as __toESM } from "../_runtime.mjs";
import { t as require_sql_wasm_inline } from "../_libs/sql.js.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/sqlite-vxxGym0h.js
var import_sql_wasm_inline = /* @__PURE__ */ __toESM(require_sql_wasm_inline());
/**
* Drop-in replacement for the subset of `node:sqlite` (DatabaseSync) the
* engine uses, backed by the pure-JS (asm.js) build of sql.js so it runs on
* the edge runtime. Databases are in-memory per server instance — the same
* ephemeral behaviour the original serverless deployment had with /tmp.
*
* `initSqlite()` must resolve before any DatabaseSync is constructed; the
* API dispatcher awaits it before loading the engine modules.
*/
var SQL = null;
var initPromise = null;
function initSqlite() {
	if (SQL) return Promise.resolve();
	if (!initPromise) initPromise = (0, import_sql_wasm_inline.default)().then((mod) => {
		SQL = mod;
	});
	return initPromise;
}
function normalizeValue(v) {
	if (v === void 0 || v === null) return null;
	if (typeof v === "boolean") return v ? 1 : 0;
	if (typeof v === "bigint") return Number(v);
	if (typeof v === "number" || typeof v === "string") return v;
	if (v instanceof Uint8Array) return v;
	return String(v);
}
function normalizeParams(args) {
	if (args.length === 1 && args[0] !== null && typeof args[0] === "object" && !(args[0] instanceof Uint8Array) && !Array.isArray(args[0])) {
		const named = {};
		for (const [k, v] of Object.entries(args[0])) {
			const value = normalizeValue(v);
			if (/^[:$@]/.test(k)) named[k] = value;
			else {
				named[`:${k}`] = value;
				named[`$${k}`] = value;
				named[`@${k}`] = value;
			}
		}
		return named;
	}
	return args.map(normalizeValue);
}
var StatementSync = class {
	owner;
	sql;
	constructor(owner, sql) {
		this.owner = owner;
		this.sql = sql;
	}
	withStmt(args, fn) {
		const stmt = this.owner.raw.prepare(this.sql);
		try {
			const params = normalizeParams(args);
			if (Array.isArray(params) ? params.length > 0 : true) stmt.bind(params);
			return fn(stmt);
		} finally {
			stmt.free();
		}
	}
	run(...args) {
		this.withStmt(args, (s) => {
			while (s.step());
		});
		const changes = this.owner.raw.getRowsModified();
		let lastInsertRowid = 0;
		try {
			const r = this.owner.raw.prepare("SELECT last_insert_rowid() AS id");
			if (r.step()) lastInsertRowid = Number(r.getAsObject()["id"] ?? 0);
			r.free();
		} catch {}
		return {
			changes,
			lastInsertRowid
		};
	}
	get(...args) {
		return this.withStmt(args, (s) => s.step() ? s.getAsObject() : void 0);
	}
	all(...args) {
		return this.withStmt(args, (s) => {
			const rows = [];
			while (s.step()) rows.push(s.getAsObject());
			return rows;
		});
	}
};
var DatabaseSync = class {
	raw;
	constructor(_path) {
		if (!SQL) throw new Error("SQLite engine not initialised. Call initSqlite() first.");
		this.raw = new SQL.Database();
	}
	exec(sql) {
		if (/^\s*PRAGMA\s+(journal_mode|busy_timeout|synchronous)\b/i.test(sql)) return;
		this.raw.exec(sql);
	}
	prepare(sql) {
		return new StatementSync(this, sql);
	}
	close() {
		this.raw.close();
	}
};
//#endregion
export { initSqlite as n, DatabaseSync as t };
