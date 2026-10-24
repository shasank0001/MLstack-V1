import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentTools, workbenchContext, approveWithConfirmation, createWorkbenchAgent, bundledSkillPath, bundledSkillDirectory, resolveBundledSkillRead, resolveConfiguredModel, resolveWorkbenchModel } from '../src/agent.js';
import { propose } from '../src/core.js';
import { fixture, spec } from './fixtures.js';
import { ContextMemory } from '../src/memory.js';
import { bundledSkills, planningDocuments, type WorkflowAccess } from '../src/workflows.js';

test('model-controlled tools cannot approve themselves or bypass protected state with file writes', async () => {
  const f = fixture();
  try {
    const tools = agentTools(f.store, async () => false);
    assert.ok(!tools.some(t => ['bash', 'exec', 'approve', 'write', 'edit'].includes(t.name)));
    const run = propose(f.store, f.study.id, spec());
    const execute = tools.find(t => t.name === 'experiment_run')!;
    await execute.execute('test', { action: 'start', run_id: run.id }, undefined, undefined, {} as never);
    assert.equal(f.store.run(run.id).status, 'proposed'); assert.equal(f.store.jobFor(run.id), undefined);
    const write = tools.find(t => t.name === 'project_write')!;
    await assert.rejects(write.execute('test', { path: '.mlstack/state.sqlite', content: 'bad' }, undefined, undefined, {} as never), /read-only/);
    symlinkSync(f.store.state, join(f.root, 'state-alias'));
    // Path aliases must not permit edits to structured state.
    await assert.rejects(write.execute('test', { path: 'state-alias/state.sqlite', content: 'bad' }, undefined, undefined, {} as never));
  } finally { f.cleanup(); }
});

test('changes while approval is pending require review again', async () => {
  const f = fixture();
  try {
    const run = propose(f.store, f.study.id, spec());
    await assert.rejects(approveWithConfirmation(f.store, run.id, async () => {
      writeFileSync(join(f.root, 'model.py'), '# source changed during confirmation'); return true;
    }), /pending/);
    assert.equal(f.store.run(run.id).status, 'proposed');
  } finally { f.cleanup(); }
});

test('actual Pi SDK session activates only the application tools without making model calls', async () => {
  const f = fixture();
  try {
    const agentDir = join(f.root, 'isolated-agent'); mkdirSync(agentDir);
    // Ambient skills must not become active simply because a provider directory contains them.
    const ambient = join(agentDir, 'skills', 'ambient'); mkdirSync(ambient, { recursive: true });
    writeFileSync(join(ambient, 'SKILL.md'), '---\nname: ambient\ndescription: Unselected skill\n---\nDo not load me.\n');
    const { session } = await createWorkbenchAgent(f.store, async () => false, true, 'openrouter/cohere/north-mini-code:free', agentDir);
    try {
      const active = session.getActiveToolNames();
      assert.ok(active.includes('experiment_run'));
      assert.ok(active.includes('project_read'));
      assert.ok(!active.includes('bash'));
      assert.ok(active.includes('project_bash'));
      assert.ok(!active.includes('mlstack_compare'));
      assert.equal(active.length, 9);
      assert.match(session.systemPrompt, /ml-research/);
      assert.match(session.systemPrompt, /ml-project/);
      assert.deepEqual(session.resourceLoader.getSkills().skills.map(skill => skill.filePath).sort(), bundledSkills.map(skill => skill.path).sort());
      assert.match(session.systemPrompt, /Load only the playbook relevant/);
      assert.ok(!active.includes('write'));
      assert.match(session.systemPrompt, /MLStack/);
      assert.equal(session.sessionManager.isPersisted(), true, 'SDK calls without a workflow policy preserve persistent sessions');
    } finally { session.dispose(); }
  } finally { f.cleanup(); }
});

