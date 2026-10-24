import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Store, now } from './store.js';
import { projectPath } from './provenance.js';
import type { EvidenceRef } from './types.js';

export function readTail(path: string, maxBytes = 6000): { text: string; truncated: boolean; bytes: number; error?: string } {
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const info = fstatSync(fd);
    if (!info.isFile()) throw new Error('Log is not a regular file');
    const bytes = info.size;
    maxBytes = Math.max(0, Math.min(32000, Math.floor(maxBytes) || 0));
    const buffer = Buffer.alloc(Math.min(maxBytes, bytes));
    const length = readSync(fd, buffer, 0, buffer.length, Math.max(0, bytes - buffer.length));
    return { text: buffer.subarray(0, length).toString('utf8'), truncated: bytes > maxBytes, bytes };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { text: '', truncated: false, bytes: 0 };
    return { text: '', truncated: false, bytes: 0, error: error instanceof Error ? error.message : String(error) };
  } finally { if (fd !== undefined) closeSync(fd); }
}
export function saveEvidence(store: Store, runId: string, kind: EvidenceRef['kind'], value: unknown): EvidenceRef {
  const content = JSON.stringify(value, null, 2);
  const sha256 = createHash('sha256').update(content).digest('hex');
  const dir = join(store.state, 'evidence'); mkdirSync(dir, { recursive: true });
  const path = join(dir, `${sha256}.json`);
  if (existsSync(path)) {
    if (createHash('sha256').update(readFileSync(path)).digest('hex') !== sha256) throw new Error('Existing evidence artifact has been modified');
  } else {
    const temporary = join(dir, `.${randomUUID()}.tmp`);
    writeFileSync(temporary, content, { mode: 0o600 });
    renameSync(temporary, path);
  }
  return { run_id: runId, kind, artifact: relative(store.root, path), sha256, captured_at: now() };
}
export function evidenceState(store: Store, ref: EvidenceRef): 'verified' | 'missing' | 'changed' {
  try {
    const path = projectPath(store.root, ref.artifact);
    if (!existsSync(path)) return 'missing';
    return createHash('sha256').update(readFileSync(path)).digest('hex') === ref.sha256 ? 'verified' : 'changed';
  } catch { return 'changed'; }
}
export function readEvidence(store: Store, ref: EvidenceRef): unknown {
  if (evidenceState(store, ref) !== 'verified') throw new Error(`Evidence is missing or changed: ${ref.artifact}`);
  return JSON.parse(readFileSync(projectPath(store.root, ref.artifact), 'utf8')) as unknown;
}
