import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store, now } from './store.js';
import { readEvidence } from './evidence.js';
import type { Run, ArtifactCapture, CaptureManifest, CapturedFile } from './types.js';

export const artifactLimits = { files: 32, fileBytes: 64 * 1024 * 1024, totalBytes: 256 * 1024 * 1024 };
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
function boundedFile(path: string): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile()) throw new Error(`Artifact is not a regular file: ${path}`);
    if (info.size > artifactLimits.fileBytes) throw new Error(`Artifact exceeds 64 MiB: ${path}`);
    const chunks: Buffer[] = []; let length = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(1024 * 1024, artifactLimits.fileBytes + 1 - length));
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break; length += count;
      if (length > artifactLimits.fileBytes) throw new Error(`Artifact exceeds 64 MiB: ${path}`);
      chunks.push(chunk.subarray(0, count));
    }
    return Buffer.concat(chunks, length);
  } finally { closeSync(fd); }
}
const directory = (store: Store, id: string) => join(store.state, 'runs', id);

/** Selected outputs use exact project-relative spellings and may not traverse symlinks or private state. */
export function selectedArtifactPath(root: string, file: string): string {
  if (!file || file.includes('\0') || isAbsolute(file) || file.split(/[\\/]/).some(p => !p || p === '.' || p === '..') || file.includes('\\') || file.split('/')[0] === '.mlstack') throw new Error('Artifact paths must be canonical project-relative files outside .mlstack');
  const target = resolve(root, file); const rel = relative(root, target);
  if (rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Artifact path escapes project');
  let current = root;
  for (const part of file.split('/')) { current = join(current, part); if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Artifact paths must not contain symlinks'); }
  if (existsSync(target) && realpathSync(target) !== target) throw new Error('Artifact path must be canonical');
  return target;
}

/** Probe only a directly approved Python interpreter; never report the MLflow helper's environment. */
export function captureTrainingEnvironment(command: string[], root: string, timeoutMs: number): Record<string, unknown> {
  const base = { command, platform: process.platform, architecture: process.arch, captured_at: now(), interpreter: null, packages: null, gpu: 'unknown', limitations: ['No runtime hardware telemetry or full dependency lock was captured.'] };
  const executable = command[0] ?? '';
  if (!/^python(?:\d+(?:\.\d+)*)?$/.test(executable.split('/').at(-1) ?? '')) return { ...base, status: 'unknown', reason: 'Only direct Python commands support interpreter probing; shell/env launchers are not resolved.' };
  const code = `import sys,json,platform,importlib.metadata as m\np={}\nfor name in ['torch','tensorflow','scikit-learn','numpy','pandas','mlflow']:\n try:p[name]=m.version(name)\n except m.PackageNotFoundError:pass\nprint(json.dumps({'interpreter':sys.executable,'python_version':sys.version,'platform':platform.platform(),'packages':p}))`;
  try {
    const result = JSON.parse(execFileSync(executable, ['-c', code], { cwd: root, encoding: 'utf8', timeout: Math.max(1, Math.min(timeoutMs, 2000)), maxBuffer: 128 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
    return { ...base, ...result, status: 'captured', limitations: [...base.limitations, 'Installed distribution versions are not proof that the training script used those frameworks.', 'The probe uses the same executable and inherited environment, but does not execute the training code or reproduce its interpreter flags/runtime environment changes.'] };
  } catch (error) { return { ...base, status: 'unknown', reason: `Interpreter probe unavailable: ${error instanceof Error ? error.message.slice(0, 500) : String(error)}` }; }
}

export function readCaptureManifest(store: Store, run: Run): CaptureManifest | null {
  if (!run.capture) return null;
  const path = resolve(store.root, run.capture.manifest);
  const expected = join(directory(store, run.id), 'captures');
  if (!path.startsWith(expected + sep)) throw new Error('Capture manifest path is outside this run');
  const bytes = readFileSync(path);
  if (sha(bytes) !== run.capture.sha256) throw new Error('Capture manifest integrity check failed');
  return JSON.parse(bytes.toString()) as CaptureManifest;
}
export function verifyCapture(store: Store, run: Run): CaptureManifest {
  const manifest = readCaptureManifest(store, run);
  if (!manifest) throw new Error('No artifact capture available');
  for (const file of manifest.files) {
    const path = resolve(store.root, file.captured_path);
    if (!path.startsWith(join(directory(store, run.id), 'captures', 'blobs') + sep)) throw new Error('Captured artifact path is outside this run');
    const bytes = readFileSync(path);
    if (bytes.byteLength !== file.size_bytes || sha(bytes) !== file.sha256) throw new Error(`Captured artifact integrity check failed: ${file.path}`);
  }
  return manifest;
}

export function captureRunArtifacts(store: Store, runId: string, options: { refresh?: boolean } = {}): ArtifactCapture {
  const run = store.run(runId);
  if (run.kind !== 'managed' || !['completed', 'failed', 'cancelled'].includes(run.status)) throw new Error('Artifact capture requires a finished managed run');
  if (run.capture && !options.refresh) { verifyCapture(store, run); return run.capture; }
  const dir = directory(store, runId); const captures = join(dir, 'captures'); const blobs = join(captures, 'blobs'); mkdirSync(blobs, { recursive: true });
  const errors: string[] = []; const files: CapturedFile[] = []; let total = 0;
  const add = (path: string, role: CapturedFile['role'], bytes: Buffer) => {
    if (bytes.length > artifactLimits.fileBytes) throw new Error(`Artifact exceeds 64 MiB: ${path}`);
    if (total + bytes.length > artifactLimits.totalBytes) throw new Error('Capture exceeds 256 MiB');
    total += bytes.length; const digest = sha(bytes); const target = join(blobs, digest);
    if (existsSync(target)) { if (sha(readFileSync(target)) !== digest) throw new Error(`Existing captured blob is corrupted: ${path}`); }
    else {
      try { writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || sha(readFileSync(target)) !== digest) throw error; }
    }
    files.push({ path, role, size_bytes: bytes.length, sha256: digest, captured_path: relative(store.root, target) });
  };
  const addFile = (path: string, role: CapturedFile['role'], physical: string, required = true) => {
    try {
      if (!existsSync(physical)) { if (required) throw new Error(`Requested artifact is missing: ${path}`); return; }
      add(path, role, boundedFile(physical));
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  };
  addFile('spec.json', 'specification', join(dir, 'spec.json'), false);
  if (!files.some(f => f.role === 'specification')) add('spec.json', 'specification', Buffer.from(JSON.stringify({ spec: run.spec, provenance: run.provenance, approved_at: run.approved_at }, null, 2)));
  for (const filename of ['stdout.log', 'stderr.log']) addFile(filename, 'log', join(dir, filename), false);
  for (const file of run.provenance?.files ?? []) addFile(`source/${file}`, 'source', join(dir, 'source', file), false);
  let environment: Record<string, unknown> = { status: 'unknown', interpreter: null, packages: null, gpu: 'unknown', reason: 'No execution-side environment probe is available for this run.' };
  try { if (existsSync(join(dir, 'environment.json'))) environment = JSON.parse(readFileSync(join(dir, 'environment.json'), 'utf8')); } catch (error) { errors.push(`Environment capture unreadable: ${String(error)}`); }
  add('environment.json', 'environment', Buffer.from(JSON.stringify(environment, null, 2)));
  if (run.ingestion === 'complete') {
    try {
      const document = run.metrics_evidence ? readEvidence(store, run.metrics_evidence) : JSON.parse(readFileSync(join(dir, 'metrics.snapshot.json'), 'utf8'));
      add('metrics.snapshot.json', 'metrics', Buffer.from(JSON.stringify(document, null, 2)));
    } catch (error) { errors.push(`Metrics evidence unavailable: ${String(error)}`); }
  }
  for (const file of run.spec.artifacts ?? []) {
    try { addFile(`outputs/${file}`, 'output', selectedArtifactPath(store.root, file)); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  const content = { schema_version: 1 as const, run_id: runId, command: run.spec.command, protocol: run.spec.protocol, source: run.provenance, environment, files, errors };
  const contentDigest = sha(JSON.stringify(content));
  let manifest: CaptureManifest;
  const prior = run.capture ? readCaptureManifest(store, run) : null;
  if (prior?.content_digest === contentDigest) manifest = prior;
  else manifest = { ...content, content_digest: contentDigest, captured_at: now() };
  const bytes = JSON.stringify(manifest, null, 2); const digest = sha(bytes); const path = join(captures, digest, 'manifest.json'); mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    try { writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || sha(readFileSync(path)) !== digest) throw error; }
  }
  const capture: ArtifactCapture = { manifest: relative(store.root, path), sha256: digest, captured_at: manifest.captured_at, status: errors.length ? 'error' : 'complete', errors };
  store.transaction(() => { const current = store.run(runId); if (current.capture?.sha256 !== digest && current.mlflow) current.mlflow_error = 'Artifact capture changed; sync MLflow to publish the latest revision'; current.capture = capture; current.capture_error = errors.length ? errors.join('; ') : null; store.put('runs', current); store.event('artifacts.captured', runId, capture); });
  return capture;
}
