import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { approve, assertApproval, propose, ingest, compare, remember, recall, supersede, runDirectory, validateMetrics } from '../src/core.js';
import { validateSpec, projectPath } from '../src/provenance.js';
import { fixture, spec } from './fixtures.js';

test('approval is bound to source and the approved command, not a reusable boolean', () => {
  const f = fixture();
  try {
    const run = propose(f.store, f.study.id, spec());
    assert.throws(() => assertApproval(f.store, run), /approval/i);
    const approved = approve(f.store, run.id);
    assert.doesNotThrow(() => assertApproval(f.store, approved));
    writeFileSync(join(f.root, 'model.py'), '# modified after approval\n');
    assert.throws(() => assertApproval(f.store, approved), /changed/);
    const refreshed = approve(f.store, run.id);
    assert.notEqual(refreshed.approval_digest, approved.approval_digest);
    refreshed.spec.command.push('changed');
    assert.throws(() => assertApproval(f.store, refreshed), /changed/);
  } finally { f.cleanup(); }
});

test('bad metrics do not turn a successful process into fabricated evidence', () => {
  const f = fixture();
  try {
    const run = propose(f.store, f.study.id, spec()); run.status = 'completed'; f.store.put('runs', run);
    mkdirSync(runDirectory(f.store, run.id), { recursive: true });
    assert.equal(ingest(f.store, run.id).status, 'not_available');
    writeFileSync(join(runDirectory(f.store, run.id), 'metrics.json'), '{broken');
    assert.equal(ingest(f.store, run.id).status, 'error');
    assert.equal(f.store.run(run.id).status, 'completed');
    assert.throws(() => validateMetrics({ schema_version: 1, metrics: [{ name: 'loss', value: Infinity, step: 0 }] }), /finite/);
    assert.throws(() => validateMetrics({ schema_version: 1, metrics: [{ name: 'a', value: 1, step: 0 }, { name: 'a', value: 2, step: 0 }] }), /Duplicate/);
  } finally { f.cleanup(); }
});

test('comparisons label changed protocols and unknown provenance rather than declare improvement', () => {
  const f = fixture();
  try {
    function completed(value: number, dataset: string | null) {
      const s = spec(); s.protocol.dataset = dataset;
      const run = propose(f.store, f.study.id, s); run.status = 'completed'; f.store.put('runs', run);
      mkdirSync(runDirectory(f.store, run.id), { recursive: true });
      writeFileSync(join(runDirectory(f.store, run.id), 'metrics.json'), JSON.stringify({ schema_version: 1, metrics: [{ name: 'accuracy', value, step: 1 }] }));
      ingest(f.store, run.id); return run;
    }
    const baseline = completed(0.8, 'v1');
    const candidate = completed(0.9, 'v1');
    assert.equal(compare(f.store, baseline.id, candidate.id).compatibility, 'comparable');
    const changed = completed(0.99, 'v2');
    const invalid = compare(f.store, baseline.id, changed.id);
    assert.equal(invalid.compatibility, 'not_directly_comparable');
    assert.match(invalid.interpretation, /does not support/);
    const unknown = completed(1, null);
    assert.equal(compare(f.store, baseline.id, unknown.id).compatibility, 'insufficient_information');
  } finally { f.cleanup(); }
});

test('research persists across connections, escapes FTS input, and preserves superseded history', () => {
  const f = fixture();
  try {
    const run = propose(f.store, f.study.id, spec());
    run.status = 'completed'; f.store.put('runs', run);
    mkdirSync(runDirectory(f.store, run.id), { recursive: true });
    writeFileSync(join(runDirectory(f.store, run.id), 'metrics.json'), JSON.stringify({ schema_version: 1, metrics: [{ name: 'accuracy', value: 0.8, step: 1 }] }));
    ingest(f.store, run.id);
    const old = remember(f.store, 'finding', 'Batch size improved throughput', [run.id], 'Single run only');
    assert.throws(() => remember(f.store, 'finding', 'Unsupported result'), /evidence/);
    const corrected = remember(f.store, 'correction', 'Batch size finding used another split', [run.id]);
    supersede(f.store, old.id, corrected.id);
    const reopened = new Store(f.root);
    try {
      assert.equal(reopened.project.id, f.store.project.id);
      const hits = recall(reopened, 'batch " OR *');
      assert.equal(hits[0]?.id, corrected.id);
      assert.equal(hits.find(x => x.id === old.id)?.status, 'superseded');
      assert.equal(reopened.memory(old.id).superseded_by, corrected.id);
      assert.equal(reopened.list('comparisons').length, 0);
    } finally { reopened.close(); }
  } finally { f.cleanup(); }
});

test('run specifications reject ambiguous settings and escaped project paths', () => {
  const f = fixture();
  try {
    assert.throws(() => validateSpec({ ...spec(), timeout_seconds: -1 }), /timeout/);
    assert.throws(() => validateSpec({ ...spec(), command: 'python train.py' }), /array/);
    assert.throws(() => validateSpec({ ...spec(), protocol: {} }), /protocol/);
    assert.throws(() => projectPath(f.root, '../outside.py'), /inside/);
  } finally { f.cleanup(); }
});