test('discuss mode blocks all mutations before database changes, file writes, or approval requests', async () => {
  const f = fixture();
  try {
    let confirmations = 0;
    const tools = agentTools(f.store, async () => { confirmations++; return true; }, { mode: 'discuss' });
    const call = (name: string, parameters: unknown) => tools.find(tool => tool.name === name)!.execute(name, parameters, undefined, undefined, {} as never);
    const before = f.store.db.prepare('SELECT total_changes() AS count').get();
    for (const [name, parameters] of [
      ['project_write', { path: 'plan.md', content: '# Disallowed' }],
      ['project_edit', { path: 'model.py', oldText: 'original', newText: 'changed' }],
      ['project_bash', { command: 'echo should-not-run' }],
      ['experiment_run', { action: 'plan', spec: spec(), study_title: 'Must not be created' }],
      ['experiment_run', { action: 'start', spec: spec(), study_title: 'Must not be created' }],
      ['experiment_run', { action: 'stop', run_id: 'missing' }],
      ['memory', { action: 'record', key: 'preference', text: 'Must not be saved' }],
      ['memory', { action: 'forget', id: 'missing' }],
    ] as const) await assert.rejects(call(name, parameters), /unavailable in discuss mode/);
    assert.equal(confirmations, 0);
    assert.deepEqual(f.store.db.prepare('SELECT total_changes() AS count').get(), before);
    assert.equal(existsSync(join(f.root, 'plan.md')), false);
    assert.equal(readFileSync(join(f.root, 'model.py'), 'utf8'), '# original source\n');
    assert.match(JSON.stringify(await call('project_read', { path: 'model.py' })), /original source/);
    assert.match(JSON.stringify(await call('project_ls', { path: '.' })), /model.py/);
    await call('experiment_read', {});
    await call('memory', { action: 'search' });
    assert.deepEqual(f.store.db.prepare('SELECT total_changes() AS count').get(), before, 'read tools cannot mutate research state');
    assert.equal(tools.length, 9);
  } finally { f.cleanup(); }
});

test('plan mode permits exact planning documents and proposals while blocking code, aliases, execution and memory changes', async () => {
  const f = fixture();
  try {
    let confirmations = 0;
    const access: WorkflowAccess = { mode: 'plan' };
    const tools = agentTools(f.store, async () => { confirmations++; return true; }, access);
    const call = (name: string, parameters: unknown) => tools.find(tool => tool.name === name)!.execute(name, parameters, undefined, undefined, {} as never);
    for (const path of planningDocuments) await call('project_write', { path, content: '# Plan\n' });
    await call('project_edit', { path: 'plan.md', edits: [{ oldText: '# Plan', newText: '# Revised plan' }] });
    assert.equal(readFileSync(join(f.root, 'plan.md'), 'utf8'), '# Revised plan\n');
    symlinkSync(join(f.root, 'plan.md'), join(f.root, 'plan-alias.md'));
    mkdirSync(join(f.root, 'other'));
    symlinkSync(join(f.root, 'docs'), join(f.root, 'docs-alias'));
    for (const path of ['model.py', 'README.md', './plan.md', 'other/../plan.md', join(f.root, 'plan.md'), 'plan-alias.md', 'docs-alias/ml-project.md', '.mlstack/state.sqlite']) {
      await assert.rejects(call('project_write', { path, content: '# Blocked' }), /exact named Markdown/);
      await assert.rejects(call('project_edit', { path, oldText: 'Plan', newText: 'Blocked' }), /exact named Markdown/);
    }
    // Even an explicitly named symlink and non-Markdown file cannot widen plan access.
    access.documentPaths = ['plan-alias.md', 'docs-alias/ml-project.md', 'model.py', 'docs/custom.md'];
    for (const path of access.documentPaths.slice(0, 3)) await assert.rejects(call('project_write', { path, content: 'blocked' }), /exact named Markdown/);
    await call('project_write', { path: 'docs/custom.md', content: '# Custom plan' });
    await assert.rejects(call('project_write', { path: 'plan.md', content: '# Blocked' }), /exact named Markdown/);
    const proposal = await call('experiment_run', { action: 'plan', spec: spec(), study_id: f.study.id });
    assert.match(JSON.stringify(proposal), /proposed/);
    assert.equal(f.store.list('runs').length, 1);
    const before = f.store.db.prepare('SELECT total_changes() AS count').get();
    for (const [name, parameters] of [
      ['project_bash', { command: 'echo should-not-run' }],
      ['experiment_run', { action: 'start', spec: spec(), study_title: 'Must not be created' }],
      ['experiment_run', { action: 'stop', run_id: 'missing' }],
      ['memory', { action: 'record', key: 'preference', text: 'Must not be saved' }],
      ['memory', { action: 'forget', id: 'missing' }],
    ] as const) await assert.rejects(call(name, parameters), /unavailable in plan mode/);
    assert.equal(confirmations, 0);
    assert.deepEqual(f.store.db.prepare('SELECT total_changes() AS count').get(), before);
    assert.equal(f.store.list('jobs').length, 0);
  } finally { f.cleanup(); }
});

