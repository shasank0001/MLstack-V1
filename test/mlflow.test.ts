import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { captureRunArtifacts, verifyCapture } from '../src/artifacts.js';
import { join, resolve } from 'node:path';
import { propose, approve, metricPoints, ingest, runDirectory } from '../src/core.js';
import { launch } from '../src/supervisor.js';
import { syncMlflow, importMlflow } from '../src/mlflow.js';
import { fixture, spec, settled } from './fixtures.js';
const python = process.env.MLSTACK_TEST_MLFLOW_PYTHON || (existsSync('.venv/bin/python') ? resolve('.venv/bin/python') : undefined);

test('real MLflow sync is retryable and imported runs retain external evidence without a managed job', { skip: !python, timeout: 120000 }, async () => {
  const f = fixture();
  process.env.MLSTACK_PYTHON = python;
  try {
    const run = propose(f.store, f.study.id, spec()); approve(f.store, run.id); launch(f.store, run.id);
    const done = await settled(f.store, run.id, 60000);
    assert.equal(done.mlflow_error, null, done.mlflow_error ?? '');
    assert.ok(done.mlflow);
    const syncedAgain = await syncMlflow(f.store, run.id);
    assert.equal(syncedAgain.mlflow_error, null, syncedAgain.mlflow_error ?? '');
    assert.equal(syncedAgain.mlflow?.run_id, done.mlflow.run_id);
    const imported = await importMlflow(f.store, f.study.id, done.mlflow.uri, done.mlflow.run_id, {
      name: 'Existing baseline', metric: 'accuracy', direction: 'maximize', protocol: { dataset: null, split: null, evaluation: null },
    });
    assert.equal(imported.kind, 'imported'); assert.equal(imported.provenance, null);
    assert.equal(f.store.jobFor(imported.id), undefined);
    assert.equal(metricPoints(f.store, imported).length, 1, 'retrying sync should not duplicate the metric point');
    assert.equal(metricPoints(f.store, imported)[0]?.value, 0.8);
    assert.throws(() => launch(f.store, imported.id), /managed/);
    const repeated = await importMlflow(f.store, f.study.id, done.mlflow.uri, done.mlflow.run_id, imported.spec);
    assert.equal(repeated.id, imported.id);
    writeFileSync(join(runDirectory(f.store, run.id), 'metrics.json'), JSON.stringify({ schema_version: 1,
      metrics: [{ name: 'accuracy', value: 0.9, step: 0 }] }));
    ingest(f.store, run.id);
    assert.match(f.store.run(run.id).mlflow_error!, /publish the latest revision/);
    const revised = await syncMlflow(f.store, run.id);
    assert.equal(revised.mlflow_error, null, revised.mlflow_error ?? '');
    assert.notEqual(revised.mlflow?.run_id, done.mlflow.run_id, 'Changed metrics publish a distinct external revision');
    const retried = await syncMlflow(f.store, run.id);
    assert.equal(retried.mlflow?.run_id, revised.mlflow?.run_id, 'Retry keeps revision identity');
    const revisedImport = await importMlflow(f.store, f.study.id, revised.mlflow!.uri, revised.mlflow!.run_id, imported.spec);
    assert.deepEqual(metricPoints(f.store, revisedImport).map(point => point.value), [0.9], 'Revisions contain no superseded metric points');
    assert.deepEqual(metricPoints(f.store, imported).map(point => point.value), [0.8], 'Original imported evidence remains unchanged');
  } finally { f.cleanup(); }
});


