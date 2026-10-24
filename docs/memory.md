# Preferences, project context and research

MLStack 0.4 keeps three kinds of knowledge separate: small lasting preferences/context in SQLite, research in ordinary Markdown, and experiment measurements/artifacts in MLflow with local immutable captures. The new preference store uses Node's built-in SQLite; it has no memory-framework dependency, embedding model, vector database or generation call.

## Save or correct a preference

```bash
npm start -- --project /path/to/project memory record \
  --scope user --key response-style --text "Use concise explanations with concrete examples."
npm start -- --project /path/to/project memory record \
  --scope project --key training-environment --text "Use /path/to/training-env/bin/python."
```

Use user scope for defaults across projects, project scope for this project's stable facts and constraints. Prefer explicit durable statements; do not store temporary plans, raw transcripts, credentials or numeric research findings here. Agent-created entries are labeled with their source, rather than treated as confirmed user statements automatically.

A record has an ID, scope, stable key, text, source and update time. Keys are 1–120 characters and text is 1–4,000 characters. Recording the same key in the same scope updates the current value and retains its ID. The preference store does not keep correction history. Reusing an operation ID through the API is idempotent; reusing it for different content fails.

```bash
npm start -- --project /path/to/project memory status
npm start -- --project /path/to/project memory list --scope all
npm start -- --project /path/to/project memory search training environment --scope project
npm start -- --project /path/to/project memory forget MEMORY_ID --scope project
```

Search is ordinary case-insensitive text matching over key and text: every query term must occur. There is no semantic similarity ranking. Status reports the actual database path and any read/write error. Writes commit synchronously or report failure; no background retry queue is implied.

Forget removes the active record and its operation receipts. It does not remove external backups, filesystem snapshots or earlier text already present in an open conversation. No application-level preference correction history is stored.

## Storage and scope

The default database is:

```text
~/.config/mlstack/memory/context.sqlite
```

`XDG_CONFIG_HOME` changes the configuration base. `MLSTACK_HOME` overrides the MLStack home directly, making the database `$MLSTACK_HOME/memory/context.sqlite`.

The database contains one user namespace and separate project namespaces keyed by MLStack's persistent project ID. Opening another project does not expose its project-scoped entries. Keeping the same project state preserves that identity when reopening; copying `.mlstack` also copies its identity and should be treated deliberately.

List/search/status/snapshot use read-only access and do not create a missing memory database or directory. Recording the first entry initializes storage. This is separate from opening a project, which can initialize its project-local `.mlstack` execution state.

## What the agent sees

Before each user prompt, the host rebuilds a small context snapshot from current preferences and project context. The default budget for selected preference text and labels is 6,000 characters; serialized record IDs/timestamps add metadata. Project entries take priority; a project key hides the user entry with the same key in this snapshot. Both scoped entries remain available through list/search. Model-facing list/search returns at most 50 entries with explicit total/omission counts; the deterministic CLI can list the full small store.

The snapshot labels scope, key and source. Budget omissions and access failures are reported, so the agent can request more information instead of assuming the snapshot is complete. New corrections appear on the next prompt. Earlier conversation text remains in the session, so the agent is instructed to prefer the refreshed snapshot and current user instructions.

The model's `memory` tool offers status/list/search and act-mode record/forget. Discuss and plan may read memory; changing it requires act. These mode checks apply to agent tools. Direct memory CLI commands are explicit user operations and do not require model credentials.

## Research stays flexible

Create any useful Markdown files under `research/`, including subdirectories:

```text
research/data-notes.md
research/learning-rate.md
research/evaluation/validation-protocol.md
```

There is no mandatory document template, required heading set or research schema. The agent can reorganize files as work evolves. Include run/evidence references where a conclusion depends on measurements, and retain limitations when correcting an interpretation. MLStack does not automatically prove that a written claim follows from an artifact.

The host supplies a bounded research index with paths, titles and modification times. The agent reads relevant files on demand instead of injecting all research text into every prompt. `/research` lists the index. Symlinks are skipped and discovery has file-size, traversal and result limits; the index is a convenience, not a complete full-text search system. Ordinary project read/search tools remain available.

Plan mode permits exact project-relative `research/**/*.md` writes, plus the named planning documents in [the workflow guide](workflows.md). Canonical paths are required; aliases and escaping paths are rejected. Discuss remains read-only.

## Bring earlier research forward

```bash
npm start -- --project /path/to/project export-research
```

The explicit exporter copies legacy structured records and `.mlstack/project.md` / `.mlstack/research.md` into `research/legacy/`. It retains source IDs, correction links, limitations, evidence links and original records. Those exported headings are a migration format, not a rule for future research files.

Repeating export leaves unchanged documents alone and preserves edited generated files. Changed legacy source receives a distinct digest-suffixed filename. Nothing is automatically promoted into preference memory. Legacy `remember`, `recall` and `supersede` commands remain available for archive compatibility; the old `research_memory` model tool is replaced by `memory`.

Workbench conversations remain in memory during the application session. `/new` clears that conversation; saved preferences, research files and jobs remain. `/ml resume` reconstructs context from these sources and experiment records, rather than restoring an unsaved transcript.
