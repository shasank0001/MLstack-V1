# MLStack

**Plan, run and compare local ML experiments from your terminal.**

MLStack is a Linux experiment workbench built on [Pi](https://github.com/earendil-works/pi). It combines an AI coding assistant with approved training jobs, captured experiment evidence and local MLflow tracking. Training continues when you close the chat.

**v0.5 · Early development · Linux · Node.js 22.19+**

[Quick start](#quick-start) · [Workflows](#workflows) · [Experiment tracking](#experiment-tracking) · [Documentation](#documentation) · [Development](#development)

## What you can do

- **Define the project:** turn an idea into a measurable goal, baseline and experiment plan.
- **Work in Pi’s terminal UI:** use its editor, Markdown responses, tool displays and model menus, with MLStack workflows and approval dialogs.
- **Run approved experiments:** bind approval to the command, specification and source; keep managed jobs running after exit.
- **Inspect the evidence:** compare compatible metrics, read logs, diagnose failures and capture selected output files.
- **Keep useful context:** store preferences in scoped local memory and research reasoning in ordinary Markdown.

MLStack provides eleven workflow routes, two bundled skills and nine model tools. It reuses Pi’s coding tools with project and mode checks. There is no embedding model, vector database or memory service to set up.

## Quick start

Requires **Linux**, **Node.js 22.19+** and **npm**. Python is needed for MLflow integration; your training project supplies its own ML dependencies.

```bash
git clone https://github.com/shasank0001/MLstack-V1.git
cd MLstack-V1
npm ci --ignore-scripts
npm run build
```

Try a command immediately—no provider key or Python environment required:

```bash
npm start -- --project ./examples/pytorch-project init
npm start -- --project ./examples/pytorch-project status --json
```

### Configure chat

Chat uses Pi’s provider credentials and selected model. If Pi is already configured:

```bash
npm start -- --project ./examples/pytorch-project chat
```

For a fresh setup, follow [provider configuration](docs/configuration.md). You can also select a model explicitly with `--model PROVIDER/MODEL`. Model availability and free quotas depend on the provider; MLStack reports an unavailable model rather than silently replacing it.

The interface opens in **discuss** mode. Use `/ml` to list workflows, `/mlstack-help` for operations, `/hotkeys` for editor shortcuts and `/exit` to leave. Add `--plain` to use the basic prompt.

To work on another repository, replace `./examples/pytorch-project` with its actual path. Run these commands from the MLStack checkout.

### Enable MLflow

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r python/requirements.txt
```

The adapter uses this checkout’s `.venv/bin/python`, or `MLSTACK_PYTHON` if set. Training uses the interpreter in the approved command, independently of the adapter environment.

### Try the CPU demo

With PyTorch installed in your training environment:

```bash
npm run demo
```

The demo runs two small synthetic experiments, compares their captured metrics, saves a research note and verifies persistent project context. It makes no AI requests and downloads no dataset. If `python3` does not have PyTorch, set `MLSTACK_TRAIN_PYTHON` to the full path of an interpreter that does. Demo output stays under the ignored `work/demos/` directory.

## Workflows

Start with a goal, then widen permissions when you are ready:

```text
/ml define Help me choose a measurable goal and baseline
/ml onboard Find the training command and metrics format
/ml --plan experiment Design a controlled learning-rate comparison
/ml --act experiment Implement the plan and ask before launching
/ml review What do the captured results support?
/ml resume Summarize the saved work and the next useful step
```

| Mode | Agent permissions |
| --- | --- |
| Discuss | Read project files, evidence and saved context; explain and propose changes. |
| Plan | Also save named planning documents, research Markdown and experiment proposals. |
| Act | Also modify code and request approval for commands, training and cancellation. |

Selecting act mode does **not** approve execution. Explicit operational commands remain user actions with their documented behavior.

Direct commands include `/status`, `/runs`, `/inspect RUN_ID`, `/compare LEFT_ID RIGHT_ID` and `/cancel RUN_ID`. `/new` clears the in-memory conversation while retaining project state and the current mode. See [all workflows and skills](docs/workflows.md).

## Experiment tracking

The managed experiment flow is:

```text
Study → proposal → approval → detached execution → metrics and artifacts → comparison
```

Run an example without chat:

```bash
npm start -- --project ./examples/pytorch-project study \
  --title "Learning rate" --hypothesis "A controlled learning-rate change may improve validation accuracy"

# Replace STUDY_ID with the ID returned above.
npm start -- --project ./examples/pytorch-project propose \
  --study STUDY_ID --spec ./examples/pytorch-project/baseline.json

# Replace RUN_ID with the proposed run ID. This asks for approval.
npm start -- --project ./examples/pytorch-project run RUN_ID
```

Commands run as argument arrays. MLStack captures logs and source provenance; structured measurements use the [JSON metrics format](docs/metrics.md). Run specifications can select output artifacts to freeze and publish to local MLflow. Process failure, metric ingestion, capture errors and MLflow publication are reported separately.

| Information | Storage |
| --- | --- |
| Preferences and important project context | Scoped local SQLite memory; refreshed into chat each turn. |
| Research reasoning, findings and next steps | Flexible `research/**/*.md` files in the project. |
| Measurements and selected artifacts | Local MLflow plus immutable capture manifests. |
| Approvals, jobs and execution state | Project-local `.mlstack/` state. |

Approval covers the declared specification and source digest. A source change requires approval again. Captured artifacts support evidence review; a single better score does not establish statistical significance or repeatability.

## Documentation

| Guide | Contents |
| --- | --- |
| [Provider configuration](docs/configuration.md) | Credentials, model selection and startup troubleshooting. |
| [Terminal interface](docs/terminal-ui.md) | Pi UI commands, fresh conversations and interface boundaries. |
| [Workflows and skills](docs/workflows.md) | Modes, eleven routes and the two bundled playbooks. |
| [Metrics format](docs/metrics.md) | JSON measurement contract and schema. |
| [Artifacts and MLflow](docs/artifacts.md) | Capture limits, integrity checks, imports and publication retries. |
| [Memory and research](docs/memory.md) | User/project scopes, corrections, forgetting and research files. |
| [Validation](docs/validation.md) | Recorded checks, live workflow results and known limitations. |
| [Project plan](plan.md) | Current progress and roadmap. |

## Current scope

MLStack is an early local prototype. Commands run with your machine permissions; its approval and path checks are **not a security sandbox**. There are no hard CPU/GPU/memory quotas, distributed execution, autonomous sweeps or automatic checkpoint/reboot recovery.

The chat history stays in memory. Native Pi shell shortcuts and session import/branching are disabled to preserve the managed execution and project boundaries. Generated scientific explanations still need review. See [validation](docs/validation.md) for the evidence behind the current release.

This repository is public and currently has no project license, as chosen by the maintainer.

## Development

```bash
npm run check
npm test
```

Tests build the TypeScript source and exercise permissions, memory, metrics, managed processes, artifacts and the actual Pi SDK lifecycle. They make no AI generation calls. MLflow integration tests run when the adapter environment is available and otherwise report explicit skips. The latest recorded v0.5 run passed 85 tests; see the validation guide for dates and scope.

Live agent and skill evaluations are optional, require a configured provider/model and may consume provider quota. See [CONTRIBUTING.md](CONTRIBUTING.md) for development commands and repository layout.
