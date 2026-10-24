/** Opt-in matched read-only probes: same model/tasks, bundled playbooks available vs absent. */
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { agentTools, bundledSkillPath, resolveWorkbenchModel } from '../src/agent.js';
import { Store } from '../src/store.js';

const { values } = parseArgs({ options: { model: { type: 'string' }, case: { type: 'string' } } });
const modelName = values.model || process.env.MLSTACK_LIVE_MODEL || 'openrouter/minimax/minimax-m3.1-flash:free';
const base = resolve('work/skill-checks'); mkdirSync(base, { recursive: true });
const output = mkdtempSync(join(base, 'probe-'));
const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
const cases = [
  { name: 'onboarding', prompt: 'Inspect this repository and explain the documented baseline command and the smallest way to connect its results to MLStack structured metrics. Preserve existing outputs. Do not execute, edit, install, or download anything. Keep the recommendation concise.', files: {
    'README.md': '# Local classifier\nRun from repository root using `.training/bin/python train.py --config configs/cpu.json`. The environment is managed separately. Data already exists in local data/; do not download it. Console output is for progress; results/latest.json is consumed by another script. Primary validation metric is valid_top1 (maximize).\n',
    'configs/cpu.json': '{"epochs":12,"seed":7,"output":"results/latest.json","split":"fixed-holdout-v1"}\n',
    'train.py': 'import argparse, json\nfrom pathlib import Path\np=argparse.ArgumentParser(); p.add_argument("--config", required=True); a=p.parse_args()\nc=json.loads(Path(a.config).read_text())\n# train_and_validate is implemented in the existing project environment.\nfrom classifier import train_and_validate\nscore=train_and_validate(c)\nPath(c["output"]).parent.mkdir(exist_ok=True)\nPath(c["output"]).write_text(json.dumps({"valid_top1":score,"epochs":c["epochs"]}))\n',
    'classifier.py': '# Application training implementation supplied by the existing environment.\n',
  } },
  { name: 'debugging', prompt: 'The saved run failed. Inspect train.py and logs/ and explain the observed exception, what preceded it, and the smallest useful next step. Do not fix, rerun, or execute anything. Separate observed facts from a proposed cause.', files: {
    'README.md': '# Local numerical diagnostic\nThe saved command was python3 train.py --lr nan. logs/ contains the captured output. Source below is the matching excerpt.\n',
    'train.py': 'import json, os\nfrom pathlib import Path\nimport torch\n# args, model and fixed synthetic data are supplied by the training entry point.\noptimizer=torch.optim.SGD(model.parameters(), lr=args.lr)\npoints=[]\nfor epoch in range(12):\n    optimizer.zero_grad(); loss=criterion(model(x), y); loss.backward(); optimizer.step()\n    value=loss.item(); points.append({"name":"train_loss","value":value,"step":epoch})\n    print(f"epoch={epoch} loss={value}", flush=True)\nPath(os.environ["MLSTACK_METRICS_PATH"]).write_text(json.dumps({"schema_version":1,"metrics":points}, allow_nan=False))\n',
    'logs/stdout.log': 'epoch=0 loss=0.7137736082077026\nepoch=1 loss=nan\nepoch=2 loss=nan\nepoch=11 loss=nan\n',
    'logs/stderr.log': 'Traceback (most recent call last):\n  File "train.py", line 12, in <module>\n    json.dumps({"schema_version":1,"metrics":points}, allow_nan=False)\nValueError: Out of range float values are not JSON compliant: nan\n',
  } },
  { name: 'evaluation', prompt: 'We got validation accuracy 0.80 with baseline.py and 0.91 with candidate.py, both seed 7. The recorded dataset/split/evaluation labels match. Is the candidate ready to recommend? Inspect the two scripts, explain the result we can defend, and suggest the next useful check. Do not execute or edit.', files: {
    'README.md': '# Local classifier\nBoth scripts read the same features.npy and labels.npy, use a 20% holdout, and report final validation accuracy.\n',
    'baseline.py': 'import numpy as np\nfrom sklearn.model_selection import train_test_split\nfrom sklearn.preprocessing import StandardScaler\nfrom sklearn.linear_model import LogisticRegression\nx,y=np.load("features.npy"),np.load("labels.npy")\ntr,va,yt,yv=train_test_split(x,y,test_size=.2,random_state=7)\ns=StandardScaler().fit(tr)\nm=LogisticRegression().fit(s.transform(tr),yt)\nprint(m.score(s.transform(va),yv))\n',
    'candidate.py': 'import numpy as np\nfrom sklearn.model_selection import train_test_split\nfrom sklearn.preprocessing import StandardScaler\nfrom sklearn.linear_model import LogisticRegression\nx,y=np.load("features.npy"),np.load("labels.npy")\nx=StandardScaler().fit_transform(x)\ntr,va,yt,yv=train_test_split(x,y,test_size=.2,random_state=7)\nm=LogisticRegression(C=2).fit(tr,yt)\nprint(m.score(va,yv))\n',
  } },
  { name: 'performance', prompt: 'The saved timing says baseline 12 ms and candidate 3 ms. Can we claim a 4x inference speedup? Read benchmark.py and explain the next measurement needed. Do not run a benchmark, install anything, or change code.', files: {
    'README.md': '# Inference timing\nSame CUDA model, precision, batch and inputs. benchmark.py shows the timing boundaries used for the two variants; model and x are already on the GPU.\n',
    'benchmark.py': 'import time, torch\n# Baseline after ten warmup calls, inference_mode enabled.\ntorch.cuda.synchronize()\nt=time.perf_counter(); baseline_output=baseline(x); torch.cuda.synchronize()\nbaseline_ms=(time.perf_counter()-t)*1000\n# Candidate after ten warmup calls, inference_mode enabled.\nt=time.perf_counter(); candidate_output=candidate(x)\ncandidate_ms=(time.perf_counter()-t)*1000\n# No output/quality check was captured.\n',
  } },
];
const selectedCases = values.case ? cases.filter(item => item.name === values.case) : cases;
if (!selectedCases.length) throw new Error('Unknown case; choose onboarding, debugging, evaluation, or performance');
type Outcome = { task: string; condition: string; root: string; prompt: string; answer: string; elapsed_ms: number; word_count: number; tool_calls: { name: string; args: unknown }[]; failure: string | null };
const results: Outcome[] = [];
const reportPath = join(output, 'report.json');
function save(failure: string | null = null) { writeFileSync(reportPath, JSON.stringify({ model: modelName, completed: results.length, planned: selectedCases.length * 2, failure, scope: 'Matched read-only SDK probes, one sample per task/condition; manual semantic review required. Not a statistical benefit estimate or replacement for the full application workflow.', results }, null, 2)); }
async function main() {
  try {
    const runtime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: join(agentDir, 'models.json'), allowModelNetwork: false });
    const model = await resolveWorkbenchModel(runtime, undefined, undefined, modelName);
    if (model.provider !== 'openrouter' || !model.id.endsWith(':free') || Object.values(model.cost).some(price => price !== 0)) throw new Error('Requires an explicit zero-price OpenRouter :free model');
    const response = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Pricing verification HTTP ${response.status}`);
    const catalog = await response.json() as { data: { id: string; pricing: { prompt: string; completion: string }; supported_parameters?: string[] }[] };
    const item = catalog.data.find(entry => entry.id === model.id);
    if (!item || Number(item.pricing.prompt) !== 0 || Number(item.pricing.completion) !== 0 || !item.supported_parameters?.includes('tools')) throw new Error('Current catalog does not verify a free tool-capable model; no substitution');
    console.log(`Free model verified: ${modelName}`);
    for (const [index, task] of selectedCases.entries()) {
      // Alternate order, fresh conversations and byte-identical task artifacts.
      for (const skill of index % 2 ? [true, false] : [false, true]) {
        const root = mkdtempSync(join(output, 'project-'));
        for (const [name, content] of Object.entries(task.files)) { const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
        const fingerprint = () => createHash('sha256').update(JSON.stringify(Object.keys(task.files).map(name => [name, readFileSync(join(root, name), 'utf8')]))).digest('hex');
        const before = fingerprint(); const store = new Store(root);
        const tools = agentTools(store, async () => false).filter(tool => ['project_read', 'project_ls', 'project_grep', 'experiment_read'].includes(tool.name));
        const settings = SettingsManager.create(root, agentDir);
        const loader = new DefaultResourceLoader({ cwd: root, agentDir, settingsManager: settings, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
          additionalSkillPaths: skill ? [bundledSkillPath] : [], skillsOverride: loaded => ({ skills: loaded.skills.filter(entry => skill && entry.filePath === bundledSkillPath), diagnostics: loaded.diagnostics }),
          appendSystemPrompt: ['You are MLStack. Answer the user using project evidence. You have read-only tools for this task. Do not invent execution results. Keep the answer concise and distinguish evidence from hypotheses.', ...(skill ? [`For ML work use the available ml-research skill at ${bundledSkillPath}; read its entry point and only the relevant reference.`] : [])] });
        await loader.reload();
        const { session } = await createAgentSession({ cwd: root, agentDir, modelRuntime: runtime, model, settingsManager: settings, resourceLoader: loader, customTools: tools, tools: tools.map(tool => tool.name), sessionManager: SessionManager.inMemory(root) });
        const entry: Outcome = { task: task.name, condition: skill ? 'playbooks' : 'no-playbooks', root, prompt: task.prompt, answer: '', elapsed_ms: 0, word_count: 0, tool_calls: [], failure: null };
        session.subscribe(event => { if (event.type === 'tool_execution_start') { entry.tool_calls.push({ name: event.toolName, args: event.args }); console.log(`  ${event.toolName}`); } });
        console.log(`${task.name} / ${entry.condition}`); const start = Date.now(); let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; void session.abort(); }, 120000);
        try {
          await session.prompt(task.prompt); entry.answer = session.getLastAssistantText() || ''; entry.word_count = entry.answer.trim().split(/\s+/).filter(Boolean).length;
          const last = session.messages.filter(message => message.role === 'assistant').at(-1) as { stopReason?: string; errorMessage?: string } | undefined;
          if (timedOut || last?.stopReason === 'error') throw new Error(timedOut ? 'Turn timed out' : last?.errorMessage || 'Provider failed');
          if (fingerprint() !== before) throw new Error('Fixture source changed');
          console.log(`  answered (${entry.word_count} words)`);
        } catch (error) { entry.failure = error instanceof Error ? error.message : String(error); throw error; }
        finally { clearTimeout(timer); entry.elapsed_ms = Date.now() - start; results.push(entry); save(); session.dispose(); store.close(); }
      }
    }
    console.log(`COMPLETED MATCHED PROBES — semantic review required\nReport: ${reportPath}`);
  } catch (error) { const failure = error instanceof Error ? error.message : String(error); save(failure); console.error(failure); process.exitCode = 1; }
}
void main();
