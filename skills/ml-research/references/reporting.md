# Local reports from captured evidence

Use when the user requests a research summary or saved report. Read selected run evidence, relevant project decisions, and actual artifacts. Prefer the smallest report that answers the audience's question; a report is not an automatic publishing workflow.

For a saved report, use `docs/ml-report.md` when host document permissions allow it. Do not automatically create a new project brief or delivery plan. Discuss mode can return prose but cannot write files; plan mode can write the permitted report but cannot execute missing analysis or update preference/context memory. Mark missing results explicitly instead of inventing them to complete a template.

Include the question and scope, baseline/method, data/split/evaluation, material configuration/resource differences, results, limitations, and the next supported decision when useful. Link run IDs and local artifacts so consequential claims can be checked. Use primary literature/documentation links for external claims; do not cite a remembered URL as evidence that it was inspected.

Keep process outcome, metric ingestion, and tracking sync separate. A completed command with missing metrics is not a successful quality result. Show metric units/direction and how selected values were aggregated. Distinguish absolute changes from relative percentages and account for failed attempts or selection that affects the conclusion.

Separate measured results from hypotheses, recommendations, and unexecuted proposals. State uncertainty appropriate to available evidence: training-seed variation, held-out sampling, or a descriptive single observation. A passing runtime test shows the integration works; it does not prove the skill improves scientific decisions or model quality. Such a causal claim requires an appropriate comparison.

Keep sensitive examples and bulky raw logs out of the prose; link permitted local artifacts instead. Never upload the report, dataset, run artifacts, or session to Hugging Face, MLflow, a document service, or any external destination merely because a report was requested. External publication requires its own user scope and supported permissions.