test('planning an existing completed run reports its actual status without creating research state', async () => {
  const f = fixture();
  try {
    const run = propose(f.store, f.study.id, spec());
    run.status = 'completed';
    f.store.put('runs', run);
    let confirmations = 0;
    const tool = agentTools(f.store, async () => { confirmations++; return true; }, { mode: 'plan' }).find(tool => tool.name === 'experiment_run')!;
    const before = f.store.db.prepare('SELECT total_changes() AS count').get();
    const events = f.store.db.prepare('SELECT COUNT(*) AS count FROM events').get();
    const response = await tool.execute('existing', { action: 'plan', run_id: run.id }, undefined, undefined, {} as never);
    const output = response.content.find(block => block.type === 'text')!;
    assert.equal(output.type, 'text');
    if (output.type !== 'text') throw new Error('Expected text result');
    const payload = JSON.parse(output.text);
    assert.equal(payload.status, 'completed');
    assert.deepEqual(payload.run, run);
    assert.deepEqual(f.store.list('runs'), [run]);
    assert.deepEqual(f.store.list('jobs'), []);
    assert.deepEqual(f.store.db.prepare('SELECT COUNT(*) AS count FROM events').get(), events);
    assert.deepEqual(f.store.db.prepare('SELECT total_changes() AS count').get(), before);
    assert.equal(confirmations, 0);
  } finally { f.cleanup(); }
});

test('existing tool instances enforce changes to host-owned access on every call and after approval', async () => {
  const f = fixture();
  try {
    const access: WorkflowAccess = { mode: 'discuss' };
    let confirmations = 0;
    let switchDuringApproval = false;
    const tools = agentTools(f.store, async () => {
      confirmations++;
      if (switchDuringApproval) { access.mode = 'discuss'; return true; }
      return false;
    }, access);
    const call = (name: string, parameters: unknown) => tools.find(tool => tool.name === name)!.execute(name, parameters, undefined, undefined, {} as never);
    const plan = { path: 'plan.md', content: '# Plan' };
    await assert.rejects(call('project_write', plan), /discuss/);
    access.mode = 'plan';
    await call('project_write', plan);
    await assert.rejects(call('project_bash', { command: 'echo plan' }), /plan/);
    access.mode = 'act';
    await call('project_write', { path: 'model.py', content: '# Changed in act' });
    assert.match(JSON.stringify(await call('project_bash', { command: 'echo denied' })), /declined/);
    assert.equal(confirmations, 1);
    access.mode = 'discuss';
    await assert.rejects(call('project_write', plan), /discuss/);
    await assert.rejects(call('memory', { action: 'record', key: 'preference', text: 'No' }), /discuss/);
    access.mode = 'act';
    switchDuringApproval = true;
    const before = f.store.db.prepare('SELECT total_changes() AS count').get();
    await assert.rejects(call('project_bash', { command: 'echo changed-during-approval' }), /discuss/);
    assert.deepEqual(f.store.db.prepare('SELECT total_changes() AS count').get(), before);
    assert.equal(confirmations, 2);
  } finally { f.cleanup(); }
});

