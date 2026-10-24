import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { propose } from '../src/core.js';
import { identity, alive } from '../src/process.js';
import { stopManagedRun } from '../src/supervisor.js';
import { now } from '../src/store.js';
import type { Job, ProcessIdentity } from '../src/types.js';
import { fixture, spec, until } from './fixtures.js';

async function ownedProcess(code = `setInterval(()=>{},1000); console.log('ready')`, detached = true) {
  const child = spawn(process.execPath, ['-e', code], { detached, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  const [ready] = await once(child.stdout!, 'data');
  const ref = identity(child.pid!);
  assert.ok(ref);
  return { child, ref, closed, ready: String(ready).trim() };
}
async function cleanupProcess(owned: { child: ChildProcess; ref: ProcessIdentity; closed: Promise<unknown> }, detached = true) {
  if (alive(owned.ref)) process.kill(detached ? -owned.ref.pid : owned.ref.pid, 'SIGKILL');
  await owned.closed;
}
function recordedOrphan(f: ReturnType<typeof fixture>, child: ProcessIdentity | null) {
  const run = propose(f.store, f.study.id, spec());
  run.status = 'unknown'; f.store.put('runs', run);
  const job: Job = {
    id: `job-${run.id}`, run_id: run.id, status: 'unreconciled',
    worker: { pid: 99999999, start: '1', boot: 'missing' }, child,
    created_at: now(), started_at: now(), finished_at: null, heartbeat_at: null,
    exit_code: null, signal: null, reason: 'Supervisor missing', cancel_requested: false,
  };
  f.store.insertJob(job);
  return { run, job };
}
function signalEvents(f: ReturnType<typeof fixture>) {
  return f.store.db.prepare("SELECT payload FROM events WHERE type='job.orphan_signal' ORDER BY seq").all()
    .map(row => JSON.parse((row as { payload: string }).payload) as { signal: string });
}

test('active jobs use the existing supervisor cancellation request', async () => {
  const f = fixture();
  try {
    const { run, job } = recordedOrphan(f, null);
    job.status = 'running'; job.worker = identity(process.pid); f.store.putJob(job);
    run.status = 'active'; f.store.put('runs', run);
    const result = await stopManagedRun(f.store, run.id);
    assert.equal(result.status, 'running'); assert.equal(result.cancel_requested, true);
    assert.deepEqual(signalEvents(f), []);
  } finally { f.cleanup(); }
});

test('approved orphan stop terminates only its recorded live group and preserves unknown exit outcome', async () => {
  const f = fixture(); const owned = await ownedProcess(); const unrelated = await ownedProcess();
  try {
    const { run } = recordedOrphan(f, owned.ref);
    const result = await stopManagedRun(f.store, run.id);
    assert.equal(result.status, 'terminated'); assert.equal(result.cancel_requested, true);
    assert.equal(result.exit_code, null); assert.equal(result.signal, null);
    assert.match(result.reason!, /Original exit code.*unknown/);
    assert.equal(f.store.run(run.id).status, 'cancelled');
    assert.equal(f.store.run(run.id).ingestion, 'not_available');
    assert.equal(alive(owned.ref), false); assert.equal(alive(unrelated.ref), true);
    assert.deepEqual(signalEvents(f).map(event => event.signal), ['SIGTERM']);
  } finally { await cleanupProcess(owned); await cleanupProcess(unrelated); f.cleanup(); }
});

test('orphan stop escalates when a managed child ignores SIGTERM', async () => {
  const f = fixture();
  const owned = await ownedProcess(`process.on('SIGTERM',()=>{});setInterval(()=>{},1000);console.log('ready')`);
  try {
    const { run } = recordedOrphan(f, owned.ref);
    const result = await stopManagedRun(f.store, run.id);
    assert.equal(result.status, 'terminated'); assert.equal(result.exit_code, null);
    assert.equal(alive(owned.ref), false);
    assert.deepEqual(signalEvents(f).map(event => event.signal), ['SIGTERM', 'SIGKILL']);
  } finally { await cleanupProcess(owned); f.cleanup(); }
});

test('orphan stop refuses dead, reused-start, and wrong-boot identities without signals', async () => {
  const owned = await ownedProcess();
  try {
    for (const child of [null, { pid: 99999999, start: '1', boot: 'missing' },
      { ...owned.ref, start: `${owned.ref.start}-reused` }, { ...owned.ref, boot: 'another-boot' }]) {
      const f = fixture();
      try {
        const { run, job } = recordedOrphan(f, child);
        await assert.rejects(stopManagedRun(f.store, run.id), /No live child identity can be verified/);
        assert.equal(alive(owned.ref), true); assert.equal(f.store.job(job.id).cancel_requested, false);
        assert.equal(f.store.run(run.id).status, 'unknown'); assert.deepEqual(signalEvents(f), []);
      } finally { f.cleanup(); }
    }
  } finally { await cleanupProcess(owned); }
});

test('orphan stop refuses a live process outside a dedicated managed group', async () => {
  const f = fixture(); const owned = await ownedProcess(undefined, false);
  try {
    const { run } = recordedOrphan(f, owned.ref);
    await assert.rejects(stopManagedRun(f.store, run.id), /not its managed process group\/session leader/);
    assert.equal(alive(owned.ref), true); assert.deepEqual(signalEvents(f), []);
  } finally { await cleanupProcess(owned, false); f.cleanup(); }
});

test('orphan stop can escalate against verified descendants after the group leader exits', async () => {
  const f = fixture();
  const owned = await ownedProcess(`
    const child=require('node:child_process').spawn(process.execPath,['-e',
      "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);console.log('ready')"],{stdio:['ignore','pipe','ignore']});
    child.stdout.once('data',()=>console.log(child.pid));setInterval(()=>{},1000);
  `);
  let descendant: ProcessIdentity | null = null;
  try {
    // The group leader has waited for its descendant's SIGTERM handler before announcing readiness.
    descendant = identity(Number(owned.ready)); assert.ok(descendant);
    const { run } = recordedOrphan(f, owned.ref);
    await stopManagedRun(f.store, run.id);
    assert.equal(alive(owned.ref), false); await until(() => !alive(descendant));
    assert.deepEqual(signalEvents(f).map(event => event.signal), ['SIGTERM', 'SIGKILL']);
  } finally {
    // The descendant is owned by this fixture, and its recorded identity must still match before cleanup.
    if (descendant && alive(descendant)) process.kill(descendant.pid, 'SIGKILL');
    await cleanupProcess(owned); f.cleanup();
  }
});
