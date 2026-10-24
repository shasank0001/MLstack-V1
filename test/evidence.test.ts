import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, spec, settled } from './fixtures.js';
import { propose, ingest, metricPoints, remember, recall, runDirectory, approve, comparisonFacts } from '../src/core.js';
import { inspectRuns } from '../src/inspection.js';
import { readEvidence } from '../src/evidence.js';
import { launch } from '../src/supervisor.js';
process.env.MLSTACK_PYTHON = '/nonexistent/mlstack-evidence-tests';

function completed(f: ReturnType<typeof fixture>, value: number, dataset: string | null = 'v1') {
  const input = spec(); input.protocol.dataset = dataset;
  const run = propose(f.store, f.study.id, input); run.status = 'completed'; f.store.put('runs', run);
  const dir = runDirectory(f.store, run.id); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'metrics.json'), JSON.stringify({ schema_version: 1, metrics: [{ name: 'accuracy', value, step: 1 }] }));
  ingest(f.store, run.id); return f.store.run(run.id);
}

test('saved findings pin measurements and detect newer or tampered evidence', () => {
  const f = fixture();
  try {
    const run = completed(f, 0.8);
    const original = run.metrics_evidence!;
    const memory = remember(f.store, 'finding', 'Observed validation accuracy was 0.8', [run.id], 'One seed');
    writeFileSync(join(runDirectory(f.store, run.id), 'metrics.snapshot.json'), '{}');
    assert.equal(metricPoints(f.store, f.store.run(run.id))[0]?.value, 0.8, 'Mutable cache is not the authoritative captured snapshot');
    writeFileSync(join(runDirectory(f.store, run.id), 'metrics.json'), JSON.stringify({ schema_version: 1, metrics: [{ name: 'accuracy', value: 0.9, step: 1 }] }));
    ingest(f.store, run.id);
    const old = readEvidence(f.store, original) as { metrics: { value: number }[] };
    assert.equal(old.metrics[0]?.value, 0.8);
    const result = recall(f.store, 'accuracy')[0]!;
    assert.equal(result.id, memory.id); assert.equal(result.evidence_status, 'pinned');
    assert.deepEqual(result.newer_metric_evidence_runs, [run.id]);
    writeFileSync(join(f.root, original.artifact), 'tampered');
    assert.equal(recall(f.store, 'accuracy')[0]?.evidence_status, 'requires_review');
    assert.equal(metricPoints(f.store, f.store.run(run.id))[0]?.value, 0.9);
  } finally { f.cleanup(); }
});

test('untested findings are rejected and corrections supersede atomically without deleting history', () => {
  const f = fixture();
  try {
    const planned = propose(f.store, f.study.id, spec());
    assert.throws(() => remember(f.store, 'finding', 'This improves accuracy', [planned.id]), /captured run evidence/);
    const run = completed(f, 0.8);
    const old = remember(f.store, 'finding', 'Accuracy improved', [run.id]);
    const correction = remember(f.store, 'correction', 'Accuracy only observed for a single seed', [run.id], 'Repeatability untested', 'agent', old.id);
    assert.equal(f.store.memory(old.id).status, 'superseded');
    assert.equal(f.store.memory(old.id).superseded_by, correction.id);
    const count = f.store.list('memories').length;
    assert.throws(() => remember(f.store, 'correction', 'Another correction', [], '', 'agent', old.id), /already/);
    assert.equal(f.store.list('memories').length, count);
  } finally { f.cleanup(); }
});

test('inspection combines compact metrics, bounded logs, and compatibility without creating a comparison record', async () => {
  const f = fixture();
  try {
    const a = completed(f, 0.8); const b = completed(f, 0.95, 'v2');
    writeFileSync(join(runDirectory(f.store, b.id), 'stderr.log'), 'x'.repeat(20000));
    const result = await inspectRuns(f.store, { run_ids: [a.id, b.id], logs: true });
    assert.ok('compatibility' in result);
    const facts = result.compatibility![0]!;
    assert.equal('compatibility' in facts ? facts.compatibility : '', 'not_directly_comparable');
    assert.ok(!('interpretation' in facts));
    assert.equal(f.store.list('comparisons').length, 0);
    const second = result.runs[1]!;
    assert.ok('logs' in second); assert.ok(second.logs?.stderr.truncated);
    assert.ok(second.logs!.stderr.text.length <= 6000);
    assert.equal(second.final_metric?.value, 0.95);
  } finally { f.cleanup(); }
});

test('bounded evidence wait returns actual results while training survives an aborted read', async () => {
  const f = fixture();
  try {
    const run = propose(f.store, f.study.id, spec(`setTimeout(()=>require('node:fs').writeFileSync(process.env.MLSTACK_METRICS_PATH, JSON.stringify({schema_version:1,metrics:[{name:'accuracy',value:0.8,step:1}]})),600)`));
    approve(f.store, run.id); launch(f.store, run.id);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(inspectRuns(f.store, { run_ids: [run.id], wait_seconds: 3 }, controller.signal), /aborted/);
    const result = await inspectRuns(f.store, { run_ids: [run.id], wait_seconds: 3 });
    assert.equal(result.runs[0]?.status, 'completed'); assert.equal(result.runs[0]?.final_metric?.value, 0.8);
    await settled(f.store, run.id);
  } finally { f.cleanup(); }
});

