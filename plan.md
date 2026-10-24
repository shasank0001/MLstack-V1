# MLStack — project plan and progress

Status: Version 0.5 Pi terminal UI complete; 85 tests and the native terminal smoke check passed. Version 0.4 passed 77 tests, a CPU demonstration and an eleven-stage actual free-model workflow. Last updated: 24 October 2026.

This is the persistent project tracker for MLStack. Update it as the project develops: keep the roadmap, decisions, completed work, current focus, verification results, and remaining work in one place. A written implementation is not considered validated until its behavior has been checked.

## Project roadmap

### Milestone 1 — Complete experiment workflow (initial prototype complete)

Deliver a standalone Pi-based application and demonstrate study → proposal → approval → persistent execution → metrics → comparison → remembered finding on one small PyTorch project.

Completion gate: close the client while an approved job runs, reconnect, inspect captured results, compare against a baseline, and retrieve the evidence-linked finding in a new session.

### Milestone 2 — Reliability and research continuity (planned)

- Harden crash/retry recovery and partial/malformed evidence ingestion.
- Expand provenance and imported-run compatibility checks.
- Improve corrections, supersession, scoped recall, and note revision/conflict handling.
- Add configurable resource/concurrency policies and bounded batch approvals.

### Milestone 3 — Debugging and representative-project validation (planned)

- Validate diagnosis workflows against representative training and evaluation failures.
- Improve optional instrumentation, monitoring, and terminal views.
- Complete the broader V1 acceptance criteria across existing repositories.
- Evaluate contextual memory against the SQLite/notes baseline before adopting another engine.

## Working scope

Build a Linux-only standalone terminal application using Pi's TypeScript SDK. The first version must support a complete local experiment workflow: study → proposal → approval → persistent execution → metric capture → comparison → research memory. Use TypeScript, SQLite, a small Python MLflow adapter, and an existing PyTorch environment. Do not use OpenCode.

## Milestone 1 — work tracker

- [x] Inspect the workspace, available runtimes, full project brief, and current Pi SDK.
- [x] Create the TypeScript project, pinned dependencies, and build configuration.
- [x] Implement initial SQLite schema, structured records, event journal, and full-text memory search.
- [x] Implement initial run proposal/approval validation, source fingerprints, metrics validation, comparisons, and findings.
- [x] Write detached supervisor/worker implementation, process identity checks, limits, and cancellation.
- [x] Write Python MLflow helper and TypeScript sync/import adapter.
- [x] Build the terminal command interface and explicit approval prompts.
- [x] Embed Pi with project-scoped coding tools and application-controlled execution tools.
- [x] Add the small CPU PyTorch demonstration and document the JSON metrics schema and ingestion behavior.
- [x] Type-check and fix integration errors against the installed SDK.
- [x] Test approval enforcement, source changes, retries, persistent jobs, failures, cancellation, invalid/missing metrics, comparison warnings, and memory history.
- [x] Test local MLflow sync/import and retry behavior with a real MLflow installation.
- [x] Test Pi session/tool initialization without making paid model calls.
- [x] Run the complete PyTorch workflow in a temporary project and inspect its saved evidence.
- [x] Review implementation, document limitations and launch instructions, and deliver the runnable project.

## Decisions for this prototype

- Standalone terminal UI with deterministic commands available without model credentials; Pi chat is an additional interface.
- Node.js built-in SQLite; Node 22.19+ required.
- One detached supervisor process per job; jobs survive application closure. Reboot/checkpoint resumption is outside this version.
- One launch per managed run. A retry with a changed configuration uses a new run; duplicate launch requests return the existing job.
- JSON metrics are ingested after process exit. Snapshot evidence remains available if MLflow synchronization fails; sync errors are visible and retryable.
- SQLite records own structured research facts. Editable Markdown notes are separate narrative context; automatic bidirectional synchronization is deferred.
- External extensions and MCP discovery are disabled in the embedded agent. Ordinary shell diagnostics use a bounded, explicitly approved Pi tool; persistent experiments use managed execution.
- No OpenCode. Ordinary automated tests make no generation calls; the separate opt-in live evaluator uses an explicitly selected free model.

## Verification log

