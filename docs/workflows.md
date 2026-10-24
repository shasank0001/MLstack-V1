# ML workflows

MLStack 0.4 provides one `/ml` command family backed by two reviewed skills. This guide is for someone working on a local ML repository who wants to choose the next useful investigation, save a plan, or execute approved work. Workflows use the existing nine tools; they do not add a second experiment runner.

## Start with a question

Open the workbench in your training repository:

```bash
npm start -- --project /absolute/path/to/repository
```

Then enter:

```text
/ml help
/ml define Help me choose a measurable goal and a simple baseline
/ml onboard Find the documented training command and captured metrics
/ml data What split or preprocessing risks can we establish from the code?
```

`/ml help` displays the routes without contacting a model. In the CLI, `ml --help` returns before project-state initialization; an already opened workbench may have initialized its project state. Workflow requests open interactive chat and require a configured provider/model. At the command line, `ml` or `ml --help` also lists the workflows:

```bash
npm start -- --project /absolute/path/to/repository ml --help
```

Tab completion offers `/ml` routes and mode switches. Plain text starts in discuss mode. `/ml YOUR REQUEST` lets the agent select relevant guidance from your request; use a named route when you want a specific workflow. Unknown questions remain questions rather than an instruction to run a particular experiment.

## Choose a mode

The application checks tool access. Prompt text, a skill, or an experiment plan cannot grant permissions.

| Mode | Agent may do | Agent may not do |
| --- | --- | --- |
| `discuss` | Read project files and captured run evidence; list/search scoped preference/context memory; reason and propose changes in chat | Write project/research state, execute commands, create experiment proposals, launch or stop jobs |
| `plan` | Discuss capabilities; write/edit the exact named Markdown files below and canonical `research/**/*.md`; create saved run proposals and associated studies | Edit source/configuration or other files, execute commands, launch/stop jobs, record/forget preferences or context memory |
| `act` | Implement project changes, create proposals and research documents; record/forget preferences and context; request command, launch, or stop approval | Bypass host approval or directly edit protected structured `.mlstack` state |

Planning may write freely organized Markdown under `research/`, including subdirectories, and these exact project-relative planning paths:

```text
plan.md
docs/ml-project.md
docs/ml-report.md
.mlstack/project.md
.mlstack/research.md
```

Research Markdown has no required schema or headings. Other Markdown files outside these paths are not writable in plan mode. Canonical project-relative spellings are required; traversal and alias paths are rejected. A run proposal is structured experiment state created through `experiment_run(action="plan")`; saving one is not a launch. Discussion can still read project data: computational exploration, shell commands, or a diagnostic training run require act mode and the relevant approval.

Use an explicit flag to select a mode:

```text
/ml --plan experiment Design one bounded baseline comparison
/ml --act experiment Start the proposed run after I approve its command
/ml --discuss review Assess what these two run records support
/ml --act
```

Leading flags may appear before or after a named route, before the request text. Use `--` to end option parsing when the request begins with a literal flag. A mode-only request changes the mode without calling a provider. Explicit selections persist for subsequent plain chat and free-text `/ml` requests. A later named route uses its route default unless that request includes a mode flag. For example, after `/ml --act`, `/ml debug ...` selects discuss; `/ml --act debug ...` selects act.

The same in-memory conversation survives mode changes. Selecting act does not approve a command or a run. Commands, managed launches, and stops retain their existing human confirmation. Ordinary file changes in act mode follow the existing project-scoped coding rules.

Modes constrain agent tools after the project is opened. Opening the workbench can initialize `.mlstack` project state and notes before chat begins; this setup is separate from discuss-mode tool access. In discuss/plan, evidence inspection does not reconcile jobs or ingest new results; `state_reconciled: false` identifies that read-only inspection, so process status may need a later authorized refresh. Deterministic commands such as `/study`, `/memory record`, `/export-research`, `/compare`, `/cancel`, and their noninteractive CLI equivalents remain explicit user actions with their existing behavior and approval rules.

## Route reference

| Route | Default | Skill / reference | Use it to resolve |
| --- | --- | --- | --- |
| `/ml define` | discuss | `ml-project` / `definition.md` | Purpose, whether ML is needed, task, success criterion, baseline, scope and constraints |
| `/ml onboard` | discuss | `ml-research` / `onboarding.md` | Existing repository entry point, environment and metrics capture path |
| `/ml data` | discuss | `ml-research` / `data.md` | Relevant data suitability, splits, leakage, transformations and feature proposals |
| `/ml experiment` | plan | `ml-research` / `experiment.md` | A bounded experiment with a baseline, useful measurement and next decision |
| `/ml debug` | discuss | `ml-research` / `debugging.md` | An observed execution, numerical, ingestion or tracking failure |
| `/ml review` | discuss | `ml-research` / `evaluation.md` | Fair comparisons, metric meaning, evidence gaps and supported conclusions |
| `/ml errors` | discuss | `ml-research` / `errors.md` | Prediction-level failures and meaningful slices, when those artifacts exist |
| `/ml optimize` | plan | `ml-research` / `performance.md` | Runtime/memory hypotheses and comparable, correct measurements |
| `/ml reproduce` | plan | `ml-research` / `reproduction.md` | A paper/repository target, feasible scope, protocol and deviations |
| `/ml report` | plan | `ml-research` / `reporting.md` | A local report linked to captured evidence and reproducibility limits |
| `/ml resume` | discuss | `ml-research` / `continuity.md` | Relevant research documents, context memory, active jobs, prior decisions and the next uncertainty |

