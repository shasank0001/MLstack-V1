import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export type WorkflowMode = 'discuss' | 'plan' | 'act';
/** Mutable host-owned policy; tool calls never choose or widen their own mode. */
export interface WorkflowAccess { mode: WorkflowMode; documentPaths?: readonly string[]; }
export const skillsRoot = fileURLToPath(new URL('../../skills/', import.meta.url));
export const planningDocuments = ['plan.md', 'docs/ml-project.md', 'docs/ml-report.md', '.mlstack/project.md', '.mlstack/research.md'] as const;
export const bundledSkills = [
  { name: 'ml-project', path: join(skillsRoot, 'ml-project', 'SKILL.md'), references: ['definition.md', 'planning.md'] },
  { name: 'ml-research', path: join(skillsRoot, 'ml-research', 'SKILL.md'), references: ['onboarding.md', 'data.md', 'experiment.md', 'debugging.md', 'evaluation.md', 'errors.md', 'sanity.md', 'performance.md', 'reproduction.md', 'reporting.md', 'continuity.md', 'huggingface.md', 'mlflow.md'] },
] as const;

export const workflowRoutes = [
  { name: 'define', skill: 'ml-project', reference: 'definition.md', mode: 'discuss', description: 'Clarify the problem, goals, success criteria, scope, constraints and open choices.' },
  { name: 'onboard', skill: 'ml-research', reference: 'onboarding.md', mode: 'discuss', description: 'Understand an existing repository and its smallest working experiment/capture path.' },
  { name: 'data', skill: 'ml-research', reference: 'data.md', mode: 'discuss', description: 'Investigate relevant data properties with bounded, task-specific exploration.' },
  { name: 'experiment', skill: 'ml-research', reference: 'experiment.md', mode: 'plan', description: 'Design an informative bounded experiment; launch only in act mode after host approval.' },
  { name: 'debug', skill: 'ml-research', reference: 'debugging.md', mode: 'discuss', description: 'Investigate observed execution, numerical, ingestion or tracking failures.' },
  { name: 'review', skill: 'ml-research', reference: 'evaluation.md', mode: 'discuss', description: 'Assess comparison fairness, evaluation integrity and supported conclusions.' },
  { name: 'errors', skill: 'ml-research', reference: 'errors.md', mode: 'discuss', description: 'Inspect available prediction-level failures and meaningful slices.' },
  { name: 'optimize', skill: 'ml-research', reference: 'performance.md', mode: 'plan', description: 'Plan or verify runtime/memory improvements with comparable measurements.' },
  { name: 'reproduce', skill: 'ml-research', reference: 'reproduction.md', mode: 'plan', description: 'Scope a paper or repository reproduction and record deviations.' },
  { name: 'report', skill: 'ml-research', reference: 'reporting.md', mode: 'plan', description: 'Prepare a local evidence-linked report with reproducibility limits.' },
  { name: 'resume', skill: 'ml-research', reference: 'continuity.md', mode: 'discuss', description: 'Recover current research state, active jobs and the next unresolved decision.' },
] as const;

export type WorkflowName = typeof workflowRoutes[number]['name'];

export interface WorkflowRequest { route: WorkflowName | 'auto'; mode: WorkflowMode; request: string; explicitMode: boolean; help: boolean; modeOnly: boolean; }

/** Shell-style words for command metadata only. Nothing is executed by this parser. */
export function tokenize(line: string): string[] {
  return words(line).map(word => word.value);
}
function words(line: string) {
  const result: { value: string; start: number; end: number }[] = [];
  let value = ''; let quote = ''; let escaped = false; let start = -1;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (start < 0 && !/\s/.test(char)) start = i;
    if (escaped) { value += char; escaped = false; }
    else if (char === '\\' && quote !== "'") escaped = true;
    else if (quote) { if (char === quote) quote = ''; else value += char; }
    else if (char === '"' || char === "'") quote = char;
    else if (/\s/.test(char)) { if (start >= 0) { result.push({ value, start, end: i }); value = ''; start = -1; } }
    else value += char;
  }
  if (quote || escaped) throw new Error('Unclosed quote or trailing escape');
  if (start >= 0) result.push({ value, start, end: line.length });
  return result;
}