test('host-controlled sessions stay in memory across mode changes even when initially acting', async () => {
  const f = fixture();
  try {
    const agentDir = join(f.root, 'isolated-agent'); mkdirSync(agentDir);
    for (const mode of ['act', 'plan', 'discuss'] as const) {
      const access: WorkflowAccess = { mode };
      const { session } = await createWorkbenchAgent(f.store, async () => false, true, 'openrouter/cohere/north-mini-code:free', agentDir, access);
      try {
        assert.equal(session.sessionManager.isPersisted(), false);
        assert.equal(session.sessionManager.getSessionFile(), undefined);
        assert.match(session.systemPrompt, /host supplies the current workflow mode/i);
        assert.doesNotMatch(session.systemPrompt, /Workflow mode: (act|plan|discuss)/);
        session.sessionManager.appendMessage({ role: 'user', content: 'Keep this conversation in memory', timestamp: Date.now() });
        access.mode = 'discuss';
        session.sessionManager.appendMessage({ role: 'user', content: 'Continue discussing', timestamp: Date.now() });
        assert.equal(session.sessionManager.getBranch().filter(entry => entry.type === 'message').length, 2);
        assert.equal(session.sessionManager.getSessionFile(), undefined);
        assert.equal(session.sessionManager.isPersisted(), false);
        const sessions = join(f.store.state, 'sessions');
        assert.deepEqual(existsSync(sessions) ? readdirSync(sessions) : [], []);
      } finally { session.dispose(); }
    }
  } finally { f.cleanup(); }
});

test('the bundled skill is readable without granting arbitrary external file access', async () => {
  const f = fixture();
  try {
    const read = agentTools(f.store, async () => false).find(tool => tool.name === 'project_read')!;
    const source = await read.execute('project', { path: 'model.py' }, undefined, undefined, {} as never);
    assert.match(JSON.stringify(source.content), /original source/);
    const skill = await read.execute('skill', { path: bundledSkillPath }, undefined, undefined, {} as never);
    assert.match(JSON.stringify(skill.content), /ML research|ml-research/i);
    const projectSkill = bundledSkills.find(skill => skill.name === 'ml-project')!;
    assert.match(JSON.stringify(await read.execute('project-skill', { path: projectSkill.path }, undefined, undefined, {} as never)), /ml-project/i);
    for (const name of projectSkill.references) {
      const path = join(projectSkill.path, '..', 'references', name);
      assert.ok(JSON.stringify(await read.execute(name, { path }, undefined, undefined, {} as never)).length > 50);
    }
    await assert.rejects(read.execute('wrong-bundle', { path: join(projectSkill.path, '..', 'references', 'onboarding.md') }, undefined, undefined, {} as never), /inside/);
    for (const name of ['onboarding', 'debugging', 'evaluation', 'performance']) {
      const reference = await read.execute(name, { path: join(bundledSkillDirectory, 'references', `${name}.md`) }, undefined, undefined, {} as never);
      assert.ok(JSON.stringify(reference.content).length > 50);
    }
    await assert.rejects(read.execute('external', { path: '/etc/passwd' }, undefined, undefined, {} as never), /inside/);
    for (const path of ['@/etc/passwd', 'file:///etc/passwd']) {
      await assert.rejects(read.execute('sdk-alias', { path }, undefined, undefined, {} as never), /Path not found/);
    }
    await assert.rejects(read.execute('unreviewed', { path: join(bundledSkillDirectory, 'references', 'arbitrary.md') }, undefined, undefined, {} as never), /inside/);
    await assert.rejects(read.execute('traversal', { path: `${bundledSkillDirectory}references/../SKILL.md` }, undefined, undefined, {} as never), /inside/);
    for (const [name, parameters] of [
      ['project_ls', { path: bundledSkillDirectory }],
      ['project_grep', { path: bundledSkillDirectory, pattern: 'research' }],
      ['project_write', { path: bundledSkillPath, content: 'overwrite' }],
      ['project_edit', { path: bundledSkillPath, oldText: 'research', newText: 'overwrite' }],
    ] as const) {
      const tool = agentTools(f.store, async () => false).find(candidate => candidate.name === name)!;
      await assert.rejects(tool.execute(name, parameters, undefined, undefined, {} as never), /inside/);
    }
    symlinkSync(bundledSkillDirectory, join(f.root, 'skill-alias'));
    await assert.rejects(read.execute('alias', { path: 'skill-alias/references/onboarding.md' }, undefined, undefined, {} as never), /escapes/);
  } finally { f.cleanup(); }
});

