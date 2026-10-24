import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { ContextMemory, contextMemoryHome } from '../src/memory.js';
import { Store } from '../src/store.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mlstack-context-'));
  const project = join(root, 'project'); mkdirSync(project);
  return { root, home: join(root, 'home'), store: new Store(project) };
}

test('memory reads are pure, missing stores stay missing, and status explains the local backend', async () => {
  const { home, store } = fixture();
  const memory = new ContextMemory(store, { home });
  assert.deepEqual(await memory.list(), []);
  assert.deepEqual(await memory.search('anything'), []);
  assert.equal((await memory.snapshot()).text, '');
  assert.equal(memory.status().backend, 'local SQLite');
  assert.equal(memory.status().pending, 0);
  assert.equal((await memory.forget('missing', 'project')).ok, false);
  assert.equal(existsSync(home), false);
  store.close();
});

test('scopes persist, keyed corrections preserve identity, and project values override user defaults', async () => {
  const { home, store, root } = fixture();
  const memory = new ContextMemory(store, { home });
  const first = await memory.record({ scope: 'user', key: 'style', text: 'Detailed explanations' }, 'one');
  assert.equal(first.ok, true, first.error);
  const correction = await memory.record({ scope: 'user', key: 'style', text: 'Concise explanations', source: 'explicit user' }, 'two');
  assert.equal(correction.ok, true, correction.error);
  assert.equal(first.record?.id, correction.record?.id);
  assert.equal((await memory.list('user')).length, 1);
  assert.equal((await memory.search('CONCISE explanations', 'user'))[0]?.text, 'Concise explanations');
  assert.equal((await memory.search('concise gpu', 'user')).length, 0);
  const scoped = await memory.record({ scope: 'project', key: 'style', text: 'Explain mathematical derivations fully' });
  assert.equal(scoped.ok, true, scoped.error);
  const snapshot = await memory.snapshot();
  assert.equal(snapshot.records.length, 1);
  assert.match(snapshot.text, /derivations/);
  assert.doesNotMatch(snapshot.text, /Concise/);
  const otherPath = join(root, 'other'); mkdirSync(otherPath);
  const other = new Store(otherPath);
  const otherMemory = new ContextMemory(other, { home });
  assert.equal((await otherMemory.list('project')).length, 0);
  assert.equal((await otherMemory.search('derivations', 'project')).length, 0);
  assert.equal((await otherMemory.list('user'))[0]?.text, 'Concise explanations');
  assert.equal((await otherMemory.forget(scoped.record!.id, 'project')).ok, false);
  const restarted = new ContextMemory(store, { home });
  assert.equal((await restarted.list('project'))[0]?.id, scoped.record?.id);
  assert.equal((await restarted.forget(scoped.record!.id, 'project')).ok, true);
  assert.match((await restarted.snapshot()).text, /Concise/);
  other.close(); store.close();
});

test('a fresh Node process retrieves memory using SQLite with no network or extra provider setup', async () => {
  const { home, store } = fixture();
  const memory = new ContextMemory(store, { home });
  assert.equal((await memory.record({ scope: 'project', key: 'device', text: 'Use CPU baselines' })).ok, true);
  const script = `import {Store} from './dist/src/store.js';import {ContextMemory} from './dist/src/memory.js';const store=new Store(${JSON.stringify(store.root)});const memory=new ContextMemory(store,{home:${JSON.stringify(home)}});console.log(JSON.stringify(await memory.list('project')));store.close();`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', cwd: process.cwd(), timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout)[0].text, 'Use CPU baselines');
  store.close();
});

test('idempotent local writes cannot replay an old preference over a newer correction', async () => {
  const { home, store } = fixture();
  const memory = new ContextMemory(store, { home });
  const old = { scope: 'project' as const, key: 'device', text: 'Use GPU' };
  const first = await memory.record(old, 'first');
  assert.equal(first.ok, true);
  assert.equal((await memory.record(old, 'first')).record?.id, first.record?.id);
  assert.equal((await memory.record({ ...old, text: 'Use CPU baselines' }, 'second')).ok, true);
  assert.equal((await memory.record(old, 'first')).record?.text, 'Use CPU baselines');
  assert.equal((await memory.list('project')).length, 1);
  const mismatch = await memory.record({ ...old, text: 'Use TPU' }, 'first');
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.pending, false);
  assert.match(mismatch.error!, /different request/);
  assert.equal((await memory.list('project'))[0]?.text, 'Use CPU baselines');
  store.close();
});

