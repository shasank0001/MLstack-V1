# Prediction-level error analysis

Use when the user asks which examples fail, why a model fails on a slice, or what targeted data/model change may help. Aggregate run scores and training logs alone cannot support this analysis.

## Require the appropriate evidence

Locate per-example predictions with stable example identifiers, targets/reference outputs, and the relevant scores or generated outputs. Establish split, checkpoint, preprocessing, label mapping, and metric definition; confirm that examples align with predictions. Probabilities/logits and thresholds may be needed for calibration or decision analysis. If these artifacts are absent, state the limitation and propose a bounded capture/evaluation path. Do not invent a confusion matrix or failure examples from aggregate accuracy.

Read existing small artifacts in discuss mode. Generating predictions, aggregating a large artifact with code, or changing a capture path requires approved act-mode work. Preserve privacy and access constraints when displaying examples.

## Separate patterns from explanations

Choose task-appropriate categories: confusion pairs/false positives and negatives, residual magnitude/bias, ranking failures, or generation failure types. Inspect representative successes as well as failures. Check label ambiguity and annotation errors before attributing every disagreement to the model.

Use slices motivated by the task or observed hypothesis, with denominators and sample selection. Report support counts and uncertainty when available; a high error rate in three examples is weak evidence of a population pattern. Repeatedly searching slices on held-out data can overfit analysis. Distinguish exploratory findings from separately validated effects.

Compare models on aligned examples under the same evaluation. An example where one wins is evidence about that example, not proof of a general mechanism. Separate observed association, plausible explanation, and the experiment needed to test it.

Return a small set of consequential patterns with evidence pointers and a bounded follow-up: fix a demonstrated label/loader problem, test a specific transformation, or collect more relevant examples. Do not relabel data, change thresholds, or launch retraining automatically.