test('coding tools reject dangling symlinks and SDK Unicode path reinterpretations', async () => {
  const f = fixture();
  try {
    const access: WorkflowAccess = { mode: 'plan' };
    const tools = agentTools(f.store, async () => false, access);
    const write = tools.find(tool => tool.name === 'project_write')!;
    const read = tools.find(tool => tool.name === 'project_read')!;
    const target = join(f.root, 'must-not-be-created.md');
    symlinkSync(target, join(f.root, 'plan.md'));
    await assert.rejects(write.execute('dangling-plan', { path: 'plan.md', content: '# Blocked' }, undefined, undefined, {} as never), /[Ss]ymlink/);
    assert.equal(existsSync(target), false);
    access.mode = 'act';
    await assert.rejects(write.execute('dangling-act', { path: 'plan.md', content: '# Blocked' }, undefined, undefined, {} as never), /[Ss]ymlink/);
    writeFileSync(join(f.root, 'ambiguous\u00a0name'), 'local file');
    symlinkSync('/etc/passwd', join(f.root, 'ambiguous name'));
    await assert.rejects(read.execute('unicode-read', { path: 'ambiguous\u00a0name' }, undefined, undefined, {} as never), /ambiguous Unicode/);
    await assert.rejects(write.execute('unicode-write', { path: 'ambiguous\u00a0name', content: 'blocked' }, undefined, undefined, {} as never), /ambiguous Unicode/);
  } finally { f.cleanup(); }
});

test('bundled read allowlist rejects symlink files and ancestors, directories, and traversal', () => {
  const f = fixture();
  try {
    const installed = join(f.root, 'installed'); const references = join(installed, 'references');
    mkdirSync(references, { recursive: true });
    const onboarding = join(references, 'onboarding.md');
    writeFileSync(onboarding, '# Onboarding\n');
    assert.equal(resolveBundledSkillRead(onboarding, installed), onboarding);
    assert.equal(resolveBundledSkillRead(`${references}/../references/onboarding.md`, installed), undefined);
    assert.equal(resolveBundledSkillRead('references/onboarding.md', installed), undefined);
    writeFileSync(join(references, 'unreviewed.md'), '# Unreviewed\n');
    assert.equal(resolveBundledSkillRead(join(references, 'unreviewed.md'), installed), undefined);
    mkdirSync(join(references, 'performance.md'));
    assert.equal(resolveBundledSkillRead(join(references, 'performance.md'), installed), undefined);
    symlinkSync(join(f.root, 'model.py'), join(references, 'debugging.md'));
    assert.equal(resolveBundledSkillRead(join(references, 'debugging.md'), installed), undefined);
    // Even an allowlisted filename beneath a symlinked references directory must remain contained.
    const other = join(f.root, 'other-installed'); mkdirSync(other);
    symlinkSync(references, join(other, 'references'));
    assert.equal(resolveBundledSkillRead(join(other, 'references', 'onboarding.md'), other), undefined);
    const alias = join(f.root, 'installed-alias'); symlinkSync(installed, alias);
    assert.equal(resolveBundledSkillRead(join(alias, 'references', 'onboarding.md'), alias), undefined);
    assert.equal(resolveBundledSkillRead(join(references, 'evaluation.md'), installed), undefined);
  } finally { f.cleanup(); }
});