The relevant skill entry point and reference load on demand. The `ml-project` skill also has `planning.md`; `ml-research` also has `sanity.md`, `huggingface.md`, and `mlflow.md` for relevant questions. These are supporting references, not additional routes. `/skill:ml-project` and `/skill:ml-research` remain available for direct invocation in chat, subject to the current mode.

## Work through an experiment

1. Use `/ml onboard` to establish the real command, evaluation identity and evidence path. The agent should use existing repository guidance and stop once the important unknowns are resolved.
2. Use `/ml experiment` to propose the smallest informative comparison. If you request a saved plan, it can use `plan.md` or `docs/ml-project.md`; a managed run proposal can be saved without execution.
3. Select `/ml --act experiment ...` when ready to implement or launch. Inspect the exact command, timeout and source scope in the approval request. Approve or decline through the host prompt.
4. Inspect captured results with `/inspect RUN_ID`, `/wait RUN_ID --seconds 30`, or a workflow question. `/ml review` checks what the evidence supports. A failed process, missing metric file and failed MLflow synchronization are separate observations.
5. Use `/ml report ...` to save an evidence-linked report or research document in plan mode. Findings belong in flexible research Markdown; preferences and stable project context belong in `memory`, whose mutations require act. A proposed experiment alone cannot support an observed result. Selected prediction/config/checkpoint files must be declared in `spec.artifacts` to join immutable capture; see [artifact capture](artifacts.md).

Diagnostic training uses the managed runner too. Short approved checks use `project_bash`, with its existing timeout. A refused action must not be retried through a different tool. An accepted hypothesis or expected result is not an observed finding.

## Resume and resource boundaries

Preferences/context persist in scoped SQLite outside the project; research persists in `research/**/*.md`; execution records and captured artifacts persist under `.mlstack`. Before every user prompt, the host refreshes a small preference/context snapshot and bounded research index. Relevant document text is read on demand. `/ml resume` reconstructs useful context from these sources and experiment evidence; it does not recover an unsaved transcript. Workbench chat remains in memory during the application session, and `/new` clears it. Managed jobs continue after exit. See [memory and research](memory.md) for scopes, corrections, omission limits and legacy export.

Only the two reviewed bundled skills and their manifest-listed references are enabled. External Pi skills, prompt templates, extensions and MCP connections are not automatically loaded. Project context files remain available. Source pages informed original local guidance; the application does not install or execute their instruction bundles.

The workflows add no automatic package installation, dataset publishing, credential setup, cloud training or uploads. Hugging Face and MLflow guidance applies only to a relevant user task, existing configuration and authorized access. The application remains a local workbench with approval controls, not a security sandbox or a compute quota manager.

For SDK integrations, `createWorkbenchAgent` without an explicit access policy keeps the historical act default and native Pi session handling. The interactive workbench supplies its own policy and starts in discuss. Embedders should provide a host-owned `WorkflowAccess` policy when they need the mode restrictions described here.

## Validation and limits

Use `npm run check` and `npm test` for the current deterministic suite; see [the validation record](validation.md) for recorded results and environments. Validation has four different scopes:

- Runtime tests establish whether forbidden tool operations are rejected and existing approval/process rules still hold.
- Bundle checks establish that routes, skill metadata, manifest-listed references and resource loading agree.
- Live agent checks establish what a specified model actually read, called and reported on the tested tasks.
- Matched baseline/adapted comparisons can assess whether guidance changes behavior or quality. A few tasks or one sample per condition cannot establish a general causal improvement.

The opt-in workflow evaluator exercises the workflow through a selected free provider model. The matched read-only probe is experimental and requires manual semantic review:

```bash
npm run test:workflows -- --model openrouter/minimax/minimax-m3.1-flash:free
npm run test:skills -- --model openrouter/minimax/minimax-m3.1-flash:free
```

These require provider credentials and available free quota. They do not substitute a paid model. A probe report records completion or failure; running the command is not itself a quality result.

Historically, the v0.3 nine-phase workflow passed its assertions; this is not a v0.4 result. A separate single matched evaluation pair detected preprocessing leakage and a simultaneous hyperparameter change in both conditions, with no execution or file edits. The skill condition produced more words/tool calls and unsupported directional/causal reasoning. It demonstrated no added benefit in that pair; it does not establish a general effect. Detailed results and prose limitations belong in [the validation record](validation.md).

The source review alone proves none of those behavioral outcomes. One successful run does not establish repeatability, and an intact artifact does not establish that a scientific claim follows from it. Provider quota, local dependencies, missing prediction artifacts and unknown evaluation identities can limit what a workflow can conclude. See [the source decisions](skill-source-review.md) for why each adaptation was retained or excluded.
