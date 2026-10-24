# Define the project before optimizing a score

Use when the objective is vague or important product and technical decisions are still mixed together. Establish the decision the system will support before selecting a model architecture.

Identify the users, the current workflow and its concrete failure or cost. Define the prediction or generation task, what information exists at decision time, and how users will act on its output. Check whether a rule, search, simpler statistical method, or existing process is an adequate baseline. A project may legitimately end with that baseline when ML adds insufficient value.

Separate three kinds of success: user/workflow benefit, model performance under a defined evaluation, and operational constraints such as latency, local memory or reproducibility. State metric direction, evaluation population and a useful acceptance threshold when known. An attractive benchmark score is not automatically the product success criterion.

Establish available data, target construction, ownership/access limitations and the unit used for splitting. Identify whether time, person, device or group boundaries matter. Record the evaluation set's role and how model/configuration selection will avoid repeatedly tuning on final test data. Unknown provenance or labels remain unknown; do not invent a dataset identity.

Bound the initial release by local hardware, CPU/GPU availability, time, dependencies and user-approved spending. Choose a small complete workflow, including evidence capture and review, before proposing integrations or autonomous sweeps. Distinguish included capabilities, explicit exclusions, proposed defaults and technical choices needing validation.

Return a concise project definition plus the few unresolved questions that block consequential choices. If asked to save it, write `docs/ml-project.md` only in a mode permitting document writes. The brief should record goals/users, why ML may help, baseline, success/evaluation, data, resources, scope and open decisions. It is a decision record, not approval to execute its proposed experiments.