test('ordinary commands need host approval and approved diagnostics work through the reused Pi tool', async () => {
  const f = fixture();
  try {
    const denied = agentTools(f.store, async () => false).find(tool => tool.name === 'project_bash')!;
    const refusal = await denied.execute('denied', { command: 'echo should-not-run' }, undefined, undefined, {} as never);
    assert.match(JSON.stringify(refusal), /declined/);
    let approved = 0;
    const allowed = agentTools(f.store, async (_text, request) => { assert.equal(request?.kind, 'command'); approved++; return true; }).find(tool => tool.name === 'project_bash')!;
    const diagnostic = await allowed.execute('allowed', { command: "printf 'diagnostic ok'", timeout: 2 }, undefined, undefined, {} as never);
    assert.match(JSON.stringify(diagnostic), /diagnostic ok/); assert.equal(approved, 1);
    await assert.rejects(allowed.execute('too-long', { command: 'echo no', timeout: 1000 }, undefined, undefined, {} as never), /1–60/);
  } finally { f.cleanup(); }
});

test('configured model prefixes normalize but unavailable models never silently fall back', () => {
  const model = { id: 'vendor/free', provider: 'router' } as never;
  const runtime = { getModel: (provider: string, id: string) => provider === 'router' && id === 'vendor/free' ? model : undefined };
  assert.equal(resolveConfiguredModel(runtime, 'router', 'router/vendor/free'), model);
  assert.equal(resolveConfiguredModel(runtime, undefined, undefined, 'router/vendor/free'), model);
  assert.throws(() => resolveConfiguredModel(runtime, 'router', 'missing'), /No model was substituted/);
  assert.throws(() => resolveConfiguredModel(runtime, undefined, undefined), /Configure/);
});

test('cached and configured model selection stays offline without refreshing catalogs', async () => {
  const model = { id: 'vendor/free', provider: 'router' } as never;
  let refreshes = 0;
  const runtime = { getModel: (provider: string, id: string) => provider === 'router' && id === 'vendor/free' ? model : undefined,
    refresh: async () => { refreshes++; return { aborted: false, errors: new Map() }; } };
  assert.equal(await resolveWorkbenchModel(runtime, 'router', 'vendor/free'), model);
  assert.equal(await resolveWorkbenchModel(runtime, undefined, undefined, 'router/vendor/free'), model);
  await assert.rejects(resolveWorkbenchModel(runtime, 'router', 'missing'), /No model was substituted/);
  assert.equal(refreshes, 0);
});

test('only a missing explicitly selected model triggers a bounded refresh of its provider', async () => {
  const model = { id: 'vendor/fresh:free', provider: 'router' } as never;
  let available = false; let refreshes = 0;
  const runtime = { getModel: (provider: string, id: string) => available && provider === 'router' && id === 'vendor/fresh:free' ? model : undefined,
    refresh: async (options?: { providers?: readonly string[]; allowNetwork?: boolean; force?: boolean; signal?: AbortSignal }) => {
      refreshes++; assert.deepEqual(options?.providers, ['router']); assert.equal(options.allowNetwork, true);
      assert.equal(options.force, true); assert.ok(options.signal instanceof AbortSignal); assert.equal(options.signal.aborted, false);
      available = true; return { aborted: false, errors: new Map() };
    } };
  assert.equal(await resolveWorkbenchModel(runtime, 'other', 'other-model', 'router/vendor/fresh:free', false), model);
  assert.equal(refreshes, 1);
});

