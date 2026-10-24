import { readFileSync } from 'node:fs';
import type { ProcessIdentity } from './types.js';
export function identity(pid: number): ProcessIdentity | null {
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = raw.slice(raw.lastIndexOf(')') + 2).trim().split(/\s+/);
    if (fields[0] === 'Z' || !fields[19]) return null;
    return { pid, start: fields[19], boot: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() };
  } catch { return null; }
}
export function alive(ref: ProcessIdentity | null): boolean {
  if (!ref) return false;
  const current = identity(ref.pid);
  return !!current && current.start === ref.start && current.boot === ref.boot;
}
