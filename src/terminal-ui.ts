import { stripVTControlCharacters } from 'node:util';
import type { ExtensionContext, ExtensionFactory } from '@earendil-works/pi-coding-agent';
import type { Confirm } from './agent.js';
import type { Store } from './store.js';
import { parseWorkflow, tokenize, workflowCompletions, workflowHelp, workflowPrompt, type WorkflowAccess } from './workflows.js';

/** Native Pi commands remain native. MLStack operations use their existing CLI names. */
export const workbenchCommands = [
  'init', 'study', 'studies', 'runs', 'status', 'propose', 'show', 'approve', 'launch', 'run', 'logs',
  'ingest', 'sync-mlflow', 'capture-artifacts', 'import-mlflow', 'compare', 'inspect', 'diagnose', 'wait',
  'models', 'research', 'export-research', 'memory', 'remember', 'recall', 'supersede', 'cancel', 'events',
] as const;

export interface WorkbenchExtensionOptions {
  store: Store;
  access: WorkflowAccess;
  executeCommand: (args: string[], confirm: Confirm, output: (text: string) => void) => Promise<void>;
  onConfirmReady: (confirm: Confirm) => void;
  getContext: () => Promise<string>;
}

/** Terminal display only: bounded, control-free output; no model turn is requested. */
export function terminalOutput(text: string): string {
  const clean = stripVTControlCharacters(text).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
  return clean.length > 24_000 ? `${clean.slice(0, 24_000)}\n[Display truncated; use the CLI for complete output.]` : clean;
}

/** Trusted inline extension; never loads code or tool definitions from the project. */
export function createWorkbenchExtension(options: WorkbenchExtensionOptions): ExtensionFactory {
  return pi => {
    const output = (text: string) => pi.sendMessage({ customType: 'mlstack', content: terminalOutput(text), display: true }, { triggerTurn: false });
    const bind = (ctx: ExtensionContext) => {
      const confirm: Confirm = async message => ctx.hasUI ? ctx.ui.confirm('MLStack approval', terminalOutput(message)) : false;
      options.onConfirmReady(confirm);
      ctx.ui.setStatus('mlstack-mode', `MLStack · ${options.access.mode}`);
      return confirm;
    };
    const updateMode = (ctx: ExtensionContext) => { bind(ctx); ctx.ui.notify(`MLStack mode: ${options.access.mode}`, 'info'); };
    pi.on('session_start', (_event, ctx) => {
      bind(ctx);
      ctx.ui.setTitle('MLStack');
      ctx.ui.setHeader(() => ({
        render: width => ['MLStack · ML experiment workbench'.slice(0, Math.max(0, width))],
        invalidate() {},
      }));
      ctx.ui.setWidget('mlstack-help', [
        '/ml workflows · /ml --act enables changes · /mlstack-help operations',
        'Approved training jobs continue after exit.',
      ]);
    });
    pi.on('tool_call', (_event, ctx) => { bind(ctx); });
    pi.on('before_agent_start', async (event, ctx) => {
      bind(ctx);
      return { systemPrompt: `${event.systemPrompt}\nCurrent host-controlled MLStack mode: ${options.access.mode}.\n${await options.getContext()}` };
    });
    pi.on('input', (event, ctx) => {
      bind(ctx);
      // sendUserMessage below already contains the trusted route wrapper.
      if (event.source === 'extension') return { action: 'continue' };
      if (event.text.startsWith('!')) {
        output('Direct ! and !! shell shortcuts are disabled. Ask the agent to use project_bash in act mode with approval.');
        return { action: 'handled' };
      }
      if (event.text.startsWith('/skill:')) {
        const match = /^\/skill:(ml-project|ml-research)(?:\s+([\s\S]*))?$/.exec(event.text);
        if (!match) { output('Only the bundled ml-project and ml-research skills are available.'); return { action: 'handled' }; }
        return { action: 'transform', text: workflowPrompt({ route: match[1] === 'ml-project' ? 'define' : 'auto', mode: options.access.mode, request: match[2] || 'Use the requested bundled skill for this project context.' }), images: event.images };
      }
      // Native/registered slash commands are dispatched by Pi before this hook.
      // Do not turn an unknown command into a model instruction.
      if (event.text.startsWith('/')) { output('Unknown command. Use /hotkeys for Pi shortcuts or /mlstack-help for MLStack operations.'); return { action: 'handled' }; }
      return { action: 'transform', text: workflowPrompt({ route: 'auto', mode: options.access.mode, request: event.text }), images: event.images };
    });
    pi.on('user_bash', (_event, ctx) => {
      bind(ctx);
      return { result: { output: 'MLStack blocks native ! and !! execution. Use approved project_bash in act mode.', exitCode: 1, cancelled: false, truncated: false } };
    });
    // Existing evidence/session assumptions are project-bound. Native fresh
    // conversations are safe, but importing or branching histories is not enabled.
    pi.on('session_before_switch', (event, ctx) => {
      bind(ctx);
      if (event.reason === 'new') return;
      ctx.ui.notify('Session import/resume is disabled. Use /ml resume to recover project research and jobs.', 'warning');
      return { cancel: true };
    });
    pi.on('session_before_fork', (_event, ctx) => {
      ctx.ui.notify('Session branching is disabled. Use /new for a fresh conversation; project state is retained.', 'warning');
      return { cancel: true };
    });
    pi.on('session_before_tree', (_event, ctx) => {
      ctx.ui.notify('Conversation tree navigation is disabled. Use /ml resume for project continuity.', 'warning');
      return { cancel: true };
    });
    pi.registerCommand('ml', {
      description: 'MLStack workflows and discuss/plan/act modes',
      getArgumentCompletions: args => workflowCompletions(`/ml ${args}`)[0].map(value => ({ value: value.slice(4), label: value.slice(4) })),
      handler: async (args, ctx) => {
        bind(ctx);
        try {
          const selected = parseWorkflow(`/ml ${args}`, options.access.mode);
          if (selected.help) { output(workflowHelp); return; }
          options.access.mode = selected.mode;
          updateMode(ctx);
          if (!selected.modeOnly) pi.sendUserMessage(workflowPrompt(selected), { deliverAs: 'followUp' });
        } catch (error) { output(error instanceof Error ? error.message : String(error)); }
      },
    });
    pi.registerCommand('exit', { description: 'Leave MLStack; approved jobs continue', handler: async (_args, ctx) => { ctx.shutdown(); } });
    pi.registerCommand('mlstack-help', {
      description: 'MLStack operational commands and safety boundaries',
      handler: async (_args, ctx) => {
        bind(ctx);
        output(`${workflowHelp}\nMLStack operations (explicit user actions, independent of agent mode):\n${workbenchCommands.map(name => `/${name}`).join(', ')}\n\nNative Pi /hotkeys, /model, /login and editor shortcuts remain available. Use /quit to exit.\n! and !! shell shortcuts, session imports and conversation branching are disabled.`);
      },
    });
    for (const name of workbenchCommands) {
      pi.registerCommand(name, {
        description: `MLStack ${name} operation`,
        handler: async (args, ctx) => {
          const confirm = bind(ctx);
          try { await options.executeCommand([name, ...tokenize(args)], confirm, output); }
          catch (error) { output(error instanceof Error ? error.message : String(error)); }
        },
      });
    }
  };
}
