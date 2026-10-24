import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import type { Store } from './store.js';

export type ContextScope = 'user' | 'project';
export interface ContextRecord {
  id: string;
  scope: ContextScope;
  key: string;
  text: string;
  source?: string;
  updated_at: string;
}
export interface ContextMemoryOptions { home?: string; maxSnapshotChars?: number }
export interface MemoryAck {
  ok: boolean;
  record?: ContextRecord;
  pending: false;
  operation_id: string;
  error?: string;
}
interface Row {
  id: string;
  namespace: string;
  key: string;
  text: string;
  source: string;
  updated_at: string;
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const timestamp = () => new Date().toISOString();
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function contextMemoryHome(override?: string): string {
  return resolve(override || process.env.MLSTACK_HOME || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'mlstack'));
}
export function contextMemoryPaths(_store: Store, home = contextMemoryHome()) {
  return { home, directory: join(home, 'memory'), database: join(home, 'memory', 'context.sqlite') };
}
function checkedScope(scope: string): asserts scope is ContextScope | 'all' {
  if (!['user', 'project', 'all'].includes(scope)) throw new Error('Choose user, project, or all memory scopes');
}

/** Small scoped preference/context store. Research documents and experiment records stay separate. */
export class ContextMemory {
  readonly paths: ReturnType<typeof contextMemoryPaths>;
  private readError?: string;
  private writeError?: string;
  private readonly snapshotBudget: number;

  constructor(readonly store: Store, options: ContextMemoryOptions = {}) {
    this.paths = contextMemoryPaths(store, contextMemoryHome(options.home));
    this.snapshotBudget = Math.max(256, Math.min(options.maxSnapshotChars ?? 6000, 20_000));
  }
  private namespace(scope: ContextScope): string {
    return scope === 'user' ? 'user' : `project:${this.store.project.id}`;
  }
  private scopes(scope: ContextScope | 'all'): ContextScope[] {
    checkedScope(scope);
    return scope === 'all' ? ['user', 'project'] : [scope];
  }
  private convert(row: Row, scope: ContextScope): ContextRecord {
    return { id: row.id, scope, key: row.key, text: row.text, source: row.source, updated_at: row.updated_at };
  }
  private open(write: boolean): DatabaseSync | undefined {
    if (!write && !existsSync(this.paths.database)) return undefined;
    if (write) {
      mkdirSync(this.paths.directory, { recursive: true, mode: 0o700 });
      if (realpathSync(this.paths.directory) !== this.paths.directory) throw new Error('Memory directory must not be a symlink');
    }
    if (existsSync(this.paths.database) && realpathSync(this.paths.database) !== this.paths.database) throw new Error('Memory database must not be a symlink');
    const db = new DatabaseSync(this.paths.database, { readOnly: !write });
    try {
      db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
      const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
      if (version !== 0 && version !== 1) throw new Error(`Unsupported context memory schema version ${version}`);
      if (write) {
        // DELETE journaling and secure_delete avoid keeping a live WAL/history of forgotten text.
        // Filesystem snapshots and external backups remain outside this operation's scope.
        db.exec(`PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;
          CREATE TABLE IF NOT EXISTS records (
            id TEXT PRIMARY KEY, namespace TEXT NOT NULL, key TEXT NOT NULL,
            text TEXT NOT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL,
            UNIQUE(namespace,key)
          );
          CREATE TABLE IF NOT EXISTS operations (
            namespace TEXT NOT NULL, operation_id TEXT NOT NULL, request_hash TEXT NOT NULL,
            record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
            PRIMARY KEY(namespace,operation_id)
          );
          PRAGMA user_version=1;`);
      }
      return db;
    } catch (error) { db.close(); throw error; }
  }
  private read(scope: ContextScope | 'all'): ContextRecord[] {
    const selected = this.scopes(scope);
    let db: DatabaseSync | undefined;
    try {
      db = this.open(false);
      if (!db) { this.readError = undefined; return []; }
      const records = selected.flatMap(current => {
        const rows = db!.prepare('SELECT * FROM records WHERE namespace=? ORDER BY key').all(this.namespace(current)) as unknown as Row[];
        return rows.map(row => this.convert(row, current));
      });
      this.readError = undefined;
      return records;
    } catch (error) { this.readError = errorText(error); return []; }
    finally { db?.close(); }
  }
  async list(scope: ContextScope | 'all' = 'all'): Promise<ContextRecord[]> { return this.read(scope); }

