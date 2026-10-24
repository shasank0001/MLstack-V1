# Reuse existing MLflow tracking

Use when existing MLflow evidence, tracking integration, or a sync failure matters. This is a restricted original adaptation of [official MLflow onboarding](https://github.com/mlflow/skills/blob/main/mlflow-onboarding/SKILL.md), not a requirement to install its skill pack.

First distinguish training/deep-learning experiment tracking from GenAI application tracing, judges, and prompt management. Infer from the requested task and relevant code; ask only if that distinction remains consequentially unclear. A PyTorch training problem does not need a GenAI tracing stack.

Inspect the project's existing tracking configuration and supported MLStack adapter path. Reuse a working environment, tracking URI, experiment, and authentication rather than replacing service configuration or starting another server. Do not expose tokens or connection secrets. Missing setup calls for a scoped proposal, not automatic package installation, global configuration, cloud registration, or artifact upload.

Read local run evidence and sync status separately. A completed local run with valid metrics remains usable when MLflow sync fails; do not retrain to repair a tracking-only failure. Check the actual adapter/environment error and intended destination before proposing a fix. Conversely, a remote run's presence does not establish local process success or evaluation fairness.

Use existing import/read capabilities when available, preserving external run identity and provenance. Do not mix stale remote metrics into a new local run or invent missing measurements. Service writes/retries require their own supported act-mode scope and approval; this guide grants none. Stop once the requested evidence or integration uncertainty is resolved.
