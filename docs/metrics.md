# JSON metrics contract

The initial adapter reads one complete JSON document after the process exits. It does not parse arbitrary console messages or continuously ingest partially written files.

```json
{
  "schema_version": 1,
  "metrics": [
    { "name": "train_loss", "value": 0.52, "step": 0 },
    { "name": "val_accuracy", "value": 0.81, "step": 0 },
    { "name": "val_accuracy", "value": 0.84, "step": 1, "timestamp": 1792584000000 }
  ]
}
```

The machine-readable contract is in `metrics.schema.json`. Names must contain a non-whitespace character and be at most 250 characters. Values must be finite numbers. Steps are nonnegative safe integers; timestamps, when supplied, are nonnegative integer Unix epoch milliseconds. Each `(name, step)` pair must be unique. A document must contain between 1 and 100,000 points and be no larger than 32 MiB. Unknown fields are rejected. NaN and Infinity are not valid JSON/metric values.

The supervisor supplies `MLSTACK_RUN_ID` and `MLSTACK_METRICS_PATH` to the training command. By default the output path is unique to the run, under `.mlstack/runs/RUN_ID/metrics.json`. Prefer using that environment variable in instrumentation. The source can remain unmodified for command/log capture; structured metrics require an existing supported output or an opt-in logging change.

A run spec may instead set `metrics_file` to an output path inside the project. That file must not exist before launch: MLStack rejects existing outputs to avoid attributing stale measurements to a new run. Choose a fresh path for each run. Paths outside the repository, including escaping symlinks, are rejected.

Write to a temporary file and rename it into place when the document is complete. The example training script demonstrates this pattern. The consumer waits for process exit, so partially written or malformed files become a visible ingestion error. Absence is `not_available`, never an inferred value of zero. A nonzero process exit remains failed even if some valid metrics were written.

MLStack saves `metrics.snapshot.json` for convenience and creates a content-addressed snapshot under `.mlstack/evidence/`. The run stores its SHA-256 reference; readers verify the snapshot before using its metric values. With the Python helper installed, the supervisor then synchronizes metrics, parameters, and small artifacts to project-local MLflow. A failed MLflow sync is separately recorded and can be retried. It does not change the process exit outcome or erase local evidence. Identical metric-document retries reuse their external MLflow revision. A changed re-ingested document creates a separate revision keyed by content digest, preserving the earlier external metrics; `mlstack.run_id` groups the logical run and `mlstack.previous_revision` links its revisions when available.

`ingest RUN_ID` retries reading the configured output after execution. The event journal records ingestion attempts. Successful re-ingestion moves the run's current metric reference to the new content-addressed snapshot; earlier artifacts remain available. If MLflow already holds an older revision, the local sync status is marked stale until the latest evidence is published with `sync-mlflow`. Recorded comparisons retain their numeric values. New research records pin the evidence available when recorded, including metric snapshot references, and recall checks for missing or changed artifacts and newer metric evidence for the same runs. Historical records without pinned artifacts are labeled `unpinned`. An intact older snapshot supports the original observation, but the model must assess whether newer results require a corrected finding. These checks do not automatically validate the scientific claim or every current ingestion condition.

Multi-run `experiment_read` inspection supplies compatibility facts and observed values without creating a comparison record; `/compare` creates a recorded comparison. Comparison uses the highest available step for the selected primary metric. It compares declared dataset, split, evaluation identity, metric name, and direction. Compatibility means those declared identities match; it does not prove the evaluation implementation is correct. Different training durations, stochasticity, checkpoint-selection rules, or preprocessing must be represented in the evaluation identity when they affect the meaning of the result.

Imported MLflow snapshots normalize repeated points at the same metric/step to the last timestamp. Imported provenance remains unknown unless explicitly supplied through the import context. Import never grants process control or writes back to the external tracking store.
