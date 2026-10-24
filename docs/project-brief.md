# MLStack — ML Experiment Workbench

**Status:** Approved design baseline. Current implementation progress is tracked in [plan.md](../plan.md).

**Updated:** 22 October 2026

**Audience:** Project owner, contributors, and coding agents

**Purpose:** Shared working reference for what to build, how the parts fit together, and how to judge completion.

This document incorporates the project owner's clarified requirements. **Confirmed** decisions define the product scope. **Proposed** details are starting points for implementation and may change after validation. Descriptions of behavior are requirements, not claims that software already exists.

## Version 0.4 amendment — current implementation decisions

This amendment supersedes conflicting memory/data-ownership proposals in the original design below. The remaining V1 requirements describe the broader roadmap; they are not a claim that all capabilities have shipped. Current tests and limitations are recorded in [validation.md](validation.md) and [plan.md](../plan.md).

- **Preferences and important project context:** small local SQLite store using Node's built-in SQLite, with user and isolated project scopes, stable-key correction, explicit forget and ordinary text matching. No Mem0, Hindsight, embedding model, vector service or extra native memory dependency is shipped.
- **Context selection:** a bounded preference/context snapshot is refreshed before every user prompt. Project values override the same user key in that snapshot; omissions and access errors remain visible. See [memory.md](memory.md).
- **Research:** ordinary `research/**/*.md` files organized freely, with no mandatory schema/headings. The agent sees a bounded index and opens relevant documents as needed. Legacy structured research records remain readable/exportable with original evidence and corrections preserved; they are not automatically promoted into preferences.
- **Measurements and artifacts:** local MLflow publication plus immutable local manifests/blobs with SHA-256 references. Explicit selected files, logs, metrics, source/specification and best-effort training-interpreter metadata are captured after terminal execution. Retry reuses frozen bytes; deliberate capture changes create another revision. Explicit external import refresh preserves earlier local evidence. See [artifacts.md](artifacts.md).
- **Operational state:** project SQLite remains responsible for run/study identity, approvals, jobs, synchronization and local evidence references. Process completion, metric ingestion, selected capture and MLflow publication have separate outcomes.
- **Agent surface:** nine tools remain: six scoped Pi coding tools, `experiment_read`, `experiment_run`, and `memory`. The old `research_memory` model tool is replaced. Eleven `/ml` routes and two bundled skills remain. Plan mode permits canonical freeform research Markdown as well as named planning documents; preference mutations still require act.

These decisions simplify the current version without removing future options. Dataset protocol labels are declared identities, not full data versioning. Best-effort environment metadata is not a complete training lock; unknown launchers/GPU stay unknown. Capturing a checkpoint does not implement training resumption. Resource quotas, autonomous sweeps, runtime GPU telemetry and full V1 acceptance remain future work.

## 1. Product and users

### 1.1 Product definition

**MLStack is a standalone, Linux-only application built using Pi that helps practitioners plan, run, debug, compare, and learn from machine-learning experiments.**

It combines ordinary coding-agent capabilities with persistent experiment records and research memory. Users can work on code, investigate training behavior, launch approved experiments, and revisit earlier findings without reconstructing the project history from chat transcripts.

The core promise is to help users make evidence-backed ML decisions while preserving the context behind those decisions across sessions.

### 1.2 Intended users and starting workload

V1 serves an individual practitioner working in an existing local PyTorch repository on one Linux machine. It supports existing project structures and training entry points. It does not require users to adopt a new training framework.

The application is proactive: it can inspect evidence, identify issues, and suggest next steps. Users retain control over training launches, meaningful compute consumption, and consequential actions.

### 1.3 Example requests

- “Understand this repository and summarize what we have already tried.”
- “My validation loss is increasing. Investigate likely causes.”
- “Propose a controlled test of a lower learning rate.”
- “Run this experiment after I approve its configuration.”
- “Compare these runs. Were they evaluated under the same conditions?”
- “Did we already try a larger batch size? What did we learn?”
- “Show active jobs, unresolved questions, and useful next steps.”

### 1.4 Product principles

