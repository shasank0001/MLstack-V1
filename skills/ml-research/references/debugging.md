# Evidence-driven ML debugging

Use when a run fails or expected evidence is missing. Establish which layer failed before changing training code.

## Separate outcomes

Read the selected run with logs: actual command/spec, exit status/signal, ingestion status/error, and tracking status/error. These are independent:

| Observation | Investigate first |
| --- | --- |
| Nonzero exit or signal | Actual traceback, termination reason/limits, implicated code/config |
| Process completed, metrics unavailable | Expected writer/path, evaluation branch, whether output was produced |
| Process completed, ingestion failed | Structure/types, finite values, duplicate points, partial/stale output |
| Local metrics valid, MLflow sync failed | Adapter/environment/tracking error; retain local evidence |
| Missing supervisor and live/unknown child | Existing managed recovery/stop; never relaunch or signal an unverified PID |

Do not rerun training solely because tracking failed, rewrite metrics to hide an error, or change the algorithm to fix serialization. Partial valid evidence does not turn a failed process into success.

## Resolve uncertainty cheaply

A captured traceback and matching source may already locate the failure. Inspect the relevant path and retain the actual exception. Form hypotheses only to choose a discriminating next check. Short approved analysis can test non-training questions; diagnostic training still needs a managed run.

For NaN/Inf, locate the earliest observed finite/nonfinite boundary: inputs, forward outputs, loss, gradients, parameter update, serialization. The first invalid value can precede the operation that raises. A JSON error after all epochs establishes serialization failure, not that the optimizer rejected an argument. Read the implementation before attributing library behavior. Additional assertions, anomaly detection, or tensor summaries may localize the mechanism; they add overhead and should be removed/disabled once answered.

For out-of-memory reports, inspect device/allocator messages, shapes/batch, retained tensors, and measurement context. Exit 137 alone does not establish GPU OOM. Shared occupancy and leaks remain hypotheses until observed. Do not clear unrelated processes or caches to make a test pass.

Unexpected scores belong to evaluation inspection, not automatically process debugging. Avoid loading both playbooks when the captured failure already has an adequate explanation.

## Verify the proposed fix

If a fix is requested, change the smallest supported mechanism. Prefer a cheap local reproduction; training-dependent verification needs an approved bounded run, not unlimited retries. Check the original failure plus behavior the change could disturb. If execution is refused or cannot be checked, state what is unverified rather than reporting expected output as observed.

Report observed failure, supported mechanism, any fix/check performed, and remaining uncertainty. A refused diagnostic remains unexecuted while its proposal can still exist. Save an observation only in act mode when it helps future work, with the correct run evidence and scope.

Source basis: [PyTorch numerical accuracy](https://docs.pytorch.org/docs/stable/notes/numerical_accuracy.html) and [autograd anomaly detection](https://docs.pytorch.org/docs/stable/autograd.html#debugging-and-anomaly-detection). The boundary and host-execution guidance is original MLStack adaptation.
