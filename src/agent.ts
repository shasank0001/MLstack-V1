import { existsSync, lstatSync, readFileSync, realpathSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, basename, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import {
  createAgentSession, createReadToolDefinition, createWriteToolDefinition, createEditToolDefinition, createLsToolDefinition, createGrepToolDefinition, createBashToolDefinition,
  DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime, defineTool,
  type ToolDefinition, type ExtensionToolContext, type ExtensionFactory, type AgentSessionServices,
} from '@earendil-works/pi-coding-agent';
import { Type, type TSchema } from 'typebox';
import { Store } from './store.js';
import { createStudy, propose, approve } from './core.js';
import { inspectRuns } from './inspection.js';
import { provenance, executionDigest, projectPath, validateSpec } from './provenance.js';
import { launch, stopManagedRun } from './supervisor.js';
import { bundledSkills, planningDocuments, type WorkflowAccess } from './workflows.js';
import type { Run, RunSpec, Study } from './types.js';
import { getContextMemory, type ContextMemory } from './memory.js';
import { researchIndex } from './research.js';

export interface ApprovalRequest { kind: 'run' | 'stop' | 'command'; run_id?: string; spec?: RunSpec; command?: string; timeout?: number; }
export type Confirm = (message: string, request?: ApprovalRequest) => Promise<boolean>;
export const bundledSkillDirectory = fileURLToPath(new URL('../../skills/ml-research/', import.meta.url));
export const bundledSkillPath = join(bundledSkillDirectory, 'SKILL.md');
/** Narrow read exception for the installed, reviewed skill and its named Markdown playbooks. */
export function resolveBundledSkillRead(file: string, directory?: string): string | undefined {
  if (!isAbsolute(file) || file.split(/[\\/]/).includes('..')) return undefined;
  const path = resolve(file);
  const sources = directory ? [{ directory, references: bundledSkills.find(skill => skill.name === basename(resolve(directory)))?.references ?? bundledSkills[1].references }]
    : bundledSkills.map(skill => ({ directory: dirname(skill.path), references: skill.references }));
  for (const source of sources) {
    const entry = relative(resolve(source.directory), path);
    const allowed = new Set<string>(['SKILL.md', ...source.references.map(name => `references/${name}`)]);
    if (!allowed.has(entry)) continue;
    try {
      const root = realpathSync(source.directory);
      if (root !== resolve(source.directory)) return undefined;
      const actual = realpathSync(path);
      // Exact canonical identity rejects escaping symlinks, including symlinked ancestors.
      if (actual !== resolve(root, entry) || !statSync(actual).isFile()) return undefined;
      return actual;
    } catch { return undefined; }
  }
  return undefined;
}

export async function approveWithConfirmation(store: Store, runId: string, confirm: Confirm): Promise<boolean> {
  const run = store.run(runId);
  if (run.kind !== 'managed' || !['proposed', 'approved'].includes(run.status) || store.jobFor(runId)) throw new Error('Only unlaunched managed runs can be approved');
  const source = provenance(store.root, run.spec);
  const digest = executionDigest(run.spec, source);
  const accepted = await confirm(`Approve run ${runId}?\n${JSON.stringify(run.spec, null, 2)}\nSource digest: ${source.source_digest}\nWorking directory: ${store.root}\n`, { kind: 'run', run_id: runId, spec: run.spec });
  if (!accepted) { store.transaction(() => store.event('run.declined', runId, { author: 'user' })); return false; }
  if (digest !== executionDigest(store.run(runId).spec, provenance(store.root, run.spec))) throw new Error('Source changed while approval was pending. Review and approve again.');
  approve(store, runId); return true;
}
const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }], details: {} });
const specSchema = Type.Object({
  name: Type.String(), command: Type.Array(Type.String()), metric: Type.String(), direction: Type.Union([Type.Literal('maximize'), Type.Literal('minimize')]),
  protocol: Type.Object({ dataset: Type.Union([Type.String(), Type.Null()]), split: Type.Union([Type.String(), Type.Null()]), evaluation: Type.Union([Type.String(), Type.Null()]) }),
  timeout_seconds: Type.Integer({ minimum: 1, maximum: 604800 }), seed: Type.Optional(Type.Integer()),
  metrics_file: Type.Optional(Type.String()), artifacts: Type.Optional(Type.Array(Type.String(), { maxItems: 32 })), source_files: Type.Optional(Type.Array(Type.String())), baseline_run_id: Type.Optional(Type.String()),
});

