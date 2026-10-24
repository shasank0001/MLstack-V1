import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { captureRunArtifacts, selectedArtifactPath } from './artifacts.js';
import { Store, id, now } from './store.js';
import { saveEvidence, readEvidence, readTail, evidenceState } from './evidence.js';
import { provenance, executionDigest, projectPath, validateSpec } from './provenance.js';
import type { Study, Run, RunSpec, MetricPoint, MetricsDocument, Memory, MemoryKind, EvidenceRef } from './types.js';

export function createStudy(store: Store, title: string, hypothesis: string): Study {
  if (!title.trim() || !hypothesis.trim()) throw new Error('Study title and hypothesis are required');
  const study: Study = { id: id('study'), title, hypothesis, created_at: now() };
  store.transaction(() => { store.put('studies', study); store.event('study.created', study.id, study); });
  return study;
}
export function propose(store: Store, studyId: string, input: unknown): Run {
  store.study(studyId);
  const spec = validateSpec(input);
  if (spec.baseline_run_id) store.run(spec.baseline_run_id);
  for (const file of spec.artifacts ?? []) selectedArtifactPath(store.root, file);
  if (spec.metrics_file) projectPath(store.root, spec.metrics_file);
  const run: Run = {
    id: id('run'), study_id: studyId, kind: 'managed', spec, provenance: provenance(store.root, spec),
    status: 'proposed', ingestion: 'pending', ingestion_error: null, approval_digest: null, approved_at: null,
    created_at: now(), mlflow: null, mlflow_error: null,
  };
  store.transaction(() => { store.put('runs', run); store.event('run.proposed', run.id, run); });
  return run;
}
export function approve(store: Store, runId: string): Run {
  return store.transaction(() => {
    const run = store.run(runId);
    if (run.kind !== 'managed' || !['proposed', 'approved'].includes(run.status) || store.jobFor(runId)) throw new Error('Only unlaunched managed runs can be approved');
    run.provenance = provenance(store.root, run.spec);
    run.approval_digest = executionDigest(run.spec, run.provenance);
    run.approved_at = now(); run.status = 'approved';
    store.put('runs', run); store.event('run.approved', run.id, { digest: run.approval_digest, author: 'user' });
    return run;
  });
}
export function assertApproval(store: Store, run: Run): void {
  if (!run.approval_digest || !run.provenance || !run.approved_at) throw new Error('Explicit approval is required before launch');
  if (executionDigest(run.spec, provenance(store.root, run.spec)) !== run.approval_digest) throw new Error('Source or run specification changed since approval. Approve the run again.');
}
export const runDirectory = (store: Store, runId: string) => join(store.state, 'runs', runId);
export function metricsPath(store: Store, run: Run): string {
  return run.spec.metrics_file ? projectPath(store.root, run.spec.metrics_file) : join(runDirectory(store, run.id), 'metrics.json');
}
export function snapshotSource(store: Store, run: Run): void {
  const dest = join(runDirectory(store, run.id), 'source');
  for (const file of run.provenance?.files ?? []) {
    const source = projectPath(store.root, file);
    const target = join(dest, relative(store.root, source));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
  writeFileSync(join(runDirectory(store, run.id), 'spec.json'), JSON.stringify({ spec: run.spec, provenance: run.provenance, approved_at: run.approved_at }, null, 2));
}
export function validateMetrics(value: unknown): MetricsDocument {
  if (!value || typeof value !== 'object') throw new Error('Metrics must be an object');
  const doc = value as Record<string, unknown>;
  if (Object.keys(doc).some(key => !['schema_version', 'metrics'].includes(key))) throw new Error('Unknown metrics document field');
  if (doc.schema_version !== 1 || !Array.isArray(doc.metrics) || doc.metrics.length === 0) throw new Error('Expected schema_version: 1 and a nonempty metrics array');
  if (doc.metrics.length > 100000) throw new Error('At most 100,000 metric points per document');
  const seen = new Set<string>();
  const metrics = doc.metrics.map((input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('Metric points must be objects');
    const p = input as Record<string, unknown>;
    if (Object.keys(p).some(key => !['name', 'value', 'step', 'timestamp'].includes(key))) throw new Error('Unknown metric point field');
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 250) throw new Error('Each metric needs a name (1–250 characters)');
    if (typeof p.value !== 'number' || !Number.isFinite(p.value)) throw new Error('Metric value must be finite');
    if (typeof p.step !== 'number' || !Number.isSafeInteger(p.step) || p.step < 0) throw new Error('Metric step must be a nonnegative safe integer');
    if (p.timestamp !== undefined && (typeof p.timestamp !== 'number' || !Number.isSafeInteger(p.timestamp) || p.timestamp < 0)) throw new Error('Metric timestamp must be epoch milliseconds');
    const key = JSON.stringify([p.name, p.step]);
    if (seen.has(key)) throw new Error(`Duplicate metric/step: ${p.name}/${p.step}`);
    seen.add(key);
    return { name: p.name, value: p.value, step: p.step, ...(p.timestamp !== undefined ? { timestamp: p.timestamp as number } : {}) };
  });
  return { schema_version: 1, metrics };
}
function captureAfterIngest(store: Store, runId: string): void {
  try { captureRunArtifacts(store, runId, { refresh: true }); }
  catch (error) { store.transaction(() => { const run = store.run(runId); run.capture_error = error instanceof Error ? error.message : String(error); store.put('runs', run); store.event('artifacts.error', runId, { error: run.capture_error }); }); }
}
export function ingest(store: Store, runId: string): { status: string; points: number; error?: string } {
  const run = store.run(runId);
  if (run.kind === 'imported') throw new Error('Imported evidence is read-only. Re-import to refresh it.');
  if (['proposed', 'approved', 'active'].includes(run.status)) throw new Error('Ingestion waits until execution has finished');
  const dir = runDirectory(store, run.id); mkdirSync(dir, { recursive: true });
  try {
    const path = metricsPath(store, run);
    if (!existsSync(path)) {
      store.transaction(() => {
        const current = store.run(run.id); current.ingestion = 'not_available'; current.ingestion_error = null;
        if (current.mlflow) current.mlflow_error = 'Metric evidence is unavailable; MLflow still points to the previous captured revision';
        store.put('runs', current); store.event('metrics.unavailable', run.id, {});
      });
      captureAfterIngest(store, run.id);
      return { status: 'not_available', points: 0 };
    }
    if (statSync(path).size > 32 * 1024 * 1024) throw new Error('Metrics document exceeds 32 MiB');
    const doc = validateMetrics(JSON.parse(readFileSync(path, 'utf8')));
    writeFileSync(join(dir, 'metrics.snapshot.json'), JSON.stringify(doc, null, 2));
    const evidence = saveEvidence(store, run.id, 'metrics', doc);
    store.transaction(() => {
      const current = store.run(run.id);
      if (current.mlflow && current.metrics_evidence?.sha256 !== evidence.sha256) current.mlflow_error = 'Metric evidence changed; sync MLflow to publish the latest revision';
      current.metrics_evidence = evidence; current.ingestion = 'complete'; current.ingestion_error = null;
      store.put('runs', current); store.event('metrics.ingested', run.id, { points: doc.metrics.length, source: path });
    });
    captureAfterIngest(store, run.id);
    return { status: 'complete', points: doc.metrics.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.transaction(() => {
      const current = store.run(run.id); current.ingestion = 'error'; current.ingestion_error = message;
      if (current.mlflow) current.mlflow_error = 'Metric ingestion failed; MLflow still points to the previous captured revision';
      store.put('runs', current); store.event('metrics.error', run.id, { error: message });
    });
    captureAfterIngest(store, run.id);
    return { status: 'error', points: 0, error: message };
  }
}
export function metricPoints(store: Store, run: Run): MetricPoint[] {
  if (run.ingestion !== 'complete') return [];
  if (run.metrics_evidence) return validateMetrics(readEvidence(store, run.metrics_evidence)).metrics;
  const path = join(runDirectory(store, run.id), 'metrics.snapshot.json');
  return validateMetrics(JSON.parse(readFileSync(path, 'utf8'))).metrics;
}
export interface Comparison {
  id: string; created_at: string; run_ids: string[]; metric: string;
  compatibility: 'comparable' | 'not_directly_comparable' | 'insufficient_information';
  reasons: string[]; values: { run_id: string; metric: string; value: number | null; step: number | null }[];
  delta: number | null; interpretation: string;
}
export function comparisonFacts(store: Store, leftId: string, rightId: string): Omit<Comparison, 'id' | 'created_at'> {
  if (leftId === rightId) throw new Error('Select two different runs');
  const runs = [store.run(leftId), store.run(rightId)] as const;
  const [left, right] = runs;
  const reasons: string[] = []; let mismatch = false; let missing = false;
  for (const field of ['dataset', 'split', 'evaluation'] as const) {
    const a = left.spec.protocol[field]; const b = right.spec.protocol[field];
    if (!a || !b) { missing = true; reasons.push(`Unknown ${field} identity`); }
    else if (a !== b) { mismatch = true; reasons.push(`Different ${field}: ${a} / ${b}`); }
  }
  if (left.spec.metric !== right.spec.metric || left.spec.direction !== right.spec.direction) {
    mismatch = true; reasons.push('Different primary metric or optimization direction');
  }
  const values = runs.map(run => {
    let points: MetricPoint[] = [];
    try { points = metricPoints(store, run).filter(p => p.name === run.spec.metric).sort((a, b) => b.step - a.step); }
    catch (error) { reasons.push(`Metric evidence unreadable for ${run.id}: ${error instanceof Error ? error.message : String(error)}`); }
    const point = points[0];
    if (!point) { missing = true; reasons.push(`Primary metric unavailable for ${run.id}`); }
    if (run.status !== 'completed') { missing = true; reasons.push(`${run.id} execution is ${run.status}`); }
    return { run_id: run.id, metric: run.spec.metric, value: point?.value ?? null, step: point?.step ?? null };
  });
  const compatibility = mismatch ? 'not_directly_comparable' : missing ? 'insufficient_information' : 'comparable';
  const a = values[0]?.value; const b = values[1]?.value;
  const delta = left.spec.metric === right.spec.metric && left.spec.direction === right.spec.direction && typeof a === 'number' && typeof b === 'number' ? b - a : null;
  let interpretation = 'Evidence does not support a direct improvement claim.';
  if (compatibility === 'comparable' && delta !== null) {
    const better = left.spec.direction === 'maximize' ? delta > 0 : delta < 0;
    interpretation = delta === 0 ? 'The selected final metric values are equal.' : `The second run has a ${better ? 'better' : 'worse'} final observed metric. This alone does not establish repeatability or statistical significance.`;
  }
  return { run_ids: [leftId, rightId], metric: left.spec.metric, compatibility, reasons, values, delta, interpretation };
}
export function compare(store: Store, leftId: string, rightId: string): Comparison {
  const result: Comparison = { id: id('comparison'), created_at: now(), ...comparisonFacts(store, leftId, rightId) };
  store.transaction(() => { store.put('comparisons', result); store.event('comparison.created', result.id, result); });
  return result;
}
const memoryKinds: MemoryKind[] = ['context', 'observation', 'hypothesis', 'finding', 'decision', 'correction', 'question'];
function captureRunEvidence(store: Store, runId: string): EvidenceRef[] {
  const run = store.run(runId); const refs: EvidenceRef[] = [];
  if (run.ingestion === 'complete') {
    const document = { schema_version: 1, metrics: metricPoints(store, run) };
    refs.push(run.metrics_evidence ?? saveEvidence(store, runId, 'metrics', document));
  }
  const job = store.jobFor(runId);
  if (job) refs.push(saveEvidence(store, runId, 'execution', job));
  const dir = runDirectory(store, runId);
  const logs = { stdout: readTail(join(dir, 'stdout.log')), stderr: readTail(join(dir, 'stderr.log')) };
  if (logs.stdout.bytes || logs.stderr.bytes) refs.push(saveEvidence(store, runId, 'logs', logs));
  const specFile = join(dir, 'spec.json');
  if (existsSync(specFile)) refs.push(saveEvidence(store, runId, 'source', JSON.parse(readFileSync(specFile, 'utf8'))));
  return refs;
}
export function remember(store: Store, kind: MemoryKind, claim: string, runIds: string[] = [], limitations = '', author = 'user', replaces?: string): Memory {
  if (!memoryKinds.includes(kind) || !claim.trim()) throw new Error('A valid memory kind and nonempty claim are required');
  runIds = [...new Set(runIds)];
  const evidence = runIds.flatMap(key => captureRunEvidence(store, key));
  if (['finding', 'observation'].includes(kind) && !evidence.length) throw new Error('Findings and observations require captured run evidence; use hypothesis for an untested claim');
  const memory: Memory = { id: id('memory'), kind, claim, run_ids: runIds, evidence, limitations, author, status: kind === 'hypothesis' ? 'tentative' : 'current', superseded_by: null, created_at: now() };
  store.transaction(() => {
    const old = replaces ? store.memory(replaces) : undefined;
    if (old?.status === 'superseded') throw new Error('That record has already been superseded; correct its current replacement');
    store.put('memories', memory);
    store.db.prepare('INSERT INTO memory_fts(id,claim,limitations) VALUES (?,?,?)').run(memory.id, claim, limitations);
    store.event('memory.recorded', memory.id, memory);
    if (old) {
      old.status = 'superseded'; old.superseded_by = memory.id; store.put('memories', old);
      store.event('memory.superseded', old.id, { replacement_id: memory.id });
    }
  });
  return memory;
}
export interface MemoryView extends Memory {
  evidence_checks: { artifact: string; state: 'verified' | 'missing' | 'changed' }[];
  evidence_status: 'pinned' | 'unpinned' | 'requires_review';
  newer_metric_evidence_runs: string[];
  unavailable_run_ids: string[];
}
export function memoryView(store: Store, record: Memory): MemoryView {
  const evidence_checks = (record.evidence ?? []).map(ref => ({ artifact: ref.artifact, state: evidenceState(store, ref) }));
  const unavailable = new Set<string>();
  const newer = (record.evidence ?? []).filter(ref => {
    if (ref.kind !== 'metrics') return false;
    try {
      const current = store.run(ref.run_id).metrics_evidence;
      return !!current && current.sha256 !== ref.sha256;
    } catch { unavailable.add(ref.run_id); return false; }
  }).map(ref => ref.run_id);
  for (const key of record.run_ids) { try { store.run(key); } catch { unavailable.add(key); } }
  return { ...record, evidence_checks,
    evidence_status: unavailable.size || evidence_checks.some(ref => ref.state !== 'verified') ? 'requires_review' : evidence_checks.length ? 'pinned' : 'unpinned',
    newer_metric_evidence_runs: [...new Set(newer)], unavailable_run_ids: [...unavailable] };
}
export function recall(store: Store, query: string): MemoryView[] {
  const tokens = query.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 20) ?? [];
  if (!tokens.length) return [];
  const match = tokens.map(token => `"${token}"`).join(' OR ');
  const rows = store.db.prepare('SELECT id FROM memory_fts WHERE memory_fts MATCH ? ORDER BY rank LIMIT 20').all(match) as { id: string }[];
  return rows.map(row => memoryView(store, store.memory(row.id))).sort((a, b) => Number(a.status === 'superseded') - Number(b.status === 'superseded'));
}
export function supersede(store: Store, oldId: string, replacementId: string): Memory {
  return store.transaction(() => {
    const old = store.memory(oldId); const replacement = store.memory(replacementId);
    if (old.id === replacement.id || old.status === 'superseded' || replacement.status === 'superseded') throw new Error('Supersession needs distinct current records');
    old.status = 'superseded'; old.superseded_by = replacement.id;
    store.put('memories', old); store.event('memory.superseded', old.id, { replacement_id: replacement.id });
    return old;
  });
}