test('missing or failed refreshed models fail clearly without model substitution or network when offline', async () => {
  let refreshes = 0;
  const runtime = { getModel: () => undefined,
    refresh: async () => { refreshes++; return { aborted: false, errors: new Map<string, Error>() }; } };
  await assert.rejects(resolveWorkbenchModel(runtime, undefined, undefined, 'router/missing', true), /PI_OFFLINE/);
  assert.equal(refreshes, 0);
  await assert.rejects(resolveWorkbenchModel(runtime, undefined, undefined, 'router/missing', false), /remains unavailable.*No model was substituted.*models.json/);
  assert.equal(refreshes, 1);
  await assert.rejects(resolveWorkbenchModel({ ...runtime, refresh: async () => ({ aborted: false, errors: new Map([['router', new Error('service unavailable')]]) }) }, undefined, undefined, 'router/missing', false), /service unavailable.*No model was substituted/);
  await assert.rejects(resolveWorkbenchModel({ ...runtime, refresh: async () => ({ aborted: true, errors: new Map() }) }, undefined, undefined, 'router/missing', false), /timed out or was aborted.*No model was substituted/);
  await assert.rejects(resolveWorkbenchModel({ ...runtime, refresh: async () => { throw new Error('network failed'); } }, undefined, undefined, 'router/missing', false), /network failed.*No model was substituted/);
});

test('a refused request is not re-prompted in the same user turn, but a new user message can reconsider', async () => {
  const f = fixture();
  try {
    let turn = 'first'; let confirmations = 0;
    const ctx = { sessionManager: { getBranch: () => [{ type: 'message', id: turn, message: { role: 'user' } }] } } as never;
    const tool = agentTools(f.store, async () => { confirmations++; return false; }).find(tool => tool.name === 'project_bash')!;
    const params = { command: 'echo diagnostic', timeout: 2 };
    await tool.execute('one', params, undefined, undefined, ctx);
    await tool.execute('two', params, undefined, undefined, ctx);
    assert.equal(confirmations, 1);
    turn = 'second';
    await tool.execute('three', params, undefined, undefined, ctx);
    assert.equal(confirmations, 2);
  } finally { f.cleanup(); }
});

test('known training entrypoints get a managed-execution hint instead of an untracked shell launch', async () => {
  const f = fixture();
  try {
    const input = spec(); input.command = ['python3', 'model.py', '--lr', '0.01'];
    propose(f.store, f.study.id, input);
    let confirmations = 0;
    const tool = agentTools(f.store, async () => { confirmations++; return true; }).find(tool => tool.name === 'project_bash')!;
    const reply = await tool.execute('training', { command: 'python3 model.py --lr nan', timeout: 60 }, undefined, undefined, {} as never);
    assert.match(JSON.stringify(reply), /experiment_run/);
    assert.equal(confirmations, 0);
    assert.equal(f.store.list('jobs').length, 0);
  } finally { f.cleanup(); }
});

test('a refused managed start reuses its refusal rather than creating repeated proposals or approvals', async () => {
  const f = fixture();
  try {
    let confirmations = 0;
    const tool = agentTools(f.store, async () => { confirmations++; return false; }).find(tool => tool.name === 'experiment_run')!;
    const args = { action: 'start', spec: spec(), study_id: f.study.id };
    await tool.execute('one', args, undefined, undefined, {} as never);
    await tool.execute('two', { ...args, spec: { ...args.spec, name: 'Renamed request' } }, undefined, undefined, {} as never);
    assert.equal(confirmations, 1); assert.equal(f.store.list('runs').length, 1); assert.equal(f.store.list('jobs').length, 0);
  } finally { f.cleanup(); }
});

