import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { artifactLimits } from './artifacts.js';
import type { Provenance, RunSpec } from './types.js';

const ignored = new Set(['.mlstack', '.git', 'node_modules', 'dist', '.venv', 'venv', '__pycache__', 'results', 'outputs', 'data', 'datasets', 'checkpoints']);
const sourceExtensions = new Set(['.py', '.ts', '.js', '.json', '.yaml', '.yml', '.toml', '.cfg', '.ini', '.sh', '.ipynb']);
export function projectPath(root: string, file: string): string {
  const path = resolve(root, file);
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Path must stay inside the project');
  // Resolve existing ancestors too, so symlinked output directories cannot escape the project.
  let ancestor = path;
  while (!existsSync(ancestor)) ancestor = resolve(ancestor, '..');
  const actual = realpathSync(ancestor);
  const actualRel = relative(root, actual);
  if (actualRel === '..' || actualRel.startsWith(`..${sep}`) || isAbsolute(actualRel)) throw new Error('Symlink escapes project');
  return resolve(actual, relative(ancestor, path));
}
export function provenance(root: string, spec: RunSpec): Provenance {
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && sourceExtensions.has(extname(path))) files.push(relative(root, path));
      if (files.length > 5000) throw new Error('Large repository: specify source_files in the run specification');
    }
  }
  if (spec.source_files) files.push(...spec.source_files);
  else walk(root);
  files.sort();
  const hash = createHash('sha256');
  let size = 0;
  for (const file of files) {
    const path = projectPath(root, file);
    size += statSync(path).size;
    if (size > 32 * 1024 * 1024) throw new Error('Source snapshot exceeds 32 MiB: narrow source_files');
    hash.update(file).update('\0').update(readFileSync(path)).update('\0');
  }
  let git_commit: string | null = null; let git_dirty: boolean | null = null;
  try {
    git_commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
    git_dirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
  } catch { /* Non-Git repositories remain supported. */ }
  return { source_digest: hash.digest('hex'), files, git_commit, git_dirty, platform: process.platform, captured_at: new Date().toISOString() };
}
export function executionDigest(spec: RunSpec, source: Provenance): string {
  return createHash('sha256').update(JSON.stringify(spec)).update(source.source_digest).digest('hex');
}
export function validateSpec(value: unknown): RunSpec {
  if (!value || typeof value !== 'object') throw new Error('Run spec must be an object');
  const s = value as Record<string, unknown>;
  if (typeof s.name !== 'string' || !s.name.trim()) throw new Error('name is required');
  if (!Array.isArray(s.command) || !s.command.length || s.command.some(x => typeof x !== 'string' || !x || x.includes('\0'))) throw new Error('command must be a nonempty array of strings, with no NUL characters');
  if (typeof s.metric !== 'string' || !s.metric.trim()) throw new Error('metric is required');
  if (s.direction !== 'maximize' && s.direction !== 'minimize') throw new Error('direction must be maximize or minimize');
  const protocol = s.protocol as Record<string, unknown> | undefined;
  if (!protocol || ['dataset', 'split', 'evaluation'].some(k => protocol[k] !== null && typeof protocol[k] !== 'string')) throw new Error('protocol requires dataset, split, evaluation (strings or explicit null)');
  if (typeof s.timeout_seconds !== 'number' || !Number.isInteger(s.timeout_seconds) || s.timeout_seconds < 1 || s.timeout_seconds > 604800) throw new Error('timeout_seconds must be an integer between 1 and 604800');
  for (const key of ['metrics_file', 'baseline_run_id']) if (s[key] !== undefined && (typeof s[key] !== 'string' || !s[key])) throw new Error(`${key} must be a nonempty string`);
  if (s.source_files !== undefined && (!Array.isArray(s.source_files) || !s.source_files.length || s.source_files.some(x => typeof x !== 'string' || !x))) throw new Error('source_files must be a nonempty string array');
  if (s.artifacts !== undefined) {
    if (!Array.isArray(s.artifacts) || s.artifacts.length > artifactLimits.files || s.artifacts.some(x => typeof x !== 'string')) throw new Error('artifacts must be an array of at most 32 project-relative file paths');
    for (const file of s.artifacts as string[]) {
      if (!file || file.includes('\0') || isAbsolute(file) || file.includes('\\') || file.split('/').some(part => !part || part === '.' || part === '..') || file.split('/')[0] === '.mlstack') throw new Error('Artifact paths must be canonical project-relative files outside .mlstack');
    }
    if (new Set(s.artifacts).size !== s.artifacts.length) throw new Error('artifacts must not contain duplicate paths');
  }
  if (s.seed !== undefined && (typeof s.seed !== 'number' || !Number.isInteger(s.seed))) throw new Error('seed must be an integer');
  // Construct a canonical specification; unrecognized fields never become execution settings.
  return {
    name: s.name, command: s.command as string[], metric: s.metric, direction: s.direction,
    protocol: { dataset: protocol.dataset as string | null, split: protocol.split as string | null, evaluation: protocol.evaluation as string | null },
    timeout_seconds: s.timeout_seconds,
    ...(s.metrics_file ? { metrics_file: s.metrics_file as string } : {}),
    ...(s.artifacts ? { artifacts: s.artifacts as string[] } : {}),
    ...(s.source_files ? { source_files: s.source_files as string[] } : {}),
    ...(s.baseline_run_id ? { baseline_run_id: s.baseline_run_id as string } : {}),
    ...(s.seed !== undefined ? { seed: s.seed as number } : {}),
  };
}