test('forget removes active text and operation receipts without retaining correction history', async () => {
  const { home, store } = fixture();
  const memory = new ContextMemory(store, { home });
  const first = await memory.record({ scope: 'project', key: 'secret-test', text: 'unique-old-test-preference' }, 'old-receipt');
  const corrected = await memory.record({ scope: 'project', key: 'secret-test', text: 'unique-new-test-preference' }, 'new-receipt');
  const file = memory.paths.database;
  assert.doesNotMatch(readFileSync(file).toString('utf8'), /unique-old-test-preference/);
  assert.equal((await memory.forget(corrected.record!.id, 'project')).ok, true);
  assert.equal((await memory.list()).length, 0);
  assert.equal((await memory.snapshot()).text, '');
  const db = new DatabaseSync(file, { readOnly: true });
  assert.equal((db.prepare('SELECT count(*) AS n FROM operations').get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE '%history%'").get() as { n: number }).n, 0);
  db.close();
  assert.doesNotMatch(readFileSync(file).toString('utf8'), /unique-new-test-preference|old-receipt|new-receipt/);
  assert.equal(existsSync(`${file}-wal`), false);
  assert.equal(first.record?.id, corrected.record?.id);
  store.close();
});

test('existing read-only access leaves database bytes and modification time unchanged; snapshots are bounded', async () => {
  const { home, store } = fixture();
  const memory = new ContextMemory(store, { home, maxSnapshotChars: 256 });
  await memory.record({ scope: 'project', key: 'first', text: 'a'.repeat(180) });
  await memory.record({ scope: 'project', key: 'second', text: 'b'.repeat(180) });
  const bytes = readFileSync(memory.paths.database), mtime = statSync(memory.paths.database).mtimeMs;
  await memory.list(); await memory.search('a'); memory.status();
  const snapshot = await memory.snapshot();
  assert.equal(snapshot.stale, true);
  assert.match(snapshot.error!, /omitted/);
  assert.ok(snapshot.text.length <= 256);
  assert.deepEqual(readFileSync(memory.paths.database), bytes);
  assert.equal(statSync(memory.paths.database).mtimeMs, mtime);
  store.close();
});

test('corrupt storage and invalid writes report errors with no pending operation or hidden fallback', async () => {
  const { home, store } = fixture();
  const memory = new ContextMemory(store, { home });
  mkdirSync(memory.paths.directory, { recursive: true });
  writeFileSync(memory.paths.database, 'not a sqlite database');
  assert.deepEqual(await memory.list(), []);
  assert.equal((await memory.snapshot()).stale, true);
  assert.match(memory.status().error!, /database/);
  const failed = await memory.record({ scope: 'project', key: 'device', text: 'Use CPU' });
  assert.equal(failed.ok, false); assert.equal(failed.pending, false);
  assert.equal(readFileSync(memory.paths.database, 'utf8'), 'not a sqlite database');
  const invalid = new ContextMemory(store, { home: join(home, 'invalid') });
  assert.equal((await invalid.record({ scope: 'project', key: '', text: 'value' })).ok, false);
  assert.equal(existsSync(invalid.paths.directory), false);
  const linked = join(home, 'linked'); mkdirSync(linked);
  const linkedHome = join(home, 'linked-home'); mkdirSync(linkedHome); symlinkSync(linked, join(linkedHome, 'memory'));
  const symlinked = new ContextMemory(store, { home: linkedHome });
  assert.match((await symlinked.record({ scope: 'project', key: 'key', text: 'value' })).error!, /symlink/);
  store.close();
});

test('memory home respects explicit overrides, application settings and XDG defaults', () => {
  const previous = { app: process.env.MLSTACK_HOME, xdg: process.env.XDG_CONFIG_HOME };
  try {
    process.env.MLSTACK_HOME = '/example/custom-memory';
    process.env.XDG_CONFIG_HOME = '/example/config';
    assert.equal(contextMemoryHome('/example/explicit'), '/example/explicit');
    assert.equal(contextMemoryHome(), '/example/custom-memory');
    delete process.env.MLSTACK_HOME;
    assert.equal(contextMemoryHome(), '/example/config/mlstack');
    delete process.env.XDG_CONFIG_HOME;
    assert.equal(contextMemoryHome(), join(homedir(), '.config', 'mlstack'));
  } finally {
    if (previous.app === undefined) delete process.env.MLSTACK_HOME; else process.env.MLSTACK_HOME = previous.app;
    if (previous.xdg === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previous.xdg;
  }
});
