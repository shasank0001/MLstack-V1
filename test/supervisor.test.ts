import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Store } from '../src/store.js';
import { propose, approve, runDirectory } from '../src/core.js';
import { launch, reconcile, requestCancellation } from '../src/supervisor.js';
import { alive } from '../src/process.js';
import { fixture, spec, until, settled } from './fixtures.js';
const exec = promisify(execFile);
process.env.MLSTACK_PYTHON = '/nonexistent/mlstack-test-python';

test('unapproved or changed runs never spawn; duplicate requests execute once', async () => {
  const f = fixture();
  try {
    const run = propose(f.store, f.study.id, spec(`const f=require('node:fs'); f.appendFileSync('launches.txt','once\\n'); console.log('ok');`));
    assert.throws(() => launch(f.store, run.id), /Approve/);
    approve(f.store, run.id);
    writeFileSync(join(f.root, 'model.py'), 'changed\n');
    assert.throws(() => launch(f.store, run.id), /changed/);
    approve(f.store, run.id);
    const first = launch(f.store, run.id);
    assert.equal(launch(f.store, run.id).id, first.id);
    await settled(f.store, run.id);
    assert.equal(readFileSync(join(f.root, 'launches.txt'), 'utf8'), 'once\n');
    assert.equal(f.store.run(run.id).ingestion, 'not_available');
    assert.equal(f.store.run(run.id).status, 'completed');
    assert.equal(launch(f.store, run.id).id, first.id);
  } finally { f.cleanup(); }
});

test('a real CLI process exits while its detached job continues, and a new connection recovers results', async () => {
  const f = fixture();
  try {
    const code = `setTimeout(()=>{require('node:fs').writeFileSync(process.env.MLSTACK_METRICS_PATH,JSON.stringify({schema_version:1,metrics:[{name:'accuracy',value:0.7,step:1}]}));console.log('survived client exit')},1200)`;
    const run = propose(f.store, f.study.id, spec(code)); approve(f.store, run.id);
    await exec(process.execPath, [resolve('dist/cli.js'), '--project', f.root, 'launch', run.id], { timeout: 10000, env: process.env });
    const reopened = new Store(f.root);
    try {
      await until(() => reopened.jobFor(run.id)?.status === 'running');
      assert.equal(reopened.run(run.id).status, 'active');
      assert.equal(reconcile(reopened).find(x => x.run_id === run.id)?.status, 'running');
      const done = await settled(reopened, run.id);
      assert.equal(done.status, 'completed'); assert.equal(done.ingestion, 'complete');
      assert.match(readFileSync(join(runDirectory(reopened, run.id), 'stdout.log'), 'utf8'), /survived client exit/);
      assert.ok(existsSync(join(runDirectory(reopened, run.id), 'source', 'model.py')));
    } finally { reopened.close(); }
  } finally { f.cleanup(); }
});

test('nonzero exits remain failures and malformed output is a separate ingestion error', async () => {
  const f = fixture();
  try {
    const run = propose(f.store, f.study.id, spec(`require('node:fs').writeFileSync(process.env.MLSTACK_METRICS_PATH,'bad');console.error('CUDA out of memory');process.exit(2)`));
    approve(f.store, run.id); launch(f.store, run.id);
    const result = await settled(f.store, run.id);
    assert.equal(result.status, 'failed'); assert.equal(result.ingestion, 'error');
    assert.equal(f.store.jobFor(run.id)?.exit_code, 2);
  } finally { f.cleanup(); }
});

