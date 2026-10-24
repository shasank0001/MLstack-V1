import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { bundledSkills, workflowRoutes, parseWorkflow, workflowPrompt, workflowCompletions, tokenize } from '../src/workflows.js';
import { inspectRuns } from '../src/inspection.js';
import { propose } from '../src/core.js';
import { fixture, spec } from './fixtures.js';
import type { Job } from '../src/types.js';

test('workflow routes select predictable defaults and explicit host modes while retaining literal requests', () => {
  assert.equal(parseWorkflow('/ml define', 'act').mode, 'discuss');
  assert.equal(parseWorkflow('/ml experiment compare learning rates', 'act').mode, 'plan');
  const selected = parseWorkflow('/ml --act experiment run train.py --lr "0.1"');
  assert.equal(selected.route, 'experiment'); assert.equal(selected.mode, 'act');
  assert.equal(selected.request, 'run train.py --lr "0.1"');
  assert.equal(parseWorkflow('/ml debug --plan run-123').mode, 'plan');
  assert.equal(parseWorkflow('/ml What should we try next?', 'act').mode, 'act');
  assert.equal(parseWorkflow('/ml --discuss').modeOnly, true);
  assert.equal(parseWorkflow('/ml').help, true);
  assert.equal(parseWorkflow('/ml help').help, true);
  assert.equal(parseWorkflow('/ml help me choose a baseline').request, 'help me choose a baseline');
});

test('request text cannot covertly become mode switches and conflicting controls fail', () => {
  const literal = parseWorkflow('/ml review Explain the --act flag');
  assert.equal(literal.mode, 'discuss'); assert.equal(literal.explicitMode, false);
  assert.equal(parseWorkflow('/ml -- --act is just text').mode, 'discuss');
  assert.equal(parseWorkflow('/ml -- --act is just text').request, '--act is just text');
  assert.equal(parseWorkflow('/ml --mode=plan define goals').mode, 'plan');
  assert.throws(() => parseWorkflow('/ml --act --discuss experiment'), /only one/);
  assert.throws(() => parseWorkflow('/ml --mode unsafe'), /Mode must/);
  assert.throws(() => parseWorkflow('/ml --execute-all'), /Unknown workflow option/);
  assert.equal(parseWorkflow("/ml What's the candidate's next step?").request, "What's the candidate's next step?");
  assert.equal(parseWorkflow('/ml define "an open question').request, '"an open question');
  assert.equal(parseWorkflow('/ml "--act" is literal').mode, 'discuss');
  assert.deepEqual(tokenize('run "argument with spaces" \'literal\''), ['run', 'argument with spaces', 'literal']);
});

test('all advertised workflow references exist within their declared reviewed skills', () => {
  assert.equal(workflowRoutes.length, 11);
  for (const skill of bundledSkills) {
    const entry = readFileSync(skill.path, 'utf8'); assert.ok(entry.startsWith('---\n'));
    for (const reference of skill.references) assert.ok(existsSync(join(dirname(skill.path), 'references', reference)), `${skill.name}/${reference}`);
  }
  for (const route of workflowRoutes) {
    const prompt = workflowPrompt({ route: route.name, mode: route.mode, request: 'Inspect the current project only.' });
    const skill = bundledSkills.find(skill => skill.name === route.skill)!;
    assert.ok(prompt.includes(join(dirname(skill.path), 'references', route.reference)));
  }
  assert.ok(workflowCompletions('/ml exp')[0].includes('/ml experiment'));
  assert.ok(workflowCompletions('/ml --act exp')[0].includes('/ml --act experiment'));
  assert.ok(workflowCompletions('/ml experiment --p')[0].includes('/ml experiment --plan'));
});

test('workflow help works without credentials and does not initialize project state', () => {
  const base = resolve('work/tests'); mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'help-'));
  try {
    const result = spawnSync(process.execPath, [resolve('dist/cli.js'), '--project', root, 'ml', '--help'], { cwd: root, encoding: 'utf8', env: { ...process.env, PI_CODING_AGENT_DIR: join(root, 'no-provider') } });
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /\/ml define/); assert.match(result.stdout, /\/ml --discuss/);
    assert.equal(existsSync(join(root, '.mlstack')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('read-only inspection reports captured state without reconciling or writing events', async () => {
  const f = fixture();
  try {
    const run = propose(f.store, f.study.id, spec()); run.status = 'active'; f.store.put('runs', run);
    const job: Job = { id: 'missing-worker', run_id: run.id, status: 'running', worker: { pid: 99999999, start: '0', boot: 'missing-boot' }, child: null,
      created_at: '2000-01-01T00:00:00Z', started_at: '2000-01-01T00:00:00Z', finished_at: null, heartbeat_at: null, exit_code: null, signal: null, reason: null, cancel_requested: false };
    f.store.insertJob(job);
    const before = f.store.db.prepare('SELECT COUNT(*) AS count FROM events').get();
    const captured = await inspectRuns(f.store, { run_ids: [run.id], read_only: true });
    assert.equal(captured.state_reconciled, false); assert.equal(f.store.run(run.id).status, 'active');
    assert.deepEqual(f.store.db.prepare('SELECT COUNT(*) AS count FROM events').get(), before);
    await inspectRuns(f.store, { run_ids: [run.id] });
    assert.equal(f.store.run(run.id).status, 'unknown'); assert.equal(f.store.jobFor(run.id)?.status, 'unreconciled');
  } finally { f.cleanup(); }
});
