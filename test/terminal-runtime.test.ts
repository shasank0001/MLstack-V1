import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTerminalRuntime } from '../cli.js';
import { getContextMemory } from '../src/memory.js';
import { Store } from '../src/store.js';

const nineTools = ['experiment_read', 'experiment_run', 'memory', 'project_bash', 'project_edit', 'project_grep', 'project_ls', 'project_read', 'project_write'];

test('terminal runtime wires trusted scoped tools, refreshes context, blocks imported histories, and supports clean /new and /reload', { timeout: 30000 }, async () => {
  const base = mkdtempSync(join(tmpdir(), 'mlstack-terminal-runtime-'));
  const project = join(base, 'project'), agentDir = join(base, 'agent'), home = join(base, 'home');
  mkdirSync(project); mkdirSync(agentDir);
  const previous = { agentDir: process.env.PI_CODING_AGENT_DIR, memoryHome: process.env.MLSTACK_HOME, offline: process.env.PI_OFFLINE };
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.MLSTACK_HOME = home;
  process.env.PI_OFFLINE = '1';
  const store = new Store(project);
  writeFileSync(join(agentDir, 'models.json'), JSON.stringify({ providers: { openai: {
    baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'offline-test-key', api: 'openai-completions',
    models: [{ id: 'terminal-stub', name: 'Offline terminal stub', contextWindow: 4096, maxTokens: 512,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
  } } }));
  // A project extension must not become trusted merely because the terminal runtime reloads.
  const projectExtension = join(project, '.pi', 'extensions');
  mkdirSync(projectExtension, { recursive: true });
  writeFileSync(join(projectExtension, 'untrusted.js'), `export default pi => pi.registerTool({name:'untrusted_project_tool',label:'bad',description:'bad',parameters:{type:'object',properties:{}},execute:async()=>({content:[]})});`);

  let runtime: Awaited<ReturnType<typeof createTerminalRuntime>> | undefined;
  try {
    const memory = getContextMemory(store);
    const saved = await memory.record({ scope: 'user', key: 'style', text: 'Current preference: concise answers', source: 'test user' }, 'terminal-context-1');
    assert.equal(saved.ok, true, saved.error);
    runtime = await createTerminalRuntime(store, 'openai/terminal-stub');
    assert.deepEqual([...runtime.session.getActiveToolNames()].sort(), nineTools);
    assert.equal(runtime.cwd, project);
    assert.equal(runtime.session.sessionManager.isPersisted(), false, 'host-managed conversations stay in memory');
    assert.equal(runtime.session.model?.provider, 'openai');
    assert.equal(runtime.session.model?.id, 'terminal-stub');

    const promptContext = async () => runtime!.session.extensionRunner.emitBeforeAgentStart({ messageType: 'user', prompt: 'inspect current context' }, { cwd: project });
    const first = await promptContext();
    assert.match(first.systemPromptOptions.forceSystemPrompt ?? '', /Current preference: concise answers/);
    assert.match(first.systemPromptOptions.forceSystemPrompt ?? '', /Current host-controlled MLStack mode: discuss/);
    assert.match(first.systemPromptOptions.forceSystemPrompt ?? '', /Research files.*freeform Markdown/s);

    // Native trusted slash commands are handled by the mounted extension and do not need a model request.
    const beforeCommands = runtime.session.sessionManager.getBranch().length;
    await runtime.session.prompt('/ml --plan');
    await runtime.session.prompt('/mlstack-help');
    await runtime.session.prompt('/memory status');
    const rejectedShell = join(project, 'must-not-exist.txt');
    await runtime.session.prompt(`!touch ${rejectedShell}`);
    assert.equal(existsSync(rejectedShell), false, 'native bang shortcut must never run through Pi');
    assert.ok(runtime.session.sessionManager.getBranch().length > beforeCommands);
    assert.match(JSON.stringify(runtime.session.sessionManager.getBranch()), /local SQLite/);
    assert.doesNotMatch(runtime.session.getActiveToolNames().join(','), /untrusted_project_tool/);

    // A successful correction is visible to the very next host context refresh.
    const corrected = await memory.record({ scope: 'user', key: 'style', text: 'Current preference: detailed answers', source: 'test user' }, 'terminal-context-2');
    assert.equal(corrected.ok, true, corrected.error);
    const updated = await promptContext();
    assert.match(updated.systemPromptOptions.forceSystemPrompt ?? '', /Current preference: detailed answers/);
    assert.doesNotMatch(updated.systemPromptOptions.forceSystemPrompt ?? '', /Current preference: concise answers/);
    assert.match(updated.systemPromptOptions.forceSystemPrompt ?? '', /Current host-controlled MLStack mode: plan/);

    const originalSession = runtime.session;
    const switchResult = await runtime.switchSession(join(base, 'foreign-session.jsonl'));
    assert.equal(switchResult.cancelled, true);
    assert.equal(runtime.session, originalSession, 'resume/import guard keeps the project session attached');
    const forkResult = await runtime.fork('not-an-entry');
    assert.equal(forkResult.cancelled, true, 'fork guard runs before entry lookup');
    assert.equal(runtime.session, originalSession);

    await runtime.session.reload();
    assert.deepEqual([...runtime.session.getActiveToolNames()].sort(), nineTools);
    assert.doesNotMatch(runtime.session.getActiveToolNames().join(','), /untrusted_project_tool/);
    assert.equal(runtime.session.sessionManager.isPersisted(), false);
    assert.match((await promptContext()).systemPromptOptions.forceSystemPrompt ?? '', /Current host-controlled MLStack mode: plan/);

    const newSession = await runtime.newSession();
    assert.equal(newSession.cancelled, false);
    assert.notEqual(runtime.session, originalSession);
    assert.equal(runtime.cwd, project);
    assert.equal(runtime.session.sessionManager.isPersisted(), false);
    assert.deepEqual([...runtime.session.getActiveToolNames()].sort(), nineTools);
    assert.doesNotMatch(JSON.stringify(runtime.session.sessionManager.getBranch()), /local SQLite|Current preference: detailed answers/, '/new starts a clean conversation');
    assert.match((await runtime.session.extensionRunner.emitBeforeAgentStart({ messageType: 'user', prompt: 'fresh context' }, { cwd: project })).systemPromptOptions.forceSystemPrompt ?? '', /Current preference: detailed answers/);
    assert.match((await runtime.session.extensionRunner.emitBeforeAgentStart({ messageType: 'user', prompt: 'fresh context' }, { cwd: project })).systemPromptOptions.forceSystemPrompt ?? '', /Current host-controlled MLStack mode: plan/);
    assert.equal(existsSync(join(project, 'untrusted_project_tool')), false);
  } finally {
    await runtime?.dispose();
    store.close();
    if (previous.agentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous.agentDir;
    if (previous.memoryHome === undefined) delete process.env.MLSTACK_HOME; else process.env.MLSTACK_HOME = previous.memoryHome;
    if (previous.offline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = previous.offline;
    rmSync(base, { recursive: true, force: true });
  }
});