- Environment: Linux, Node 22.23.3, npm 10.9.9, Python 3.13.5, PyTorch 2.8.0 available.
- Dependency installation: completed with pinned npm dependencies; npm reported zero vulnerabilities.
- MLflow validation environment: isolated virtual environment with mlflow-skinny 3.17.2 and SQLAlchemy 2.0.48 installed under the workspace scratch directory.
- First behavioral pass: 12 of 13 tests passed. A symlink alias bypass of protected state was found, fixed with canonical path resolution, and passed on the next run.
- Second pass: 13 of 14 tests passed, including actual Pi SDK initialization. The real MLflow test identified missing Alembic in the lightweight Python setup; the dependency setup was subsequently corrected by adding Alembic.
- Initial PyTorch demonstration: both CPU runs completed; final validation accuracy was 0.484375 and 0.71875 on the same declared protocol. The comparison retained the single-seed limitation, and a fresh connection recalled the saved finding. MLflow synchronization correctly reported the missing dependency instead of losing local evidence.
- After adding Alembic and serializing local MLflow initialization with a file lock: all 14 tests passed, including real MLflow sync/import/retry and Pi SDK tool initialization. The final PyTorch run synchronized both runs successfully to MLflow; final code review is complete.

- Final verification: `npm run check` passed; `npm test` passed all 17 tests with zero skipped, using the application-local MLflow virtual environment. Additional tests covered concurrent CLI launches, stale output rejection, and actual supervisor death with a live child.
- Application-local `.venv` installed from the documented requirements; npm dependencies installed and `dist/` built.
- Manual terminal smoke test: opened the completed demonstration, listed both completed/synced runs, recalled the saved finding, and exited.
- Detailed validation record: `docs/validation.md`.

## Next project actions

1. Validate the complete workflow on representative existing PyTorch repositories and evaluate the quality of model explanations beyond the synthetic task.
2. Implement configurable concurrency/resource policies and bounded batch approvals.
3. Extend evaluation identities, diagnostics, and optional instrumentation based on observed needs.
4. Evaluate whether richer memory retrieval improves on the current evidence-pinned SQLite/notes baseline before adding another engine.

## Version 0.2 — rethink and agent workflow validation (completed)

User direction: reconsider whether each feature needs a dedicated model tool, build useful improvements, run the complete workflow through the actual agent, and adjust the implementation based on that experience. Do not use the OpenCode tool.

Decision rule: a dedicated application primitive is justified for durable state, reliable evidence retrieval, approvals, or execution lifetime/identity. Code understanding, hypotheses, arithmetic, explanations, and diagnosis usually belong to the model and ordinary coding tools.

- [x] Review every existing model tool and supporting capability against that rule.
- [x] Record the feature decisions and reduce the model-facing tool surface (9 specialized tools → 3 coherent tools; see `docs/tool-design-v02.md`).
- [x] Preserve occasional workflows through slash commands and a bundled Pi research/debugging skill, following the user's clarification.
- [x] Remove canned diagnostic reasoning; return useful evidence for the model to investigate.
- [x] Make run inspection provide compact metrics, logs, compatibility facts, and a bounded wait for completion.
- [x] Add immutable evidence references and atomic memory corrections, with behavioral tests.
- [x] Restore an approval-controlled general command path for ordinary coding/diagnostics.
- [x] Resolve configured model IDs reliably and prohibit silent model substitution.
- [x] Add focused regression tests for changed behavior and run the existing reliability checks (43 passed).
- [x] Run actual free-model conversations through onboarding, training, follow-up experiment, result interpretation, memory, a fresh session, and refusal/failure scenarios (six-stage flow passed).
- [x] Fix friction found in live use and rerun affected local checks.
- [x] Finish the expanded live evaluator after the usability refinements, including cancellation through the agent (MiniMax free, seven phases passed).
- [x] Finalize README, validation record, and this tracker with the actual final result.

Live-test configuration discovery: Pi already has an OpenRouter free-model configuration. Use that configuration first, with synthetic project data only. Do not print credentials or silently switch to a paid model. A live agent test must be reported separately from deterministic and scripted tests.

The configured `nex-n2.5-mini:free` model is absent from both Pi's catalog and the current OpenRouter API catalog. Its non-free replacement is not used. The live test explicitly selects `openrouter/cohere/north-mini-code:free`, advertised with zero input/output price and tool support. Global Pi settings are unchanged. Version 0.2 builds successfully; live connectivity/tool-use smoke and a complete six-stage workflow passed.

