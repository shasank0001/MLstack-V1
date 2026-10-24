import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Store } from './src/store.js';
import { createStudy, propose, approve, compare } from './src/core.js';
import { ContextMemory } from './src/memory.js';
import { researchIndex } from './src/research.js';
import { launch } from './src/supervisor.js';
import { alive } from './src/process.js';
import type { Run } from './src/types.js';

async function wait(store: Store, runId: string): Promise<Run> {
  const start = Date.now();
  while (Date.now() - start < 110000) {
    const run = store.run(runId); const job = store.jobFor(runId);
    if (job && !alive(job.worker) && !['queued', 'starting', 'running'].includes(job.status) && run.ingestion !== 'pending') return run;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Demo job did not settle: ${runId}`);
}
async function main() {
  const base = resolve('work/demos'); mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, 'pytorch-'));
  copyFileSync(resolve('examples/pytorch-project/train.py'), join(root, 'train.py'));
  console.log(`Launching two tiny CPU PyTorch demonstrations in ${root}`);
  let store = new Store(root);
  const study = createStudy(store, 'Learning-rate comparison', 'A higher learning rate may improve final validation accuracy on this fixed synthetic task.');
  const runs = ['baseline', 'candidate'].map(name => {
    const value = JSON.parse(readFileSync(resolve(`examples/pytorch-project/${name}.json`), 'utf8'));
    if (process.env.MLSTACK_TRAIN_PYTHON) value.command[0] = process.env.MLSTACK_TRAIN_PYTHON;
    value.command.push('--sleep', '0.05');
    const run = propose(store, study.id, value); approve(store, run.id); return run;
  });
  for (const run of runs) launch(store, run.id);
  store.close();
  console.log('Client connection closed. Detached workers continue training.');
  await new Promise(resolve => setTimeout(resolve, 250));
  store = new Store(root);
  try {
    const finished = [];
    for (const run of runs) {
      const done = await wait(store, run.id);
      finished.push(done);
      if (done.status !== 'completed' || done.ingestion !== 'complete') throw new Error(`Demo run failed: ${JSON.stringify(done)}`);
    }
    const comparison = compare(store, runs[0]!.id, runs[1]!.id);
    mkdirSync(join(root, 'research'), { recursive: true });
    const research = 'research/learning-rate.md';
    writeFileSync(join(root, research), `# Learning-rate experiment\n\n${comparison.interpretation}\n\n${JSON.stringify(comparison.values, null, 2)}\n\nRuns: ${runs.map(run => run.id).join(', ')}. MLflow references are in the captured run records.\n\nSynthetic dataset, one seed, CPU execution, final epoch metric only. This does not establish general improvement. The next question is whether a corrected or repeated comparison is needed for the intended claim.\n`);
    const memoryHome = join(root, '.mlstack', 'demo-context');
    const preference = await new ContextMemory(store, { home: memoryHome }).record({ scope: 'project', key: 'reporting.scope', text: 'Keep advice scoped to this synthetic CPU demonstration and label its limitations.', source: 'user' });
    if (!preference.ok) throw new Error(preference.error || 'Context memory could not be saved');
    const record = { version: '0.4.0', project: root, study, runs: finished, comparison, research, preference };
    writeFileSync(join(root, '.mlstack', 'demo-report.json'), JSON.stringify(record, null, 2));
    console.log(JSON.stringify({ comparison, mlflow: finished.map(run => ({ run: run.id, reference: run.mlflow, error: run.mlflow_error })), report: join(root, '.mlstack', 'demo-report.json') }, null, 2));
    store.close();
    store = new Store(root);
    const snapshot = await new ContextMemory(store, { home: memoryHome }).snapshot();
    if (!snapshot.records.length) throw new Error('Fresh connection lost scoped context');
    console.log(`Fresh connection recovered ${snapshot.records.length} project preference(s) and ${researchIndex(store).total} research document(s).`);
  } finally { store.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
