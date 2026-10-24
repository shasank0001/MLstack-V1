/** Opt-in, actual free-model evaluation against a disposable synthetic CPU project. */
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createWorkbenchAgent, type ApprovalRequest } from '../src/agent.js';
import { Store } from '../src/store.js';
import { metricPoints, comparisonFacts, runDirectory } from '../src/core.js';
import { alive } from '../src/process.js';
import { parseWorkflow, workflowPrompt, type WorkflowAccess, type WorkflowName } from '../src/workflows.js';
import { readTail } from '../src/evidence.js';
import type { Run, Job } from '../src/types.js';
import { ContextMemory } from '../src/memory.js';
import { researchIndex } from '../src/research.js';
import { readCaptureManifest } from '../src/artifacts.js';

const { values } = parseArgs({ options: { model: { type: 'string' }, workflows: { type: 'boolean' } } });
const modelName = values.model || process.env.MLSTACK_LIVE_MODEL || 'openrouter/minimax/minimax-m3.1-flash:free';
const access: WorkflowAccess = { mode: values.workflows ? 'discuss' : 'act' };
const base = resolve('work/agent-evals'); mkdirSync(base, { recursive: true });
const root = mkdtempSync(join(base, 'pytorch-'));
copyFileSync('examples/pytorch-project/train.py', join(root, 'train.py'));
const sourceHash = () => createHash('sha256').update(readFileSync(join(root, 'train.py'))).digest('hex');
const initialSourceHash = sourceHash();
const context = `# Synthetic CPU classifier\nNo external data or downloads. Read train.py for the implementation.\nBaseline: python3 train.py --lr 0.01 --epochs 12 --seed 7. Candidate changes only lr to 0.1.\nPrimary metric val_accuracy; maximize.\nDataset ID: synthetic-linear-v1-generator-seed-42\nSplit ID: first-256-train-last-64-validation\nEvaluation ID: argmax-accuracy-final-epoch-v1\nThe script writes JSON metrics to MLSTACK_METRICS_PATH supplied by MLStack.\n`;
writeFileSync(join(root, 'README.md'), context);
const store = new Store(root);
const memory = new ContextMemory(store, { home: join(store.state, 'context') });
let contextRecords: unknown[] = [];
writeFileSync(join(store.state, 'project.md'), context);
const approvals: { phase: string; request?: ApprovalRequest; approved: boolean }[] = [];
const turns: { phase: string; prompt: string; answer?: string; duration_ms: number }[] = [];
const toolCalls: { phase: string; tool: string; args: unknown }[] = [];
let phase = 'setup';
let session: Awaited<ReturnType<typeof createWorkbenchAgent>>['session'] | undefined;
let passed = false; let failure: string | null = null;
// Keep generated evaluation output out of the default source/config scan.
const reportPath = join(store.state, 'agent-eval-report.json');
function save() {
  writeFileSync(reportPath, JSON.stringify({ version: '0.4.0', workflows: !!values.workflows, model: modelName, root, passed, failure, source_sha256: initialSourceHash,
    approvals, turns, tool_calls: toolCalls, runs: store.list<Run>('runs'), context_memory: contextRecords, research: researchIndex(store) }, null, 2));
}
async function confirm(_message: string, request?: ApprovalRequest): Promise<boolean> {
  let approved = false;
  if (request?.kind === 'run' && request.spec && sourceHash() === initialSourceHash) {
    const command = request.spec.command;
    const pairs = new Map<string, string>(); let valid = command[0] === 'python3' && command[1] === 'train.py';
    for (let i = 2; i < command.length; i += 2) {
      const key = command[i]; const value = command[i + 1];
      if (!key || !value || !['--lr', '--epochs', '--seed', '--sleep'].includes(key) || pairs.has(key)) valid = false;
      else pairs.set(key, value);
    }
    const epoch = Number(pairs.get('--epochs'));
    approved = valid && ['0.01', '0.1', 'nan'].includes(pairs.get('--lr') ?? '') && [12, 2000].includes(epoch)
      && pairs.get('--seed') === '7' && (!pairs.has('--sleep') || ['0.05', '0.1'].includes(pairs.get('--sleep')!))
      && request.spec.timeout_seconds <= 60;
  }
  if (request?.kind === 'stop' && request.run_id) approved = !!store.jobFor(request.run_id);
  if (request?.kind === 'command') approved = ['which python3', 'python3 --version'].includes(request.command ?? '');
  approvals.push({ phase, request, approved });
  console.log(`  approval ${request?.kind}: ${approved ? 'accepted within fixture scope' : 'refused'}`); return approved;
}
async function open() {
  const created = await createWorkbenchAgent(store, confirm, true, modelName, undefined, values.workflows ? access : undefined, memory);
  session = created.session;
  const model = session.model;
  if (!model || model.provider !== 'openrouter' || !model.id.endsWith(':free') || Object.values(model.cost).some(price => price !== 0)) throw new Error('The live evaluator requires an explicitly selected zero-price OpenRouter :free model');
  // Confirm live public pricing before any generation request; do not trust a stale local price alone.
  const response = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Cannot verify free model pricing: catalog HTTP ${response.status}`);
  const catalog = await response.json() as { data: { id: string; pricing: { prompt: string; completion: string }; supported_parameters?: string[] }[] };
  const entry = catalog.data.find(item => item.id === model.id);
  if (!entry || Number(entry.pricing.prompt) !== 0 || Number(entry.pricing.completion) !== 0 || !entry.supported_parameters?.includes('tools')) throw new Error('Free tool-capable model is unavailable; no paid model will be substituted');
  console.log(`Selected ${model.provider}/${model.id}; free pricing verified.`);
  session.subscribe(event => { if (event.type === 'tool_execution_start') { toolCalls.push({ phase, tool: event.toolName, args: event.args }); console.log(`  ${event.toolName}`); } });
}
async function turn(name: string, prompt: string) {
  phase = name; console.log(`Phase: ${name}`); const started = Date.now(); let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void session!.abort(); }, 150000);
  const routes: Record<string, WorkflowName> = { 'project-definition': 'define', 'project-plan': 'define', baseline: 'onboard', 'candidate-and-research': 'experiment', 'context-preference': 'define', 'context-correction': 'define', 'fresh-session-recall': 'resume', correction: 'review', 'actual-failure': 'debug', 'refused-launch': 'experiment', 'start-and-stop': 'debug' };
  const selected = parseWorkflow(`/ml ${routes[name] ?? 'experiment'} --${access.mode} -- ${prompt.replace(/^\/skill:ml-research\s*/, '')}`, access.mode);
  try { await session!.prompt(values.workflows ? workflowPrompt(selected) : prompt); } finally { clearTimeout(timer); }
  const answer = session!.getLastAssistantText(); contextRecords = (await memory.snapshot()).records; turns.push({ phase, prompt, answer, duration_ms: Date.now() - started }); save();
  const last = session!.messages.filter(message => message.role === 'assistant').at(-1) as { stopReason?: string; errorMessage?: string } | undefined;
  if (timedOut) throw new Error(`Agent turn timed out: ${name}`);
  if (last?.stopReason === 'error') throw new Error(last.errorMessage || 'Provider request failed');
  console.log(answer || '(no final text)');
  return answer ?? '';
}
async function settled(runId: string) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const run = store.run(runId); const job = store.jobFor(runId);
    if (job && !alive(job.worker) && run.ingestion !== 'pending') return run;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Job did not settle after agent response: ${runId}`);
}
async function main() {
  try {
    await open();
    if (values.workflows) {
      const contextBefore = readFileSync(join(store.state, 'project.md'), 'utf8');
      const counts = () => ['studies','runs','jobs','memories'].map(table => store.list(table as 'runs').length);
      const before = counts();
      await turn('project-definition', 'Using the supplied README and code, summarize the goal, primary metric, first milestone and limitations of this synthetic CPU project. This is discussion only: do not save files or research records and do not execute anything. Do not invent a real-world deployment goal.');
      assert.deepEqual(counts(), before); assert.equal(approvals.length, 0);
      assert.equal(readFileSync(join(store.state, 'project.md'), 'utf8'), contextBefore);
      assert.equal(sourceHash(), initialSourceHash); assert.equal(existsSync(join(root,'plan.md')), false);
      access.mode = 'plan';
      await turn('project-plan', 'Save a concise project brief to docs/ml-project.md and milestones to plan.md for the documented baseline/candidate demonstration. Use only established README facts and label unknowns. Do not execute or modify training code, request compute approval, or record research memory.');
      assert.ok(existsSync(join(root, 'docs/ml-project.md'))); assert.ok(existsSync(join(root, 'plan.md')));
      assert.equal(sourceHash(), initialSourceHash); assert.equal(store.list('jobs').length, 0); assert.equal(approvals.length, 0);
      access.mode = 'act';
    }
    await turn('context-preference', 'Remember this project preference using the memory tool: key reporting.style, scope project, text: Keep experiment reports concise and include the run IDs. This is lasting project context, not an experimental finding.');
    assert.ok((await memory.list('project')).some(record => record.key === 'reporting.style'));
    const baselineText = await turn('baseline', '/skill:ml-research Inspect this project and run its documented CPU baseline: lr 0.01, epochs 12, seed 7, timeout 60 seconds. Do not edit source. Declare README.md as a selected artifact. Wait for the captured result and report the actual final validation accuracy concisely.');
    const baselines = store.list<Run>('runs').filter(run => run.status === 'completed'); assert.equal(baselines.length, 1);
    const baseline = await settled(baselines[0]!.id); assert.equal(baseline.ingestion, 'complete');
    assert.equal(metricPoints(store, baseline).findLast(point => point.name === 'val_accuracy')?.value, 0.484375);
    assert.match(baselineText, /0\.484375|48\.44/);
    assert.ok(readCaptureManifest(store, baseline)?.files.some(file => file.role === 'output' && file.path === 'outputs/README.md'));
    await turn('candidate-and-research', 'Run the candidate with lr 0.1 and otherwise identical documented conditions, 12 epochs, seed 7, timeout 60 seconds. Compare actual measurements with the baseline and save a freely organized research/learning-rate.md with actual values, run IDs and limitations. Keep experimental conclusions out of preference memory.');
    const completed = store.list<Run>('runs').filter(run => run.status === 'completed'); assert.equal(completed.length, 2);
    const candidate = await settled(completed.find(run => run.id !== baseline.id)!.id);
    assert.equal(metricPoints(store, candidate).findLast(point => point.name === 'val_accuracy')?.value, 0.71875);
    assert.equal(comparisonFacts(store, baseline.id, candidate.id).compatibility, 'comparable');
    assert.ok(existsSync(join(root, 'research/learning-rate.md')));
    assert.match(readFileSync(join(root,'research/learning-rate.md'),'utf8'),new RegExp(baseline.id));
    assert.match(readFileSync(join(root,'research/learning-rate.md'),'utf8'),new RegExp(candidate.id));
    assert.equal(store.list('memories').length,0,'research uses documents, not legacy memory');
    session!.dispose(); await open();
    const recalled = await turn('fresh-session-recall', 'What have we already tried, what did the actual measurements show, and do these two runs establish statistical significance? Use saved research/evidence. Do not execute anything.');
    assert.match(recalled, /0\.484375|48\.44/); assert.match(recalled, /0\.71875|71\.8/);
    await turn('context-correction', 'Correct the project preference reporting.style using the memory tool: report uncertainty first, then the measured values and run IDs. Keep the same key and project scope.');
    const corrected = await memory.list('project');
    assert.equal(corrected.filter(record => record.key === 'reporting.style').length,1);
    assert.match(corrected.find(record=>record.key === 'reporting.style')!.text,/uncertainty/i);
    await turn('correction', 'Clarification for future advice: this is preliminary evidence for this synthetic task and one seed, not a general recommendation. Update research/learning-rate.md to make that limitation clear and preserve the original observations and run references. Do not run anything or save metrics in preference memory.');
    assert.match(readFileSync(join(root,'research/learning-rate.md'),'utf8'),/seed|preliminary|synthetic/i);
    const failureText = await turn('actual-failure', 'Run one diagnostic experiment with --lr nan, other baseline arguments and same protocol, timeout 60 seconds. Inspect its actual failure and relevant code; explain the observed cause. Do not fix or retry it.');
    const failed = store.list<Run>('runs').filter(run => run.status === 'failed'); assert.equal(failed.length, 1);
    const diagnostic = await settled(failed[0]!.id); assert.equal(store.jobFor(diagnostic.id)?.exit_code, 1);
    assert.match(readTail(join(runDirectory(store, diagnostic.id), 'stderr.log')).text, /JSON compliant: nan/);
    assert.match(failureText, /json/i); assert.match(failureText, /nan/i);
    const jobsBefore = store.list<Job>('jobs').length;
    await turn('refused-launch', 'Try one more candidate with lr 0.9, 12 epochs, seed 7, same protocol and timeout 60 seconds.');
    assert.equal(store.list<Job>('jobs').length, jobsBefore);
    const refusals = approvals.filter(item => item.phase === 'refused-launch' && item.request?.kind === 'run');
    assert.equal(refusals.length, 1, 'Exactly one host approval request should occur'); assert.equal(refusals[0]!.approved, false);
    const previousRuns = new Set(store.list<Run>('runs').map(run => run.id));
    await turn('start-and-stop', 'Check managed job cancellation: start train.py with --lr 0.01 --epochs 2000 --seed 7 --sleep 0.1, timeout 60 seconds. Immediately request stopping that new run through run control, wait for confirmation of termination, and report its actual outcome. This is only a cancellation check; do not save a scientific finding or wait for training to finish normally.');
    const stopRun = store.list<Run>('runs').find(run => !previousRuns.has(run.id)); assert.ok(stopRun);
    const cancelled = await settled(stopRun.id); assert.equal(cancelled.status, 'cancelled');
    assert.ok(approvals.some(item => item.phase === 'start-and-stop' && item.request?.kind === 'stop' && item.approved));
    assert.equal(alive(store.jobFor(cancelled.id)?.child ?? null), false);
    passed = true; save(); console.log(`LIVE AGENT EVALUATION PASSED\nReport: ${reportPath}`);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error); save(); console.error(`LIVE AGENT EVALUATION FAILED: ${failure}\nReport: ${reportPath}`); process.exitCode = 1;
  } finally {
    session?.dispose();
    // Preserve evidence. Any approved detached job retains its own wall-time limit if a test aborts.
    store.close();
  }
}
void main();
