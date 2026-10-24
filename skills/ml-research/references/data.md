# Bounded data investigation

Use when a concrete data uncertainty affects the task, evaluation, or next experiment. Begin with available schema, dataset documentation, loader code, and captured artifacts. A data route in discuss mode authorizes reads and reasoning only; computational exploration requires approved act-mode execution.

## Establish the data contract

Identify what one row/example represents, the target, when features become available, and which examples belong to the intended evaluation population. Distinguish dataset version, subset/configuration, split, sampling method, and transformations. Unknown provenance or split identity remains unknown. For a Hugging Face source, use [the HF reference](huggingface.md) only when remote dataset details are actually needed.

Check the uncertainty that could change the decision: missingness, label range/type, invalid values, imbalance, duplicate/group overlap, time ordering, outliers, or train/evaluation distribution differences. Choose a bounded sample or aggregate that can answer it. Record sample selection and limits; the first few rows do not establish population frequencies, completeness, or absence of leakage.

## Keep transformations inside evaluation

Split at the appropriate unit before fitting learned preprocessing. Fit scalers, imputers, vocabularies, feature selection, resampling, and learned transformations on training data only, then apply the fitted result to held-out data. Respect entity/time boundaries and feature availability at inference. A target-correlated feature is not automatically useful if its value is produced after the decision.

Propose a feature or cleaning change with its hypothesis and an unchanged evaluation. Separate correction of objectively invalid data from selection based on validation performance. Keep final test data out of repeated exploratory selection; document any unavoidable exposure.

Return the observed property, its scope, and the next consequential check or proposal. Do not download a whole corpus, rewrite the pipeline, or enumerate unrelated plots because EDA was requested. Do not copy sensitive examples into reports or upload data as an exploration default.

Source basis: [scikit-learn common pitfalls](https://scikit-learn.org/stable/common_pitfalls.html), especially inconsistent preprocessing and data leakage. This is original MLStack guidance.
