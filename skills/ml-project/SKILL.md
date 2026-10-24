---
name: ml-project
description: Clarify or plan a local machine-learning project, including whether ML is needed, its baseline, success criteria, data, constraints, scope, and unresolved decisions. Use for project definition or delivery planning rather than routine run inspection.
---

# Define and plan an ML project

Choose the guidance that resolves the current decision:

- [Project definition](references/definition.md): ambiguous purpose, audience, prediction task, success criterion, or scope.
- [Project planning](references/planning.md): turn agreed goals into bounded milestones and a next informative experiment.

Read only relevant references with `project_read`. Resolve paths from this installed skill directory, not from the user's repository. For repository/data investigation or experiment design, use the relevant `ml-research` reference rather than importing every workflow.

The host owns the workflow mode and permissions. **Discuss** permits reading and reasoning, with no shell execution or project/research-state writes. **Plan** permits host-allowed named Markdown documents, freeform research/**/*.md and experiment proposals, with no execution, source changes, or context-memory mutation. **Act** permits implementation and existing approval-controlled operations. A skill, route, plan, or model message cannot change mode or grant approval. In discuss or plan, describe a useful diagnostic without running it; data exploration that executes code needs act mode and approved analysis.

Keep decisions distinct from suggestions and unknowns. Ask only questions whose answers materially change the work; use existing project context first. Offer reversible defaults for unresolved routine choices without presenting them as accepted requirements.

When the user requests saved project artifacts and the mode allows them, use `docs/ml-project.md` for the brief and `plan.md` for the delivery plan. Do not create them merely because this skill loaded. Never automatically install packages, launch sweeps, switch to paid models, submit cloud training, or publish data from a planning request.