1. **Experiments and evidence persist across conversations.** Chat is an interface to the work, not the only record of it.
2. **Existing projects work without source edits.** Optional instrumentation provides richer visibility.
3. **Measurements and interpretations remain distinct.** Hypotheses, observations, findings, and decisions are explicitly labeled.
4. **Conclusions preserve provenance.** Important claims link to runs, artifacts, and evaluation conditions.
5. **Missing information stays unknown.** The agent must not invent metrics, dataset identities, or explanations.
6. **Compute remains under user control.** Approval and resource limits apply to execution.
7. **Established tools handle established jobs.** Reuse Pi, MLflow, and PyTorch tooling where appropriate.
8. **The first implementation stays modest.** Establish a reliable local workflow before adding broader orchestration or advanced memory infrastructure.

## 2. V1 contract

### 2.1 Confirmed decisions

| Area | Decision |
| --- | --- |
| Product | ML Experiment Workbench with general coding-agent capabilities |
| Foundation | [earendil-works/pi](https://github.com/earendil-works/pi) |
| Application model | Separate application built using Pi; MLStack owns its interface and workflow |
| Operating system | Linux only |
| Initial workload | Existing local PyTorch projects; single machine; individual user |
| Agent behavior | Proactive copilot with approval for compute-consuming or consequential actions |
| Integration | Command capture first, existing MLflow runs, and one documented JSON metrics format |
| Core stack | TypeScript application/core, a small Python helper, SQLite, and local MLflow |
| Current memory | Scoped SQLite preferences/context; flexible research Markdown (v0.4 amendment) |
| Hindsight | Optional future adapter, evaluated after the baseline workflow works |
| Job lifetime | Training continues when the MLStack application or embedded Pi session closes |
| First milestone | One small complete workflow: propose → approve → launch → capture → compare → remember |

Pi's documented TypeScript SDK supports embedding its agent, sessions, and tools in another application. MLStack will start with that integration surface and avoid a Pi fork unless a demonstrated limitation requires reconsideration. See the [Pi SDK documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md).

### 2.2 Included capabilities

- Open and inspect an existing PyTorch repository without restructuring it.
- Identify training/evaluation entry points, configurations, and available outputs.
- Create studies, establish baselines, and prepare run proposals.
- Approve and launch managed runs through a persistent local supervisor.
- Capture commands, logs, execution outcomes, available resource observations, and provenance.
- Ingest the documented JSON metrics format and reference existing MLflow runs.
- Compare results with explicit evaluation compatibility checks.
- Diagnose common training failures and suspicious metrics using recorded evidence.
- Store and retrieve research decisions, corrections, findings, and unresolved questions across sessions.
- Offer small, reviewable instrumentation edits when more reliable metrics are needed.

### 2.3 Initial interface

**Proposed starting point:** A standalone terminal application with conversation, approval prompts, job status, run details, comparison views, and research history. Being a separate application does not require a graphical dashboard.

Exact navigation and command names remain implementation choices. Any commands shown during design are illustrative until implemented. A full graphical experiment dashboard is outside V1.

### 2.4 Exclusions

- macOS and Windows support.
- Distributed or multi-node training and cloud GPU orchestration.
- Autonomous hyperparameter search or unapproved experiment batches.
- Multi-user collaboration, enterprise authentication, and shared hosted workspaces.
- A replacement for MLflow or a custom mandatory training framework.
- General support for every ML framework, logging format, or profiler.
- TensorBoard and generic CSV adapters in the initial integration set.
- Mandatory Hindsight or another external memory engine.
- Automatic training resumption after an operating-system reboot or machine failure.
- Guarantees of scientific validity or model improvement beyond the available evidence.

### 2.5 V1 acceptance criteria

V1 is complete when the application can demonstrate all of the following:

- [ ] Open an existing PyTorch repository and capture a command without editing its source.
- [ ] Create a study with a goal, hypothesis, target metric, and baseline.
- [ ] Import an existing MLflow run without claiming to control its process or know missing provenance.
- [ ] Persist a run proposal, obtain approval, and launch it with stable run/job identifiers.
- [ ] Prevent duplicate launches when a request is retried.
- [ ] Capture logs, process outcomes, and metrics from the supported JSON format.
- [ ] Keep an approved training job running after the application closes, then reconnect and reconcile its status.
- [ ] Display unavailable metrics and uncertain job states honestly.
- [ ] Compare two runs and flag changed or unknown dataset, split, or evaluation conditions.
- [ ] Explain a representative training failure using traceable evidence and labeled uncertainty.
- [ ] Save a finding with supporting evidence, scope, and limitations.
- [ ] Correct or supersede that finding while retaining its history.
- [ ] Retrieve relevant decisions and previous attempts in a fresh application session.
- [ ] Enforce the approval policy through application-controlled execution paths.
- [ ] Perform essential experiment tracking and research recall without Hindsight.

## 3. User workflow

### 3.1 Onboard the project

The user opens a repository in MLStack. The agent inspects code and configurations, identifies likely training and evaluation commands, discovers supported outputs, and loads existing research context.

Onboarding must distinguish verified information from assumptions. If the dataset version, metric definition, or evaluation split is unknown, the application records that gap rather than guessing.

### 3.2 Frame a study

The user and agent establish the objective, hypothesis, primary metric, baseline, and evaluation protocol. A study groups attempts that address the same research question.

For example: “Does reducing the learning rate improve validation accuracy while keeping the dataset, split, and evaluation procedure fixed?”

### 3.3 Prepare and approve a run

MLStack persists a proposed run with its command, configuration, intended change, evidence requirements, working directory, environment references, and applicable resource limits. It presents the proposal and available resource estimates to the user.

Approval applies to a specific execution specification or an explicitly bounded batch. Material changes to the approved command, code/configuration state, or limits require renewed approval. Unknown execution costs must be identified as unknown.

### 3.4 Execute and collect evidence

The supervisor allocates a stable job record before process creation, validates approval, and launches the command. It collects logs and available execution observations independently of the conversation.

Supported adapters ingest metrics and artifact references. A command-only run remains useful even if its script exposes no metrics. Metric ingestion failures are reported separately from training-process outcomes.

### 3.5 Validate and compare

After execution, MLStack checks process outcomes, available artifacts, evaluation conditions, and metric availability. The user can compare the run with a baseline or related attempts.

A successful process exit establishes execution success only. It does not establish that training was useful, that evaluation was correct, or that the model improved.

### 3.6 Interpret and remember

The agent summarizes observations, assesses possible explanations, states limitations, and suggests a controlled next step. It stores meaningful findings, decisions, corrections, and open questions with evidence links.

On a later session, startup context includes the current goal, relevant project rules, active work, accepted decisions, and unresolved issues. Additional history is retrieved selectively.

## 4. System design

### 4.1 Logical architecture

```text
User
  |
Standalone MLStack application — TypeScript
  |-- Application interface and approval controls
  |-- Embedded Pi agent/session — reasoning, coding, tools, ML workflows
  |
MLStack core
  |-- Experiment Manager
  |-- ML Debugger workflows
  |-- Research Memory
  |-- Approval records and durable events
  |
  |-- SQLite — structured state and search
  |-- MLflow adapter — metrics, parameters, tracked artifacts
  |-- Project notes and evidence references
  |-- Optional future memory adapter
  |
Persistent local Training Supervisor
  |-- Job launch, logs, limits, status, reconciliation
  |-- Small Python helper where needed
  |
Existing local PyTorch project and its Python environment
```

These are logical responsibilities, not a requirement for separate services for every component. In particular, the supervisor has an independent lifetime; the other components can initially share an application/core process. MLflow is not responsible for launching or supervising jobs.

### 4.2 Component responsibilities

| Component | Owns | Boundary |
| --- | --- | --- |
| Application and Pi integration | User interaction, agent session, coding tools, approval presentation, ML workflows | Application policy governs execution; prompts alone do not enforce approval |
| Experiment Manager | Projects, studies, run proposals, baselines, provenance, comparisons | Delegates process execution and metric storage |
| Training Supervisor | Approved launches, queueing, logs, limits, process outcomes, recovery/reconciliation | Does not choose hypotheses or declare scientific improvement |
| ML Debugger | Evidence gathering, possible causes, targeted checks, recommendations | Uses shared run/evidence records; does not create a competing database |
| Research Memory | Decisions, findings, corrections, open questions, selective recall | References measurements; does not replace their authoritative sources |

The debugger starts with exceptions, out-of-memory failures, NaN/Inf values, unstable learning, overfitting/underfitting symptoms, and evaluation discrepancies. Performance analysis depends on available resource/profiler evidence. A suspected cause remains a hypothesis until tested.

### 4.3 Domain model

**Project → Study → Run** is the research hierarchy.

| Entity | Meaning |
| --- | --- |
| Project | Repository/workspace and its research context |
| Study | A hypothesis-driven investigation |
| Run | One defined configuration and evaluation attempt within a study |
| Job | A managed operating-system execution associated with a run |
| Evidence | Metrics, logs, artifacts, code state, environment, dataset identity, and evaluation protocol |
| Comparison | A recorded assessment of selected runs and their compatibility |
| Finding | An interpretation supported by evidence, with scope and limitations |
| Decision | A deliberate choice with rationale and author |
| Approval | Recorded authorization for an execution specification or bounded batch |

A **managed run** is proposed, approved, and executed through MLStack. An **imported run** references an existing MLflow record; MLStack does not assume control of its process. Retries and diagnostic executions must retain distinct execution identities; precise run/job retry semantics will be documented before implementation.

MLflow's term *experiment* describes its own run grouping. MLStack uses *study* for the research concept. These identifiers remain distinct; multiple studies may reference runs in one MLflow experiment.

### 4.4 Data ownership

| Data | Authoritative owner |
| --- | --- |
| Project/study/run identity, intended configuration, approvals, relationships, comparisons | MLStack SQLite records |
| Managed-run observed metrics, logged parameters, tracked artifacts | Local MLflow records; original JSON/log files retained as source evidence |
| Imported-run observed metrics, parameters, tracked artifacts | Referenced source MLflow records; timestamped comparison snapshots retain source identity |
| Job identity, execution state, process references, log locations, resource observations | Supervisor-owned records persisted in MLStack state |
| Research findings, decisions, questions and evidence links | Flexible research Markdown; earlier structured records retained as a legacy archive |
| Lasting preferences and important stable project context | Scoped context-memory SQLite |
| Legacy project/research notes | Editable files retained for compatibility and explicit export |
| Search indexes and optional contextual retrieval | Derived, rebuildable representations |
| Code, dataset contents, checkpoints | Original repository or referenced storage locations |

Planned configuration and observed/logged configuration are separate fields and may differ. The application must report such differences. Imported runs are read-only through the initial adapter; any local snapshot is labeled with its source and capture time.

Structured records and notes must not become competing editable sources for the same fact. The proposed notes policy is described in Section 7.

### 4.5 Integration levels

| Level | V1 behavior | Requirement |
| --- | --- | --- |
| Command capture | Command/arguments, working directory, stdout/stderr, elapsed time, exit outcome, available code/resource context | No training-script changes |
| Supported outputs | Existing MLflow runs and one documented JSON metrics format | The project already emits a supported output, or the user opts into adding it |
| Optional instrumentation | Explicit metrics, configuration, checkpoint references, dataset/split identifiers | Small visible code changes using ordinary logging hooks |

Arbitrary PyTorch loops do not necessarily expose structured metrics. MLStack must show metrics as unavailable when reliable extraction is impossible. Free-form console text is retained as evidence; treating it as structured measurements requires a validated adapter.

**Proposed JSON contract:** A versioned JSON document containing a metric series, with each point identifying a metric name, finite numeric value, and step. Run association comes from the registered output path/run specification. Timestamp, dataset/split identity, and protocol references can be included when known. The implementation must publish an exact schema, example, validation rules, and file-completion behavior before this adapter ships. Malformed values must produce an ingestion error rather than fabricated measurements.

### 4.6 Provenance and comparisons

Capture the following when available:

- Git commit, dirty-tree state, and an appropriate patch or source snapshot.
- Approved and executed commands, configuration, and working directory.
- Python environment, dependency information, device identity, and relevant runtime details.
- Dataset version/identifier, train/validation/test split, preprocessing, and transformations.
- Metric definition, direction, aggregation, checkpoint, and evaluation protocol.
- Seeds, artifact locations, and known gaps.

Comparisons assess dataset, split, metric definition, and material evaluation differences. Their compatibility assessment must distinguish **comparable**, **not directly comparable**, and **insufficient information**. Known differences may be intentionally studied, but conclusions must explain their scope.

An improved number from one run is an observation. Broader claims require suitable evidence, including repeatability across seeds when relevant.

### 4.7 Research Memory — original proposal

**Superseded for v0.4:** new research uses flexible Markdown, while scoped SQLite stores only preferences and important stable context. The following describes the original structured-research design, retained to explain existing archive records and later roadmap discussions.

The required baseline is structured SQLite records, full-text search, and editable notes. Memory categories are project context, observations, hypotheses, findings, decisions, corrections, and open questions.

Findings carry an evidence relationship, scope, author, timestamps, limitations, revision history, and a status such as current, tentative, contradicted, superseded, or requires revalidation. Supersession preserves the earlier record and its relationship to the replacement.

The memory lifecycle is:

1. Detect a meaningful decision, correction, comparison, diagnostic conclusion, or unresolved question.
2. Persist the structured record and evidence pointers.
3. Produce a concise labeled summary when useful.
4. Update derived search representations.
5. On recall, resolve evidence references and check current status and applicability.

Do not store every conversation turn as research memory. Do not index credentials, raw private dataset contents, or large checkpoints. A remembered summary is never an authoritative measurement.

An optional Hindsight adapter may later improve contextual retrieval. It must sit behind MLStack's memory interface, remain replaceable, and treat retrieved narratives as suggestions that require resolution against structured records and evidence. Failure of that adapter must leave baseline memory usable.

## 5. Reliability and user control

### 5.1 Approval policy

| Operation | Default policy |
| --- | --- |
| Read code, logs, metrics, and memory | Automatic |
| Suggest hypotheses, checks, or experiments | Automatic |
| Cheap read-only diagnostics | Automatic within explicitly configured resource limits |
| Ordinary reversible code/configuration edits | Allowed, with visible changes; stricter project policy takes precedence |
| Training/evaluation or diagnostics consuming meaningful compute | Explicit approval per launch, unless covered by an explicitly approved bounded batch |
| Paid/cloud resource use | Explicit budget and approval; orchestration outside V1 |
| Cancel or terminate a job | Approval, except enforcement of previously approved limits |
| Record evidence and meaningful research records | Automatic and auditable |
| Override a decision or remove historical findings | Never silently; record correction or supersession |

An ordinary code-edit permission does not authorize executing training as a side effect. Batch approval must specify allowed configurations, number of launches, resource/time limits, and expiry or completion conditions.

MLStack owns policy enforcement. Pi's upstream documentation states that it does not provide built-in filesystem/process/network permission restrictions; see [Pi permissions and containerization](https://github.com/earendil-works/pi#permissions--containerization). The integration must therefore mediate execution tools and supervised launches rather than rely solely on agent instructions. This workflow policy is not a security sandbox for arbitrary hostile code.

### 5.2 Persistent execution

The supervisor runs independently of the application and Pi conversation. Closing the terminal, ending a session, or reopening the application must not cancel an approved training job.

The required lifecycle is:

1. Persist the run specification and applicable approval.
2. Allocate a stable job identity and launch request identity before spawning.
3. Launch within approved scope and record execution identity.
4. Persist outcomes and capture logs without depending on the client connection.
5. Reconnect and reconcile queued, active, completed, or uncertain jobs on reopening.

Launch retries must not create duplicate training processes. Process reconciliation must validate identity rather than trust a PID alone. A run whose outcome cannot be established is reported as unknown/unreconciled until resolved; it must not be silently relaunched.

The Linux process mechanism remains subject to a focused implementation spike. Application-close survival is required. Automatic checkpoint recovery after reboot is outside V1; after reboot, previously active jobs must be reconciled honestly.

### 5.3 Separate lifecycle records

Run state, job state, evidence-ingestion state, and research conclusions are distinct. A proposed vocabulary is:

- **Run:** proposed, approved, active, completed, failed, cancelled, unknown.
- **Job:** queued, running, exited, failed, terminated, unreconciled.
- **Ingestion:** pending, partial, complete, error, not available.

An exited job may have missing metrics. A completed run may provide inconclusive research evidence. The exact transition rules must be specified before implementing lifecycle logic.

### 5.4 Events and monitoring

Persist important state changes and an outbox/event record transactionally before dispatch. Use stable event identifiers and idempotent consumers for launches, ingestion, and memory updates. V1 does not require a distributed message broker.

Illustrative events include run proposed/approved, job queued/started/exited, metrics ingested, comparison created, and finding recorded/superseded.

Routine process checks, metric polling, and resource monitoring use deterministic code. Invoke the agent when interpretation or a decision is useful; continuous LLM polling is unnecessary.

### 5.5 Storage and local operation

**Proposed layout:** `.mlstack/` holds project-local metadata, SQLite state, notes, job logs, generated reports, and references to other artifacts. Exact paths and local MLflow storage configuration must be finalized during the prototype.

Keep training dependencies in the project's Python environment. The MLStack helper environment must not silently replace or modify that environment. Large datasets and checkpoints stay in their existing locations unless explicitly configured otherwise.

Do not commit credentials, generated databases, logs, datasets, or checkpoints by default. Decide explicitly which project notes and configuration files belong in version control. “Local” describes training and state placement; it does not promise offline LLM inference. Model-provider selection and credential configuration remain open implementation choices.

## 6. Delivery plan

### Milestone 1 — Complete experiment workflow

Build the smallest usable version across all core responsibilities:

- Standalone TypeScript application embedding Pi.
- Project/study/run/job identity and SQLite migrations.
- Basic proposals, approval records, and duplicate-safe launch.
- Persistent supervisor sufficient to survive application closure.
- Command/log capture and the initial documented JSON adapter.
- Local MLflow integration and a minimal existing-run import path.
- Basic compatibility checks and a stored comparison.
- One evidence-linked finding and retrieval in a fresh session.

**Demonstration:** Use a small PyTorch example to establish a baseline, propose a controlled change, approve and launch it, close the application while training continues, reopen it, compare results, and retrieve the recorded conclusion in a new session.

The example may emit the documented JSON format. Separately demonstrate zero-edit command capture for a script that exposes no structured metrics.

### Milestone 2 — Reliability and research continuity

- Harden crash/retry reconciliation and uncertain-state handling.
- Separate partial/malformed ingestion from execution outcomes.
- Expand imported-run provenance and evaluation compatibility checks.
- Add findings revisions, corrections, supersession, and scoped recall.
- Establish the editable-notes synchronization policy and audit trail.
- Add project-level resource limits and bounded batch approvals.

**Demonstration:** Repeated launch requests do not duplicate jobs; missing evidence remains visible; a corrected finding is recalled with its history and current status.

### Milestone 3 — Debugging and representative-project validation

- Validate debugging workflows on representative failures and evaluation mistakes.
- Add the optional instrumentation path and available resource observations.
- Improve run/job/history views using experience from real repositories.
- Complete V1 acceptance checks beyond the initial example.
- Benchmark optional contextual memory only after the baseline is reliable.

**Demonstration:** Diagnose a representative failure, propose a controlled remedy, run it with approval, and store a conclusion that cites the supporting evidence.

### Evaluation approach

Evaluate deterministic behavior with small integration scenarios: retries, application disconnects, partial ingestion, malformed metrics, and comparison mismatches. Evaluate agent behavior with fixed evidence cases containing known causes, missing information, and misleading comparisons.

Compare MLStack with ordinary Pi on tasks such as recalling earlier attempts, explaining decisions with evidence, recognizing invalid comparisons, and diagnosing representative failures. Use the same repository/evidence and model configuration where possible. Report correctness, citation accuracy, unsupported claims, workflow completion, latency, and model cost. Set explicit thresholds before using these results as release gates.

If Hindsight is evaluated, compare it with SQLite search and notes on the same recall questions. Adoption requires a meaningful benefit in correctness, evidence citation, or useful recall that justifies latency, model cost, and operating complexity.

## 7. Decision register and implementation starting point

The product scope is sufficiently defined to begin a prototype. The following choices remain visible rather than being presented as settled requirements.

| Topic | Proposed starting point / question | When to resolve |
| --- | --- | --- |
| Application interface | Standalone terminal interface; exact views and navigation to prototype | Start of Milestone 1 |
| Pi SDK integration | Pin a compatible release; verify tool mediation, approvals, session restoration, and custom-tool behavior | Start of Milestone 1 |
| Model configuration | Select provider/model configuration and credential discovery without embedding secrets | Start of Milestone 1 |
| Linux supervision | Compare a user-service mechanism with a detached worker; prove terminal-close survival, identity checks, logs, and reconciliation | Before first managed launch |
| Core/helper boundary | TypeScript owns application/domain state; use Python where required for MLflow/PyTorch integration | Milestone 1 |
| Metrics contract | One versioned JSON schema; define atomic output/completion and validation behavior | Before adapter implementation |
| State and MLflow paths | Project-local `.mlstack/` metadata with explicit artifact references and Git exclusions | Milestone 1 |
| Lifecycle and retries | Define state transitions, cancellation behavior, and retry run/job identity | Before supervisor implementation |
| Resource policy | Define cheap diagnostics, wall-time limits, concurrency, and approval expiry; unavailable limits must be disclosed | Before automatic diagnostics/launch |
| Provenance overhead | Choose practical code snapshots, environment capture, and user-supplied dataset/evaluation identities | Milestone 1, harden in Milestone 2 |
| Notes editing | Human context remains editable; structured-fact edits become explicit revisions in SQLite, with conflict detection | Basic policy in Milestone 1; harden in Milestone 2 |
| Hardware coverage | CPU execution as a proposed baseline; GPU monitoring is opportunistic. Define tested GPU/driver coverage | During representative-project validation |
| Memory engine | SQLite search and notes first; Hindsight adoption depends on benchmark results | After baseline validation |
| Quality thresholds | Define representative evaluation cases and acceptable correctness/cost/reliability thresholds | Before V1 acceptance review |

### Suggested repository organization

```text
mlstack/
├── packages/
│   ├── app/                 # Standalone interface and Pi SDK integration
│   ├── core/                # Domain state, approvals, comparisons, memory, events
│   └── supervisor/          # Persistent execution and reconciliation
├── python/
│   └── mlstack_helper/      # Tracking/diagnostic helpers where needed
├── skills/
│   └── mlstack/             # Agent research and debugging guidance
├── examples/
│   └── pytorch-project/     # Small complete-workflow demonstration
└── docs/
    └── project.md
```

This organization is proposed. Component responsibilities and reliable shared identities matter more than the final directory names.

### Immediate next action

Build Milestone 1 as a narrow complete workflow. Begin by validating Pi embedding and execution-policy integration, then establish project/run/job identities and the persistent launch path. Add minimal ingestion, comparison, and research recall to complete the demonstration before expanding features or memory infrastructure.

### Reference sources

- [Pi repository](https://github.com/earendil-works/pi) — selected agent foundation.
- [Pi SDK documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md) — embedding and session/tool integration; checked on 21 October 2026.
- [Pi permissions and containerization](https://github.com/earendil-works/pi#permissions--containerization) — upstream execution-permission boundary; checked on 21 October 2026.
- Original MLStack project description and the project owner's clarification answers — authority for product scope and accepted defaults.

**Document boundary:** This is a project brief and architectural working reference. Exact schemas, tool contracts, process mechanisms, and UI designs will be specified and validated during implementation.