### Version 0.2 validation and iteration notes

- Real free-model smoke test passed: the agent read the bundled skill and inspected the synthetic project through actual SDK tool calls.
- First regression pass: 24 tests passed, including real MLflow integration.
- Initial live workflow completed baseline (0.484375), candidate (0.71875), evidence-linked finding, fresh-session recall, and atomic supersession. It did not complete diagnostic training: the model chose the general shell, those requests were denied by the fixture's approval policy, and it described an expected failure without actual evidence. This is recorded as a failed full-flow attempt, not a pass.
- Fixes from that experience: clearer startup note locations/inventory; concise evidence-focused instructions; recognized training entrypoints route back to managed execution; identical refused requests do not re-prompt in the same user turn; compact memory responses avoid copying server-generated evidence metadata into new requests.
- Parallel review: safe approved orphan stopping is implemented and wired into agent/CLI; evidence reads are bounded and resilient; mismatched metrics do not produce a numeric delta; changed MLflow documents publish immutable external revisions, while unchanged retries reuse the same revision.
- Follow-up regression suite: `npm test` passed 40 tests, zero failed or skipped, including actual MLflow revisions/import and verified orphan process-group termination.
- Successful six-stage live evaluation: two completed runs (baseline 0.484375, candidate 0.71875), evidence-linked finding, fresh-session recall, history-preserving correction, actual NaN diagnostic failure, and a refused launch that created no job. The failure was JSON serialization rejecting nonfinite metrics, not the optimizer rejecting the learning rate.
- Added exact metric/evidence counts, broad recent-memory recall, and a boolean bounded wait based on observed model mistakes and unnecessary tool friction.
- Added the reproducible opt-in `npm run test:agent` evaluator with tightly scoped synthetic CPU approvals, live free-pricing verification, persistent reports, and an additional cancellation phase.
- The first expanded attempt was blocked at its first generation by OpenRouter's daily free quota. The user authorized MiniMax M3.1 Flash free, then NVIDIA Nemotron 3.5 Super VL free as fallback. MiniMax completed all seven phases; the fallback was not needed. Both completed experiment runs synchronized to MLflow; the diagnostic failed as expected; the refusal left only a proposal with no job; approved cancellation ended the child with SIGTERM before timeout.
- New explicit model selections refresh only their provider's catalog when missing, bounded to 15 seconds and respecting PI_OFFLINE. Default/cached selection remains offline and unavailable models are never silently substituted. For this live test, fresh model metadata from the public catalog was supplied through isolated Pi configuration; credentials were referenced without copying, and global settings were unchanged.
- Final regression suite: 43 tests passed, zero failed or skipped. Manual terminal checks passed for `/inspect`, `/wait`, `/compare`, `/diagnose`, `/models`, and `/exit`.
- The model still produced overly long responses and minor inaccurate descriptions of evidence counts/proposal state. Passing live assertions establish the measurements, state transitions, approvals, recall/correction, and job outcomes; they do not validate every sentence of generated prose.
- A live evaluation artifact was included in an automatic source scan for the cancellation-only run. Future evaluator reports now live inside `.mlstack/`, excluded from that scan; build/type-check and a direct source-fingerprint check verified this cleanup. The successful live transcript remains unmodified.
- Saved final evidence summary: `docs/live-eval-v02.json`; detailed validation and reproduction: `docs/validation.md`.

## Skill pack expansion — research, integration, and initial usefulness checks (completed)

User direction: add the suggested ML playbooks, inspect other skills and cookbooks, and adapt only workflows with a practical benefit. Preserve the small tool surface; no OpenCode or global skill installation.

- [x] Establish a bounded source-review plan in `work/research_ml_skills/research_plan.md`.
- [x] Review general engineering and official ML sources; record adopt/defer/reject decisions with links.
- [x] Expand the bundled entry point with on-demand onboarding/capture, debugging, and evaluation references.
- [x] Decide whether an additional measured-performance cookbook earns its place.
- [x] Allow read-only access to reviewed references without broadening external file access or adding model tools.
- [x] Validate skill structure, resource access boundaries, and actual agent decisions on isolated realistic tasks.
- [x] Review behavioral limitations, document invocation and source provenance, and finalize this tracker.

