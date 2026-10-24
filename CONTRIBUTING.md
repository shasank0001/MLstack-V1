# Working on MLStack

MLStack is an early Linux-only project. Use GitHub issues for reproducible bugs and feature discussions; include the command, expected behavior and relevant redacted output. Do not attach credentials, private datasets or complete local state directories.

The repository currently has no project license. No contribution license agreement is defined.

## Local setup

Use Node.js 22.19+ and npm:

```bash
npm ci --ignore-scripts
npm run check
npm test
```

For real MLflow integration tests, create the adapter environment first:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r python/requirements.txt
npm test
```

Alternatively, set `MLSTACK_TEST_MLFLOW_PYTHON` to an interpreter with those dependencies. Without it or `.venv/bin/python`, the MLflow tests report explicit skips. The ordinary test suite makes no AI generation calls.

The optional synthetic CPU demo also needs a training interpreter with PyTorch. See the [quick start](README.md#try-the-cpu-demo).

## Repository layout

```text
cli.ts                    CLI and Pi terminal runtime
src/                      Agent policy, execution, evidence, memory and storage
python/                   MLflow adapter and pinned requirements
skills/                   Two bundled skills and on-demand references
examples/pytorch-project/ Synthetic CPU training example and run specifications
test/                     Unit, regression and integration tests
scripts/                  Optional live agent and skill evaluators
docs/                     Guides, design notes and validation summaries
plan.md                   Persistent project progress and roadmap
```

Keep fixes focused. For execution or persistence changes, check the relevant refusal, retry, source-change and process-lifecycle behavior. A software test passing does not validate an ML result or scientific claim.

## Optional live evaluations

Live evaluations consume provider quota and require an available configured model. Set `MLSTACK_LIVE_MODEL` explicitly to a model you are authorized to use before running:

```bash
npm run test:workflows
npm run test:skills
```

Both scripts also accept `--model PROVIDER/MODEL`. Inspect their current behavior before using them against a new provider. Reports and scratch projects go under the ignored `work/` directory. Never commit credentials, generated provider configuration, local databases or full raw conversations.

## Documentation

Keep the README focused on getting started. Put detailed contracts and procedures in `docs/`, link them from the README and update `plan.md` when project scope or validation changes. Describe limitations and observed results accurately; keep historical validation separate from current checks.

## Dependency maintenance

Pi stays pinned to 1.3.0. The root package overrides its transitive Undici to 8.12.2 and the optional Zod peers to 4.6.6 to address the advisories reviewed during repository preparation. Keep these overrides and the lockfile consistent; rerun the SDK and integration tests when changing them. `npm audit` reports the current registry advisory state, which can change after a passing check.
