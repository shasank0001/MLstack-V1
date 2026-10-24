import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Confirm } from '../src/agent.js';
import type { Store } from '../src/store.js';
import type { WorkflowAccess } from '../src/workflows.js';
import { createWorkbenchExtension, terminalOutput, workbenchCommands } from '../src/terminal-ui.js';

async function setup() {
  // The fixture exercises public extension contracts without a provider or TTY.
  const hooks = new Map<string, (event: any, context: any) => any>();
  const commands = new Map<string, any>();
  const messages: any[] = []; const userMessages: any[] = []; const dialogs: any[] = [];
  const statuses = new Map<string, string>(); const notifications: string[] = [];
  const operations: string[][] = [];
  let confirm: Confirm = async () => false;
  let snapshot = 'Current preferences snapshot';
  const access: WorkflowAccess = { mode: 'discuss' };
  const ctx = {
    hasUI: true,
    ui: {
      confirm: async (...args: unknown[]) => { dialogs.push(args); return true; },
      setStatus: (key: string, value: string) => statuses.set(key, value),
      notify: (text: string) => notifications.push(text),
      setTitle() {}, setHeader() {}, setWidget() {},
    },
  } as unknown as ExtensionContext;
  const api = {
    on: (event: string, handler: (event: any, context: any) => any) => { hooks.set(event, handler); },
    registerCommand: (name: string, command: unknown) => commands.set(name, command),
    sendMessage: (...args: unknown[]) => messages.push(args),
    sendUserMessage: (...args: unknown[]) => userMessages.push(args),
  } as unknown as ExtensionAPI;
  await createWorkbenchExtension({
    store: { root: '/fixture' } as Store, access,
    onConfirmReady: value => { confirm = value; },
    getContext: async () => snapshot,
    executeCommand: async (args, approve, output) => {
      operations.push(args);
      if (args[0] === 'cancel') assert.equal(await approve('Cancel this managed run?'), true);
      output('Operation completed');
    },
  })(api);
  return { hooks, commands, messages, userMessages, dialogs, statuses, notifications, operations, ctx, access,
    confirm: (message: string) => confirm(message), setSnapshot: (text: string) => { snapshot = text; },
    emit: (event: string, payload: unknown = {}) => hooks.get(event)!(payload, ctx),
  };
}

test('Pi UI supplies current native confirmation and mode status', async () => {
  const ui = await setup();
  await ui.emit('session_start', { reason: 'startup' });
  assert.equal(ui.statuses.get('mlstack-mode'), 'MLStack · discuss');
  assert.equal(await ui.confirm('Approve this exact command?'), true);
  assert.deepEqual(ui.dialogs[0], ['MLStack approval', 'Approve this exact command?']);
  const noUi = { ...ui.ctx, hasUI: false };
  await ui.hooks.get('tool_call')!({}, noUi);
  assert.equal(await ui.confirm('Must fail closed'), false);
});

test('/ml help and mode changes make no provider request; route defaults and literal text stay intact', async () => {
  const ui = await setup();
  const command = ui.commands.get('ml');
  await command.handler('help', ui.ctx);
  assert.equal(ui.userMessages.length, 0);
  await command.handler('--act', ui.ctx);
  assert.equal(ui.access.mode, 'act');
  assert.equal(ui.userMessages.length, 0);
  await command.handler('define What\'s the candidate\'s goal?', ui.ctx);
  assert.equal(ui.access.mode, 'discuss');
  assert.equal(ui.userMessages.length, 1);
  assert.match(ui.userMessages[0][0], /What's the candidate's goal/);
  assert.match(ui.userMessages[0][0], /definition\.md/);
  await command.handler('--act --discuss do work', ui.ctx);
  assert.equal(ui.access.mode, 'discuss');
  assert.equal(ui.userMessages.length, 1);
  assert.match(ui.messages.at(-1)[0].content, /only one/);
  assert(command.getArgumentCompletions('exp').some((item: { value: string }) => item.value === 'experiment'));
});

