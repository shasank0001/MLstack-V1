import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, realpathSync, existsSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Study, Run, Job, Memory, Project } from './types.js';

export const now = () => new Date().toISOString();
export const id = (prefix: string) => `${prefix}-${randomUUID().slice(0, 12)}`;
type Table = 'studies' | 'runs' | 'jobs' | 'memories' | 'comparisons';

export class Store {
  readonly root: string;
  readonly state: string;
  readonly db: DatabaseSync;
  readonly project: Project;
  constructor(root: string) {
    this.root = realpathSync(root);
    this.state = join(this.root, '.mlstack');
    mkdirSync(this.state, { recursive: true, mode: 0o700 });
    if (realpathSync(this.state) !== this.state) throw new Error('.mlstack must be a real project-local directory, not a symlink');
    this.db = new DatabaseSync(join(this.state, 'state.sqlite'));
    this.db.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS studies (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE REFERENCES runs(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id UNINDEXED, claim, limitations);
      CREATE TABLE IF NOT EXISTS comparisons (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL, aggregate_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT OR IGNORE INTO meta VALUES ('schema_version', '1');
    `);
    const version = this.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as { value: string };
    if (version.value !== '1') { this.db.close(); throw new Error(`Unsupported state schema version ${version.value}`); }
    this.db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES ('project',?)").run(JSON.stringify({ id: id('project'), name: basename(this.root), root_at_creation: this.root, created_at: now() }));
    this.project = JSON.parse((this.db.prepare("SELECT value FROM meta WHERE key='project'").get() as { value: string }).value) as Project;
    if (!existsSync(join(this.state, '.gitignore'))) writeFileSync(join(this.state, '.gitignore'), '*\n!.gitignore\n');
    if (!existsSync(join(this.state, 'project.md'))) writeFileSync(join(this.state, 'project.md'), '# Project context\n\nAdd goals, constraints, and project instructions here.\n');
    if (!existsSync(join(this.state, 'research.md'))) writeFileSync(join(this.state, 'research.md'), '# Research notes\n\nEditable narrative notes. Structured findings are managed through MLStack commands.\n');
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get<T>(table: Table, key: string): T {
    const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(key) as { data: string } | undefined;
    if (!row) throw new Error(`${table}: ${key} not found`);
    return JSON.parse(row.data) as T;
  }
  list<T>(table: Table): T[] {
    return (this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all() as { data: string }[]).map(row => JSON.parse(row.data) as T);
  }
  put(table: Exclude<Table, 'jobs'>, record: { id: string }): void {
    this.db.prepare(`INSERT INTO ${table}(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(record.id, JSON.stringify(record));
  }
  insertJob(job: Job): void {
    this.db.prepare('INSERT INTO jobs(id,run_id,data) VALUES (?,?,?)').run(job.id, job.run_id, JSON.stringify(job));
  }
  putJob(job: Job): void { this.db.prepare('UPDATE jobs SET data=? WHERE id=?').run(JSON.stringify(job), job.id); }
  jobFor(runId: string): Job | undefined {
    const row = this.db.prepare('SELECT data FROM jobs WHERE run_id=?').get(runId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as Job : undefined;
  }
  event(type: string, aggregate: string, payload: unknown): void {
    this.db.prepare('INSERT INTO events(id,type,aggregate_id,payload,created_at) VALUES (?,?,?,?,?)').run(id('evt'), type, aggregate, JSON.stringify(payload), now());
  }
  study(key: string) { return this.get<Study>('studies', key); }
  run(key: string) { return this.get<Run>('runs', key); }
  job(key: string) { return this.get<Job>('jobs', key); }
  memory(key: string) { return this.get<Memory>('memories', key); }
  close() { this.db.close(); }
}
