import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Store } from '../src/store.js';
import { createStudy } from '../src/core.js';
import type { RunSpec } from '../src/types.js';
import { alive } from '../src/process.js';
export function fixture() {
  const base = resolve(process.env.MLSTACK_TEST_ROOT ?? 'work/tests');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, 'project-'));
  writeFileSync(join(root, 'model.py'), '# original source\n');
  const store = new Store(root);
  const study = createStudy(store, 'Learning rate', 'A controlled change improves validation accuracy');
  return { root, store, study, cleanup: () => { store.close(); rmSync(root, { recursive: true, force: true }); } };
}
export function spec(code?: string): RunSpec {
  return { name: 'Test', command: [process.execPath, '-e', code ?? `require('node:fs').writeFileSync(process.env.MLSTACK_METRICS_PATH, JSON.stringify({schema_version:1,metrics:[{name:'accuracy',value:0.8,step:0}]}));console.log('training complete')`],
    metric: 'accuracy', direction: 'maximize', protocol: { dataset: 'v1', split: 'validation-v1', evaluation: 'accuracy-v1' }, source_files: ['model.py'], timeout_seconds: 10 };
}
export async function until(check: () => boolean, timeout = 15000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for expected state');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
export async function settled(store: Store, runId: string, timeout = 15000) {
  await until(() => {
    const run = store.run(runId); const job = store.jobFor(runId);
    return !!job && !alive(job.worker) && ['completed', 'failed', 'cancelled'].includes(run.status) && run.ingestion !== 'pending';
  }, timeout);
  return store.run(runId);
}
