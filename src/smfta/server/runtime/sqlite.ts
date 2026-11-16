/**
 * Drop-in replacement for the subset of `node:sqlite` (DatabaseSync) the
 * engine uses, backed by the pure-JS (asm.js) build of sql.js so it runs on
 * the edge runtime. Databases are in-memory per server instance — the same
 * ephemeral behaviour the original serverless deployment had with /tmp.
 *
 * `initSqlite()` must resolve before any DatabaseSync is constructed; the
 * API dispatcher awaits it before loading the engine modules.
 */
// @ts-expect-error — sql.js ships no types for the wasm-inline build path
import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';

type SqlJsStatic = {
  Database: new () => SqlJsDatabase;
};
type SqlJsStatement = {
  bind(values: unknown): boolean;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): boolean;
  reset(): void;
};
type SqlJsDatabase = {
  exec(sql: string): unknown;
  run(sql: string, params?: unknown): void;
  prepare(sql: string): SqlJsStatement;
  getRowsModified(): number;
  close(): void;
};

let SQL: SqlJsStatic | null = null;
let initPromise: Promise<void> | null = null;

export function initSqlite(): Promise<void> {
  if (SQL) return Promise.resolve();
  if (!initPromise) {
    initPromise = (initSqlJs as (cfg?: unknown) => Promise<SqlJsStatic>)().then(
      (mod) => {
        SQL = mod;
      }
    );
  }
  return initPromise;
}

type SqlValue = string | number | null | Uint8Array;

function normalizeValue(v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (v instanceof Uint8Array) return v;
  return String(v);
}

function normalizeParams(args: unknown[]): unknown {
  if (
    args.length === 1 &&
    args[0] !== null &&
    typeof args[0] === 'object' &&
    !(args[0] instanceof Uint8Array) &&
    !Array.isArray(args[0])
  ) {
    const named: Record<string, SqlValue> = {};
    for (const [k, v] of Object.entries(args[0] as Record<string, unknown>)) {
      const value = normalizeValue(v);
      if (/^[:$@]/.test(k)) {
        named[k] = value;
      } else {
        named[`:${k}`] = value;
        named[`$${k}`] = value;
        named[`@${k}`] = value;
      }
    }
    return named;
  }
  return args.map(normalizeValue);
}

class StatementSync {
  constructor(
    private readonly owner: DatabaseSync,
    private readonly sql: string
  ) {}

  private withStmt<T>(args: unknown[], fn: (s: SqlJsStatement) => T): T {
    const stmt = this.owner.raw.prepare(this.sql);
    try {
      const params = normalizeParams(args);
      if (Array.isArray(params) ? params.length > 0 : true) stmt.bind(params);
      return fn(stmt);
    } finally {
      stmt.free();
    }
  }

  run(...args: unknown[]): { changes: number; lastInsertRowid: number } {
    this.withStmt(args, (s) => {
      while (s.step()) {
        /* drain */
      }
    });
    const changes = this.owner.raw.getRowsModified();
    let lastInsertRowid = 0;
    try {
      const r = this.owner.raw.prepare('SELECT last_insert_rowid() AS id');
      if (r.step()) lastInsertRowid = Number(r.getAsObject()['id'] ?? 0);
      r.free();
    } catch {
      /* ignore */
    }
    return { changes, lastInsertRowid };
  }

  get(...args: unknown[]): Record<string, unknown> | undefined {
    return this.withStmt(args, (s) => (s.step() ? s.getAsObject() : undefined));
  }

  all(...args: unknown[]): Record<string, unknown>[] {
    return this.withStmt(args, (s) => {
      const rows: Record<string, unknown>[] = [];
      while (s.step()) rows.push(s.getAsObject());
      return rows;
    });
  }
}

export class DatabaseSync {
  public readonly raw: SqlJsDatabase;

  constructor(_path?: string) {
    if (!SQL) {
      throw new Error('SQLite engine not initialised. Call initSqlite() first.');
    }
    this.raw = new SQL.Database();
  }

  exec(sql: string): void {
    // WAL / busy_timeout / synchronous pragmas are meaningless in memory.
    if (/^\s*PRAGMA\s+(journal_mode|busy_timeout|synchronous)\b/i.test(sql)) return;
    this.raw.exec(sql);
  }

  prepare(sql: string): StatementSync {
    return new StatementSync(this, sql);
  }

  close(): void {
    this.raw.close();
  }
}
