# Scope a reproduction honestly

Use when reproducing a paper, repository result, or published number. Establish the exact claim and available source: paper/version, code commit, dataset/version, split, checkpoint, metric/evaluator, and reported resource budget. Access the primary source when available; summaries and model cards may omit consequential details.

Distinguish verifying a released checkpoint, rerunning supplied training code, and independently reimplementing a method. These support different conclusions. Decide which is requested before substituting a cheaper task. Read the project's documented environment and entrypoint before proposing dependency or hardware changes.

Record known conditions and explicit gaps: preprocessing, architecture, initialization, optimizer/schedule, stopping/checkpoint selection, augmentation, precision, evaluation protocol, seeds, and tuning access. Focus on conditions relevant to the claim rather than reconstructing an exhaustive environment inventory. A matching seed does not guarantee identical results across devices or software releases.

Plan the smallest useful stage: inspect/evaluate supplied artifacts, validate capture with a bounded smoke run, then attempt the scoped reproduction. State expected time/hardware/storage and a stopping condition. Downloading restricted data, fetching large checkpoints, installing packages, or submitting cloud training is not implied by a request to plan. Training requires existing act-mode approval; never automatically escalate local resource limits to cloud compute.

Maintain a compact deviation record linking each difference to its likely consequence or an explicit unknown. A different dataset, reduced training budget, or alternate metric may be a useful adaptation but does not reproduce the original number. Failure to match the score is not proof the published result is false; distinguish missing conditions, implementation defects, stochastic variation, and unresolved discrepancy.

Report target claim, actual protocol, captured evidence, deviations, and the degree of reproduction achieved. If the user requests a saved report, use [reporting](reporting.md). Do not mark a documented plan as a completed reproduction.

Source basis: [PyTorch reproducibility notes](https://docs.pytorch.org/docs/stable/notes/randomness.html) on randomness, deterministic execution, and cross-environment limitations.
