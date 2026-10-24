import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, id, now } from './store.js';
import { captureRunArtifacts, verifyCapture } from './artifacts.js';
import { saveEvidence } from './evidence.js';
import { metricPoints, runDirectory, validateMetrics } from './core.js';
import type { Run, RunSpec, MetricsDocument } from './types.js';

function pythonFor(store: Store): string {
  const local = join(fileURLToPath(new URL('../../', import.meta.url)), '.venv', 'bin', 'python');
  return process.env.MLSTACK_PYTHON || (existsSync(local) ? local : 'python3');
}
export function helper(store: Store, request: unknown): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonFor(store), [fileURLToPath(new URL('../../python/mlflow_helper.py', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let exceeded = false;
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('MLflow adapter timed out after 45 seconds')); }, 45000);
    child.stdout.on('data', (data: Buffer) => {
      if (exceeded) return;
      stdout += data.toString();
      if (stdout.length > 32 * 1024 * 1024) { exceeded = true; child.kill('SIGKILL'); }
    });
    child.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-8000); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (exceeded) return reject(new Error('MLflow response exceeds 32 MiB'));
      try {
        const value = JSON.parse(stdout);
        if (code !== 0 || value.error) reject(new Error(String(value.error || stderr || 'MLflow adapter failed').slice(-8000)));
        else resolve(value);
      } catch { reject(new Error((stderr || stdout || `MLflow helper exited ${code}`).slice(-8000))); }
    });
    child.stdin.on('error', () => { /* Spawn failure is reported by the child error handler. */ });
    child.stdin.end(JSON.stringify({ ...(request as object), lock_path: join(store.state, 'mlflow.lock') }));
  });
}
export async function syncMlflow(store: Store, runId: string): Promise<Run> {
  const run = store.run(runId);
  if (run.kind !== 'managed' || !['completed', 'failed', 'cancelled'].includes(run.status)) throw new Error('Only finished managed runs can sync');
  const uri = `sqlite:///${join(store.state, 'mlflow.sqlite')}`;
  try {
    if (run.ingestion === 'pending') throw new Error('Wait for metrics ingestion before syncing MLflow');
    captureRunArtifacts(store, runId);
    const captured = store.run(runId); const manifest = verifyCapture(store, captured);
    if (captured.capture?.status === 'error') throw new Error(`Artifact capture incomplete: ${captured.capture.errors.join('; ')}`);
    const document = { schema_version: 1, metrics: metricPoints(store, run) };
    const value = await helper(store, { operation: 'sync', uri, local_id: run.id, study_id: run.study_id,
      spec: run.spec, source_digest: run.provenance?.source_digest ?? 'unknown',
      capture: captured.capture, manifest, project_root: store.root,
      document, previous_run_id: run.mlflow?.run_id,
      artifact_root: join(store.state, 'mlflow-artifacts'), run_dir: runDirectory(store, runId),
      status: run.status === 'completed' ? 'FINISHED' : run.status === 'cancelled' ? 'KILLED' : 'FAILED' });
    return store.transaction(() => {
      const current = store.run(runId);
      const changed = current.capture?.sha256 !== captured.capture?.sha256 || JSON.stringify({ schema_version: 1, metrics: metricPoints(store, current) }) !== JSON.stringify(document);
      if (!changed) current.mlflow = { uri, run_id: value.run_id };
      current.mlflow_error = changed ? 'Metric evidence changed during synchronization; sync again to publish the latest revision' : null;
      store.put('runs', current); store.event('mlflow.synced', runId, { uri, run_id: value.run_id, revision_digest: value.revision_digest, current: !changed }); return current;
    });
  } catch (error) {
    return store.transaction(() => {
      const current = store.run(runId); current.mlflow_error = error instanceof Error ? error.message : String(error);
      store.put('runs', current); store.event('mlflow.error', runId, { error: current.mlflow_error }); return current;
    });
  }
}
export async function importMlflow(store: Store, studyId: string, uri: string, externalId: string, details: Pick<RunSpec, 'name' | 'metric' | 'direction' | 'protocol'>, options: { refresh?: boolean } = {}): Promise<Run> {
  store.study(studyId);
  if (!uri || !externalId) throw new Error('Tracking URI and external run ID are required');
  const duplicate = store.list<Run>('runs').reverse().find(run => run.kind === 'imported' && run.mlflow?.uri === uri && run.mlflow.run_id === externalId);
  if (duplicate && !options.refresh) return duplicate;
  const result = await helper(store, { operation: 'import', uri, run_id: externalId });
  const document = result.document as MetricsDocument;
  if (document.metrics.length) validateMetrics(document);
  const run: Run = {
    id: id('run'), study_id: studyId, kind: 'imported',
    spec: { ...details, command: ['<imported: command unknown>'], timeout_seconds: 1 }, provenance: null,
    status: result.status === 'FINISHED' ? 'completed' : result.status === 'FAILED' ? 'failed' : result.status === 'KILLED' ? 'cancelled' : 'unknown',
    ingestion: document.metrics.length ? 'complete' : 'not_available', ingestion_error: null,
    import_source: { uri, run_id: externalId, captured_at: now(), ...(duplicate ? { previous_snapshot_id: duplicate.id } : {}), artifact_uri: result.artifact_uri },
    approval_digest: null, approved_at: null, created_at: now(), mlflow: { uri, run_id: externalId }, mlflow_error: null,
  };
  const dir = runDirectory(store, run.id); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'metrics.snapshot.json'), JSON.stringify(document, null, 2));
  writeFileSync(join(dir, 'import.snapshot.json'), JSON.stringify({ ...result, source_uri: uri, captured_at: now() }, null, 2));
  if (document.metrics.length) run.metrics_evidence = saveEvidence(store, run.id, 'metrics', document);
  store.transaction(() => { store.put('runs', run); store.event('run.imported', run.id, { source_uri: uri, source_run_id: externalId, refresh: !!options.refresh, previous_snapshot_id: duplicate?.id }); });
  return run;
}
