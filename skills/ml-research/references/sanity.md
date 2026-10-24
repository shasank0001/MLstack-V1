# Targeted training sanity checks

Use when a concrete uncertainty could invalidate a costly run. Select a check appropriate to the task and evidence; this reference is not a mandatory checklist before every experiment. Existing successful evidence may already answer the question.

Inspect the loss/output/target contract: shapes, dtype, label range, masks, reduction, and whether logits or probabilities are expected. Check preprocessing, train/evaluation mode, gradient flow, optimizer updates, and metric aggregation where relevant. A finite decreasing training loss does not establish correct evaluation or generalization.

Useful small checks include:

- A hand-computable metric/loss example to reveal label, masking, or denominator mistakes.
- A forward/backward/update check on a representative small batch to verify finite values and intended parameter updates.
- Overfitting a tiny clean subset when the model/task should permit it, to test the optimization path.
- An appropriate simple or constant baseline to detect a reversed metric, trivial target leakage, or an ineffective learning path.

Tiny-subset overfitting is a diagnostic, not a universal pass/fail gate: strong augmentation, regularization, frozen components, ambiguous labels, or the task itself can prevent perfect fit. Temporarily simplifying those conditions changes the diagnostic; record it and restore the intended configuration before a scientific comparison. Random-label or shuffled-target checks are optional discriminators, not mandatory expensive training jobs.

Choose the cheapest observation that addresses the uncertainty. In discuss/plan, explain the expected evidence without running the check. Short non-training computation requires approved act-mode analysis; any diagnostic training uses managed approval and a bounded timeout. Do not conceal failed checks by dropping invalid values or weakening assertions until they pass.

Report what the check establishes and what remains untested. Passing a one-batch update check validates that path; it does not establish stable long-run training, capture integrity, or improved quality.

Source basis: [Google's ML engineering rules](https://developers.google.com/machine-learning/guides/rules-of-ml) on pipeline correctness and simple baselines. The diagnostic choices above are original task-dependent MLStack guidance.
