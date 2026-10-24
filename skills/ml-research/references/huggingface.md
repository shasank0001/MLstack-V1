# Bounded Hugging Face assistance

Use only for a relevant HF dataset or inference-memory question. These are original restricted adaptations of the official skills linked below. They add no external resource, tool, installation, network permission, or upload authorization to MLStack. If the host has no allowed remote-read path, explain the missing access and use supplied/local artifacts.

## Dataset details

Confirm repository identity, configuration/subset, and split before interpreting rows. With an available authorized read path, Dataset Viewer metadata and a small preview can resolve schema/label questions without downloading the corpus. Request only the needed rows; record sample scope, total counts when supplied, and partial-response limits. A preview does not establish full-dataset frequencies or rule out leakage. Inspect license/access conditions before proposing acquisition. Use existing authenticated access without displaying secrets; private/gated access is not permission to republish. Never upload sessions or project data as an exploration step.

Source: [HF Dataset Viewer skill](https://github.com/huggingface/skills/blob/main/skills/huggingface-datasets/SKILL.md). MLStack adopts bounded configuration/split/preview/metadata reasoning; bulk extraction and additional CLI skills are outside this adaptation.

## Inference-memory estimates

Identify model/revision and weight format/precision; for GGUF identify the actual quantized file. Separate weight storage from optional KV-cache estimates, specifying batch size, sequence length, and cache dtype. Label estimates and assumptions. They are not a training-memory calculation or a guarantee a model fits: runtime workspace, activations, framework/allocator overhead, implementation, and other device users can matter. Confirm actual peak usage only with separately approved execution.

Use an already available estimator only within host mode/approval rules. Do not run upstream `uvx` commands that implicitly fetch/install software or download weights automatically. When tooling/access is missing, give a qualified calculation or proposal and state its limits.

Source: [HF memory-estimation skill](https://github.com/huggingface/skills/blob/main/skills/hf-mem/SKILL.md). MLStack adopts inference weight/KV reasoning, not upstream execution defaults.
