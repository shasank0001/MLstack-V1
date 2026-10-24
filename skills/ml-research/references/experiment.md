# Controlled experiment proposals

Use when choosing the next informative test. Read relevant prior runs and decisions before proposing another attempt. A proposal is not an approved launch; plan mode may create proposals and permitted named Markdown documents but cannot execute or mutate preference/context memory.

## Make the question answerable

State the hypothesis, baseline evidence, controlled change, primary metric/direction, fixed evaluation, expected cost, and what result would change the next decision. Include command/config, source scope, timeout, available hardware, data/split/evaluation identities, and a stop condition where known. Keep unknown identities null rather than manufacturing compatibility. Distinguish a path/capture smoke test from a scientific comparison.

Choose the smallest experiment that distinguishes plausible explanations. An ablation isolates a mechanism; a parameter search selects a configuration; repeated seeds estimate training variability. They answer different questions. Avoid changing the dataset, optimizer, architecture, and evaluator together when attributing an effect to one of them.

## Match fairness to the claim

A matched single change is useful for causal diagnosis. Comparing tuned systems may instead require a declared tuning protocol with appropriate search spaces, validation access, attempts, and compute/time budgets. Equal parameter values or an equal number of trials are not always fair across different methods. Report the selection resources each method received and any material asymmetry; never silently give the favored method more validation looks. Keep final test data out of tuning.

Predeclare useful stopping/selection rules when they affect interpretation. One seed may suffice for a cheap discriminator; it does not measure seed variability. Choose repetitions or example-level uncertainty analysis according to the intended claim and available evidence, not a mandatory universal run count.

## Bound execution

Propose an explicit number or range of attempts within the user's resource scope. Host timeouts do not enforce a GPU-memory, financial, or full-study budget. Never auto-launch a sweep or infer batch approval from a plan. Launch training, including diagnostics, only through existing managed execution in act mode with host approval. Changed source/config needs the applicable fresh approval.

After an approved result, retain failed/inconclusive hypotheses and distinguish observed values from explanations. Choose the next action from the evidence; an exhausted budget is a valid stopping point.

Source basis: [Google ML engineering rules](https://developers.google.com/machine-learning/guides/rules-of-ml) on sound infrastructure and useful baselines, adapted to MLStack's controlled local execution.
