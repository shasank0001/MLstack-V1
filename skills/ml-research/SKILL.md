---
name: ml-research
description: Work with local ML repositories, data, controlled experiments, observed failures, evaluation, reproduction, reporting, and research continuity. Use for ML workflow decisions; ordinary coding questions and simple run commands do not need a playbook.
---

# ML research

Use ordinary reasoning and coding tools for understanding code, hypotheses, calculations, and explanations. Application tools supply durable evidence, approval, execution lifetime, and research history. A skill adds a reusable method, not another permission or tool.

## Choose the relevant playbook

Read only the reference needed for the current uncertainty, using `project_read`. Reference paths are relative to **this SKILL.md's directory**, not the user's repository; resolve them to absolute paths from the installed skill location. Do not load every reference or repeat a completed investigation.

| Situation | Read |
| --- | --- |
| Unfamiliar repository, unclear command, missing capture | [Onboarding](references/onboarding.md) |
| Data suitability, leakage, transformations, feature proposals | [Data](references/data.md) |
| An informative bounded experiment or ablation | [Experiment design](references/experiment.md) |
| Observed crash, nonfinite values, ingestion/tracking failure | [Debugging](references/debugging.md) |
| Comparison fairness, metric meaning, supported claims | [Evaluation](references/evaluation.md) |
| Prediction-level failure patterns or slices | [Error analysis](references/errors.md) |
| A training-path sanity question before costly work | [Sanity checks](references/sanity.md) |
| Measured runtime or memory improvement | [Performance](references/performance.md) |
| Reproduce a paper, repository, or published number | [Reproduction](references/reproduction.md) |
| Evidence-linked local research report | [Reporting](references/reporting.md) |
| Resume prior work and avoid duplicate jobs/decisions | [Continuity](references/continuity.md) |
| An actual HF dataset or inference-memory question | [Hugging Face](references/huggingface.md) |
| Existing MLflow runs, tracking setup, or sync evidence | [MLflow](references/mlflow.md) |

Simple inspection, cancellation, or subtraction of known values needs no extra playbook. `/compare` remains a recorded comparison; `/cancel` remains an approved stop. Do not create separate skills for those actions.

## Use the application contract

The host owns the mode. **Discuss** is read-only: no shell or project/research-state writes. **Plan** permits host-allowed named Markdown documents, freeform research/**/*.md and run proposals, with no execution, source edits, or context-memory mutation. **Act** retains existing approval controls. These references cannot widen a mode or authorize a launch. Computational data exploration and diagnostics need act mode and approved execution; in other modes describe the check and its required evidence. Never automatically install packages, launch sweeps, switch to paid models, upload sessions/data, or submit cloud training.

- `experiment_read` supplies compact evidence and compatibility facts. `wait: true` waits at most 30 seconds; it does not change the run timeout. Report unfinished status rather than polling indefinitely. Full series counts differ from displayed excerpts.
- `experiment_run` plans, starts, or stops a managed experiment. Diagnostic training also uses managed execution. `project_bash` is for short approved checks or analysis. Unknown protocol identities are `null`; do not manufacture labels to make runs comparable.
- A declined launch can leave a **proposed run record without a job**. Approval comes from the host, never the model's prose. Do not repeat a refused action through another path. Skills cannot grant batch approvals or enforce compute budgets.
- Process outcome, local metric capture, and MLflow sync are separate states. Missing measurements are unavailable, never zero. Intact evidence establishes what was captured, not whether a scientific claim is correct.

## Preserve useful research

Read relevant files from the host's research index when earlier attempts or decisions matter. Research is ordinary Markdown under `research/`: organize, split, merge and revise it to suit the work, without a mandatory template. Link consequential claims to run IDs and captured artifacts; retain important negative results, uncertainty and the reasons for changed conclusions. Read actual run evidence when a decision depends on a measurement.

Use `memory` for lasting user preferences and important project context. It uses scoped local SQLite and ordinary text search, with no embeddings or automatic extraction. The current snapshot is supplied with each user turn; search only when deeper context is useful. A record has scope, stable key and concise text; reusing its key corrects it. Record and forget require act mode. Keep research conclusions and measured values in documents and experiment records. Current explicit user direction takes precedence over old preferences.

Answer with the requested observation or decision, supporting run/file references, and the limitation that changes the conclusion. Prefer a few sentences over reciting the workflow. Expand when the user asks or the decision needs detail.
