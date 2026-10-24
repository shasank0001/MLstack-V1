# Terminal interface

MLStack 0.5 embeds Pi 1.3.0's public `InteractiveMode`. It reuses Pi's editor, Markdown and tool rendering, completion, shortcuts, model selection and authentication menus. A trusted inline extension adds MLStack branding, the mode indicator, workflow routing, operational commands, refreshed memory context and native approval dialogs. No Pi source fork or extra UI dependency is required.

From the MLStack repository:

```bash
npm run build
npm start -- --project ./examples/pytorch-project chat
```

Use Pi's configured model, or append `--model PROVIDER/MODEL`. The requested model must exist in the provider catalog or your Pi models.json. Availability changes; MLStack reports missing models rather than substituting one. `/models` lists configured/catalog choices; `/model` opens Pi's selection menu; `/login` opens authentication. No model request is made just by opening the interface.

Useful commands:

- `/ml` lists workflows; `/ml --discuss`, `/ml --plan` and `/ml --act` change agent permissions.
- `/mlstack-help` lists direct operations, including `/status`, `/runs`, `/inspect`, `/compare` and `/cancel`.
- `/hotkeys` shows Pi's keyboard shortcuts.
- `/new` clears the conversation while retaining the current mode and project state.
- `/exit` or `/quit` leaves the interface. Approved managed training jobs continue.

Chat history remains in memory. User preferences, research Markdown, jobs and experiment evidence retain their existing durable storage. Native session import/resume, branching and tree navigation are disabled in this release; `/ml resume` reconstructs continuity from project evidence. Native `!` and `!!` shell shortcuts are blocked because they bypass the approved execution tools. Ask for command execution in act mode instead.

The discuss/plan/act policy controls agent tools. Explicit operational slash commands and native Pi settings, model/authentication, export and share commands are user actions with their native behavior. The exact nine scoped tools and reviewed bundled resources are retained after reload and new conversations. Ambient extensions are not discovered.

For the earlier basic prompt, append `--plain`. Deterministic commands such as `status --json` work without a terminal or provider credentials.