export function agentTools(store: Store, confirm: Confirm, access: WorkflowAccess = { mode: 'act' }, contextMemory = getContextMemory(store)): ToolDefinition[] {
  function requireAct(operation: string) {
    if (access.mode !== 'act') throw new Error(`${operation} is unavailable in ${access.mode} mode. Ask the host to switch to act mode.`);
  }
  const confirmAct: Confirm = async (message, request) => {
    requireAct('Approval');
    const accepted = await confirm(message, request);
    requireAct('Approval');
    return accepted;
  };
  let latestTurn = '';
  const refused = new Map<string, unknown>();
  function refusals(ctx: ExtensionToolContext) {
    const turn = ctx.sessionManager?.getBranch().findLast(entry => entry.type === 'message' && entry.message.role === 'user')?.id ?? 'direct';
    if (turn !== latestTurn) { refused.clear(); latestTurn = turn; }
    return refused;
  }
  function knownExperimentCommand(command: string): boolean {
    const tokens = (command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []).map(token => token.replace(/^(["'])(.*)\1$/, '$2'));
    return store.list<Run>('runs').some(run => {
      const interpreter = run.spec.command[0]; const script = run.spec.command[1];
      if (!interpreter || !script || script.startsWith('-')) return false;
      return tokens.some((token, index) => {
        if (basename(token) !== basename(interpreter)) return false;
        let next = index + 1;
        while (tokens[next]?.startsWith('-')) {
          const flag = tokens[next]!;
          if (['-c', '-m', '-e', '--eval', '--print'].includes(flag)) return false;
          next += ['-W', '-X', '--check-hash-based-pycs', '--require', '-r'].includes(flag) ? 2 : 1;
        }
        const entry = tokens[next];
        return !!entry && resolve(store.root, entry) === resolve(store.root, script);
      });
    });
  }
  function runRefusalKey(spec: RunSpec) {
    return `run:${JSON.stringify({ command: spec.command, timeout: spec.timeout_seconds, metrics_file: spec.metrics_file ?? null, source: provenance(store.root, spec).source_digest })}`;
  }
  function scoped<T extends TSchema, D>(base: ToolDefinition<T, D>) {
    return defineTool({ ...base, name: `project_${base.name}`, executionMode: 'sequential',
      execute: async (callId, params, signal, onUpdate, ctx) => {
        const file = (params as { path?: string }).path ?? '.';
        const mutates = ['write', 'edit'].includes(base.name);
        if (mutates && access.mode === 'discuss') requireAct('File changes');
        const bundledRead = base.name === 'read' ? resolveBundledSkillRead(file) : undefined;
        // existsSync follows symlinks: a dangling link must not look like a new
        // project-local file that the SDK may create outside the project.
        if (!bundledRead) {
          for (let ancestor = resolve(store.root, file); ancestor !== dirname(ancestor); ancestor = dirname(ancestor)) {
            if (!existsSync(ancestor)) {
              try { if (lstatSync(ancestor).isSymbolicLink()) throw new Error('Dangling symlink paths are unavailable'); }
              catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
            }
            if (ancestor === store.root) break;
          }
        }
        const path = bundledRead ?? projectPath(store.root, file);
        // SDK coding tools normalize these characters into ordinary spaces.
        // Reject ambiguous paths before they can select a different file/link.
        if (/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/.test(path)) throw new Error('Path contains ambiguous Unicode spaces');
        const rel = relative(store.root, path);
        if (mutates && access.mode === 'plan') {
          const allowed = access.documentPaths ?? planningDocuments;
          const researchDocument = file.startsWith('research/') && file.endsWith('.md');
          if (file !== rel || path !== resolve(store.root, file) || !file.endsWith('.md') || !allowed.includes(file) && !researchDocument) {
            throw new Error(`Plan mode permits exact named Markdown planning documents and freeform research/**/*.md: ${allowed.join(', ')}`);
          }
        }
        if (mutates && (rel === '.mlstack' || rel.startsWith('.mlstack/')) && !['.mlstack/project.md', '.mlstack/research.md'].includes(rel)) throw new Error('Structured MLStack state is read-only to coding tools. Use experiment/memory tools.');
        // Pass the checked absolute path: the SDK expands @, ~, and file: inputs,
        // which must not reinterpret a project-local spelling after validation.
        if (base.name === 'read' && !existsSync(path)) throw new Error(`Path not found: ${file}`);
        return base.execute(callId, { ...params, path }, signal, onUpdate, ctx);
      },
    });
  }
  const fileTools = [scoped(createReadToolDefinition(store.root)), scoped(createWriteToolDefinition(store.root)), scoped(createEditToolDefinition(store.root)), scoped(createLsToolDefinition(store.root)), scoped(createGrepToolDefinition(store.root))];
  const bash = createBashToolDefinition(store.root, { exposeSessionEnvironment: false });
  const commandTool = defineTool({ ...bash, name: 'project_bash', label: 'Approved project command', executionMode: 'sequential',
    description: 'Run a short diagnostic, test, or custom analysis in the project. Always asks the human for approval. Timeout defaults to 30s, maximum 60s. Use experiment_run for persistent training; never use a second execution path after approval was refused.',
    parameters: Type.Object({ command: Type.String(), timeout: Type.Optional(Type.Number({ minimum: 1, maximum: 60 })) }),
    execute: async (callId, params, signal, onUpdate, ctx) => {
      requireAct('Command execution');
      const timeout = params.timeout ?? 30;
      if (!Number.isFinite(timeout) || timeout < 1 || timeout > 60) throw new Error('Command timeout must be 1–60 seconds');
      const blocked = refusals(ctx); const key = `command:${params.command.trim()}`;
      if (blocked.has(key)) return result(blocked.get(key));
      if (knownExperimentCommand(params.command)) return result({ executed: false, reason: 'This invokes a known experiment entry point. Diagnostic training also needs persistent logs and a run record.', next_tool: 'experiment_run', action: 'start', hint: 'Use the same protocol and an argument-array command, then inspect the actual outcome. No command was executed or approval requested here.' });
      if (!await confirmAct(`Run this command in ${store.root}?\n${params.command}\nWall-time limit: ${timeout}s`, { kind: 'command', command: params.command, timeout })) {
        const decline = { status: 'declined', executed: false, reason: 'Human approval was refused. Do not repeat this request in the same turn.' };
        blocked.set(key, decline); store.transaction(() => store.event('command.declined', store.project.id, { command: params.command, author: 'user' }));
        return result(decline);
      }
      store.transaction(() => store.event('command.approved', store.project.id, { command: params.command, timeout, author: 'user' }));
      return bash.execute(callId, { ...params, timeout }, signal, onUpdate, ctx);
    },
  });
  const tools = [
    defineTool({ name: 'experiment_read', label: 'Read experiment evidence',
      description: 'Get a compact project overview, or up to 4 selected runs with primary metrics, series summaries, errors, provenance, and optional log tails. Selecting multiple runs automatically checks evaluation compatibility; interpret results yourself. Set wait=true to wait up to 30 seconds for selected runs; if still running, report the status instead of polling indefinitely.',
      parameters: Type.Object({ run_ids: Type.Optional(Type.Array(Type.String(), { maxItems: 4 })), logs: Type.Optional(Type.Boolean()), wait: Type.Optional(Type.Boolean()), offset: Type.Optional(Type.Integer({ minimum: 0 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 25 })) }),
      prepareArguments: args => {
        const input = args as Record<string, unknown>;
        const { wait_seconds, ...rest } = input;
        return { ...rest, ...(typeof wait_seconds === 'number' && input.wait === undefined ? { wait: wait_seconds > 0 } : {}) } as never;
      },
      execute: async (_id, p, signal) => result(await inspectRuns(store, { run_ids: p.run_ids, logs: p.logs, offset: p.offset, limit: p.limit, wait_seconds: p.wait ? 30 : 0, read_only: access.mode !== 'act' }, signal)) }),
    defineTool({ name: 'experiment_run', label: 'Plan, start, or stop an experiment', executionMode: 'sequential',
      description: 'action=plan saves spec without executing. action=start accepts a new spec or an existing run_id and asks the human for approval before launch. action=stop asks approval to cancel run_id. New plans can use study_id or study_title/hypothesis; omitted study uses the latest study or an exploratory default. Repeated starts return the existing job. Commands are argument arrays; unknown protocol fields are null.',
      parameters: Type.Object({ action: Type.Union([Type.Literal('plan'), Type.Literal('start'), Type.Literal('stop')]), run_id: Type.Optional(Type.String()), spec: Type.Optional(specSchema), study_id: Type.Optional(Type.String()), study_title: Type.Optional(Type.String()), hypothesis: Type.Optional(Type.String()) }),
      execute: async (_id, p, _signal, _update, ctx) => {
        if (access.mode !== 'act' && !(access.mode === 'plan' && p.action === 'plan')) requireAct(`Experiment ${p.action}`);
        const blocked = refusals(ctx);
        if (p.action === 'stop') {
          if (!p.run_id || p.spec) throw new Error('stop requires run_id and no spec');
          const job = store.jobFor(p.run_id);
          if (!job || !['queued', 'starting', 'running', 'unreconciled'].includes(job.status)) throw new Error('No active or unreconciled managed job to stop');
          const key = `stop:${p.run_id}`; if (blocked.has(key)) return result(blocked.get(key));
          const detail = job.status === 'unreconciled' ? ' The supervisor is missing; only a verified surviving managed process group can be stopped. Its original outcome remains unknown.' : '';
          if (!await confirmAct(`Cancel the managed job for ${p.run_id}?${detail}`, { kind: 'stop', run_id: p.run_id })) {
            const decline = { status: 'declined', stopped: false }; blocked.set(key, decline); return result(decline);
          }
          return result(await stopManagedRun(store, p.run_id));
        }
        if (p.spec && p.run_id || !p.spec && !p.run_id) throw new Error('Supply either a new spec or an existing run_id');
        if (p.spec) {
          const canonical = validateSpec(p.spec);
          const key = runRefusalKey(canonical);
          if (p.action === 'start' && blocked.has(key)) return result(blocked.get(key));
        }
        let run;
        if (p.run_id) run = store.run(p.run_id);
        else {
          const studies = store.list<Study>('studies');
          const study = p.study_id ? store.study(p.study_id) : p.study_title ? studies.find(study => study.title === p.study_title) ?? createStudy(store, p.study_title, p.hypothesis || 'Exploratory execution; no hypothesis recorded.') : studies.at(-1) ?? createStudy(store, 'Experiments', p.hypothesis || 'Exploratory execution; no hypothesis recorded.');
          run = propose(store, study.id, p.spec);
        }
        if (p.action === 'plan') return result({ status: run.status, run });
        const existing = store.jobFor(run.id); if (existing) return result({ run_id: run.id, job: existing });
        const key = runRefusalKey(run.spec);
        if (blocked.has(key)) return result(blocked.get(key));
        if (!await approveWithConfirmation(store, run.id, confirmAct)) {
          const decline = { status: 'declined', launched: false, run_id: run.id, reason: 'Human approval was refused. Wait for a new user instruction before requesting it again.' };
          blocked.set(key, decline); return result(decline);
        }
        return result({ run_id: run.id, job: launch(store, run.id), next: 'Use experiment_read with this run_id and wait=true to collect evidence.' });
      } }),
    defineTool({ name: 'memory', label: 'Preferences and project context', executionMode: 'sequential',
      description: 'Read or save lasting preferences/project context in scoped local SQLite memory. Research reasoning belongs in flexible research/*.md; measurements belong to experiment records/MLflow. search uses query; omit query for the current snapshot. list/status are read-only. record requires a stable key, concise text and scope; reusing that key corrects the prior value. forget requires id and its scope. record/forget require act mode. The host supplies user/project identity. Never store run metrics, raw transcripts, credentials or inferred preferences as confirmed user statements.',
      parameters: Type.Object({ action: Type.Union(['search','list','record','forget','status'].map(value => Type.Literal(value))),
        query: Type.Optional(Type.String()), scope: Type.Optional(Type.Union([Type.Literal('user'), Type.Literal('project'), Type.Literal('all')])),
        key: Type.Optional(Type.String()), text: Type.Optional(Type.String()), id: Type.Optional(Type.String()) }),
      execute: async (callId, p) => {
        const scope = p.scope ?? 'project';
        if (p.action === 'status') return result(contextMemory.status());
        if (p.action === 'search' && !p.query?.trim() && (!p.scope || p.scope === 'all')) return result(await contextMemory.snapshot());
        if (p.action === 'list' || p.action === 'search') {
          const matches = p.action === 'list' || !p.query?.trim() ? await contextMemory.list(p.scope ?? 'all') : await contextMemory.search(p.query, p.scope ?? 'all');
          return result({ records: matches.slice(0, 50), total_records: matches.length, omitted_records: Math.max(0, matches.length - 50), status: contextMemory.status() });
        }
        requireAct('Context memory changes');
        if (scope === 'all') throw new Error('Choose user or project scope for a memory change');
        if (p.action === 'forget') {
          if (!p.id) throw new Error('Forget requires id and its scope');
          return result(await contextMemory.forget(p.id, scope));
        }
        if (!p.key?.trim() || !p.text?.trim()) throw new Error('Record requires a stable key and concise text');
        return result(await contextMemory.record({ scope, key: p.key, text: p.text, source: 'agent' }, callId));
      } }),
  ];
  return [...fileTools, commandTool, ...tools];
}

export function resolveConfiguredModel(runtime: Pick<ModelRuntime, 'getModel'>, provider: string | undefined, modelId: string | undefined, explicit?: string) {
  if (explicit) {
    const slash = explicit.indexOf('/');
    if (slash < 1) throw new Error('Model must be provider/model-id');
    provider = explicit.slice(0, slash); modelId = explicit.slice(slash + 1);
  }
  if (!provider || !modelId) throw new Error('Configure a Pi provider/model, or pass --model provider/model-id. Use /models to list free choices; project commands remain usable.');
  let model = runtime.getModel(provider, modelId);
  if (!model && modelId.startsWith(`${provider}/`)) model = runtime.getModel(provider, modelId.slice(provider.length + 1));
  if (!model) throw new Error(`Configured model ${provider}/${modelId} is unavailable. No model was substituted. Choose an available model explicitly with --model; use /models for choices.`);
  return model;
}
export async function resolveWorkbenchModel(runtime: Pick<ModelRuntime, 'getModel' | 'refresh'>, provider: string | undefined, modelId: string | undefined, explicit?: string, offline = process.env.PI_OFFLINE !== undefined) {
  if (!explicit) return resolveConfiguredModel(runtime, provider, modelId);
  const slash = explicit.indexOf('/');
  if (slash < 1 || slash === explicit.length - 1) return resolveConfiguredModel(runtime, provider, modelId, explicit);
  const selectedProvider = explicit.slice(0, slash); const selectedId = explicit.slice(slash + 1);
  const cached = runtime.getModel(selectedProvider, selectedId) ?? (selectedId.startsWith(`${selectedProvider}/`) ? runtime.getModel(selectedProvider, selectedId.slice(selectedProvider.length + 1)) : undefined);
  if (cached) return cached;
  const guidance = `No model was substituted. Configure this exact model in Pi models.json if the provider catalog does not include it.`;
  if (offline) throw new Error(`Configured model ${explicit} is unavailable in the offline catalog. PI_OFFLINE disables catalog refresh. ${guidance}`);
  // This refresh updates only the provider catalog/cache, never model defaults.
  // The provider's catalog can lag fresh API IDs; explicit models.json metadata
  // remains available when a successful refresh cannot supply the requested ID.
  let refreshed: Awaited<ReturnType<ModelRuntime['refresh']>>;
  try {
    refreshed = await runtime.refresh({ providers: [selectedProvider], allowNetwork: true, force: true, signal: AbortSignal.timeout(15000) });
  } catch (error) {
    throw new Error(`Model catalog refresh failed for ${selectedProvider}: ${error instanceof Error ? error.message : String(error)}. ${guidance}`, { cause: error });
  }
  if (refreshed.aborted) throw new Error(`Model catalog refresh for ${selectedProvider} timed out or was aborted. ${guidance}`);
  const error = refreshed.errors.get(selectedProvider);
  if (error) throw new Error(`Model catalog refresh failed for ${selectedProvider}: ${error.message}. ${guidance}`, { cause: error });
  try { return resolveConfiguredModel(runtime, provider, modelId, explicit); }
  catch (error) { throw new Error(`Configured model ${explicit} remains unavailable after refreshing ${selectedProvider}. ${guidance}`, { cause: error }); }
}
export async function modelChoices(agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent'), cwd = process.cwd()) {
  const settings = SettingsManager.create(cwd, agentDir);
  const runtime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: join(agentDir, 'models.json'), allowModelNetwork: false });
  const provider = settings.getDefaultProvider();
  return { configured_provider: provider ?? null, configured_model: settings.getDefaultModel() ?? null,
    free_catalog_choices: runtime.getModels(provider).filter(model => model.cost.input === 0 && model.cost.output === 0).slice(0, 25).map(model => `${model.provider}/${model.id}`),
    note: 'Catalog choices are explicit selections, not automatic substitutions. Provider availability and rate limits still apply.' };
}
export interface AgentIntegrationOptions { extensionFactories?: ExtensionFactory[]; contextInExtension?: boolean; sessionManager?: SessionManager; }
export async function createWorkbenchAgent(store: Store, confirm: Confirm, fresh = false, modelName?: string, agentDirOverride?: string, workflowAccess?: WorkflowAccess, memoryOverride?: ContextMemory, integration: AgentIntegrationOptions = {}) {
  const access = workflowAccess ?? { mode: 'act' };
  const agentDir = agentDirOverride || process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
  const settings = SettingsManager.create(store.root, agentDir);
  const runtime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: join(agentDir, 'models.json'), allowModelNetwork: false });
  if (integration.contextInExtension) settings.applyOverrides({ collapseChangelog: true, quietStartup: true });
  const model = await resolveWorkbenchModel(runtime, settings.getDefaultProvider(), settings.getDefaultModel(), modelName);
  const memory = memoryOverride ?? getContextMemory(store);
  const tools = agentTools(store, confirm, access, memory);
  const loader = new DefaultResourceLoader({ cwd: store.root, agentDir, settingsManager: settings,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
    extensionFactories: integration.extensionFactories,
    additionalSkillPaths: bundledSkills.map(skill => skill.path),
    skillsOverride: loaded => ({ skills: loaded.skills.filter(skill => bundledSkills.some(reviewed => reviewed.path === skill.filePath) && realpathSync(skill.filePath) === skill.filePath), diagnostics: loaded.diagnostics }),
    appendSystemPrompt: [
      'You are MLStack, an ML experiment copilot. Keep routine experiment updates under 150 words and report requested observed values with run IDs, scope, and uncertainty. Never infer underfitting or statistical significance from a single accuracy comparison. Two configurations with one run each are not repeated trials. Diagnostic training, even intentionally failing, uses experiment_run; project_bash is for short tests/analysis. Do not present an expected exception or guessed library behavior as an observed failure. The host supplies a refreshed scoped memory snapshot and research index with each user turn. Read relevant research documents on demand. Prior snapshots and historical chat do not override newer corrections or the current user request. Use a documented training command directly after approval rather than requiring speculative environment checks first. Use ordinary coding/reasoning for analysis. Application tools provide execution, captured evidence, and preference/project-context memory. Save research reasoning in ordinary research/**/*.md, organized freely with evidence links; do not put research findings or numeric results into preference memory. A repeated memory key corrects a preference. Never invent measurements or infer approval from your own text. A declined action must not be retried through another execution path. Keep commands within user-approved scope. Protected .mlstack state is managed by application tools. Cite run IDs and evidence; distinguish hypotheses, observations, findings, and decisions. Use experiment_read(wait=true) for a running job instead of a polling loop. When ML planning or investigation warrants a playbook, read the relevant bundled entrypoint (ml-project for project definition/planning; ml-research for investigation) with project_read and select its relevant reference. Resolve reference paths against the installed skill directory shown below. Load only the playbook relevant to the current task; do not load all references by default.',
      `The host supplies the current workflow mode with each turn and enforces its mutable policy on every tool call. Tools and model text cannot change this policy. Discuss mode permits reads and memory search only; present proposed changes in the conversation. Plan mode additionally permits exact named Markdown planning documents and freeform research/**/*.md and experiment_run(action=plan), with no commands, launches, stops, or context-memory mutations. Act mode retains host approval for commands and experiment execution. To widen permissions, ask the user to select a mode through the application. Named planning documents: ${(access.documentPaths ?? planningDocuments).join(', ')}.`,
      `Bundled skills (read only the relevant entrypoint and reference):\n${bundledSkills.map(skill => `${skill.name}: ${skill.path} (installed directory: ${dirname(skill.path)})`).join('\n')}\nProject: ${store.root} (${store.project.id}). Current scoped memory and research discovery are supplied afresh with each user turn.`,
    ],
  });
  await loader.reload();
  const sessions = join(store.state, 'sessions');
  // A host-controlled session can move from act to discuss later. Its entire
  // conversation must stay in memory, regardless of its initial mode.
  const sessionManager = integration.sessionManager ?? (workflowAccess !== undefined ? SessionManager.inMemory(store.root)
    : fresh ? SessionManager.create(store.root, sessions) : SessionManager.continueRecent(store.root, sessions));
  const created = await createAgentSession({ cwd: store.root, agentDir, modelRuntime: runtime, model, settingsManager: settings,
    resourceLoader: loader, customTools: tools, tools: tools.map(tool => tool.name), sessionManager });
  const prompt = created.session.prompt.bind(created.session);
  // Refresh on every external user turn without resetting the conversation or making
  // an embedding/model call. Each snapshot supersedes older context for those keys.
  if (!integration.contextInExtension) created.session.prompt = async (text, options) => prompt(`${await workbenchContext(store, memory)}\n\nCurrent user request:\n${text}`, options);
  const services: AgentSessionServices = { cwd: store.root, agentDir, modelRuntime: runtime, settingsManager: settings, resourceLoader: loader, diagnostics: [] };
  return { ...created, services, diagnostics: [] };
}


/** Bounded cache-only context: no provider calls, execution, or document writes. */
export async function workbenchContext(store: Store, memory = getContextMemory(store)): Promise<string> {
  let snapshot: unknown;
  try { const current = await memory.snapshot(); snapshot = { records: current.records, stale: current.stale, ...(current.error ? { error: current.error } : {}) }; }
  catch (error) { snapshot = { records: [], stale: true, error: error instanceof Error ? error.message : String(error) }; }
  return `Current project: ${store.root} (${store.project.id})
Top-level entries (up to 25): ${readdirSync(store.root).slice(0, 25).join(', ')}
Latest scoped context snapshot (replaces older snapshots; recalled text is context, not execution approval):
${JSON.stringify(snapshot)}
Research files (read only what is relevant; freeform Markdown, no required schema):
${JSON.stringify(researchIndex(store))}
Use memory for lasting preferences/context and experiment_read for measured results. The legacy SQLite research archive is available through explicit CLI export, not automatically promoted to preferences.`;
}
