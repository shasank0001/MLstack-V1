# Artifact capture and MLflow

MLStack 0.4 freezes finished-run evidence locally and publishes verified bytes to MLflow. A process outcome, metric ingestion, artifact capture and MLflow publication are separate results: a successful training process can still have a missing requested output or a retryable publication error.

## Select output files

Add optional `artifacts` to a run specification:

```json
{
  "name": "Baseline",
  "command": ["/path/to/training-env/bin/python", "train.py"],
  "metric": "val_accuracy",
  "direction": "maximize",
  "protocol": {
    "dataset": "dataset-v1",
    "split": "validation-v1",
    "evaluation": "accuracy-v1"
  },
  "source_files": ["train.py", "config.json"],
  "artifacts": ["results/predictions.csv", "results/config.json", "checkpoints/best.pt"],
  "timeout_seconds": 600
}
```

The training command must produce the declared files. MLStack does not discover output directories or recursively upload them. Selection is part of the approved specification.

Limits are 32 selected output files, 64 MiB per file and 256 MiB across the complete capture, including source/log/metric evidence. Paths must be canonical project-relative files outside `.mlstack`; absolute paths, traversal, symlink paths, directories and duplicate selections are rejected or reported as capture errors. There is no extension restriction: choose only bytes appropriate to retain and publish.

A missing or oversized requested output marks capture incomplete without inventing a training failure. Inspect `capture.status`, `capture.errors`, `capture_error`, `ingestion_error` and `mlflow_error` to distinguish outcomes. Incomplete selected capture prevents successful publication until corrected and refreshed.

## What is frozen

After terminal execution, the capture manifest records:

- Exact command, declared dataset/split/evaluation protocol and approved source provenance.
- Available specification, stdout/stderr, approved source copies and ingested metric snapshot.
- Explicit selected output files and execution-environment metadata.
- Each file's logical path, role, byte size, SHA-256 and immutable local blob path.
- Capture time, manifest content identity and any capture errors.

Files are stored under `.mlstack/runs/RUN_ID/captures/blobs/`; manifests are stored by their own digest. `Run.capture` points to the current manifest with its hash and status. Older manifests/blobs remain available. Hash checks establish byte identity, not scientific validity or protection against an administrator changing every copy and record.

The source snapshot is the approved source selection, not the entire machine or complete repository history. Data files, dependencies and dynamically loaded code are not automatically frozen. Include relevant resolved configuration, prediction files or small data manifests as explicit outputs when useful.

## Environment coverage

Inside managed execution, a bounded probe uses the directly approved Python executable and inherited environment. Its time counts toward the approved job timeout. It records interpreter/version, platform and available installed distribution versions for common ML packages; it does not run training code or collect arbitrary environment variables.

The probe does not reproduce interpreter flags or training-time environment changes. Installed package versions do not establish which packages the training code used. Shell/env launchers, unsupported executables and failed probes are marked unknown. GPU/driver/CUDA observations and full resource telemetry are not collected; GPU remains explicitly unknown.

This metadata comes from the training command's interpreter when supported, not the separate MLflow-helper environment. It is best-effort reproducibility evidence, not a complete environment lock or a guarantee that a run can be reproduced.

## Publish and retry

Finished managed runs synchronize to:

```text
.mlstack/mlflow.sqlite
.mlstack/mlflow-artifacts/
```

A file lock serializes local helper operations. Before publication, MLStack verifies local manifest/blob hashes. The helper uploads frozen bytes, downloads them to verify hashes, and marks publication complete and the external run terminal only after artifacts and manifest succeed. The `mlstack.publication_status` tag distinguishes pending/error/complete publication; local `mlflow_error` reports failures.

```bash
npm start -- --project /path/to/project sync-mlflow RUN_ID
```

Retry reuses the same frozen capture and external revision even if original output files or logs changed afterward. Existing metric points are checked to avoid duplicate logging after partial publication. A failed partial retry stays visibly incomplete and can be retried after the underlying failure is resolved.

To capture deliberately changed output/log bytes:

```bash
npm start -- --project /path/to/project capture-artifacts RUN_ID --refresh
npm start -- --project /path/to/project sync-mlflow RUN_ID
```

Without `--refresh`, capture reuses and verifies the current immutable manifest. An unchanged refresh retains its identity. `ingest RUN_ID` re-ingests terminal metrics and refreshes capture too.

Publication identity includes both metric content and the capture manifest. Changed selected artifacts or logs create a new external revision even with identical metrics. `mlstack.run_id` links revisions to the logical local run; `mlstack.previous_revision` links the previously associated external run when available. Earlier manifests/publications are preserved by MLStack, although externally modifying an MLflow artifact can still invalidate a citation.

## Import and refresh an external run

```bash
npm start -- --project /path/to/project import-mlflow \
  --study STUDY_ID --uri sqlite:////absolute/path/to/mlflow.sqlite \
  --external-run MLFLOW_RUN_ID --metric val_accuracy --direction maximize \
  --dataset DATASET_ID --split SPLIT_ID --evaluation PROTOCOL_ID
```

Supply only known protocol identities; omitted values stay unknown. Import creates local metric evidence and `import.snapshot.json` with source URI/run ID, artifact URI, parameters, tags, available dataset-input metadata and capture time. External metrics repeated at the same name/step retain the last timestamp for the local JSON representation; this is not a lossless mirror of every MLflow history entry.

A normal repeat returns the latest local snapshot. Add `--refresh` to create another local run snapshot linked to the preceding capture. Earlier metric evidence remains unchanged, allowing existing research citations to retain their meaning. External artifact bytes are not automatically downloaded or copied by this import; the snapshot preserves their source location and metadata.

Imported runs do not have managed jobs, process control, inferred source provenance or a known training command. They cannot be launched or cancelled through MLStack.

## Boundaries

MLflow can store selected checkpoints, predictions, plots and configurations, but they must be emitted and selected. Checkpoint storage does not implement resuming training. The three protocol strings are declared identities, not transformed-data fingerprints or full data versioning. No model registry, automatic framework conversion, autologging, live system metrics or recursive dataset upload is added.

Use [the metrics contract](metrics.md) for accepted JSON and comparison rules, [the workflow guide](workflows.md) for approvals/modes, and [the validation record](validation.md) for actual tests and known limits.
