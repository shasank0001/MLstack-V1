import { join } from 'node:path';
import { Store } from './store.js';
import { comparisonFacts, metricPoints, runDirectory } from './core.js';
import { reconcile } from './supervisor.js';
import { readTail } from './evidence.js';
import { readCaptureManifest } from './artifacts.js';
import type { Run, Study } from './types.js';

export interface ReadOptions { run_ids?: string[]; logs?: boolean; wait_seconds?: number; offset?: number; limit?: number; read_only?: boolean; }
const compactText = (text: string, limit = 1000) => text.length > limit ? `${text.slice(0, limit)}… [truncated]` : text;
function summary(store: Store, run: Run) {
  let metric_error: string | null = null;
  let points: ReturnType<typeof metricPoints> = [];
  try { points = metricPoints(store, run).filter(point => point.name === run.spec.metric).sort((a, b) => a.step - b.step); }
  catch (error) { metric_error = error instanceof Error ? error.message : String(error); }
  return { id: run.id, name: compactText(run.spec.name), study_id: run.study_id, kind: run.kind, status: run.status,
    metric: run.spec.metric, direction: run.spec.direction, final_metric: points.at(-1) ?? null,
    ingestion: run.ingestion, ingestion_error: run.ingestion_error ? compactText(run.ingestion_error, 2000) : null,
    metric_error: metric_error ? compactText(metric_error, 2000) : null, mlflow: run.mlflow,
    mlflow_error: run.mlflow_error ? compactText(run.mlflow_error, 2000) : null,
    capture: run.capture ?? null, capture_error: run.capture_error ?? null,
    ...(run.import_source ? { import_source: run.import_source } : {}) };
}
export async function inspectRuns(store: Store, options: ReadOptions = {}, signal?: AbortSignal) {
  const ids = [...new Set(options.run_ids ?? [])];
  if (ids.length > 4) throw new Error('Inspect at most four runs per request');
  ids.forEach(key => store.run(key));
  const wait = options.wait_seconds ?? 0;
  if (!Number.isFinite(wait) || wait < 0 || wait > 30) throw new Error('wait_seconds must be between 0 and 30');
  if (wait && !ids.length) throw new Error('Select run_ids before waiting');
  const deadline = Date.now() + wait * 1000;
  let waited = 0;
  while (ids.length) {
    if (signal?.aborted) throw new Error('Evidence wait was aborted; training jobs continue');
    if (!options.read_only) reconcile(store);
    const pending = ids.some(key => {
      const run = store.run(key);
      return ['proposed', 'approved'].includes(run.status) ? false : run.status === 'active' || run.ingestion === 'pending' && run.status !== 'unknown';
    });
    if (!pending || Date.now() >= deadline) break;
    const duration = Math.min(200, Math.max(0, deadline - Date.now()));
    await new Promise(resolve => setTimeout(resolve, duration)); waited += duration;
  }
  if (!options.read_only) reconcile(store);
  if (!ids.length) {
    const limit = options.limit ?? 10; const offset = options.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 25 || !Number.isInteger(offset) || offset < 0) throw new Error('limit must be 1–25 and offset nonnegative');
    const all = store.list<Run>('runs').reverse();
    return { project: store.project, state_reconciled: !options.read_only, studies: store.list<Study>('studies').slice(-10),
      runs: all.slice(offset, offset + limit).map(run => summary(store, run)), total_runs: all.length,
      next_offset: offset + limit < all.length ? offset + limit : null };
  }
  const runs = ids.map(key => {
    const run = store.run(key);
    const dir = runDirectory(store, key);
    let metricCountsAvailable = false;
    const points = run.ingestion === 'complete' ? (() => {
      try { const captured = metricPoints(store, run); metricCountsAvailable = true; return captured; } catch { return []; }
    })() : [];
    const names = [...new Set(points.map(point => point.name))].sort((a, b) => Number(b === run.spec.metric) - Number(a === run.spec.metric));
    const metrics = names.slice(0, 20).map(name => {
      const series = points.filter(point => point.name === name).sort((a, b) => a.step - b.step);
      const shownUniquePoints = Math.min(series.length, 6);
      return { name, total_points: series.length, shown_unique_points: shownUniquePoints, omitted_points: series.length - shownUniquePoints,
        first: series[0], last: series.at(-1), recent: series.slice(-5) };
    });
    const job = store.jobFor(key) ?? null;
    const { source_files, command, protocol, ...spec } = run.spec;
    let artifacts: unknown = null;
    if (run.capture) {
      try {
        const manifest = readCaptureManifest(store, run);
        artifacts = manifest ? { manifest: run.capture.manifest, sha256: run.capture.sha256, environment: manifest.environment,
          total_files: manifest.files.length, files: manifest.files.slice(0, 40), errors: manifest.errors } : { error: 'Capture manifest is unavailable' };
      } catch (error) { artifacts = { error: error instanceof Error ? error.message : String(error) }; }
    }
    return { ...summary(store, run), spec: { ...spec, name: compactText(spec.name), command: command.slice(0, 20).map(arg => compactText(arg, 2000)),
      protocol: Object.fromEntries(Object.entries(protocol).map(([key, value]) => [key, value === null ? null : compactText(value)])),
      ...(source_files ? { source_files: source_files.slice(0, 40) } : {}) },
      spec_truncated: command.length > 20 || command.some(arg => arg.length > 2000) || (source_files?.length ?? 0) > 40,
      provenance: run.provenance ? { ...run.provenance, files: run.provenance.files.slice(0, 40), total_files: run.provenance.files.length } : null,
      job, metrics, total_metric_points: metricCountsAvailable ? points.length : null,
      total_metric_names: metricCountsAvailable ? names.length : null,
      shown_metric_names: metrics.length, omitted_metric_names: metricCountsAvailable ? names.length - metrics.length : null,
      metrics_evidence: run.metrics_evidence ?? null, artifacts,
      ...(options.logs || ['failed', 'cancelled', 'unknown'].includes(run.status) ? { logs: { stdout: readTail(join(dir, 'stdout.log')), stderr: readTail(join(dir, 'stderr.log')), supervisor: readTail(join(dir, 'supervisor.log'), 3000) } } : {}),
      evidence_directory: dir };
  });
  const compatibility = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    try {
      const { interpretation: _interpretation, ...facts } = comparisonFacts(store, ids[i]!, ids[j]!);
      compatibility.push({ ...facts, reasons: facts.reasons.map(reason => compactText(reason)) });
    } catch (error) { compatibility.push({ run_ids: [ids[i], ids[j]], error: error instanceof Error ? error.message : String(error) }); }
  }
  return { project: store.project.id, runs, compatibility, state_reconciled: !options.read_only, waited_seconds: waited / 1000,
    guidance: 'Interpret these captured observations using the code and evaluation scope. Metric series are compact excerpts: use total_metric_points and total_points for counts; first/last may also occur in recent. Null counts mean evidence was unavailable or unreadable. Matching declared identities do not prove evaluation correctness. No repeated polling is needed for finished runs.' };
}
