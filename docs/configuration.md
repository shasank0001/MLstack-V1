# Configure a provider and model

MLStack reuses Pi's provider configuration. It does not bundle a key or pick a replacement model when your selection is unavailable. Deterministic project commands work without a provider.

Run the following from the MLStack checkout after `npm ci --ignore-scripts` and `npm run build`.

## Existing Pi setup

If Pi already has a working provider and default model:

```bash
npm start -- --project ./examples/pytorch-project chat
```

Configuration normally lives under `~/.pi/agent/`. Set `PI_CODING_AGENT_DIR` to use a different directory. Project settings are read from the selected project's `.pi/settings.json`.

## New OpenRouter setup

In Bash, enter your own key without writing it in shell history:

```bash
read -r -s -p "OpenRouter API key: " OPENROUTER_API_KEY
printf '\n'
export OPENROUTER_API_KEY
```

The variable applies to this shell and its child processes. For persistent credentials, use Pi's credential store or your normal secret manager. Do not put a real key in project files or commit it to Git.

List configured and cached free model choices:

```bash
npm start -- --project ./examples/pytorch-project models
```

Copy a full `provider/model-id` from the output and pass it explicitly:

```text
npm start -- --project ./examples/pytorch-project chat --model PROVIDER/MODEL_ID
```

`PROVIDER/MODEL_ID` is a placeholder. For OpenRouter, the provider prefix is `openrouter/`; the remaining model ID may itself contain a slash. A zero-price catalog entry is not a guarantee of availability, remaining quota or tool support. Verify the exact model in the provider's live catalog if a request fails.

To save a default, merge these fields into Pi's existing `~/.pi/agent/settings.json`, using the actual ID you selected:

```json
{
  "defaultProvider": "openrouter",
  "defaultModel": "MODEL_ID_WITHOUT_THE_OPENROUTER_PROVIDER_PREFIX"
}
```

For a full selection `openrouter/vendor/model:free`, `defaultModel` is `vendor/model:free`. Preserve other settings already in the file. Once the interface opens, Pi's `/model` and `/login` menus remain available; `/models` is MLStack's catalog listing.

## A model is absent from Pi's catalog

An explicitly requested missing model triggers one provider-scoped refresh with a 15-second limit, unless `PI_OFFLINE` is set. No replacement is selected. A saved default that cannot be resolved is reported at startup.

If the provider lists the exact model but the installed Pi catalog does not, add a reviewed custom model entry in your private `~/.pi/agent/models.json`, following the installed guide at `node_modules/@earendil-works/pi-coding-agent/docs/models.md` or [upstream documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md). Use the provider's published API, supported inputs and token limits. Merge with existing entries; keep credentials out of model metadata committed to a repository.

The bundled guide is available after dependency installation and is not part of the source checkout. Current upstream documentation may describe a later Pi release; MLStack pins Pi 1.3.0.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `Configured model ... is unavailable` | List choices with the standalone `models` command, then supply an available exact `--model` selection. Check provider-prefixed versus model-only settings as described above. |
| Authentication fails | Check the selected provider, the environment variable in the current shell and Pi's credential store. Do not paste the key into an issue. |
| Free quota exhausted or rate limited | Wait for the provider's reset or explicitly choose another available model. MLStack does not silently switch to a paid model. |
| `ENOENT` for `/path/to/...` | Replace the placeholder with a real project directory, or use `./examples/pytorch-project`. |
| `SQLite is an experimental feature` | This is a Node.js warning. It does not prevent startup. |
| Interactive mode needs a terminal | Use a real terminal for chat; use deterministic CLI commands in scripts. |

## Python environments

The MLflow adapter uses `MLSTACK_PYTHON` when set; otherwise it tries this checkout's `.venv/bin/python`, then `python3`.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r python/requirements.txt
```

Training is separate: the approved run specification declares its interpreter and command. `MLSTACK_TRAIN_PYTHON` selects the CPU demonstration's training interpreter. `MLSTACK_TEST_MLFLOW_PYTHON` selects an adapter interpreter for MLflow integration tests. These variables take executable paths, not shell command strings.