test('approved wall-time limits and requested cancellation terminate managed processes', async () => {
  const f = fixture();
  try {
    const timed = spec('setInterval(()=>{},1000)'); timed.timeout_seconds = 1;
    const run = propose(f.store, f.study.id, timed); approve(f.store, run.id); launch(f.store, run.id);
    await settled(f.store, run.id);
    assert.equal(f.store.run(run.id).status, 'cancelled');
    assert.match(f.store.jobFor(run.id)?.reason ?? '', /wall-time/);
    assert.equal(alive(f.store.jobFor(run.id)?.child ?? null), false);
    const cancelled = propose(f.store, f.study.id, spec('setInterval(()=>{},1000)')); approve(f.store, cancelled.id); launch(f.store, cancelled.id);
    await until(() => f.store.jobFor(cancelled.id)?.status === 'running');
    requestCancellation(f.store, cancelled.id);
    await settled(f.store, cancelled.id);
    assert.equal(f.store.run(cancelled.id).status, 'cancelled');
    assert.match(f.store.jobFor(cancelled.id)?.reason ?? '', /User requested/);
  } finally { f.cleanup(); }
});

test('missing supervisor identities reconcile to unknown and never relaunch automatically', () => {
  const f = fixture();
  try {
    const run = propose(f.store, f.study.id, spec()); run.status = 'active'; f.store.put('runs', run);
    f.store.insertJob({ id: 'job-missing', run_id: run.id, status: 'running', worker: { pid: 99999999, start: '1', boot: 'wrong' }, child: null, created_at: new Date(0).toISOString(), started_at: null, finished_at: null, heartbeat_at: null, exit_code: null, signal: null, reason: null, cancel_requested: false });
    assert.equal(reconcile(f.store)[0]?.status, 'unreconciled');
    assert.equal(f.store.run(run.id).status, 'unknown');
    assert.equal(launch(f.store, run.id).id, 'job-missing');
  } finally { f.cleanup(); }
});

test('concurrent CLI clients still produce one job and one execution', async () => {
  const f = fixture();
  try {
    const run = propose(f.store, f.study.id, spec(`require('node:fs').appendFileSync('launches.txt','once\\n');setTimeout(()=>{},300)`));
    approve(f.store, run.id);
    const args = [resolve('dist/cli.js'), '--project', f.root, 'launch', run.id];
    const [a, b] = await Promise.all([exec(process.execPath, args, { env: process.env }), exec(process.execPath, args, { env: process.env })]);
    assert.equal(JSON.parse(a.stdout).id, JSON.parse(b.stdout).id);
    await settled(f.store, run.id);
    assert.equal(readFileSync(join(f.root, 'launches.txt'), 'utf8'), 'once\n');
    assert.equal(f.store.list('jobs').length, 1);
  } finally { f.cleanup(); }
});

test('a stale configured metrics output is rejected before any process starts', () => {
  const f = fixture();
  try {
    const s = spec(); s.metrics_file = 'old-metrics.json';
    writeFileSync(join(f.root, 'old-metrics.json'), JSON.stringify({ schema_version: 1, metrics: [] }));
    const run = propose(f.store, f.study.id, s); approve(f.store, run.id);
    assert.throws(() => launch(f.store, run.id), /already exists/);
    assert.equal(f.store.jobFor(run.id), undefined);
  } finally { f.cleanup(); }
});

test('a killed supervisor with a live child becomes unknown without duplicating or killing the child', async () => {
  const f = fixture();
  let child: ReturnType<typeof f.store.jobFor>;
  try {
    const run = propose(f.store, f.study.id, spec('setInterval(()=>{},1000)')); approve(f.store, run.id); launch(f.store, run.id);
    await until(() => f.store.jobFor(run.id)?.status === 'running');
    child = f.store.jobFor(run.id);
    assert.ok(child?.worker); assert.ok(child.child);
    process.kill(child.worker.pid, 'SIGKILL');
    await until(() => !alive(child!.worker));
    const reconciled = reconcile(f.store).find(job => job.run_id === run.id)!;
    assert.equal(reconciled.status, 'unreconciled');
    assert.equal(f.store.run(run.id).status, 'unknown');
    assert.ok(alive(child.child));
    assert.equal(launch(f.store, run.id).id, child.id);
  } finally {
    if (child?.child && alive(child.child)) {
      process.kill(-child.child.pid, 'SIGKILL');
      await until(() => !alive(child!.child));
    }
    f.cleanup();
  }
});