## Current limitations

- This is an initial implementation, not the complete V1 acceptance sign-off.
- Approval controls govern application execution paths; they are not a sandbox for hostile code.
- No automatic scientific-validity guarantees, distributed execution, cloud orchestration, graphical dashboard, or Hindsight dependency.
- Full environment locking, GPU telemetry, profiler integration, and bounded batch approvals remain deferred. Version 0.4 captures best-effort interpreter metadata for direct Python commands.

## Version 0.3 — bundled workflows and controlled modes

Authorized after the discussion of eleven workflows and a final review of reputable sources. Work moved to `MLstack-V1` on 22 October 2026; the original workspace copy is retained.

- [x] Final broad source pass: official HF/MLflow skills, established planning/coding sources, and primary ML cookbooks.
- [x] Start the shared workflow registry and exact bundled resource manifest.
- [x] Complete `/ml` routing, discoverable help/completion, and discuss/plan/act controls.
- [x] Finish two entry skills and all focused references; no new domain tools or global installs.
- [x] Verify mode restrictions before approvals/state changes, including read-only inspection.
- [x] Run skill validation, behavioral tests, terminal checks, and free-model workflow checks where available.
- [x] Finalize source decisions, workflow docs, actual validation results, and this tracker.

Default interactive chat is discuss; named routes use registry defaults unless overridden. Mode changes remain active for subsequent plain chat. Explicit operational commands retain their existing behavior. Mode-controlled conversations stay in memory, while saved research/job state persists. Broad external packs, cloud execution defaults, GenAI tracing, and autonomous search are outside this increment.


### Version 0.3 completion evidence

- Implemented eleven `/ml` routes, help and tab completion, two entry skills and fifteen focused references. Kept nine model tools total: three ML primitives and six scoped coding tools. `/compare` and `/cancel` remain direct commands.
- Discuss permits reads; plan adds exact named Markdown paths and experiment proposals; act permits approved execution. Enforcement happens in application tools, including a second check after an approval wait. Selecting act does not approve a job.
- Reviewed eighteen source groups spanning planning, engineering, documentation, data and ML. Original local adaptations draw on official Cursor, Anthropic, Hugging Face, MLflow, Google, PyTorch and scikit-learn sources and established maintainer guidance. No wholesale pack installation or global changes. Decisions and links: `docs/skill-source-review.md`.
- Type-check/build passed; final runtime suite passed 55/55 with real local MLflow. Both entry skills passed metadata validation and local reference checks. Terminal help, mode-only transitions and exit passed without a provider call.
- Actual MiniMax free nine-phase workflow passed: discussion, saved plan, baseline, candidate/finding, fresh-session recall, correction, observed diagnostic failure, refusal and cancellation. Both completed runs synchronized to MLflow. Evidence: `docs/live-eval-v03.json` and `docs/validation.md`. No paid fallback or OpenCode was used.
- A matched read-only evaluation probe completed both conditions. Both detected preprocessing leakage and the simultaneous parameter change. Guidance did not demonstrate an improvement: the skill answer used 720 words/16 calls versus 584/14 without it, and introduced unsupported directional/causal statements and an inconsistent ablation. Manual assessment: `docs/skill-probe-v03.json`.
- Tightened the evaluation reference after that observation: do not infer leakage's direction/magnitude, split identity or mechanisms from insufficient evidence; repair invalid preprocessing first; keep proposed controls internally consistent. This wording revision passed structural checks but has not been retested in a live matched probe. The original probe results are retained unchanged.

### Next validation scope

Validate on representative user repositories and repeated task samples before claiming general skill quality improvements. Prioritize concise, supported conclusions over extra ceremony. Resource/concurrency policies, broader diagnostics and the full V1 acceptance gate remain roadmap work, not completed features. See `docs/workflows.md` for the usable interface and `docs/validation.md` for observed limits.

## Version 0.4 — scoped context memory and experiment capture (completed)

Authorized: complete the researched next version; use Luna agents for testing when useful. Do not use OpenCode or silently use paid providers.

Updated ownership: simple local SQLite context memory owns user preferences/lasting project context; freeform research Markdown owns research reasoning; MLflow owns published measurements/artifacts; local SQLite retains execution/approval state, immutable evidence, synchronization receipts and legacy history. Preserve existing research records during a verifiable export instead of deleting them. No mandatory research-document schema.

