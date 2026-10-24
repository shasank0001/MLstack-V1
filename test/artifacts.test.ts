import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync, readFileSync, symlinkSync, writeFileSync, truncateSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { captureRunArtifacts, captureTrainingEnvironment, readCaptureManifest, selectedArtifactPath, verifyCapture } from '../src/artifacts.js';
import { propose, approve, ingest, runDirectory } from '../src/core.js';
import { launch } from '../src/supervisor.js';
import { fixture, spec, settled } from './fixtures.js';

function terminal(f: ReturnType<typeof fixture>, artifacts: string[] = []) {
  const run = propose(f.store, f.study.id, { ...spec(), artifacts });
  run.status = 'completed'; f.store.put('runs', run); mkdirSync(runDirectory(f.store, run.id), { recursive: true });
  writeFileSync(join(runDirectory(f.store, run.id), 'metrics.json'), JSON.stringify({ schema_version: 1, metrics: [{ name: 'accuracy', value: 0.8, step: 0 }] }));
  writeFileSync(join(runDirectory(f.store, run.id), 'stdout.log'), 'original stdout');
  return run;
}

test('selected output capture freezes exact bytes and changed outputs/logs get a new identity with unchanged metrics', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, 'predictions.csv'), 'label,prediction\n0,1\n');
    const run = terminal(f, ['predictions.csv']);
    assert.equal(ingest(f.store, run.id).status, 'complete');
    const first = f.store.run(run.id).capture!; const manifest = verifyCapture(f.store, f.store.run(run.id));
    const output = manifest.files.find(file => file.role === 'output')!;
    assert.equal(readFileSync(join(f.root, output.captured_path), 'utf8'), 'label,prediction\n0,1\n');
    writeFileSync(join(f.root, 'predictions.csv'), 'label,prediction\n0,0\n');
    writeFileSync(join(runDirectory(f.store, run.id), 'stdout.log'), 'changed stdout');
    assert.equal(captureRunArtifacts(f.store, run.id).sha256, first.sha256, 'ordinary retry does not reopen mutable outputs');
    assert.equal(readFileSync(join(f.root, output.captured_path), 'utf8'), 'label,prediction\n0,1\n');
    const second = captureRunArtifacts(f.store, run.id, { refresh: true });
    assert.notEqual(second.sha256, first.sha256);
    assert.equal(captureRunArtifacts(f.store, run.id, { refresh: true }).sha256, second.sha256, 'unchanged refresh is idempotent');
    assert.equal(readFileSync(join(f.root, first.manifest), 'utf8').includes(output.sha256), true);
    writeFileSync(join(f.root, output.captured_path), 'tampered');
    const oldRun = { ...f.store.run(run.id), capture: first };
    assert.throws(() => verifyCapture(f.store, oldRun), /integrity/);
  } finally { f.cleanup(); }
});

test('missing or oversized selected outputs are capture errors independent of execution/metrics', () => {
  const f = fixture();
  try {
    const path = join(f.root, 'huge.bin'); const descriptor = openSync(path, 'w'); closeSync(descriptor); truncateSync(path, 64 * 1024 * 1024 + 1);
    const run = terminal(f, ['missing.csv', 'huge.bin']);
    assert.equal(ingest(f.store, run.id).status, 'complete');
    const current = f.store.run(run.id);
    assert.equal(current.status, 'completed'); assert.equal(current.ingestion, 'complete'); assert.equal(current.capture?.status, 'error');
    assert.match(current.capture!.errors.join(' '), /missing/); assert.match(current.capture!.errors.join(' '), /64 MiB/);
  } finally { f.cleanup(); }
});

test('selected artifacts reject escapes, private state, ambiguous paths, directories and symlinks', () => {
  const f = fixture();
  try {
    for (const file of ['../secret', '/etc/passwd', '.mlstack/state.sqlite', 'outputs/../secret', './secret', 'a//b', 'a\\b']) assert.throws(() => selectedArtifactPath(f.root, file), /Artifact/);
    symlinkSync('/etc/passwd', join(f.root, 'secret')); assert.throws(() => selectedArtifactPath(f.root, 'secret'), /symlink/i);
    assert.throws(() => propose(f.store, f.study.id, { ...spec(), artifacts: ['secret'] }), /symlink/i);
    mkdirSync(join(f.root, 'outputs'));
    const run = terminal(f, ['outputs']); ingest(f.store, run.id);
    assert.match(f.store.run(run.id).capture!.errors.join(' '), /regular file/);
    assert.throws(() => propose(f.store, f.study.id, { ...spec(), artifacts: Array.from({ length: 33 }, (_, i) => `f${i}`) }), /32/);
  } finally { f.cleanup(); }
});

test('environment capture uses the command interpreter and marks unsupported launchers unknown', () => {
  const f = fixture();
  try {
    const environment = captureTrainingEnvironment(['python3', 'model.py'], f.root, 1500);
    assert.equal(environment.status, 'captured'); assert.match(String(environment.python_version), /3\./); assert.equal(environment.gpu, 'unknown');
    assert.equal(captureTrainingEnvironment(['bash', '-lc', 'python model.py'], f.root, 1500).status, 'unknown');
    const run = terminal(f); ingest(f.store, run.id);
    assert.equal(readCaptureManifest(f.store, f.store.run(run.id))?.environment.status, 'unknown');
  } finally { f.cleanup(); }
});

test('managed Python execution saves its own interpreter probe before terminal artifact capture', { timeout: 30000 }, async () => {
  const f = fixture();
  try {
    const run = propose(f.store, f.study.id, { ...spec(), command: ['python3', '-c', "import os,json;open(os.environ['MLSTACK_METRICS_PATH'],'w').write(json.dumps({'schema_version':1,'metrics':[{'name':'accuracy','value':0.8,'step':0}]}))"] });
    approve(f.store, run.id); launch(f.store, run.id);
    const done = await settled(f.store, run.id, 25000); assert.equal(done.status, 'completed');
    const environment = verifyCapture(f.store, done).environment;
    assert.equal(environment.status, 'captured'); assert.match(String(environment.python_version), /3\./);
    assert.ok(!String(environment.interpreter).includes('MLstack-V1/.venv'), 'probe is not the isolated MLflow helper interpreter');
    assert.ok(verifyCapture(f.store, done).files.some(file => file.role === 'source'), 'approved source bytes are part of the manifest');
  } finally { f.cleanup(); }
});

test('source changes during interpreter probing invalidate approval before training can launch', { timeout: 30000 }, async () => {
  const f = fixture();
  try {
    const executable = join(f.root, 'python');
    writeFileSync(executable, `#!${process.execPath}\nimport fs from 'node:fs';\nif (process.argv[2] === '-c') { fs.writeFileSync('model.py', '# changed during environment probe\\n'); console.log('{}'); }\nelse fs.writeFileSync('training-started', 'must not happen');\n`, { mode: 0o700 });
    const run = propose(f.store, f.study.id, { ...spec(), command: [executable, 'model.py'], source_files: ['model.py', 'python'] });
    approve(f.store, run.id); launch(f.store, run.id);
    const done = await settled(f.store, run.id, 25000);
    assert.equal(done.status, 'failed'); assert.equal(f.store.jobFor(run.id)?.child, null);
    assert.match(f.store.jobFor(run.id)?.reason ?? '', /Source or run specification changed since approval/);
    assert.equal(readFileSync(join(f.root, 'model.py'), 'utf8'), '# changed during environment probe\n');
    assert.equal(existsSync(join(f.root, 'training-started')), false, 'training executable must not run after probe changed approved source');
  } finally { f.cleanup(); }
});