test('model evidence reads use a simple boolean wait and normalize old numeric requests', () => {
  const f = fixture();
  try {
    const tool = agentTools(f.store, async () => false).find(tool => tool.name === 'experiment_read')!;
    assert.match(JSON.stringify(tool.parameters), /"wait"/);
    assert.ok(!JSON.stringify(tool.parameters).includes('wait_seconds'));
    assert.deepEqual(tool.prepareArguments!({ run_ids: ['run-test'], wait_seconds: 65 }), { run_ids: ['run-test'], wait: true });
    assert.deepEqual(tool.prepareArguments!({ run_ids: ['run-test'], wait: false }), { run_ids: ['run-test'], wait: false });
  } finally { f.cleanup(); }
});

test('empty memory query uses bounded context without an embedding request and does not expose legacy research', async () => {
  const f = fixture();
  try {
    const memory = new ContextMemory(f.store, { home: join(f.root, 'context-home') });
    const tools = agentTools(f.store, async () => false, { mode: 'discuss' }, memory);
    const tool = tools.find(tool => tool.name === 'memory')!;
    const reply = await tool.execute('recall', { action: 'search', query: '' }, undefined, undefined, {} as never);
    assert.match(JSON.stringify(reply), /records/);
    assert.equal(existsSync(join(f.root, 'context-home')), false, 'a read must not create memory/model files');
    assert.ok(!tools.some(tool => tool.name === 'research_memory'));
  } finally { f.cleanup(); }
});

test('host context refresh discovers freeform research edits and memory changes within one session', async () => {
  const f = fixture();
  try {
    let text = 'Prefer concise answers';
    const memory = { snapshot: async () => ({ records: [{key:'style',text}], text, stale:false }) } as unknown as ContextMemory;
    const first = await workbenchContext(f.store, memory);
    assert.match(first, /Prefer concise answers/);
    text = 'Prefer detailed explanations';
    mkdirSync(join(f.root, 'research'), {recursive:true});
    writeFileSync(join(f.root, 'research/my-topic.md'), 'An ordinary note without a prescribed template.');
    const second = await workbenchContext(f.store, memory);
    assert.match(second, /Prefer detailed explanations/); assert.doesNotMatch(second, /Prefer concise answers/);
    assert.match(second, /my-topic.md/);
    assert.doesNotMatch(second, /An ordinary note/, 'document bodies load on demand');
    assert.equal(f.store.list('memories').length, 0);
  } finally { f.cleanup(); }
});

test('plan mode supports freeform research Markdown while rejecting aliases and code', async () => {
  const f=fixture();
  try {
    const write = agentTools(f.store, async()=>false, {mode:'plan'}).find(tool=>tool.name==='project_write')!;
    await write.execute('write', {path:'research/any/subtopic.md',content:'Freeform research'},undefined,undefined,{} as never);
    assert.equal(readFileSync(join(f.root,'research/any/subtopic.md'),'utf8'),'Freeform research');
    for (const path of ['research/code.py','research/../other.md','./research/topic.md']) await assert.rejects(write.execute('write',{path,content:'no'},undefined,undefined,{} as never));
    symlinkSync(join(f.root,'research/any'),join(f.root,'research/alias'));
    await assert.rejects(write.execute('write',{path:'research/alias/subtopic.md',content:'no'},undefined,undefined,{} as never));
  } finally {f.cleanup();}
});

test('custom analysis mentioning a training file is not mistaken for running that entrypoint', async () => {
  const f = fixture();
  try {
    const input = spec(); input.command = ['python3', 'model.py']; propose(f.store, f.study.id, input);
    let confirmations = 0;
    const bash = agentTools(f.store, async () => { confirmations++; return false; }).find(tool => tool.name === 'project_bash')!;
    const reply = await bash.execute('analysis', { command: 'python3 analyze.py model.py' }, undefined, undefined, {} as never);
    assert.equal(confirmations, 1); assert.match(JSON.stringify(reply), /declined/);
    assert.ok(!JSON.stringify(reply).includes('next_tool'));
  } finally { f.cleanup(); }
});
