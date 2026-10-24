import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Store, id, now } from './store.js';
import { assertApproval, ingest, metricsPath, runDirectory } from './core.js';
import { alive } from './process.js';
import type { Job, ProcessIdentity } from './types.js';

export function launch(store: Store, runId: string): Job {
  const existing = store.jobFor(runId);
  if (existing) return existing;
  const job = store.transaction(() => {
    const duplicate = store.jobFor(runId);
    if (duplicate) return duplicate;
    const run = store.run(runId);
    if (run.kind !== 'managed' || run.status !== 'approved') throw new Error('Approve this managed run before launching it');
    assertApproval(store, run);
    if (existsSync(metricsPath(store, run))) throw new Error('Metrics output already exists. Use a new output path to avoid stale evidence.');
    const record: Job = { id: id('job'), run_id: runId, status: 'queued', worker: null, child: null, created_at: now(), started_at: null, finished_at: null, heartbeat_at: null, exit_code: null, signal: null, reason: null, cancel_requested: false };
    store.insertJob(record); run.status = 'active'; store.put('runs', run); store.event('job.queued', record.id, { run_id: runId });
    return record;
  });
  // Multiple clients may race to spawn workers; the worker itself claims the queued job transactionally.
  const dir = runDirectory(store, runId); mkdirSync(dir, { recursive: true });
  const log = openSync(join(dir, 'supervisor.log'), 'a', 0o600);
  try {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./worker.js', import.meta.url)), store.root, job.id], { detached: true, stdio: ['ignore', log, log], cwd: store.root });
    child.on('error', error => {
      try {
        store.transaction(() => {
          const current = store.job(job.id);
          if (current.status !== 'queued') return;
          current.status = 'failed'; current.reason = `Supervisor launch failed: ${error.message}`; current.finished_at = now();
          const run = store.run(runId); run.status = 'failed'; store.putJob(current); store.put('runs', run); store.event('job.failed', job.id, { reason: current.reason });
        });
      } catch { /* A closed client database will be reconciled on the next open. */ }
    });
    child.unref();
  } finally { closeSync(log); }
  return job;
}
export function reconcile(store: Store): Job[] {
  return store.transaction(() => {
    for (const original of store.list<Job>('jobs')) {
      const job = store.job(original.id);
      if (!['queued', 'starting', 'running'].includes(job.status)) continue;
      if (job.status === 'queued' && Date.now() - Date.parse(job.created_at) < 15000) continue;
      if (alive(job.worker)) continue;
      job.status = 'unreconciled';
      job.reason = alive(job.child) ? 'Supervisor is missing but the recorded child is alive; manual inspection required.' : 'No live supervisor identity could be verified. Outcome is unknown; no automatic relaunch.';
      const run = store.run(job.run_id); run.status = 'unknown'; store.putJob(job); store.put('runs', run); store.event('job.unreconciled', job.id, { reason: job.reason });
    }
    return store.list<Job>('jobs');
  });
}
export function requestCancellation(store: Store, runId: string): Job {
  return store.transaction(() => {
    const job = store.jobFor(runId);
    if (!job || !['queued', 'starting', 'running'].includes(job.status)) throw new Error('No active managed job to cancel');
    job.cancel_requested = true; store.putJob(job); store.event('job.cancel_requested', job.id, { author: 'user' });
    return job;
  });
}

interface GroupMember extends ProcessIdentity { group: number; session: number; }
function groupMember(pid: number, boot: string): GroupMember | null {
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = raw.slice(raw.lastIndexOf(')') + 2).trim().split(/\s+/);
    if (fields[0] === 'Z' || !fields[19]) return null;
    return { pid, start: fields[19], boot, group: Number(fields[2]), session: Number(fields[3]) };
  } catch { return null; }
}
function groupMembers(group: number): GroupMember[] {
  const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  return readdirSync('/proc').filter(name => /^\d+$/.test(name))
    .map(name => groupMember(Number(name), boot))
    .filter((member): member is GroupMember => !!member && member.group === group);
}
const sameProcess = (a: ProcessIdentity, b: ProcessIdentity) => a.pid === b.pid && a.start === b.start && a.boot === b.boot;

