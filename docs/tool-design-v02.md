# Version 0.2 — what belongs in a tool?

The first version exposed one tool per product feature. That made the model interface resemble the application's menu and duplicated reasoning the model already does.

The revised rule is to expose reliable capabilities the model cannot recreate in a conversation: persistent execution, approvals, authoritative evidence access, and durable research records. Use Pi's coding tools for investigation and the model for interpretation.

## Review of the previous interface

| Previous capability | Decision | Reason |
| --- | --- | --- |
| Project status | Fold into `experiment_read` | A compact overview is useful; a separate all-history response is noisy. |
| Create study | Fold into run planning | Studies remain useful organizing records. A separate setup tool is unnecessary for the common workflow. |
| Propose run | Keep as a run-control action | Persisting an approved specification and its provenance is an application responsibility. |
| Launch run | Keep as a run-control action | The model cannot guarantee process lifetime, deduplication, or approval enforcement. |
| Cancel run | Keep the operation within run control; remove the dedicated tool | Stable process identity and an auditable stop request remain necessary. The occasional operation does not need its own model-facing tool. |
| Compare runs | Remove the standalone model tool | The model interprets results. Inspection supplies deterministic compatibility checks and exact observed values. The CLI comparison command remains available. |
| Diagnose run | Remove the standalone model tool and canned causal advice | Supply error evidence and code access; let the model investigate and label uncertainty. |
| Remember / recall / supersede | One `research_memory` tool | These actions share one coherent persistent record lifecycle and need validation and history. |
| Coding read/write/edit/list/search | Reuse scoped Pi tools | No reason to rebuild ordinary coding capabilities. |
| General terminal commands | Restore Pi's bash tool behind human approval and a short timeout | Tests, environment checks, and custom analysis should not require inventing a training experiment. Long-running training uses run control. |

## Revised model interface

1. `experiment_read`: bounded overview or selected-run evidence; optional `wait: true` waits up to 30 seconds for completion. This flag is separate from the run's approved execution timeout; CLI `/wait --seconds` retains numeric control. When several runs are selected, include compatibility facts automatically. The model provides interpretation.
2. `experiment_run`: plan, launch, or stop a managed run, including diagnostic training expected to fail. Planning can create/reuse a study. Launch/stop confirmation always comes from the host application. Stop can also handle a surviving managed process group after supervisor loss when its identity can be verified, preserving the unknown original outcome.
3. `research_memory`: search, record, or supersede persistent research records. Evidence references are pinned to captured artifacts; historical records stay reviewable. The application attaches evidence and returns compact summaries/citations with an explicit evidence count; model input excludes copied generated fields such as evidence, author, and status.

The model sees nine tools in total: the three MLStack tools above plus six reused Pi tools (`project_read`, `project_write`, `project_edit`, `project_ls`, `project_grep`, and `project_bash`). File tools enforce project paths and protect structured internal state. `project_bash` starts in the project, always requests human approval, and has a 30-second default and 60-second maximum timeout; it inherits the user's permissions rather than providing shell containment. This is a smaller ML interface with explicit responsibilities, rather than a generic dispatcher for unrelated application functions.

## Useful supporting improvements

- Give the model primary metric summaries, bounded log tails, errors, and provenance in one evidence read. Preserve explicit totals for compacted run, metric, and file lists so omission is visible.
- Use a boolean model-facing wait flag inside the evidence call instead of a numeric duration that can be confused with the run timeout. Waits remain bounded to 30 seconds; legacy numeric model arguments are normalized for older sessions.
- Route recognized existing training entry points requested through the shell tool back to run control, without execution. This includes diagnostic training, whose failures need durable logs and run identities.
- Avoid repeated approval prompts for the same refused request in one actual user turn. Reset the refusal cache only when a new user message arrives.
- Preserve content-addressed metric evidence so a saved finding does not silently change when output is re-ingested. New memories also capture available execution records, bounded log tails, and approved spec/source metadata.
- Make memory corrections possible through the agent, and surface superseded records, missing or changed evidence, and newer metric snapshots on recall. Label legacy unpinned records explicitly; hash checks do not validate the truth of a claim.
- Reject unavailable configured models instead of silently substituting a different model/provider. Normalize redundant provider prefixes only to resolve that same catalog model. `/models` exposes explicit free catalog choices without changing settings or promising provider availability.
- Measure the complete workflow through real model calls, separately from deterministic tests. Keep test approvals restricted to the synthetic fixture and never substitute a paid model silently.

No new dashboard, external memory engine, cloud scheduler, or specialist diagnosis framework is needed to establish whether this interface is useful.

## Commands and skills preserve occasional workflows

The user clarified that removed tool capabilities should also be considered as simple slash commands or skills. Keep `/cancel` and `/compare` as deterministic direct commands. Make `/diagnose` an evidence-inspection alias, with the reasoning method supplied by a bundled `ml-research` Pi skill invoked through `/skill:ml-research`. Diagnosis must distinguish observed failures from possible causes. Keep `/study`, `/remember`, `/recall`, and `/supersede` as direct command entry points even when they are consolidated at the model-tool layer. Add `/inspect` and `/wait` shortcuts to the new evidence reader. Load the bundled skill without enabling arbitrary external extensions or skills.
