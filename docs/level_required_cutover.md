# `levelRequired` Hard Cutover

## Scope

This cutover removes `required` from every skill-shaped schema and makes `levelRequired` the only canonical numeric proficiency field for:

- job-side `techStack`
- job-side `techCapabilities`
- job-side `devTools`
- job-side `softQuality`
- job-side `growthPotential`
- student-side `techStack`
- student-side `techCapability` / `techCapabilities`
- student-side `devTools`
- AI result dimensions in `softQuality` and `growthPotential`
- skillcheck change payloads

## What Changed

- LLM extraction contracts no longer include a `required` slot.
- Runtime code no longer reads legacy `level`, `required`, or `isMandatory` from skill-shaped objects.
- Source-of-truth `dataset/career.json` is rewritten offline to drop `required` and normalize all skill-shaped items to `levelRequired`.
- `career-planner.sqlite3` JSON blobs are rewritten offline with the same rule.
- Tag-center snapshots and skill-search indices are rebuilt from the rewritten source data.

## Explicit Exceptions

These fields are intentionally unchanged:

- `basicInfo.certificates[].level`
- job-side `basicRequirements.certifications[].level`
- analysis-only fields such as `currentLevel` and `inferredLevel`

Those fields are not canonical skill proficiency fields, so they are outside this cutover.

## Migration Command

Run:

```bash
python scripts/unify_level_required.py
```

Use `--dry-run` to inspect the planned rewrite without writing files.
