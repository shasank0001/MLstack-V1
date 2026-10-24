# Repository onboarding and metrics capture

Use when the project or its measurement path is unfamiliar. Produce a grounded, small run plan or the precise remaining unknown, not a repository rewrite.

## Find the actual path

Start with notes already supplied, README, environment/lock files, and the documented entrypoint. Follow its configuration through data loading, training, evaluation, and output writing. Establish only what the requested task needs:

- Working directory, command/config overrides, and intended interpreter/environment.
- Data location and access requirements; split construction and existing assets.
- Primary metric definition/direction/aggregation, evaluation mode, and checkpoint selection.
- Existing output or MLflow tracking, likely runtime/device needs, and a bounded first check.

Do not substitute an installed interpreter for the documented environment without checking. Missing dependencies do not authorize package installation, data downloads, artifact pushes, or global configuration changes. Avoid speculative probes when the documented command is sufficient. Ask about an unknown that affects cost/correctness; preserve other unknowns rather than inventing them.

Prefer a documented small smoke/configuration check before full training when it resolves uncertainty. Smoke training validates a path, not scientific improvement; it uses managed execution and host approval. Honor requested scope/time limits rather than escalating to a sweep.

## Reuse or add the smallest capture path

Logs suffice for command/failure capture. Reuse compatible JSON or imported MLflow evidence before adding another logger. Do not attribute stale files or unrecorded prose metrics to a new run.

When structured measurements are needed and no supported output exists, make a small instrumentation change within the user's coding scope. Preserve training and evaluation semantics. The local contract is:

```json
{"schema_version":1,"metrics":[{"name":"val_accuracy","value":0.81,"step":0}]}
```

Write the completed document to `os.environ['MLSTACK_METRICS_PATH']`, supplied at managed launch. Values are finite numbers, steps nonnegative integers, `(name, step)` pairs unique; optional timestamps are integer Unix milliseconds. Use strict JSON (`allow_nan=False` in Python), a temporary file next to the destination, then atomic replacement. Do not silently drop NaNs to manufacture valid evidence. An early crash may leave no metrics; retain its logs.

Avoid fixed paths and existing files: launch rejects stale configured metrics files. Verify new capture code with a cheap check or approved bounded smoke run when execution is requested; inspection alone does not establish ingestion worked. Source edits invalidate earlier launch approval.

Preserve unknown dataset/split/evaluation identities as null. Narrow `source_files` to relevant code/config when generated outputs would contaminate snapshots; do not put large datasets in source snapshots.

Handoff: command/environment, metric/protocol, capture path, expected resources, and any blocker. Store a useful research handoff in freely organized `research/` Markdown when document writes are permitted. Lasting preferences or important project constraints can use the `memory` tool in act mode; use a stable key to correct a prior value. Measurements remain in run/MLflow records. Discuss onboarding produces a read-only summary.
