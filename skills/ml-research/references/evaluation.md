# Evaluation integrity and conclusions

Use when interpreting a comparison, reviewing evaluation code, or choosing a controlled follow-up. A higher score is an observation; its meaning depends on how it was produced.

## Check meaning before magnitude

Read selected runs together for actual primary values, direction, verified evidence, and declared compatibility. Inspect code/config only where needed to establish omitted conditions:

- Dataset version and unit of independence; split membership, group/time boundaries, duplicates/overlap.
- Preprocessing fitted only on training data; feature availability at prediction time; target-derived features/augmentation leakage.
- Evaluation mode, masking, metric scale/denominator, and averaging/weighting.
- Checkpoint selection/stopping rule, validation looks/hyperparameter attempts, whether test data influenced selection.
- Training/data/compute budgets, seeds, and meaningful code changes.

Matching protocol strings do not establish fairness. Different training code is normal in many legitimate comparisons; explain whether evaluation meaning is preserved. Never assign matching identities to repair a mismatch. Application compatibility can pass while code reveals leakage or changed checkpoint selection.

Examples: a scaler fitted before splitting leaks held-out information; final versus validation-selected best checkpoint changes selection; unweighted means of batch means change scores when batch sizes differ.

Code can establish a leakage path without establishing its observed effect. Do not infer the direction or size of the score bias, a regularization change, or identical split membership from a seed alone; check the relevant data/order/configuration or label the condition. Treat user-reported scores separately from captured run evidence. A matching score in a follow-up does not by itself establish which mechanism caused the original gap.

## State the supported claim

Give actual values and run IDs. Distinguish absolute differences and relative percentages: accuracy 0.50 to 0.55 is 0.05 absolute, or 5 percentage points, not 5% relative improvement. Use documented aggregation rather than a convenient last point or best intermediate score. MLStack compares the highest captured step by default; state when that differs from the desired evaluation.

Separate training-seed variability from uncertainty across held-out examples. One run per configuration does not estimate seed variability. Aggregate scores alone do not establish significance. Paired per-example predictions can answer other statistical questions under sampling assumptions; repeated seeds do not fix leakage. Avoid blanket claims that no interval or test could ever be computed for one trained model.

A fair synthetic/single-seed result can be useful within scope. Two aggregate scores do not establish a universally better learning rate, underfitting mechanism, or significance. State the unknown that matters without listing every hypothetical issue.

## Choose the next useful check

First resolve evaluation flaws or missing measurements. Otherwise choose the cheapest check relevant to the claim: one controlled change, fixed evaluation, and a criterion for accepting/rejecting the hypothesis. Ablations isolate mechanisms; repeated seeds assess training variability; held-out evaluation assesses the selected configuration under its sampling assumptions.

Propose a bounded plan with expected cost/stop condition. Do not launch a sweep merely because it would be interesting. Keep final test data out of tuning. In plan or act mode, preserve useful rejected attempts/limitations and correct overbroad conclusions in relevant research Markdown. Keep the evidence and explanation for a changed conclusion; choose the document organization that suits the work.

When preprocessing is invalid, first compare the corrected candidate against a valid baseline on the fixed split. Do not require another leaky run to make a recommendation; reproducing a flawed path is a separate diagnostic only when that question matters. Keep every proposed arm consistent with its stated controls. Add repetitions only when the intended claim needs them, rather than prescribing a universal seed count or selection procedure.

Source basis: [scikit-learn common pitfalls](https://scikit-learn.org/stable/common_pitfalls.html) and [PyTorch reproducibility](https://docs.pytorch.org/docs/stable/notes/randomness.html). Statistical-claim and compatibility guidance is original MLStack interpretation, not a guarantee from these sources.
