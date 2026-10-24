import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Store, now } from './store.js';
import { assertApproval, ingest, metricsPath, runDirectory, snapshotSource } from './core.js';
import { captureTrainingEnvironment } from './artifacts.js';
import { identity, alive } from './process.js';
import { syncMlflow } from './mlflow.js';

async function main() {
  const [root, jobId] = process.argv.slice(2);
  if (!root || !jobId) throw new Error('worker requires project and job ID');
  const store = new Store(root);
  const claimed = store.transaction(() => {
    const job = store.job(jobId);
    if (job.status !== 'queued') return false;
    job.status = 'starting'; job.worker = identity(process.pid); job.heartbeat_at = now();
    store.putJob(job); store.event('job.claimed', job.id, {}); return true;
  });
  if (!claimed) { store.close(); return; }
  const job = store.job(jobId); const run = store.run(job.run_id);
  let timer: NodeJS.Timeout | undefined;
  let escalation: NodeJS.Timeout | undefined;
  const handles: number[] = [];
  try {
    assertApproval(store, run);
    snapshotSource(store, run);
    assertApproval(store, run);
    const output = metricsPath(store, run);
    if (existsSync(output)) throw new Error('Metrics output appeared before launch; refusing stale evidence');
    mkdirSync(dirname(output), { recursive: true });
    const dir = runDirectory(store, run.id);
    handles.push(openSync(join(dir, 'stdout.log'), 'a', 0o600), openSync(join(dir, 'stderr.log'), 'a', 0o600));
    if (store.job(jobId).cancel_requested) throw new Error('Cancelled before process launch');
    const executionStart = Date.now();
    writeFileSync(join(dir, 'environment.json'), JSON.stringify(captureTrainingEnvironment(run.spec.command, store.root, Math.min(2000, run.spec.timeout_seconds * 500)), null, 2));
    // The bounded probe is still an execution window: recheck approval and cancellation
    // immediately before starting training, after any source or state changes during it.
    assertApproval(store, run);
    if (store.job(jobId).cancel_requested) throw new Error('Cancelled before process launch');
    const child = spawn(run.spec.command[0]!, run.spec.command.slice(1), {
      cwd: store.root, detached: true, stdio: ['ignore', handles[0]!, handles[1]!],
      env: { ...process.env, MLSTACK_RUN_ID: run.id, MLSTACK_METRICS_PATH: output },
    });
    let stopReason: string | null = null;
    let childRef = child.pid ? identity(child.pid) : null;
    const stop = (reason: string) => {
      if (stopReason) return;
      stopReason = reason;
      if (child.pid && alive(childRef)) {
        try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
        escalation = setTimeout(() => {
          // A group may still contain descendants after its leader exits.
          try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* Group exited. */ }
        }, 1500);
      }
    };
    const onTerm = () => stop('Supervisor received termination signal');
    process.on('SIGTERM', onTerm); process.on('SIGINT', onTerm);
    const result = await new Promise<{ code: number | null; signal: string | null; error?: string }>(resolve => {
      child.once('error', error => resolve({ code: null, signal: null, error: error.message }));
      child.once('spawn', () => {
        childRef = identity(child.pid!);
        store.transaction(() => {
          const active = store.job(jobId); active.child = childRef; active.status = 'running'; active.started_at = now(); active.heartbeat_at = now();
          store.putJob(active); store.event('job.started', jobId, { child: childRef });
        });
      });
      child.once('close', (code, signal) => resolve({ code, signal }));
      const start = executionStart;
      timer = setInterval(() => {
        try {
          const active = store.job(jobId);
          if (active.cancel_requested) stop('User requested cancellation');
          else if (Date.now() - start >= run.spec.timeout_seconds * 1000) stop('Approved wall-time limit reached');
          store.transaction(() => {
            const current = store.job(jobId); current.heartbeat_at = now(); store.putJob(current);
          });
        } catch (error) { console.error(error); stop('Supervisor state failure'); }
      }, 250);
    });
    if (timer) clearInterval(timer);
    // If cancellation killed the leader first, allow the escalation to clean up its process group.
    if (escalation) await new Promise(resolve => setTimeout(resolve, 1600));
    process.off('SIGTERM', onTerm); process.off('SIGINT', onTerm);
    store.transaction(() => {
      const finished = store.job(jobId); finished.finished_at = now(); finished.exit_code = result.code; finished.signal = result.signal;
      finished.reason = stopReason || result.error || null;
      finished.status = stopReason ? 'terminated' : result.code === 0 ? 'exited' : 'failed';
      const current = store.run(run.id); current.status = stopReason ? 'cancelled' : result.code === 0 ? 'completed' : 'failed';
      store.putJob(finished); store.put('runs', current); store.event('job.exited', jobId, { code: result.code, signal: result.signal, reason: finished.reason });
    });
  } catch (error) {
    store.transaction(() => {
      const failed = store.job(jobId); failed.status = failed.cancel_requested ? 'terminated' : 'failed'; failed.finished_at = now();
      failed.reason = error instanceof Error ? error.message : String(error);
      const current = store.run(run.id); current.status = failed.cancel_requested ? 'cancelled' : 'failed';
      store.putJob(failed); store.put('runs', current); store.event('job.failed', jobId, { reason: failed.reason });
    });
  } finally {
    if (timer) clearInterval(timer);
    if (escalation) clearTimeout(escalation);
    handles.forEach(handle => closeSync(handle));
  }
  ingest(store, run.id);
  await syncMlflow(store, run.id);
  store.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
