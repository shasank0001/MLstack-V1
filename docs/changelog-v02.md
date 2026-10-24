# MLStack 0.2 changes

Version 0.2 reduces the model's ML interface to three persistent capabilities and leaves investigation to Pi's coding tools and the model. It preserves deterministic commands for occasional operations.

## Interface changes

- Replace nine specialized ML tools with `experiment_read`, `experiment_run`, and `research_memory`.
- Fold cancellation into `experiment_run(action="stop")`; retain `/cancel` for direct use.
- Supply exact observations and compatibility checks through multi-run inspection; retain `/compare` for a recorded deterministic comparison.
- Replace canned diagnosis with evidence inspection and model investigation. `/diagnose` aliases `/inspect`.
- Combine study creation with run planning while retaining `/study`.
- Retain `/remember`, `/recall`, and `/supersede`; the model can also record a replacement and supersede the earlier record atomically.
- Add `/inspect`, `/wait`, and `/models`.
- Load the bundled `ml-research` skill, callable as `/skill:ml-research`. Other Pi skills, extensions, prompt templates, and MCP connections remain excluded.

## Useful additions

- Compact experiment overviews and selected-run evidence include metric summaries, provenance, bounded logs, errors, and compatibility checks. The model sets `wait: true` to wait up to 30 seconds for short jobs; `/wait --seconds` retains numeric CLI control. Legacy numeric model arguments are normalized for older sessions. Explicit totals identify the full size of compacted run, metric, and provenance lists. Metric summaries distinguish total, shown, and omitted points; unreadable evidence has unknown counts.
- Reuse six Pi coding tools, including `project_bash` for short approved diagnostics, tests, and analysis. Shell commands default to a 30-second timeout and cannot exceed 60 seconds. Recognized existing training entry points return a run-control routing hint without shell execution, including diagnostic training.
- Cache a human refusal for repeated identical requests within the current user turn; a new user message allows reconsideration.
- Let the approved stop operation recover a verified surviving managed process group after supervisor loss. Unverifiable identities require manual inspection, and the original exit outcome remains unknown.
- Preserve external MLflow metric revisions when a re-ingested document changes; retries of the same document reuse its revision.
- Return compact model-facing memory summaries with selected citations and a total evidence count; attach evidence in the application rather than asking the model to resubmit generated record fields.
- Store content-addressed evidence snapshots and pin them to new research records. Recall verifies hashes, flags missing or changed artifacts and newer metric evidence, and labels older unpinned records.
- Reject an unavailable configured model with an actionable error instead of silently choosing another model. A redundant provider prefix may be normalized to resolve the same model. `/models` lists explicit free catalog selections. An explicitly selected model missing offline gets one provider-scoped catalog refresh with a 15-second deadline unless `PI_OFFLINE` is set; missing/failed refreshes still refuse substitution. Global model defaults are unchanged, although the catalog cache may update.

Approval, source fingerprints, detached training, JSON metrics, local MLflow integration, studies, and durable SQLite records remain core infrastructure. These are application guarantees that a conversation or skill alone cannot provide.

## Validation and limits

Version 0.2 passed 43 deterministic tests with zero skips, a six-phase Cohere live workflow, and the expanded seven-phase MiniMax free-model evaluation including approved cancellation and confirmed child exit. A prior expanded Cohere attempt hit a provider free quota. Live assertions passed; some generated explanations still miscounted citation types, confused proposed records with executed jobs, or were overly verbose. `npm run test:agent -- --model openrouter/…:free` runs the opt-in isolated CPU evaluator with public pricing verification and scoped approvals. See [validation.md](validation.md) for detailed evidence, model-quality limits, and historical initial-version results.

The model still has to assess scientific validity, investigate root causes, and qualify single-seed results. No graphical dashboard, GPU telemetry, resource quotas, checkpoint recovery, or automatic statistical significance claim is added in this revision.