test('real MLflow preserves frozen artifact bytes, revisions changed outputs, and refreshes external evidence explicitly', { skip: !python, timeout: 120000 }, async () => {
  const f = fixture(); process.env.MLSTACK_PYTHON = python;
  const external = (code: string, ...args: string[]) => JSON.parse(execFileSync(python!, ['-c', code, ...args], { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 20000 }));
  try {
    const run = propose(f.store, f.study.id, { ...spec(`const fs=require('node:fs');fs.writeFileSync('predictions.csv','truth,prediction\\n0,1\\n');fs.writeFileSync(process.env.MLSTACK_METRICS_PATH,JSON.stringify({schema_version:1,metrics:[{name:'accuracy',value:0.8,step:0}]}));console.log('original log')`), artifacts: ['predictions.csv'] });
    approve(f.store, run.id); launch(f.store, run.id);
    const done = await settled(f.store, run.id, 60000); assert.equal(done.mlflow_error, null, done.mlflow_error ?? ''); assert.ok(done.mlflow);
    const manifest = verifyCapture(f.store, done); const output = manifest.files.find(file => file.role === 'output')!;
    const download = `import sys,json,tempfile,hashlib;from pathlib import Path;from mlflow.tracking import MlflowClient;c=MlflowClient(tracking_uri=sys.argv[1]);r=c.get_run(sys.argv[2]);d=tempfile.mkdtemp();p=Path(c.download_artifacts(sys.argv[2],'outputs/predictions.csv',d));print(json.dumps({'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'status':r.info.status,'publication':r.data.tags.get('mlstack.publication_status')}))`;
    const original = external(download, done.mlflow.uri, done.mlflow.run_id);
    assert.equal(original.sha256, output.sha256); assert.equal(original.publication, 'complete'); assert.equal(original.status, 'FINISHED');
    writeFileSync(join(f.root, 'predictions.csv'), 'truth,prediction\n0,0\n'); writeFileSync(join(runDirectory(f.store, run.id), 'stdout.log'), 'mutated after completion');
    const retried = await syncMlflow(f.store, run.id);
    assert.equal(retried.mlflow?.run_id, done.mlflow.run_id, 'retry reuses immutable capture despite mutable sources changing');
    assert.equal(external(download, done.mlflow.uri, done.mlflow.run_id).sha256, output.sha256);
    captureRunArtifacts(f.store, run.id, { refresh: true });
    const revised = await syncMlflow(f.store, run.id); assert.equal(revised.mlflow_error, null, revised.mlflow_error ?? '');
    assert.notEqual(revised.mlflow?.run_id, done.mlflow.run_id, 'changed selected bytes publish a new revision even with identical metrics');
    const revisedOutput = external(download, revised.mlflow!.uri, revised.mlflow!.run_id);
    assert.equal(revisedOutput.sha256, createHash('sha256').update(readFileSync(join(f.root, 'predictions.csv'))).digest('hex'));
    assert.equal(external(download, done.mlflow.uri, done.mlflow.run_id).sha256, output.sha256, 'prior publication unchanged');
    // Simulate an artifact destination failure after metrics were already published.
    external(`import sys,json,shutil;from pathlib import Path;from urllib.parse import urlparse,unquote;from mlflow.tracking import MlflowClient;c=MlflowClient(tracking_uri=sys.argv[1]);p=Path(unquote(urlparse(c.get_run(sys.argv[2]).info.artifact_uri).path))/'outputs'/'predictions.csv';p.unlink();p.mkdir();print(json.dumps(True))`, revised.mlflow!.uri, revised.mlflow!.run_id);
    const failedPublication = await syncMlflow(f.store, run.id); assert.ok(failedPublication.mlflow_error, 'partial publication failure is visible'); assert.equal(failedPublication.status, 'completed');
    const publicationState = external(`import sys,json;from mlflow.tracking import MlflowClient;r=MlflowClient(tracking_uri=sys.argv[1]).get_run(sys.argv[2]);print(json.dumps({'status':r.info.status,'publication':r.data.tags.get('mlstack.publication_status')}))`, revised.mlflow!.uri, revised.mlflow!.run_id);
    assert.equal(publicationState.status, 'RUNNING'); assert.equal(publicationState.publication, 'error');
    writeFileSync(join(f.root, 'predictions.csv'), 'changed yet again, must not be uploaded');
    external(`import sys,json,shutil;from pathlib import Path;from urllib.parse import urlparse,unquote;from mlflow.tracking import MlflowClient;c=MlflowClient(tracking_uri=sys.argv[1]);p=Path(unquote(urlparse(c.get_run(sys.argv[2]).info.artifact_uri).path))/'outputs'/'predictions.csv';shutil.rmtree(p);print(json.dumps(True))`, revised.mlflow!.uri, revised.mlflow!.run_id);
    const recovered = await syncMlflow(f.store, run.id); assert.equal(recovered.mlflow_error, null, recovered.mlflow_error ?? ''); assert.equal(recovered.mlflow?.run_id, revised.mlflow?.run_id);
    assert.equal(external(download, revised.mlflow!.uri, revised.mlflow!.run_id).sha256, revisedOutput.sha256, 'retry after partial failure uses identical frozen bytes');
    const details = { name: 'External', metric: 'accuracy', direction: 'maximize' as const, protocol: { dataset: null, split: null, evaluation: null } };
    const imported = await importMlflow(f.store, f.study.id, revised.mlflow!.uri, revised.mlflow!.run_id, details);
    external(`import sys,json;from mlflow.tracking import MlflowClient;c=MlflowClient(tracking_uri=sys.argv[1]);c.log_metric(sys.argv[2],'accuracy',0.85,step=1);print(json.dumps(True))`, revised.mlflow!.uri, revised.mlflow!.run_id);
    assert.equal((await importMlflow(f.store, f.study.id, revised.mlflow!.uri, revised.mlflow!.run_id, details)).id, imported.id, 'ordinary import preserves captured snapshot');
    const refreshed = await importMlflow(f.store, f.study.id, revised.mlflow!.uri, revised.mlflow!.run_id, details, { refresh: true });
    assert.notEqual(refreshed.id, imported.id); assert.equal(refreshed.import_source?.previous_snapshot_id, imported.id); assert.ok(refreshed.import_source?.captured_at);
    assert.deepEqual(metricPoints(f.store, imported).map(point => point.value), [0.8]); assert.deepEqual(metricPoints(f.store, refreshed).map(point => point.value), [0.8, 0.85]);
    assert.equal((await importMlflow(f.store, f.study.id, revised.mlflow!.uri, revised.mlflow!.run_id, details)).id, refreshed.id, 'default returns latest explicit snapshot');
  } finally { f.cleanup(); }
});
