#!/usr/bin/env node
import { AgentSessionRuntime, InteractiveMode, type CreateAgentSessionRuntimeFactory } from '@earendil-works/pi-coding-agent';
import { createWorkbenchExtension } from './src/terminal-ui.js';
import { parseArgs } from 'node:util';
import { readFileSync, existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';
import { Store } from './src/store.js';
import { createStudy, propose, compare, remember, recall, supersede, ingest, runDirectory } from './src/core.js';
import { launch, reconcile, stopManagedRun } from './src/supervisor.js';
import { inspectRuns } from './src/inspection.js';
import { importMlflow, syncMlflow } from './src/mlflow.js';
import { captureRunArtifacts } from './src/artifacts.js';
import { getContextMemory } from './src/memory.js';
import { researchIndex, exportLegacyResearch } from './src/research.js';
import { approveWithConfirmation, createWorkbenchAgent, workbenchContext, modelChoices, type Confirm } from './src/agent.js';
import type { Run, Study, MemoryKind } from './src/types.js';
import { tokenize, parseWorkflow, workflowPrompt, workflowHelp, workflowCompletions, type WorkflowAccess } from './src/workflows.js';
export { tokenize } from './src/workflows.js';

const options = {
  project: { type: 'string', short: 'p' }, spec: { type: 'string' }, study: { type: 'string' }, title: { type: 'string' },
  hypothesis: { type: 'string' }, claim: { type: 'string' }, kind: { type: 'string' }, run: { type: 'string', multiple: true },
  limitations: { type: 'string' }, replacement: { type: 'string' }, uri: { type: 'string' }, 'external-run': { type: 'string' },
  metric: { type: 'string' }, direction: { type: 'string' }, dataset: { type: 'string' }, split: { type: 'string' }, evaluation: { type: 'string' },
  model: { type: 'string' }, seconds: { type: 'string' }, fresh: { type: 'boolean' }, yes: { type: 'boolean', short: 'y' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  scope: { type: 'string' }, key: { type: 'string' }, text: { type: 'string' }, query: { type: 'string' }, refresh: { type: 'boolean' }, plain: { type: 'boolean' },
} as const;
const help = `MLStack 0.5 — local ML experiment workbench

Usage: npm start -- --project /path/to/repository COMMAND [options]
Without a command, opens the workbench. Commands work without model credentials.

  ml                                        List bundled workflows and mode controls
  init                                      Initialize project state and notes
  study --title TEXT --hypothesis TEXT       Create a study
  studies | runs | status                    Browse project state
  propose --study ID --spec plan.json         Register a run proposal (spec may declare artifacts)
  show RUN_ID                                Inspect run, job, and evidence
  approve RUN_ID [--yes]                      Approve the current source and command
  launch RUN_ID                              Launch a previously approved run
  run RUN_ID [--yes]                          Approve and launch; retries return the same job
  logs RUN_ID                                Show bounded stdout/stderr tails
  ingest RUN_ID                              Retry final JSON metric ingestion
  sync-mlflow RUN_ID                          Retry local MLflow synchronization
  capture-artifacts RUN_ID [--refresh]        Capture or explicitly recapture selected output files
  import-mlflow --study ID --uri URI --external-run ID --metric NAME --direction maximize|minimize
                 [--dataset ID --split ID --evaluation ID] [--refresh]
  compare LEFT_RUN RIGHT_RUN                  Compare final primary metric snapshots
  inspect RUN_ID [RUN_ID]                     Read metrics, provenance, compatibility, and logs
  wait RUN_ID [--seconds 30]                  Wait briefly and read captured evidence
  diagnose RUN_ID                            Evidence-inspection alias; the model diagnoses
  models                                     List configured model and free catalog choices
  memory status | list                        Inspect scoped local context memory
  memory search WORDS [--scope all|user|project]
  memory record --key KEY --text TEXT [--scope project|user]
  memory forget ID --scope project|user       Forget a preference/context entry
  research                                   List freeform research Markdown documents
  export-research                            Export legacy research with original evidence links
  remember --kind finding --claim TEXT --run ID  Legacy archive compatibility
  recall WORDS                               Search the legacy research archive
  supersede MEMORY_ID --replacement ID        Legacy research correction (archive compatibility)
  cancel RUN_ID [--yes]                       Approve cancellation of a managed job
  events                                     Show recent durable state events
  chat [--model PROVIDER/MODEL] [--plain]       Open Pi conversation and command interface

Common flags: --project PATH, --json, --help
Training runs as an argument array without a shell. --yes is an explicit CLI approval.
Inside the workbench: /ml [workflow] [--discuss|--plan|--act] [request].
Chat starts in discuss mode. /ml lists workflows without a model request.
Model calls occur only for chat messages. Scoped memory uses local SQLite and ordinary text search.
`;
function required(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value;
}
function tail(path: string): string {
  if (!existsSync(path)) return '(not available yet)';
  const fd = openSync(path, 'r');
  try {
    const size = statSync(path).size; const buffer = Buffer.alloc(Math.min(12000, size));
    readSync(fd, buffer, 0, buffer.length, Math.max(0, size - buffer.length)); return buffer.toString('utf8');
  } finally { closeSync(fd); }
}
export async function execute(store: Store, args: string[], confirm: Confirm, output?: (text: string) => void): Promise<void> {
  const emit = output ?? ((text: string) => { stdout.write(text); });
  const print = (value: unknown) => emit(`${JSON.stringify(value, null, 2)}\n`);
  const { values: v, positionals: p } = parseArgs({ args, options, allowPositionals: true });
  const command = p[0] ?? 'status';
  const key = () => required(p[1], 'ID');
  const approval: Confirm = v.yes ? async () => true : confirm;
  switch (command) {
    case 'help': emit(help); return;
    case 'ml':
      if (p.length > 1) throw new Error('Send workflow requests inside the interactive workbench with /ml; use ml or ml --help to list them.');
      emit(workflowHelp); return;
    case 'init': print({ project: store.project, path: store.root, state: store.state, notes: ['.mlstack/project.md', '.mlstack/research.md'] }); return;
    case 'study': print(createStudy(store, required(v.title, '--title'), required(v.hypothesis, '--hypothesis'))); return;
    case 'studies': print(store.list<Study>('studies')); return;
    case 'runs': {
      reconcile(store);
      const runs = store.list<Run>('runs');
      if (v.json || output) print(runs);
      else console.table(runs.map(run => ({ id: run.id, name: run.spec.name, kind: run.kind, status: run.status, metrics: run.ingestion, mlflow: run.mlflow ? 'synced' : run.mlflow_error ? 'error' : 'pending' })));
      return;
    }
    case 'status': print({ project: store.project, path: store.root, studies: store.list('studies'), jobs: reconcile(store), runs: store.list('runs'), legacy_research_records: store.list('memories').length,
      context_memory: getContextMemory(store).status(), research: researchIndex(store) }); return;
    case 'propose': {
      const spec = JSON.parse(readFileSync(resolve(required(v.spec, '--spec')), 'utf8'));
      print(propose(store, required(v.study, '--study'), spec)); return;
    }
    case 'show': reconcile(store); print({ run: store.run(key()), job: store.jobFor(key()) ?? null, evidence_directory: runDirectory(store, key()) }); return;
    case 'approve': if (await approveWithConfirmation(store, key(), approval)) print(store.run(key())); else print({ status: 'declined' }); return;
    case 'launch': print(launch(store, key())); return;
    case 'run': {
      const existing = store.jobFor(key());
      if (existing) { print(existing); return; }
      if (!await approveWithConfirmation(store, key(), approval)) { print({ status: 'declined', launched: false }); return; }
      print(launch(store, key())); return;
    }
    case 'logs': store.run(key()); print({ stdout: tail(join(runDirectory(store, key()), 'stdout.log')), stderr: tail(join(runDirectory(store, key()), 'stderr.log')), supervisor: tail(join(runDirectory(store, key()), 'supervisor.log')) }); return;
    case 'ingest': print(ingest(store, key())); return;
    case 'sync-mlflow': print(await syncMlflow(store, key())); return;
    case 'capture-artifacts': print(captureRunArtifacts(store, key(), { refresh: v.refresh })); return;
    case 'import-mlflow': {
      const direction = required(v.direction, '--direction');
      if (!['maximize', 'minimize'].includes(direction)) throw new Error('--direction must be maximize or minimize');
      print(await importMlflow(store, required(v.study, '--study'), required(v.uri, '--uri'), required(v['external-run'], '--external-run'), {
        name: `Imported ${v['external-run']}`, metric: required(v.metric, '--metric'), direction: direction as 'maximize' | 'minimize',
        protocol: { dataset: v.dataset ?? null, split: v.split ?? null, evaluation: v.evaluation ?? null },
      }, { refresh: v.refresh })); return;
    }
    case 'compare': print(compare(store, key(), required(p[2], 'second run ID'))); return;
    case 'inspect': case 'diagnose': print(await inspectRuns(store, { run_ids: p.slice(1), logs: true })); return;
    case 'wait': print(await inspectRuns(store, { run_ids: [key()], logs: true, wait_seconds: Number(v.seconds ?? 30) })); return;
    case 'models': print(await modelChoices(undefined, store.root)); return;
    case 'research': print(researchIndex(store, 60)); return;
    case 'export-research': print(exportLegacyResearch(store)); return;
    case 'memory': {
      const memory = getContextMemory(store); const action = p[1] ?? 'status';
      if (v.scope && !['user', 'project', 'all'].includes(v.scope)) throw new Error('--scope must be user, project or all');
      const scope = v.scope as 'user' | 'project' | 'all' | undefined;
      if (action === 'status') print(memory.status());
      else if (action === 'list') print({ records: await memory.list(scope ?? 'all'), status: memory.status() });
      else if (action === 'search') print({ records: await memory.search(required(v.query ?? p.slice(2).join(' '), 'query'), scope ?? 'all'), status: memory.status() });
      else {
        if (scope === 'all') throw new Error('Choose user or project scope for memory changes');
        let acknowledgement;
        if (action === 'record') acknowledgement = await memory.record({ scope: scope ?? 'project', key: required(v.key, '--key'), text: required(v.text, '--text'), source: 'user' });
        else if (action === 'forget') acknowledgement = await memory.forget(required(p[2], 'memory ID'), scope ?? 'project');
        else throw new Error('Memory actions: status, list, search, record, forget');
        print(acknowledgement);
        if (!acknowledgement.ok) throw new Error(acknowledgement.error || 'Context memory change was not saved');
      }
      return;
    }
    case 'remember': print(remember(store, required(v.kind, '--kind') as MemoryKind, required(v.claim, '--claim'), v.run ?? [], v.limitations ?? '')); return;
    case 'recall': print(recall(store, required(p.slice(1).join(' '), 'query'))); return;
    case 'supersede': print(supersede(store, key(), required(v.replacement, '--replacement'))); return;
    case 'cancel': if (await approval(`Cancel the managed job for ${key()}?`)) print(await stopManagedRun(store, key())); else print({ status: 'declined' }); return;
    case 'events': print(store.db.prepare('SELECT * FROM events ORDER BY seq DESC LIMIT 40').all()); return;
    default: throw new Error(`Unknown command: ${command}. Use --help.`);
  }
}
async function plainWorkbench(store: Store, modelName?: string, fresh = false) {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('The interactive workbench needs a terminal. Use deterministic commands with --json in scripts.');
  const rl = createInterface({ input: stdin, output: stdout, completer: workflowCompletions });
  const access: WorkflowAccess = { mode: 'discuss' };
  const confirm: Confirm = async message => (await rl.question(`\n${message}\nType yes to approve: `)).trim().toLowerCase() === 'yes';
  let session: Awaited<ReturnType<typeof createWorkbenchAgent>>['session'] | undefined;
  let closed = false;
  const stop = () => { closed = true; rl.close(); void session?.abort(); };
  rl.on('close', () => { closed = true; });
  rl.on('SIGINT', stop);
  stdout.write(`\nMLStack · ${store.root}\nType /help for commands; /exit to leave. Training jobs continue after exit.\nChat starts in discuss mode (read-only). /ml lists workflows; /ml --act enables coding and approved execution.
Mode applies to agent tools; operational slash commands remain explicit user actions.
Use /models for provider choices; /skill:ml-project and /skill:ml-research are bundled.\n\n`);
  try {
    while (!closed) {
      let line: string;
      try { line = (await rl.question('mlstack › ')).trim(); } catch { break; }
      if (!line) continue;
      if (['/exit', '/quit'].includes(line)) break;
      try {
        if (/^\/ml(?:\s|$)/.test(line)) {
          const selected = parseWorkflow(line, access.mode);
          if (selected.help) { stdout.write(workflowHelp); continue; }
          access.mode = selected.mode;
          stdout.write(`Workflow: ${selected.route} · mode: ${access.mode}\n`);
          if (selected.modeOnly) continue;
          line = workflowPrompt(selected);
        } else if (line.startsWith('/skill:')) {
          const match = /^\/skill:(ml-project|ml-research)(?:\s+([\s\S]*))?$/.exec(line);
          if (!match) throw new Error('Only the bundled ml-project and ml-research skills are available');
          line = workflowPrompt({ route: match[1] === 'ml-project' ? 'define' : 'auto', mode: access.mode, request: match[2] || 'Use the requested bundled skill for this project context.' });
        } else if (line.startsWith('/')) {
          if (line === '/new') { session?.dispose(); session = undefined; fresh = true; stdout.write('The next message will start a fresh Pi session. Research records are retained.\n'); }
          else await execute(store, tokenize(line.slice(1)), confirm);
          continue;
        } else {
          line = workflowPrompt({ route: 'auto', mode: access.mode, request: line });
        }
        if (!session) {
          const created = await createWorkbenchAgent(store, confirm, fresh, modelName, undefined, access);
          session = created.session;
          if (created.modelFallbackMessage) stdout.write(`${created.modelFallbackMessage}\n`);
          session.subscribe(event => {
            if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') stdout.write(event.assistantMessageEvent.delta);
            if (event.type === 'tool_execution_start') stdout.write(`\n[${event.toolName}]\n`);
          });
          stdout.write(`Pi model: ${session.model?.provider ?? 'unconfigured'}/${session.model?.id ?? 'unconfigured'}\n`);
        }
        await session.prompt(line); stdout.write('\n\n');
      } catch (error) { stdout.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`); }
    }
  } finally { session?.dispose(); rl.close(); }
}
/** Mount Pi's public terminal UI with the same scoped backend used by the CLI. */
export async function createTerminalRuntime(store: Store, modelName?: string) {
  const access: WorkflowAccess = { mode: 'discuss' };
  let activeConfirm: Confirm = async () => false;
  const confirm: Confirm = (message, request) => activeConfirm(message, request);
  const extension = createWorkbenchExtension({
    store, access,
    executeCommand: (args, approve, output) => execute(store, args, approve, output),
    onConfirmReady: ready => { activeConfirm = ready; },
    getContext: () => workbenchContext(store),
  });
  let host: AgentSessionRuntime | undefined;
  const factory: CreateAgentSessionRuntimeFactory = async options => {
    if (resolve(options.cwd) !== store.root) throw new Error('MLStack sessions must remain in the current project');
    const currentModel = host?.session.model;
    const selected = currentModel ? `${currentModel.provider}/${currentModel.id}` : modelName;
    return createWorkbenchAgent(store, confirm, true, selected, options.agentDir, access, undefined, {
      extensionFactories: [extension], contextInExtension: true, sessionManager: options.sessionManager,
    });
  };
  const created = await createWorkbenchAgent(store, confirm, true, modelName, undefined, access, undefined, {
    extensionFactories: [extension], contextInExtension: true,
  });
  host = new AgentSessionRuntime(created.session, created.services, factory, created.diagnostics, created.modelFallbackMessage);
  return host;
}
async function workbench(store: Store, modelName?: string) {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('The interactive workbench needs a terminal. Use deterministic commands with --json in scripts.');
  const host = await createTerminalRuntime(store, modelName);
  try { await new InteractiveMode(host).run(); }
  finally { await host.dispose(); }
}
async function main() {
  if (process.platform !== 'linux') throw new Error('MLStack currently supports Linux only');
  const args = process.argv.slice(2);
  const { values, positionals } = parseArgs({ args, options, allowPositionals: true });
  if (positionals[0] === 'ml' && (values.help || positionals.length === 1)) { stdout.write(workflowHelp); return; }
  if (values.help || positionals[0] === 'help') { stdout.write(help); return; }
  const store = new Store(resolve(values.project ?? process.cwd()));
  try {
    if (!positionals.length || positionals[0] === 'chat') await (values.plain ? plainWorkbench(store, values.model, values.fresh) : workbench(store, values.model));
    else {
      const confirm: Confirm = async message => {
        if (!stdin.isTTY) throw new Error('Approval requires a terminal, or an explicit --yes on the CLI');
        const rl = createInterface({ input: stdin, output: stdout });
        try { return (await rl.question(`${message}\nType yes to approve: `)).trim().toLowerCase() === 'yes'; } finally { rl.close(); }
      };
      await execute(store, args, confirm);
    }
  } finally { store.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`MLStack: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
