# Repository preparation validation — 24 October 2026

The public source checkout was validated separately from local generated files and credentials:

- `npm ci --ignore-scripts` and `npm run check` passed in a clean export of the staged source.
- All **85 tests passed**, zero failures/skips, with isolated provider/context settings and real MLflow integration tests using the existing adapter interpreter. No AI generation calls were made.
- README `init` and `status --json` commands passed without provider credentials in that checkout.
- Staged known-key/token-pattern checks found no credentials; all relative Markdown file links resolved within the published source. Environments, dependencies, generated builds, local state, databases and scratch work remain ignored.
- Registry audit reported **zero vulnerabilities** after overriding transitive Undici to 8.12.2 and optional Zod peers to 4.6.6. Pi remains pinned to 1.3.0. See the [Undici advisory](https://github.com/advisories/GHSA-4qv8-2p9j-2685) and [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5); this is the audit state on the date above, not a guarantee against later disclosures.
- Added Linux CI with pinned GitHub Action revisions. GitHub-hosted results are separate from these local checks.

The first clean-export run exposed a test that assumed `MLSTACK_HOME` was unset. The corrected regression explicitly checks environment/argument/default precedence and restores settings. The final suite above includes that correction and the dependency patches. Local preparation logs are retained under ignored `work/public-repository-preparation/`.

---

# Version 0.4 validation

Checked on 22 October 2026 in the current project directory. The shipped design follows the user's explicit simplification: built-in scoped SQLite preferences/context, freeform research Markdown, MLflow measurements/artifacts, and local execution state. The earlier Mem0/embedding prototype was removed, together with its dependencies; its scratch experiments do not describe the shipped application.

## Completed implementation checks

- `npm run check` and build passed. The final full deterministic/integration suite passed **77 tests**, zero failures or skips, including actual local MLflow and detached processes.
- Node built-in SQLite memory was tested across fresh processes, user/project isolation, keyed correction and replay, forgetting, ordinary text search, bounded snapshots, missing/corrupt storage and read-only operations. No vector search, embeddings, model downloads or memory generation calls are used.
- Luna independently tested the agent/memory boundary and scopes. Its corrupt-database CLI reproduction identified a failed write returning exit code 0; record/forget now return a nonzero CLI exit on failed acknowledgements. The regression covers both commands.
- Artifact checks cover selected byte capture, hashes, immutable retries, changed outputs with unchanged metrics, corrupted blobs, real upload/download verification, partial publication retry, direct-Python environment metadata and explicit external import refresh preserving old snapshots.
- Research checks cover arbitrary nested Markdown, canonical plan-mode write paths, symlink/path aliases, restartable legacy export, original-record retention and preservation of user edits.
- Both bundled skills passed metadata validation; local documentation links resolved. npm production audit reported **zero vulnerabilities** after removing the framework/native embedding dependencies.

## Actual CPU demonstration

`npm run demo` passed in `work/demos/pytorch-ojA9ui/`. Both approved synthetic CPU runs completed with final validation accuracies **0.484375** and **0.71875**, and both synchronized to local MLflow. A research document recorded the qualified comparison; a fresh connection recovered one project preference and the research document. The saved evidence is `.mlstack/demo-report.json` in that disposable project. This is an integration demonstration, not evidence of general model improvement.

## Actual agent workflow

The historical free MiniMax workflow was verified separately. The first attempt completed discussion, saved planning, a scoped preference and the actual baseline, then failed an evaluator assertion: the test expected selected artifact `README.md`, while the correct captured name is `outputs/README.md`. The runtime had captured and published it correctly. That assertion was corrected; the original failed report remains in `work/agent-evals/pytorch-eEMSTJ/.mlstack/agent-eval-report.json`. It is not reported as a passed full workflow.

The corrected rerun passed all eleven phases with `openrouter/minimax/minimax-m3.1-flash:free`, verified against the public free-pricing/tool-capability catalog. Isolated Pi model metadata reused the existing authentication reference; no credentials were copied or printed and no paid fallback was used.

| Phase | Observed outcome |
| --- | --- |
| Project definition | Discuss-only inspection, no experiment or document mutation. |
| Saved plan | Brief and plan written in plan mode; training source unchanged. |
| Project preference | Scoped `reporting.style` saved through the memory tool. |
| Baseline | `run-7f3315fa-814` completed: validation accuracy **0.484375**; selected README captured and published. |
| Candidate and research | `run-cf46883e-f91` completed: **0.71875**; comparison saved to `research/learning-rate.md` with both run IDs. |
| Fresh-session recall | Actual values and prior research recovered in a new conversation. |
| Preference correction | Same key/record corrected in place, one current project record. |
| Research correction | Scope/limitations clarified while preserving observations and run references. |
| Actual failure | `run-36c8fcf0-855` exited 1; JSON serialization rejected NaN, actual logs/code inspected. |
| Refusal | `run-d2cea875-0bf` stayed proposed without a job after one refused launch. |
| Cancellation | `run-7f0406eb-f23` stopped by SIGTERM before timeout; child confirmed dead. |

All four executed runs had complete artifact captures and successful MLflow synchronization, including failed/cancelled runs with no metric document. All recorded workers/children were separately checked stopped. The refused proposal had no job. No legacy structured research records were created by the workflow. See [saved result summary](live-eval-v04.json); detailed evidence remains at `work/agent-evals/pytorch-VH3y23/.mlstack/agent-eval-report.json`.

Manual terminal checks passed `/memory list --scope project`, `/research`, mode-only plan/discuss switches and `/exit` without a generation request. Luna's independent tests covered the memory/agent boundary, scoped empty queries, and failed CLI write/forget exit status. A final regression also proves that a source change during interpreter probing prevents subsequent training launch.

Ordinary tests make no provider generation calls. The live model remained verbose and made speculative optimization statements; it initially confused delta direction, then corrected the research note after inspecting evidence. Passing assertions establish the scoped state transitions and evidence, not every generated sentence or a general scientific-reasoning improvement.

## Scope and limits

Context snapshots are reconstructed before user prompts, with project entries overriding same-key user defaults. The default selected text/label budget is 6,000 characters plus serialized metadata; omissions are explicit, and deeper list/text search is available. Forgetting affects the current database and operation receipts, not old conversation messages or external backups. Preference correction history is not retained.

Research has no required heading or document schema. The host discovers bounded file metadata; contents are read on demand. Legacy SQLite research history remains available for explicit export/compatibility commands.

Managed captures allow 32 explicitly selected output files, 64 MiB per file and 256 MiB per capture including other captured files. Direct Python execution is probed for interpreter/selected installed package metadata; shell launchers and GPU details can remain unknown. This is not full data versioning, a training checkpoint-resume implementation, live telemetry, model registry or a hard resource quota. External imports preserve metric/metadata snapshots and artifact locations; external artifact bytes are not automatically mirrored. Captured metric compatibility is not proof of scientific validity, and model prose requires review.

---

# Version 0.3 workflow validation

Validated on 22 October 2026 in `MLstack-V1`. The source project was copied from the earlier Codex workspace; historical v0.2 scratch artifacts remain in that original workspace and were not copied into this checkout.

## Implementation and structural checks

- TypeScript build/type-check passed. The final deterministic suite passed **55 tests**, zero failures or skips, including actual local MLflow sync/import/revision behavior.
- Both bundled entry skills passed `quick_validate.py`; all 15 named reference files exist and local links resolve.
- Runtime checks cover discuss/plan/act transitions on reused tool instances; denial before approval, mutation or execution; exact planning paths; SDK-normalized path aliases and dangling symlinks; and only two reviewed bundled skills despite ambient skill configuration.
- Read-only evidence inspection does not reconcile jobs or append events. It labels `state_reconciled: false`; captured status can therefore be stale until a worker updates it or explicit reconciliation occurs.
- Mode-controlled conversations remain in memory across mode changes; legacy SDK calls without a supplied policy retain their earlier session behavior. The application still initializes `.mlstack` when opening a project before chat begins.
- Workflow parsing/help/completion checks cover named defaults, sticky plain-chat modes, conflicting flags, literal request text, ordinary apostrophes/prose quotes, and help without credentials or project-state initialization. Final parser refinements were checked after the live flow.

## Actual nine-phase agent workflow

The reproducible evaluator used the explicitly authorized free model `openrouter/minimax/minimax-m3.1-flash:free`, with public zero-price/tool support verified before generation. An isolated Pi configuration supplied current model metadata and referenced existing authentication without copying credentials or changing global model defaults.

| Phase | Checked outcome |
| --- | --- |
| Project definition, discuss | Read project and skill guidance; no project/research mutation, approval request, or execution. |
| Project plan, plan | Saved `docs/ml-project.md` and `plan.md`; training source unchanged, no job or approval request. |
| Baseline, act | Run `run-1dae193f-f42` completed; final validation accuracy **0.484375**. |
| Candidate and finding, act | Run `run-1cf2ce48-825` completed; final accuracy **0.71875**; pinned finding saved. |
| Fresh-session recall | Retrieved saved research and both observed values in a new conversation. |
| Correction | Superseded the prior finding without erasing its history. |
| Actual failure | Diagnostic `run-d5549c94-f4d` exited 1 with JSON serialization rejecting NaN; actual logs inspected. |
| Refused launch | `run-6b9c588d-6ad` remained a proposal without a job after exactly one refused launch request. |
| Start and stop | `run-e5eba5b2-9ec` was cancelled through SIGTERM before its timeout; recorded child was no longer live. |

Both completed runs synchronized to local MLflow. The observed accuracy difference is 0.234375 on the same declared synthetic protocol and one seed; this does not establish a general learning-rate recommendation.

The evaluator passed all outcome assertions. A compact [saved result summary](live-eval-v03.json) records the checked outcomes. The detailed report is `work/agent-evals/pytorch-PX9JWT/.mlstack/agent-eval-report.json`.

Generated explanations remain imperfect: this model was verbose, made overbroad claims about statistical impossibility and convergence, and called an aggregate net gain of 15 correct predictions “15 flipped samples” without paired predictions. The outcome checks do not endorse every generated statement or prove a causal quality improvement from the skills. The cancellation workflow also inspected a running job before stopping it; termination was confirmed, but conversational latency was not minimized.

## Matched skill probe — no demonstrated benefit

One evaluation task was run in fresh read-only conversations with byte-identical project artifacts and the same MiniMax free model. The control had no playbooks; the other condition exposed the research entry skill and on-demand references. Both completed without execution or source edits, detected preprocessing leakage and the simultaneous parameter change, and withheld a candidate recommendation.

| Condition | Words | Tool calls | Elapsed |
| --- | ---: | ---: | ---: |
| No playbooks | 584 | 14 | 52.284 s |
| Playbooks | 720 | 16 | 54.226 s |

Manual review found unsupported assumptions in both answers. The skill-assisted answer also inferred a direction for the regularization/bias effect, proposed inconsistent ablation controls, and attributed hypothetical outcomes too strongly. It did not demonstrate improved decision quality and produced more output. One pair supports no general quality or latency conclusion. The fixture has source and reported scores but no data or captured runs; it does not reproduce the reported accuracy values.

The evaluation reference was then tightened to separate a known leakage path from its unmeasured effect, repair invalid preprocessing first, and keep proposed controls consistent. The revised wording was structurally checked but not rerun through a matched live probe. The original results remain unchanged. See the [manual assessment](skill-probe-v03.json); the detailed report is `work/skill-checks/probe-hC738l/report.json`.

## Reproduce or inspect

```bash
npm run check
npm test
npm run test:workflows -- --model openrouter/minimax/minimax-m3.1-flash:free
```

The opt-in workflow evaluator uses a fresh synthetic CPU fixture, tightly scoped test approvals, original-source verification, and 60-second training limits. It makes real provider requests and can be blocked by availability or free quota; ordinary tests make no generation requests. `test:agent` retains the seven-phase execution-focused flow. The experimental `test:skills` probe compares matched read-only tasks with and without available playbooks and requires manual semantic review.

Manual terminal smoke checks passed for `/ml` help, mode-only act/plan/discuss switches, and exit without contacting a provider. Core managed-execution reliability remains covered by the existing integration tests.

---

# Version 0.2 validation

Validated on 21 October 2026 on Linux. This record separates deterministic implementation checks, actual agent behavior, and remaining quality limits.

## Automated checks

- `npm run check`: passed.
- `npm test`: **43 tests passed**, with zero skips and the real local MLflow adapter available.
- The suite covers source-bound approvals, refusal handling, scoped file access, model selection, bounded evidence reads, explicit excerpt counts, immutable evidence, memory corrections, MLflow revisions, detached execution, timeouts, cancellation, and verified orphan stopping.

Deterministic cancellation and orphan-stop tests passed. Those results establish the application behavior independently of whether a model chooses the right tool in conversation.

## Actual six-phase agent workflow

A real Pi session using the explicitly selected free model `openrouter/cohere/north-mini-code:free` completed these phases against the isolated synthetic CPU PyTorch project:

| Phase | Observed result |
| --- | --- |
| Baseline | Approved launch completed; final validation accuracy **0.484375**. |
| Candidate and finding | Approved learning-rate change completed; final validation accuracy **0.71875**; evidence-linked finding saved. |
| Fresh-session recall | A new Pi session retrieved the previous runs and research. |
| Correction | A replacement finding atomically superseded the earlier record while retaining history and evidence. |
| Actual failure | The approved `--lr nan` run exited with code 1 at JSON serialization, with `Out of range float values are not JSON compliant: nan` in stderr. The agent inspected actual logs and code. |
| Refused launch | The host refused the requested lr=0.9 run; exactly one run approval was requested and no job was launched. |

Baseline and candidate used 12 epochs, seed 7, matching dataset/split/evaluation identities, and an unchanged training source. Their observed accuracy difference is 0.234375. One run per configuration on a synthetic task does not establish statistical significance or a general learning-rate recommendation.

The saved fixture is `work/v02/agent-flow-0fBSrE/`. The summary is `work/v02/live-flow-summary-final.json`; the detailed tool transcript is `work/v02/live-flow-result-final.json`. The successful six-phase run predates the expanded cancellation phase in the reusable evaluator.

The live evaluation also exposed response-quality problems: the model initially tried a diagnostic training run through the shell, repeated refused requests, confused evidence wait duration with the run timeout, and counted displayed metric excerpts as complete series. The application now routes recognized training entry points to run control, caches identical refusals per actual user turn, offers a boolean model wait flag, and supplies explicit total/shown/omitted counts. Compact memory responses identify selected citations and total evidence separately. These improvements were checked deterministically; generated explanations still need evidence-based review, especially scientific causal claims and counts.

## Expanded live evaluation

The reusable **seven-phase live evaluation passed** using the explicitly authorized `openrouter/minimax/minimax-m3.1-flash:free` model. A compact [saved result summary](live-eval-v02.json) records the checked outcomes. The detailed report is `work/agent-evals/pytorch-VSJlM2/agent-eval-report.json`.

- Baseline `run-3ac5051e-423` completed with validation accuracy 0.484375; candidate `run-27eaed23-d8f` completed with 0.71875.
- A fresh session recalled the evidence, and the correction preserved the superseded finding.
- Diagnostic `run-5fcd6831-180` actually failed with exit code 1 at JSON serialization.
- Refused `run-ff9775ee-d3c` remained a proposed record with no job, after exactly one refused launch approval.
- Cancellation check `run-1eaaf055-f7e` received approved start and stop requests, ended as cancelled through SIGTERM before its timeout, and left no live recorded child.

The earlier attempt with Cohere was blocked at its first provider request by the OpenRouter daily free quota. MiniMax completed the expanded evaluation; the authorized NVIDIA fallback was unnecessary.

On 21 October 2026, the live public catalog contained MiniMax metadata before the bundled SDK catalog could resolve the new ID. The test used an isolated `PI_CODING_AGENT_DIR=work/v02/live-model-config` with zero-price metadata checked against the official live catalog and an authentication-file symlink. No credential contents were copied and global model settings were unchanged. Explicit missing-model refresh remains useful, but provider/SDK catalog lag can still require exact custom-model metadata.

Passing assertions do not make every generated statement correct. MiniMax was still verbose, described eight total evidence items as eight metrics/log citations, and said no new run was created when a proposed record existed without a job. It also misinterpreted a changed source digest caused by the evaluator's generated root-level report. Future evaluator reports are stored under `.mlstack/agent-eval-report.json` so that generated reports are excluded from the default source scan; the already-passed report remains at the original path above. Evidence types, proposal/job distinctions, and scientific explanations still need careful review.

## Reproduce the opt-in live evaluation

From the application directory, configure Pi credentials and select an available free model explicitly:

```bash
npm run test:agent -- --model openrouter/minimax/minimax-m3.1-flash:free
```

The evaluator is separate from `npm test` and makes real provider requests. It requires an OpenRouter `:free` model with zero pricing in both Pi's catalog and the current public OpenRouter catalog, plus tool support. It refuses unavailable or nonzero-price models and never substitutes a paid model. Free model availability and quotas can prevent completion.

It copies the included CPU training script into a new disposable project under `work/agent-evals/`, uses synthetic data without downloads, and writes `.mlstack/agent-eval-report.json` with prompts, answers, tool calls, scoped approvals, runs, and memories. The earlier successful MiniMax report retains its original root-level location. The test host approves only specified synthetic training commands with the original source hash, a 60-second maximum run timeout, and limited arguments; the out-of-scope candidate is intentionally refused. Short environment checks and managed stops have separate allowlists. These fixture approvals are not the normal interactive approval policy. An approved detached job retains its wall-time limit if evaluation is interrupted.

This is evidence that the scoped workflow works with actual model calls, not a full V1 acceptance sign-off. GPU monitoring, hard resource quotas, repeated-seed statistics, profiler integration, checkpoint recovery, and general diagnosis quality remain outside this validation.

---

# Historical initial-version validation

Validated on 21 October 2026 on Linux with Node 22.23.3, Python 3.13.5, PyTorch 2.8.0, Pi SDK 1.3.0, and MLflow Skinny 3.17.2.

## Automated checks

- `npm run check`: passed.
- `npm test`: 17 tests passed; zero failures and zero skipped tests. The local `.venv` supplied real MLflow dependencies.
- Python helper and demonstration script syntax: checked; both scripts were also exercised through real execution.
- npm install audit: zero reported vulnerabilities at installation.

The behavioral tests cover:

1. Approval is required and tied to the command/specification and source digest.
2. Changed source during approval requires renewed review.
3. Model-created execution requests cannot approve themselves.
4. Coding tools cannot alter structured state directly or through a symlink alias.
5. Actual Pi SDK initialization activates only application-controlled tools, without a generation request.
6. Duplicate and concurrent launch requests produce one job and one execution.
7. A real CLI exits while a detached job continues; a new connection reads its final evidence.
8. Nonzero process exits remain failures; malformed/missing metrics have independent ingestion states.
9. Approved timeouts and explicit cancellation terminate managed child processes.
10. Missing or killed supervisors become unknown/unreconciled, including when the child remains alive. No automatic relaunch occurs.
11. Existing configured metric outputs are rejected before launch.
12. Invalid metric numbers and duplicate metric/step entries are rejected.
13. Changed/unknown evaluation identities prevent unsupported improvement claims.
14. Memory and stable project identity persist across connections; supersession preserves history.
15. Real MLflow sync/import works, and retrying sync does not duplicate the run or its metric history.

## Actual PyTorch demonstration

Two deterministic CPU runs used the same synthetic dataset, split, seed, epoch count, and declared evaluation protocol. The client database connection closed while detached workers ran, then reopened to collect results.

| Setting | Baseline | Candidate |
| --- | --- | --- |
| Learning rate | 0.01 | 0.1 |
| Epochs | 12 | 12 |
| Seed | 7 | 7 |
| Final validation accuracy | 0.484375 | 0.71875 |
| Process outcome | Completed | Completed |
| JSON ingestion | Complete | Complete |
| Local MLflow sync | Successful | Successful |

The observed difference is 0.234375. The stored finding explicitly limits the conclusion to this synthetic task and single seed; it does not claim general model improvement or statistical significance.

The comparison and finding were saved, and a fresh connection recalled the evidence-linked research record. The saved demonstration is under `work/demos/pytorch-4lM5pP/`; its `.mlstack/demo-report.json` contains the run IDs, comparison, finding, and MLflow references. `npm run demo` creates a new independent demonstration project.

The terminal was also opened against this completed project: `/runs` listed both completed/synced runs, and `/recall learning rate` returned the saved finding. The application then exited normally.

## Scope of this result

This establishes the initial complete experiment workflow. It is not a full V1 acceptance sign-off. No live LLM generation was performed, so model/provider credentials and conversational diagnosis quality still require validation in the intended user setup. GPU monitoring, automatic environment/data version capture, bounded batches, hard resource quotas, imported-snapshot refresh, and automatic finding revalidation remain on the project roadmap.

## Version 0.5 — Pi terminal UI

The application now mounts the installed Pi 1.3.0 public interactive runtime with a trusted MLStack extension. No backend dependency changes were required.

- Initial complete suite: 84/84 tests passed, including seven new extension tests for native confirmations, mode routing, image preservation, fresh memory context, native shell interception, lifecycle guards and operational output.
- Actual pseudo-terminal check passed: startup, `/ml --plan`, `/runs`, blocked `!touch`, `/new`, `/mlstack-help` and `/exit`. The forbidden file did not exist afterwards. Script: `work/terminal-smoke-v05.py`; captured terminal output: `work/terminal-smoke-v05.ansi`.
- Deterministic `runs --json` still works outside a terminal without model credentials.
- The previously requested MiniMax and NVIDIA free model IDs were unavailable in the current catalog, including after the bounded refresh. They were not silently replaced. UI checks used the catalogued Cohere free model offline and made no generation request. The v0.4 eleven-stage MiniMax report remains historical backend validation, not a new UI-model test.

Luna added an actual offline SDK lifecycle regression covering the nine-tool allowlist, blocked shell execution/import/fork, trusted commands, corrected memory snapshots, reload and fresh in-memory conversations. An intermediate suite caught the `/exit` alias missing from a command-inventory assertion; that assertion now checks the alias separately.

Final v0.5 suite: **85 passed, zero failed/skipped**, recorded in `work/test-v05-final.log`.