test('ordinary input wraps once, preserves images and cannot change host mode', async () => {
  const ui = await setup();
  const images = [{ type: 'image', data: 'fixture', mimeType: 'image/png' }];
  const input = await ui.emit('input', { text: 'Explain --act without changing files', source: 'interactive', images });
  assert.equal(input.action, 'transform');
  assert.match(input.text, /Explain --act without changing files/);
  assert.equal(ui.access.mode, 'discuss');
  assert.deepEqual(input.images, images);
  const trusted = await ui.emit('input', { text: input.text, source: 'extension' });
  assert.deepEqual(trusted, { action: 'continue' });
  const skill = await ui.emit('input', { text: '/skill:ml-project define this', source: 'interactive' });
  assert.equal(skill.action, 'transform'); assert.match(skill.text, /definition\.md/);
  const external = await ui.emit('input', { text: '/skill:unreviewed execute', source: 'interactive' });
  assert.equal(external.action, 'handled');
  const unknown = await ui.emit('input', { text: '/unknown', source: 'interactive' });
  assert.equal(unknown.action, 'handled');
});

test('each agent turn refreshes scoped memory and host mode in system context', async () => {
  const ui = await setup();
  let result = await ui.emit('before_agent_start', { systemPrompt: 'Base prompt' });
  assert.match(result.systemPrompt, /Current preferences snapshot/);
  assert.match(result.systemPrompt, /mode: discuss/);
  ui.setSnapshot('Corrected preference'); ui.access.mode = 'plan';
  result = await ui.emit('before_agent_start', { systemPrompt: 'Base prompt' });
  assert.match(result.systemPrompt, /Corrected preference/);
  assert.doesNotMatch(result.systemPrompt, /Current preferences snapshot/);
  assert.match(result.systemPrompt, /mode: plan/);
});

test('all native bang shell shortcuts are blocked in every mode', async () => {
  const ui = await setup();
  for (const mode of ['discuss', 'plan', 'act'] as const) {
    ui.access.mode = mode;
    for (const text of ['!touch surprise', '!!touch surprise']) {
      assert.equal((await ui.emit('input', { text, source: 'interactive' })).action, 'handled');
    }
    const shell = await ui.emit('user_bash', { command: 'touch surprise', excludeFromContext: false });
    assert.equal(shell.result.exitCode, 1); assert.match(shell.result.output, /blocks native/);
  }
  assert.equal(ui.operations.length, 0); assert.equal(ui.userMessages.length, 0);
});

test('native fresh conversations remain available, but importing and branching sessions are blocked', async () => {
  const ui = await setup();
  assert.equal(await ui.emit('session_before_switch', { reason: 'new' }), undefined);
  assert.deepEqual(await ui.emit('session_before_switch', { reason: 'resume', targetSessionFile: '/external/session.jsonl' }), { cancel: true });
  assert.deepEqual(await ui.emit('session_before_fork'), { cancel: true });
  assert.deepEqual(await ui.emit('session_before_tree'), { cancel: true });
});

test('operations reuse CLI parsing and native approval; output is bounded and does not trigger a model turn', async () => {
  const ui = await setup();
  assert.deepEqual([...ui.commands.keys()].filter(key => !['ml', 'mlstack-help', 'exit'].includes(key)), [...workbenchCommands]);
  let exited = false;
  await ui.commands.get('exit').handler('', { ...ui.ctx, shutdown: () => { exited = true; } });
  assert.equal(exited, true);
  for (const reserved of ['help', 'new', 'model', 'login', 'logout']) assert.equal(ui.commands.has(reserved), false);
  await ui.commands.get('cancel').handler('"run one"', ui.ctx);
  assert.deepEqual(ui.operations[0], ['cancel', 'run one']);
  assert.equal(ui.dialogs.length, 1);
  assert.equal(ui.userMessages.length, 0);
  assert.deepEqual(ui.messages.at(-1)[1], { triggerTurn: false });
  await ui.commands.get('show').handler('"unfinished', ui.ctx);
  assert.match(ui.messages.at(-1)[0].content, /Unclosed quote/);
  assert.equal(ui.operations.length, 1);
  const sanitized = terminalOutput('\x1b[31mRed\x1b[0m\x00\x07');
  assert.equal(sanitized, 'Red');
  assert.match(terminalOutput('a'.repeat(30_000)), /Display truncated/);
  assert(terminalOutput('a'.repeat(30_000)).length < 25_000);
});