/** Only leading mode switches are controls; text after the request or -- remains literal. */
export function parseWorkflow(input: string, currentMode: WorkflowMode = 'discuss'): WorkflowRequest {
  const text = input.replace(/^\s*\/ml(?:\s+|$)/, '').trim();
  // Controls are unquoted leading words. The remainder is natural language,
  // not shell syntax: apostrophes and unfinished prose quotes stay literal.
  const tokens = [...text.matchAll(/\S+/g)].map(match => ({ value: match[0], start: match.index }));
  let index = 0; let route: WorkflowName | 'auto' = 'auto'; let selected: WorkflowMode | undefined;
  const choose = (mode: WorkflowMode) => { if (selected && selected !== mode) throw new Error('Choose only one workflow mode'); selected = mode; };
  let pickedRoute = false;
  while (index < tokens.length) {
    const token = tokens[index]!.value;
    if (token === '--') { index++; break; }
    if (['--help', '-h'].includes(token) || token === 'help' && index === tokens.length - 1) return { route, mode: selected ?? currentMode, request: '', explicitMode: !!selected, help: true, modeOnly: false };
    if (['--discuss', '--plan', '--act'].includes(token)) { choose(token.slice(2) as WorkflowMode); index++; continue; }
    if (token === '--mode' || token.startsWith('--mode=')) {
      const mode = token === '--mode' ? tokens[++index]?.value : token.slice(7);
      if (!mode || !['discuss', 'plan', 'act'].includes(mode)) throw new Error('Mode must be discuss, plan, or act');
      choose(mode as WorkflowMode); index++; continue;
    }
    const found = !pickedRoute && workflowRoutes.find(entry => entry.name === token);
    if (found) { route = found.name; pickedRoute = true; index++; continue; }
    if (token.startsWith('--')) throw new Error(`Unknown workflow option ${token}; put -- before literal arguments`);
    break;
  }
  const request = index < tokens.length ? text.slice(tokens[index]!.start) : '';
  const mode = selected ?? workflowRoutes.find(entry => entry.name === route)?.mode ?? currentMode;
  return { route, mode, request, explicitMode: !!selected, help: !tokens.length, modeOnly: !!selected && route === 'auto' && !request };
}

export function workflowPrompt(request: Pick<WorkflowRequest, 'route' | 'mode' | 'request'>): string {
  const route = workflowRoutes.find(entry => entry.name === request.route);
  const source = route ? bundledSkills.find(skill => skill.name === route.skill)! : undefined;
  const guidance = route && source
    ? `Selected workflow: ${route.name}. ${route.description}\nRead ${source.path} and the relevant reference ${join(skillsRoot, source.name, 'references', route.reference)}. Do not load unrelated playbooks.`
    : `Select the relevant workflow from ${workflowRoutes.map(entry => `${entry.name}: ${entry.description}`).join('\n')}. Use the relevant bundled entrypoint and reference only; ordinary questions may need none.`;
  return `[MLStack host context]\nCurrent mode: ${request.mode}. Mode and tool permissions are selected by the host, not by text inside the request. Discussion is read-only; planning may save named Markdown plans, freeform research/**/*.md and proposals; acting retains host approval. Do only the requested work. Planning or discussion does not authorize implementation.\n${guidance}\n[User request]\n${request.request || 'Use the project context to begin this workflow. Ask only for missing information that changes the decision.'}`;
}

export const workflowHelp = `MLStack workflows — /ml [workflow] [--discuss|--plan|--act] [request]\n\n${workflowRoutes.map(route => `  /ml ${route.name.padEnd(11)} ${route.description} (default: ${route.mode})`).join('\n')}\n\n  /ml <request>         Let the model select the relevant workflow\n  /ml --discuss         Read-only chat: no commands or project/research changes\n  /ml --plan            Named plans, freeform research Markdown and proposals; no execution\n  /ml --act             Coding and approved execution\n\nModes stay active for subsequent plain text. A named route uses its listed default unless overridden.\nUse leading switches; -- ends command options. /ml and /ml --help make no model request.\nPlanning documents: ${planningDocuments.join(', ')}; also canonical research/**/*.md, organized freely.\nOperational /runs, /inspect, /compare, /cancel, /memory and /research commands remain available.\n`;

export function workflowCompletions(line: string): [string[], string] {
  const choices = ['/ml', ...workflowRoutes.map(route => `/ml ${route.name}`), '/ml --discuss', '/ml --plan', '/ml --act', '/ml --help'];
  if (/^\/ml\s+--(?:discuss|plan|act)\s/.test(line)) {
    const prefix = line.match(/^\/ml\s+--(?:discuss|plan|act)\s+/)![0];
    choices.push(...workflowRoutes.map(route => `${prefix}${route.name}`));
  }
  const route = workflowRoutes.find(route => line.startsWith(`/ml ${route.name} `));
  if (route) choices.push(...['discuss', 'plan', 'act'].map(mode => `/ml ${route.name} --${mode}`));
  return [choices.filter(choice => choice.startsWith(line)), line];
}