test('unreadable evidence degrades inspection and recall instead of hiding all research context', async () => {
  const f = fixture();
  try {
    const a = completed(f, 0.8); const b = completed(f, 0.9);
    remember(f.store, 'finding', 'Measured accuracy needs verification', [a.id]);
    rmSync(join(f.root, a.metrics_evidence!.artifact));
    mkdirSync(join(runDirectory(f.store, a.id), 'stderr.log'));
    const result = await inspectRuns(f.store, { run_ids: [a.id, b.id], logs: true });
    assert.match(result.runs[0]!.metric_error!, /missing or changed/);
    assert.equal(result.runs[0]!.final_metric, null);
    assert.ok('total_metric_points' in result.runs[0]! && result.runs[0]!.total_metric_points === null);
    assert.ok('logs' in result.runs[0]! && result.runs[0]!.logs?.stderr.error);
    const facts = comparisonFacts(f.store, a.id, b.id);
    assert.equal(facts.compatibility, 'insufficient_information'); assert.equal(facts.delta, null);
    assert.equal(recall(f.store, 'accuracy')[0]?.evidence_status, 'requires_review');
    assert.throws(() => remember(f.store, 'finding', 'Do not pin a damaged artifact', [a.id]), /missing or changed/);
  } finally { f.cleanup(); }
});

test('compact series report exact captured and omitted metric counts rather than imply excerpt counts', async () => {
  const f = fixture();
  try {
    const run = completed(f, 0.8);
    const metrics = ['accuracy', 'loss'].flatMap(name => Array.from({ length: 12 }, (_, step) => ({ name, step, value: step / 12 })));
    writeFileSync(join(runDirectory(f.store, run.id), 'metrics.json'), JSON.stringify({ schema_version: 1, metrics }));
    ingest(f.store, run.id);
    const result = await inspectRuns(f.store, { run_ids: [run.id] });
    const detail = result.runs[0]!;
    assert.ok('metrics' in detail);
    assert.equal(detail.total_metric_points, 24); assert.equal(detail.total_metric_names, 2);
    assert.equal(detail.shown_metric_names, 2); assert.equal(detail.omitted_metric_names, 0);
    for (const metric of detail.metrics) {
      assert.equal(metric.total_points, 12); assert.equal(metric.shown_unique_points, 6);
      assert.equal(metric.omitted_points, 6); assert.equal(metric.recent.length, 5);
      assert.deepEqual(metric.last, metric.recent.at(-1), 'Repeated boundary points are not extra captured measurements');
    }
  } finally { f.cleanup(); }
});

test('comparison never subtracts different primary metrics even when both series exist', () => {
  const f = fixture();
  try {
    const a = completed(f, 0.8); const b = completed(f, 0.9);
    b.spec.metric = 'loss'; b.spec.direction = 'minimize'; f.store.put('runs', b);
    writeFileSync(join(runDirectory(f.store, b.id), 'metrics.json'), JSON.stringify({ schema_version: 1, metrics: [
      { name: 'accuracy', value: 0.9, step: 1 }, { name: 'loss', value: 0.2, step: 1 },
    ] }));
    ingest(f.store, b.id);
    const facts = comparisonFacts(f.store, a.id, b.id);
    assert.equal(facts.compatibility, 'not_directly_comparable'); assert.equal(facts.delta, null);
    assert.deepEqual(facts.values.map(value => [value.metric, value.value]), [['accuracy', 0.8], ['loss', 0.2]]);
  } finally { f.cleanup(); }
});

test('inspection bounds source lists and command text and preserves legacy metric snapshots', async () => {
  const f = fixture();
  try {
    const run = completed(f, 0.8);
    delete run.metrics_evidence;
    run.provenance!.files = Array.from({ length: 5000 }, (_, n) => `source-${n}.py`);
    run.spec.source_files = run.provenance!.files; run.spec.command = ['python3', '-c', 'x'.repeat(10000)];
    f.store.put('runs', run);
    assert.equal(metricPoints(f.store, run)[0]?.value, 0.8);
    const memory = remember(f.store, 'finding', 'Legacy accuracy captured', [run.id]);
    assert.equal(memory.evidence?.[0]?.kind, 'metrics');
    const result = await inspectRuns(f.store, { run_ids: [run.id] });
    const detail = result.runs[0]!;
    assert.ok('provenance' in detail && detail.provenance?.files.length === 40);
    assert.equal(detail.provenance!.total_files, 5000);
    assert.ok('spec_truncated' in detail && detail.spec_truncated);
    assert.ok(JSON.stringify(result).length < 12000);
    f.store.db.prepare('DELETE FROM runs WHERE id=?').run(run.id);
    const recalled = recall(f.store, 'Legacy')[0]!;
    assert.equal(recalled.evidence_status, 'requires_review');
    assert.deepEqual(recalled.unavailable_run_ids, [run.id]);
  } finally { f.cleanup(); }
});