- [x] Record implementation scope and inspect existing boundaries/research decisions.
- [x] Implement simple scoped SQLite memory with persistent user/project scopes, keyed corrections, forgetting and ordinary text search. Remove Mem0/vector/embedding dependencies following the user’s explicit simplification.
- [x] Replace recency-only startup research memory with a bounded, refreshable preference/context snapshot and on-demand memory lookup; keep existing host mode/approval rules.
- [x] Support flexible research files and a repeatable legacy export preserving source IDs, limitations, corrections and evidence links.
- [x] Capture selected artifacts and actual execution metadata with immutable hashes/manifests; publish changed outputs as distinct revisions and report publication state.
- [x] Implement external MLflow refresh preserving old snapshots, and maintain retry behavior.
- [x] Update commands, skills, product docs and migration instructions without adding a tool per operation.
- [x] Run deterministic/integration checks, real local memory persistence checks, terminal smoke and suitable actual-agent workflow checks; use Luna review/testing when useful.
- [x] Resolve observed issues, record validation/limitations, and finalize this tracker.

Implementation acceptance: persistence across fresh processes; cross-project isolation; explicit preference corrections outrank old entries; successful edits invalidate snapshots; reads respect mode rules; retry does not duplicate confirmed writes; memory outages leave execution usable. Artifact bytes round-trip with verified hashes, unchanged retry preserves identity, changed artifacts change capture identity, partial publication is retryable, and explicit imports refresh without erasing previously cited evidence. New live provider calls remain explicitly free or local.

### Version 0.4 scope correction during implementation

The user questioned vector-search complexity and explicitly selected replacing Mem0 with simple scoped memory. The initially implemented Mem0/CPU-embedding experiment is superseded and its dependencies are removed from the shipped version. Retain preferences/context as compact local SQLite records with explicit user/project scope, stable keys, corrections, forgetting, ordinary text search and refreshed snapshots. No memory framework, vector index, embedding download or background extraction. The successful earlier SDK experiments are historical exploration, not shipped functionality. Artifact/MLflow work continues unchanged.

### Version 0.4 verification log

- Final local suite: 77 tests passed, zero failed/skipped. Actual MLflow roundtrips, partial publication retry, changed-artifact revisions, immutable imported snapshots and a source-change-during-probe refusal were exercised.
- Scoped memory uses only Node built-in SQLite, stable project identity, user/project key precedence and ordinary text matching. Eight memory tests include fresh-process persistence and pure read behavior; Luna integration checks additionally cover agent scoping and CLI failures.
- Luna reproduced a CLI failed-save acknowledgement returning success; fixed record/forget to exit nonzero and retained a child-process regression. Root fixed scope-specific empty memory search and duplicate snapshot text.
- CPU demo completed both runs (0.484375/0.71875), synchronized both to MLflow, saved freeform research and recovered a preference/document after reconnecting. Manual terminal checks passed memory listing, research discovery, mode-only plan/discuss switches and exit without generation.
- Both skills validate, local documentation links resolve, npm audit reports zero vulnerabilities, and the dependency list contains only the original Pi/Typebox runtime and TypeScript tooling.
- The first v0.4 live attempt stopped at a test assertion expecting README.md instead of the correct outputs/README.md capture name. Runtime capture was correct; assertion fixed and the full corrected eleven-stage free-model rerun passed. Its failed report is retained rather than counted as a pass.

### Version 0.4 final result

- All 77 tests passed, zero skips/failures; deterministic CPU demo, terminal checks, both skill validators, documentation links and zero-vulnerability npm audit passed. Luna supplied independent integration checks and reproduced the CLI failure-status defect that was fixed.
- Actual MiniMax free eleven-phase run passed: discussion, planning, scoped preference, baseline, candidate/research document, fresh-session recall, keyed preference correction, research correction, diagnostic failure, refused launch and approved cancellation. All executed runs synchronized to MLflow with complete captures; all recorded processes stopped. Evidence summary: `docs/live-eval-v04.json`; reproduction/limits: `docs/validation.md`.
- Shipped dependency set is the original Pi/Typebox runtime plus TypeScript tooling. No Mem0, embedding/vector dependency, memory model download, paid provider fallback or OpenCode. Earlier SDK prototype scratch is historical and not used by the application.
- Nine tools remain: six reused scoped Pi tools plus experiment_read, experiment_run and memory. Eleven workflows and two entry skills/fifteen references remain. Research documents are freely organized; original research records remain recoverable through explicit export/archive compatibility.

