# Prompt Output Compaction Plan

## Goal

Reduce LLM output tokens in the portrait builder pipeline without changing the existing pipeline stages, file layout, run artifacts, or API call flow.

## Scope

Keep these unchanged:

- Stage order and branching logic.
- How records are restored, split, merged, normalized, stored, and applied.
- Existing portrait JSON schema after normalization.
- Existing run files such as `results.jsonl`, `portraits.json`, and trace files.

Change only these parts:

- Prompt wording that controls model output.
- Compact output protocols accepted by the parser.
- Parser tolerance for markdown fences, extra prose, and single-item nested arrays.

## Method

1. Send only fields already needed by each stage.
2. Require raw JSON only. No markdown fences, preamble, or explanation.
3. Prefer compact array protocols where the downstream code can expand them safely.
4. Keep object output compatibility so old model responses and traces remain readable.
5. Parse defensively by extracting the first valid JSON object or array from noisy output.

## Compact Protocols

- Field restore may output `{"title":["raw_title"],"requirement":["raw_req"]}` instead of verbose label objects.
- Sentence classification may output `[tech_sentences, soft_sentences, noise_sentences]`.
- Soft quality may output `[soft_levels, growth_levels]`, where each level list follows the fixed dimension order.
- Technical extraction keeps top-level object keys, but item payloads use compact arrays such as `[name, levelRequired, note]`.

## Non-Goals

- Do not redesign agents or split stages.
- Do not change the final portrait schema.
- Do not replace the current normalization layer.
- Do not change storage paths or run metadata.