  async search(query: string, scope: ContextScope | 'all' = 'all'): Promise<ContextRecord[]> {
    // Transparent ordinary text matching: all query terms must occur in key or text.
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 30);
    return this.read(scope).filter(record => {
      const text = `${record.key} ${record.text}`.toLowerCase();
      return terms.every(term => text.includes(term));
    });
  }
  async record(input: { scope: ContextScope; key: string; text: string; source?: string }, operationId: string = randomUUID()): Promise<MemoryAck> {
    let db: DatabaseSync | undefined;
    try {
      checkedScope(input.scope);
      if (input.scope !== 'user' && input.scope !== 'project') throw new Error('Memory writes require user or project scope');
      const key = input.key.trim(), text = input.text.trim(), source = input.source || 'user';
      if (!key || key.length > 120 || !text || text.length > 4000) throw new Error('Memory requires key (1–120 characters) and text (1–4000 characters)');
      if (source.length > 500) throw new Error('Memory source must be at most 500 characters');
      if (!operationId || operationId.length > 240) throw new Error('Memory operation ID must be 1–240 characters');
      const namespace = this.namespace(input.scope);
      const requestHash = hash(JSON.stringify({ key, text, source }));
      db = this.open(true)!;
      db.exec('BEGIN IMMEDIATE');
      const receipt = db.prepare('SELECT request_hash,record_id FROM operations WHERE namespace=? AND operation_id=?').get(namespace, operationId) as { request_hash: string; record_id: string } | undefined;
      if (receipt) {
        if (receipt.request_hash !== requestHash) throw new Error('Memory operation ID already belongs to a different request');
        const row = db.prepare('SELECT * FROM records WHERE namespace=? AND id=?').get(namespace, receipt.record_id) as unknown as Row;
        db.exec('COMMIT'); this.writeError = undefined;
        return { ok: true, pending: false, operation_id: operationId, record: this.convert(row, input.scope) };
      }
      db.prepare(`INSERT INTO records(id,namespace,key,text,source,updated_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(namespace,key) DO UPDATE SET text=excluded.text,source=excluded.source,updated_at=excluded.updated_at`)
        .run(randomUUID(), namespace, key, text, source, timestamp());
      const row = db.prepare('SELECT * FROM records WHERE namespace=? AND key=?').get(namespace, key) as unknown as Row;
      // Receipts contain no historical text; deleting the record cascades to all its receipts.
      db.prepare('INSERT INTO operations(namespace,operation_id,request_hash,record_id) VALUES (?,?,?,?)').run(namespace, operationId, requestHash, row.id);
      db.exec('COMMIT'); this.writeError = undefined;
      return { ok: true, pending: false, operation_id: operationId, record: this.convert(row, input.scope) };
    } catch (error) {
      try { db?.exec('ROLLBACK'); } catch { /* Transaction may not have started. */ }
      this.writeError = errorText(error);
      return { ok: false, pending: false, operation_id: operationId, error: this.writeError };
    } finally { db?.close(); }
  }
  async forget(id: string, scope: ContextScope): Promise<MemoryAck> {
    const operationId = randomUUID();
    let db: DatabaseSync | undefined;
    try {
      if (scope !== 'user' && scope !== 'project') throw new Error('Forget requires user or project scope');
      if (!id) throw new Error('Forget requires a memory ID');
      // Missing data stays missing: forgetting never creates a database.
      if (!existsSync(this.paths.database)) throw new Error('Memory ID was not found in the selected scope');
      db = this.open(true)!;
      db.exec('BEGIN IMMEDIATE');
      const deleted = db.prepare('DELETE FROM records WHERE namespace=? AND id=?').run(this.namespace(scope), id);
      if (!deleted.changes) throw new Error('Memory ID was not found in the selected scope');
      db.exec('COMMIT'); this.writeError = undefined;
      return { ok: true, pending: false, operation_id: operationId };
    } catch (error) {
      try { db?.exec('ROLLBACK'); } catch { /* Transaction may not have started. */ }
      this.writeError = errorText(error);
      return { ok: false, pending: false, operation_id: operationId, error: this.writeError };
    } finally { db?.close(); }
  }
  async snapshot(): Promise<{ text: string; records: ContextRecord[]; stale: boolean; error?: string }> {
    const all = this.read('all');
    const overrides = new Set(all.filter(record => record.scope === 'project').map(record => record.key));
    const selected = all.filter(record => record.scope === 'project' || !overrides.has(record.key))
      .sort((a, b) => a.scope === b.scope ? a.key.localeCompare(b.key) : a.scope === 'project' ? -1 : 1);
    const records: ContextRecord[] = [];
    let text = '', omitted = 0;
    for (const record of selected) {
      const line = `[${record.scope}/${record.key}; source=${record.source || 'unknown'}] ${record.text}\n`;
      if (text.length + line.length > this.snapshotBudget) { omitted++; continue; }
      text += line; records.push(record);
    }
    const issues = [this.readError, this.writeError, omitted ? `${omitted} memory record(s) omitted by context budget; use list/search` : undefined].filter(Boolean);
    return { text, records, stale: issues.length > 0, ...(issues.length ? { error: issues.join('; ') } : {}) };
  }
  status() {
    const records = this.read('all');
    const error = [this.readError, this.writeError].filter(Boolean).join('; ') || undefined;
    return {
      backend: 'local SQLite', retrieval: 'ordinary case-insensitive text matching',
      pending: 0, stale: !!error, ...(error ? { error } : {}), paths: this.paths,
      scopes: (['user', 'project'] as const).map(scope => ({ scope, records: records.filter(record => record.scope === scope).length, pending: 0, ...(error ? { error } : {}) })),
      forget_policy: 'Deletes the active record and its operation receipts. No correction history is stored. External backups and filesystem snapshots are not erased.',
    };
  }
  /** Compatibility only: writes are synchronous local transactions, with no pending queue. */
  async retry() { return this.status(); }
}
const services = new WeakMap<Store, ContextMemory>();
export function getContextMemory(store: Store): ContextMemory {
  let service = services.get(store);
  if (!service) { service = new ContextMemory(store); services.set(store, service); }
  return service;
}