/** Caller must obtain human approval before invoking this operation. */
export async function stopManagedRun(store: Store, runId: string): Promise<Job> {
  const run = store.run(runId);
  if (run.kind !== 'managed') throw new Error('Only managed runs can be stopped');
  const job = store.jobFor(runId);
  if (!job) throw new Error('No managed job to stop');
  if (['queued', 'starting', 'running'].includes(job.status)) return requestCancellation(store, runId);
  if (job.status !== 'unreconciled') throw new Error('No active or unreconciled managed job to stop');
  if (alive(job.worker)) throw new Error('Supervisor is alive. Refresh job status before requesting cancellation.');
  const child = job.child;
  if (!child || !alive(child)) throw new Error('No live child identity can be verified. Inspect the recorded job and logs; its original outcome remains unknown.');
  const leader = groupMember(child.pid, child.boot);
  if (!leader || !sameProcess(leader, child) || leader.group !== child.pid || leader.session !== child.pid) {
    throw new Error('Recorded child is not its managed process group/session leader. Inspect the process manually; no signal was sent.');
  }
  // Keep living identities as anchors: a numeric process group alone is unsafe after PID reuse.
  let anchors = groupMembers(child.pid);
  if (!anchors.some(member => sameProcess(member, child))) throw new Error('Child exited before its managed group could be verified. Inspect job logs; no signal was sent.');
  const verifiedMembers = () => {
    const members = groupMembers(child.pid);
    if (!members.length) return members;
    if (members.some(member => member.session !== child.pid) || !members.some(member => anchors.some(anchor => sameProcess(member, anchor)))) {
      throw new Error('Managed process group identity can no longer be verified; no further signal was sent. Inspect remaining processes manually.');
    }
    anchors = members;
    return members;
  };
  const signalGroup = (signal: NodeJS.Signals) => {
    const members = verifiedMembers();
    if (!members.length) return;
    // Recheck a live identity immediately before signalling the detached group.
    if (!members.some(member => alive(member))) throw new Error('Managed process identities changed before signalling. Inspect the job manually.');
    try { process.kill(-child.pid, signal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    store.event('job.orphan_signal', job.id, { signal, process_group: child.pid, child });
  };
  const waitForExit = async (milliseconds: number) => {
    const deadline = Date.now() + milliseconds;
    while (verifiedMembers().length) {
      if (Date.now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return true;
  };
  store.transaction(() => {
    const current = store.job(job.id);
    if (current.status !== 'unreconciled' || alive(current.worker) || !current.child || !sameProcess(current.child, child)) {
      throw new Error('Job identity or status changed. Refresh before stopping.');
    }
    current.cancel_requested = true;
    store.putJob(current); store.event('job.orphan_stop_requested', job.id, { author: 'user', child });
  });
  try {
    signalGroup('SIGTERM');
    if (!await waitForExit(1500)) {
      signalGroup('SIGKILL');
      if (!await waitForExit(1500)) throw new Error('Managed processes remain after SIGKILL. Inspect their OS state manually.');
    }
    store.transaction(() => {
      const current = store.job(job.id);
      current.status = 'terminated'; current.finished_at = now(); current.exit_code = null; current.signal = null;
      current.reason = 'User approved stopping the orphaned managed process group. Original exit code and termination signal are unknown.';
      const stopped = store.run(runId); stopped.status = 'cancelled';
      store.putJob(current); store.put('runs', stopped);
      store.event('job.orphan_stopped', job.id, { child, exit_code: null, reason: current.reason });
    });
    ingest(store, runId);
    return store.job(job.id);
  } catch (error) {
    store.transaction(() => {
      const current = store.job(job.id);
      current.reason = `Orphan stop could not be confirmed: ${error instanceof Error ? error.message : String(error)}`;
      store.putJob(current); store.event('job.orphan_stop_failed', job.id, { reason: current.reason });
    });
    throw error;
  }
}