Next work remains representative user repositories, scientific explanation quality, larger-artifact/data reproducibility requirements and measured resource policies. This release does not claim full V1 acceptance, automatic statistical validity or general skill efficacy.

## Version 0.5 — reuse Pi's interactive terminal UI

User direction: use Pi's UI with MLStack changes. Replace the prototype readline chat with the public Pi interactive mode and a reviewed inline MLStack extension. Keep the execution, memory, research and capture backend; preserve nine model tools and existing mode/approval constraints. No OpenCode, paid provider substitution or external extension discovery.

- [x] Verify public SDK runtime/UI integration and lifecycle contracts against installed Pi 1.3.0.
- [x] Mount Pi InteractiveMode with MLStack commands, visible mode/status, native approval dialogs and refreshed context.
- [x] Preserve scoped tools across new sessions/model changes and route/block native shell shortcuts consistently with host policy.
- [x] Keep deterministic CLI commands usable without credentials and provide a plain terminal fallback when explicitly requested.
- [x] Exercise terminal behavior and meaningful mode/approval/session regressions, using Luna testing where useful.
- [x] Update launch instructions, actual validation results and this tracker.

### Version 0.5 final verification

- Final suite: 85 passed, zero failed/skipped (`work/test-v05-final.log`). Luna’s offline actual SDK lifecycle regression passed with no implementation defects found.
- Real terminal smoke: native Pi startup, mode change, run listing, blocked shell shortcut with file absence verified, fresh conversation, help and exit passed (`work/terminal-smoke-v05.ansi`). No generation request was made.
- Default chat now uses Pi InteractiveMode; `--plain` retains the original prompt. Native approvals, mode footer, trusted workflow/operation commands and per-turn context use the existing scoped backend. Nine tools, dependencies and persistent experiment/memory formats retained.
- Previously requested MiniMax/NVIDIA free IDs were missing from the current catalog. UI checks used a catalogued free model offline; prior v0.4 live workflow results are not counted as v0.5 generation validation.
- Launch and boundaries documented in `docs/terminal-ui.md`; deterministic CLI remains usable without a terminal/provider credentials.

### Local provider setup — 22 October 2026

- Validated the existing environment OpenRouter key against the authenticated key endpoint; saved it in Pi's private credential store without logging its value.
- Replaced the unavailable saved default with the user's previously authorized `nvidia/nemotron-3.5-super-vl:free`, confirmed in OpenRouter's current live catalog. Added explicit Pi-compatible model metadata to the private agent configuration because the bundled catalog lacks this free ID.
- Confirmed `createTerminalRuntime` resolves the configured default without `--model`. No application source changes or paid model requests were needed.


## Public repository preparation — 24 October 2026

Target: public `shasank0001/MLstack-V1`. The user chose to leave the project unlicensed for now.

- [x] Review README guidance and established project examples; rewrite onboarding and documentation links.
- [x] Exclude credentials, generated files, environments, run state and scratch work; preserve local copies.
- [x] Validate a clean source checkout, check documentation links and scan the staged content for secrets.
- [ ] Create the public GitHub repository, push the initial commit and verify its visibility and contents.

Preparation notes: used GitHub’s `create-readme` skill after source review, with Pi/MLflow/Typer README examples. Scratch research was moved under ignored `work/`; local environments and run state were preserved. Added setup/contributor guides and a Linux CI workflow with pinned action revisions. A clean source export revealed an environment-dependent memory-path test; it now explicitly tests override precedence and restores environment values. Updated only the Undici/Zod transitive resolutions to patched versions while retaining Pi 1.3.0. Known-key and token-pattern scanning plus staged Markdown link checks passed; generated/local files are excluded.

Final local preparation: fresh npm install, type-check, all 85 tests (zero skips), README init/status commands, staged link/credential checks and zero-vulnerability npm audit passed on 24 October 2026. Detailed scope is recorded in `docs/validation.md`.
