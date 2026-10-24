# Measured performance changes

Use only when runtime, throughput, memory, or compute cost is the requested problem. Do not add profiling to routine experiment work.

## Define the measurement

Identify workload: model, device, batch/shape, precision, data path, concurrency, and whether the target is end-to-end completion, steady-state throughput, latency, or peak memory. Include a correctness/quality constraint so a faster different task is not accepted as a win. Measure a baseline before claiming a bottleneck.

Use a representative small case, warm up initialization/compilation, and hold workload, threads, device, and timing boundaries fixed. Accelerator work is asynchronous: complete relevant work inside the timed boundary or use appropriate device events. Include data-loading/transfers if the user's metric includes them. Report sample count and spread, not just the fastest result. Inspect installed dependencies before choosing a version-specific API.

## Localize, then measure without instrumentation

A targeted profiler can distinguish loading, CPU work, transfers, kernels, or synchronization. Overhead can change behavior; a trace locates candidates but is not the final speedup benchmark. Summarize relevant intervals rather than dumping huge traces into context.

Make one supported change, repeat the same unprofiled measurement, and check outputs/quality. Compare warm with warm, retain unsuccessful attempts, and undo complexity that does not earn its place. Memory metrics need a boundary: allocated, reserved, and device-wide usage answer different questions. A lower sampled peak does not establish that a leak is fixed.

## Bound the work

Training/performance experiments use managed approval; short isolated analysis uses approved `project_bash`. Current limits are wall time, not hard memory/GPU/concurrency budgets or approval for autonomous batches. Propose expected attempts and a stop condition. Do not inherit external cookbook iteration quotas, paid model routing, cloud submission, or automatic publishing.

Report baseline/new measurements, workload/timing boundary, variation, correctness checks, and whether the gain merits the change. No stable baseline or an effect below noise means an unverified gain, not an invented bottleneck.

Source basis: [PyTorch benchmark recipe](https://docs.pytorch.org/tutorials/recipes/recipes/benchmark.html) and [profiler recipe](https://docs.pytorch.org/tutorials/recipes/recipes/profiler_recipe.html), restricted to existing local facilities and host-approved execution.
