import asyncio
import json
import random
import re
import uuid
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from job_profile_schema import is_tech_stack_branch, tech_stack_tag_name
from portrait_builder.api_client import (
    AsyncRequestRateLimiter,
    call_model_messages,
    mask_api_key,
    merge_token_usage,
)
from portrait_builder.api_models import BuilderConfig
from project_paths import TAG_DIR, ensure_runtime_dirs
from tag_sync import (
    IMPORT_LOCK,
    clean_text,
    dev_tool_tag_name,
    load_jobs,
    now_iso,
    rebuild_tag_assets,
    save_jobs,
    tech_capability_tag_name,
)

from .config import JOBS_FILE
from .job_data_service import ensure_jobs_fresh
from .tag_review_prompts import build_tag_review_user_prompt, get_tag_review_system_prompt


TAG_REVIEW_DIR = TAG_DIR / "tag_review_runs"
TAG_REVIEW_INDEX_FILE = TAG_REVIEW_DIR / "runs_index.json"
TAG_REVIEW_STATS_FILE = TAG_REVIEW_DIR / "review_stats.json"
TAG_REVIEW_TASKS: Dict[str, asyncio.Task] = {}
TAG_REVIEW_REQUEST_FILE_NAME = "request.json"
TAG_REVIEW_CANDIDATES_FILE_NAME = "candidates.json"
TAG_REVIEW_CHECKPOINT_FILE_NAME = "checkpoint.json"
TAG_REVIEW_CONTROL_FILE_NAME = "control.json"

REVIEW_MODE_ALL = "all"
REVIEW_MODE_UNREVIEWED_ONLY = "unreviewed_only"
VALID_REVIEW_MODES = {REVIEW_MODE_ALL, REVIEW_MODE_UNREVIEWED_ONLY}

CJK_RE = re.compile(r"[\u4e00-\u9fff]")
REVIEW_RESPONSE_RE = re.compile(r"^\s*\[(.+?)\]\s*$", re.DOTALL)
REVIEW_RESPONSE_GROUP_RE = re.compile(r"\[([^\[\]]+)\]")
REVIEW_SAMPLE_LIMIT = 200
DELETE_SENTINELS = {"DELETE", "__DELETE__"}
TAG_REVIEW_SUMMARY_CACHE: Dict[str, Dict[str, Any]] = {}


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8-sig"))


def append_jsonl(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def ensure_tag_review_storage() -> None:
    ensure_runtime_dirs()
    TAG_REVIEW_DIR.mkdir(parents=True, exist_ok=True)


def file_mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def run_dir(run_id: str) -> Path:
    return TAG_REVIEW_DIR / run_id


def load_run_index() -> List[Dict[str, Any]]:
    ensure_tag_review_storage()
    return read_json(TAG_REVIEW_INDEX_FILE, [])


def save_run_index(rows: List[Dict[str, Any]]) -> None:
    write_json(TAG_REVIEW_INDEX_FILE, rows)


def upsert_run_index(row: Dict[str, Any]) -> None:
    rows = [item for item in load_run_index() if item.get("runId") != row.get("runId")]
    rows.append(row)
    rows.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    save_run_index(rows)


def review_stats_key(tag_type: str, current_name: str) -> str:
    return f"{clean_text(tag_type)}::{clean_text(current_name).lower()}"


def load_review_stats() -> Dict[str, Dict[str, Any]]:
    ensure_tag_review_storage()
    payload = read_json(TAG_REVIEW_STATS_FILE, {})
    return payload if isinstance(payload, dict) else {}


def save_review_stats(stats: Dict[str, Dict[str, Any]]) -> None:
    write_json(TAG_REVIEW_STATS_FILE, stats)


def get_review_stats_entry(review_stats: Dict[str, Dict[str, Any]], tag_type: str, current_name: str) -> Dict[str, Any]:
    entry = review_stats.get(review_stats_key(tag_type, current_name), {})
    return entry if isinstance(entry, dict) else {}


def parse_review_stats_replacements(value: Any) -> List[str]:
    text = clean_text(value)
    if not text or text == "[DELETE]":
        return []
    parts = [clean_text(part) for part in text.split("|")]
    return [part for part in parts if part]


def latest_running_task() -> str | None:
    for run_id, task in list(TAG_REVIEW_TASKS.items()):
        if task.done():
            TAG_REVIEW_TASKS.pop(run_id, None)
            continue
        return run_id
    return None


def contains_cjk(text: str) -> bool:
    return bool(CJK_RE.search(clean_text(text)))


def empty_token_usage() -> Dict[str, int]:
    return {
        "modelCallCount": 0,
        "inputTokens": 0,
        "outputTokens": 0,
        "totalTokens": 0,
    }


def append_sample(rows: List[Dict[str, Any]], sample: Dict[str, Any], key_fields: List[str], limit: int = REVIEW_SAMPLE_LIMIT) -> None:
    if len(rows) >= limit:
        return
    for existing in rows:
        if all(clean_text(existing.get(field)).lower() == clean_text(sample.get(field)).lower() for field in key_fields):
            return
    rows.append(sample)


def build_review_config(config: BuilderConfig) -> BuilderConfig:
    payload = config.model_dump() if hasattr(config, "model_dump") else config.dict()
    payload["temperature"] = 0
    payload["maxTokens"] = min(int(payload.get("maxTokens") or 4000), 256)
    return BuilderConfig(**payload)


def summarize_config(config: BuilderConfig) -> Dict[str, Any]:
    return {
        "configId": clean_text(config.id),
        "configName": clean_text(config.name),
        "baseUrl": clean_text(config.baseUrl),
        "model": clean_text(config.model),
        "apiMode": clean_text(config.apiMode),
        "chatCompletionsSystemRole": clean_text(config.chatCompletionsSystemRole),
        "requestsPerMinute": int(config.requestsPerMinute or 800),
        "temperature": float(config.temperature or 0),
        "maxTokens": int(config.maxTokens or 0),
        "maskedApiKey": mask_api_key(config.apiKey),
    }


def build_candidate_summary(candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_type = {
        "techStack": 0,
        "techCapabilities": 0,
        "devTools": 0,
    }
    reviewed_before = 0
    repeat_reviewed = 0
    for candidate in candidates:
        tag_type = clean_text(candidate.get("tagType"))
        if tag_type in by_type:
            by_type[tag_type] += 1
        review_count = int(candidate.get("reviewCount") or 0)
        if review_count > 0:
            reviewed_before += 1
        if review_count > 1:
            repeat_reviewed += 1
    return {
        "totalCandidates": len(candidates),
        "byType": by_type,
        "reviewedBeforeCandidates": reviewed_before,
        "repeatReviewedCandidates": repeat_reviewed,
        "topSamples": [
            {
                "tagType": candidate.get("tagType"),
                "currentName": candidate.get("currentName"),
                "sampleRawText": candidate.get("sampleRawText"),
                "sampleRawTexts": candidate.get("sampleRawTexts") or [],
                "occurrenceCount": candidate.get("occurrenceCount"),
                "reviewCount": candidate.get("reviewCount") or 0,
                "lastReviewedAt": candidate.get("lastReviewedAt") or "",
            }
            for candidate in candidates[:30]
        ],
    }


def build_review_stats_summary(review_stats: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    rows = [value for value in review_stats.values() if isinstance(value, dict)]
    rows.sort(
        key=lambda item: (
            -int(item.get("reviewCount") or 0),
            clean_text(item.get("tagType")),
            clean_text(item.get("currentName")),
        )
    )
    return {
        "trackedTags": len(rows),
        "reviewedOnceOrMore": sum(1 for row in rows if int(row.get("reviewCount") or 0) > 0),
        "reviewedMoreThanOnce": sum(1 for row in rows if int(row.get("reviewCount") or 0) > 1),
        "appliedOnceOrMore": sum(1 for row in rows if int(row.get("appliedCount") or 0) > 0),
        "appliedMoreThanOnce": sum(1 for row in rows if int(row.get("appliedCount") or 0) > 1),
        "topReviewed": [
            {
                "tagType": row.get("tagType"),
                "currentName": row.get("currentName"),
                "reviewCount": int(row.get("reviewCount") or 0),
                "appliedCount": int(row.get("appliedCount") or 0),
                "lastDecision": row.get("lastDecision") or "",
                "lastReplacement": row.get("lastReplacement") or "",
                "lastReviewedAt": row.get("lastReviewedAt") or "",
                "lastAppliedAt": row.get("lastAppliedAt") or "",
            }
            for row in rows[:30]
        ],
    }


def annotate_candidates_with_review_stats(
    candidates: List[Dict[str, Any]],
    review_stats: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for candidate in candidates:
        stats_entry = get_review_stats_entry(
            review_stats,
            clean_text(candidate.get("tagType")),
            clean_text(candidate.get("currentName")),
        )
        rows.append(
            {
                **candidate,
                "reviewCount": int(stats_entry.get("reviewCount") or 0),
                "appliedCount": int(stats_entry.get("appliedCount") or 0),
                "lastReviewedAt": clean_text(stats_entry.get("lastReviewedAt")),
                "lastAppliedAt": clean_text(stats_entry.get("lastAppliedAt")),
                "lastDecision": clean_text(stats_entry.get("lastDecision")),
                "lastReplacement": clean_text(stats_entry.get("lastReplacement")),
            }
        )
    return rows


def collect_tag_review_candidates(jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    candidates: Dict[Tuple[str, str], Dict[str, Any]] = {}

    def add_candidate(
        *,
        job_index: int,
        job_id: str,
        tag_type: str,
        current_name: str,
        raw_text: str,
        path: str,
        item_index: int,
    ) -> None:
        current_name = clean_text(current_name)
        raw_text = clean_text(raw_text) or current_name
        if not current_name:
            return
        key = (tag_type, current_name.lower())
        entry = candidates.setdefault(
            key,
            {
                "tagType": tag_type,
                "currentName": current_name,
                "occurrenceCount": 0,
                "rawCounter": Counter(),
                "references": [],
            },
        )
        entry["occurrenceCount"] += 1
        entry["rawCounter"][raw_text] += 1
        entry["references"].append(
            {
                "jobIndex": job_index,
                "jobId": job_id,
                "path": path,
                "itemIndex": item_index,
            }
        )

    for job_index, job in enumerate(jobs):
        job_id = clean_text(job.get("id")) or f"job_{job_index}"
        for item_index, item in enumerate(job.get("techStack", []) or []):
            if is_tech_stack_branch(item):
                for opt_index, opt in enumerate(item.get("options", []) or []):
                    c_name = tech_stack_tag_name(opt) if isinstance(opt, dict) else clean_text(opt)
                    raw = (
                        clean_text(opt.get("note")) or clean_text(opt.get("rawExtractedText")) or c_name
                    ) if isinstance(opt, dict) else c_name
                    add_candidate(
                        job_index=job_index,
                        job_id=job_id,
                        tag_type="techStack",
                        current_name=c_name,
                        raw_text=raw,
                        path=f"techStack[{item_index}].options",
                        item_index=opt_index,
                    )
                continue
            add_candidate(
                job_index=job_index,
                job_id=job_id,
                tag_type="techStack",
                current_name=tech_stack_tag_name(item),
                raw_text=clean_text(item.get("note")) or tech_stack_tag_name(item),
                path="techStack",
                item_index=item_index,
            )
        for item_index, item in enumerate(job.get("techCapabilities", []) or []):
            if clean_text(item.get("type")) == "soft_flag":
                continue
            add_candidate(
                job_index=job_index,
                job_id=job_id,
                tag_type="techCapabilities",
                current_name=tech_capability_tag_name(item),
                raw_text=clean_text(item.get("rawExtractedText")) or tech_capability_tag_name(item),
                path="techCapabilities",
                item_index=item_index,
            )
        for item_index, item in enumerate(job.get("devTools", []) or []):
            add_candidate(
                job_index=job_index,
                job_id=job_id,
                tag_type="devTools",
                current_name=dev_tool_tag_name(item),
                raw_text=clean_text(item.get("rawExtractedText")) or dev_tool_tag_name(item),
                path="devTools",
                item_index=item_index,
            )

    rows: List[Dict[str, Any]] = []
    for candidate in candidates.values():
        raw_counter: Counter = candidate.pop("rawCounter")
        unique_raw_texts = [text for text in raw_counter.keys() if clean_text(text)]
        if len(unique_raw_texts) > 3:
            sample_raw_texts = random.sample(unique_raw_texts, 3)
        else:
            sample_raw_texts = unique_raw_texts
        rows.append(
            {
                **candidate,
                "sampleRawText": sample_raw_texts[0] if sample_raw_texts else candidate.get("currentName"),
                "sampleRawTexts": sample_raw_texts,
            }
        )
    rows.sort(key=lambda item: (-int(item.get("occurrenceCount") or 0), item.get("tagType") or "", item.get("currentName") or ""))
    return rows


def build_existing_exact_index(jobs: List[Dict[str, Any]]) -> Dict[Tuple[str, str], str]:
    exact_index: Dict[Tuple[str, str], str] = {}
    for job in jobs:
        for item in job.get("techStack", []) or []:
            if is_tech_stack_branch(item):
                for opt in item.get("options", []) or []:
                    name = tech_stack_tag_name(opt) if isinstance(opt, dict) else clean_text(opt)
                    if name:
                        exact_index.setdefault(("techStack", name.lower()), name)
                continue
            name = tech_stack_tag_name(item)
            if name:
                exact_index.setdefault(("techStack", name.lower()), name)
        for item in job.get("techCapabilities", []) or []:
            if clean_text(item.get("type")) == "soft_flag":
                continue
            name = tech_capability_tag_name(item)
            if name:
                exact_index.setdefault(("techCapabilities", name.lower()), name)
        for item in job.get("devTools", []) or []:
            name = dev_tool_tag_name(item)
            if name:
                exact_index.setdefault(("devTools", name.lower()), name)
    return exact_index


def parse_review_response(text: str, tag_type: str, current_name: str) -> Dict[str, Any]:
    text = clean_text(text)
    if not text:
        if contains_cjk(current_name):
            raise ValueError("current Chinese tag cannot remain unchanged")
        return {"action": "unchanged", "replacements": []}
    matches = [clean_text(item) for item in REVIEW_RESPONSE_GROUP_RE.findall(text) if clean_text(item)]
    residual = REVIEW_RESPONSE_GROUP_RE.sub("", text)
    residual = re.sub(r"[\s|,;/]+", "", residual)
    if residual:
        raise ValueError(f"invalid review response: {text[:120]}")
    if not matches:
        raise ValueError("review response must be empty or bracketed")
    if len(matches) == 1 and matches[0].upper() in DELETE_SENTINELS:
        if tag_type not in {"techStack", "techCapabilities"}:
            raise ValueError("delete is only allowed for techStack or techCapabilities")
        return {"action": "delete", "replacements": []}

    seen = set()
    replacements: List[str] = []
    for item in matches:
        upper_item = item.upper()
        if upper_item in DELETE_SENTINELS:
            raise ValueError("DELETE cannot be mixed with replacements")
        if contains_cjk(item):
            raise ValueError(f"replacement still contains Chinese: {item}")
        lowered = item.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        replacements.append(item)

    if not replacements:
        raise ValueError("empty replacement in bracket response")
    if tag_type != "techCapabilities" and len(replacements) > 1:
        raise ValueError("multiple replacements are only allowed for techCapabilities")
    return {
        "action": "split" if len(replacements) > 1 else "replace",
        "replacements": replacements,
    }


def resolve_review_replacements(
    tag_type: str,
    replacements: List[str],
    exact_index: Dict[Tuple[str, str], str],
) -> Tuple[List[str], List[Optional[str]], int]:
    resolved_names: List[str] = []
    direct_canonicals: List[Optional[str]] = []
    seen = set()
    direct_count = 0
    for replacement in replacements:
        exact_key = (tag_type, replacement.lower())
        direct_canonical = clean_text(exact_index.get(exact_key)) or None
        final_name = direct_canonical or replacement
        lowered = final_name.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        resolved_names.append(final_name)
        direct_canonicals.append(direct_canonical)
        if direct_canonical:
            direct_count += 1
        exact_index.setdefault(exact_key, final_name)
    return resolved_names, direct_canonicals, direct_count


def apply_review_decisions(
    jobs: List[Dict[str, Any]],
    decisions: Dict[Tuple[str, str], Dict[str, Any]],
) -> Tuple[int, int]:
    updated_occurrences = 0
    direct_normalized_occurrences = 0

    for job in jobs:
        next_tech_stack: List[Dict[str, Any]] = []
        for item in job.get("techStack", []) or []:
            if is_tech_stack_branch(item):
                updated_group = dict(item)
                next_options: List[Any] = []
                for opt in item.get("options", []) or []:
                    current_name = tech_stack_tag_name(opt) if isinstance(opt, dict) else clean_text(opt)
                    if not current_name:
                        next_options.append(opt)
                        continue
                    decision = decisions.get(("techStack", current_name.lower()))
                    if not decision:
                        next_options.append(opt)
                        continue
                    updated_occurrences += 1
                    action = clean_text(decision.get("action"))
                    if action == "delete":
                        continue
                    replacements = decision.get("resolvedReplacements") or []
                    if not replacements:
                        next_options.append(opt)
                        continue
                    if isinstance(opt, dict):
                        updated_opt = dict(opt)
                        updated_opt["name"] = replacements[0]
                        next_options.append(updated_opt)
                    else:
                        next_options.append(replacements[0])
                if next_options:
                    updated_group["options"] = next_options
                    next_tech_stack.append(updated_group)
                continue
            current_name = tech_stack_tag_name(item)
            decision = decisions.get(("techStack", current_name.lower()))
            if not decision:
                next_tech_stack.append(item)
                continue
            updated_occurrences += 1
            action = clean_text(decision.get("action"))
            if action == "delete":
                continue
            replacements = decision.get("resolvedReplacements") or []
            if not replacements:
                next_tech_stack.append(item)
                continue
            updated_item = dict(item)
            updated_item["name"] = replacements[0]
            next_tech_stack.append(updated_item)
        job["techStack"] = next_tech_stack

        next_tech_capabilities: List[Dict[str, Any]] = []
        for item in job.get("techCapabilities", []) or []:
            if clean_text(item.get("type")) == "soft_flag":
                next_tech_capabilities.append(item)
                continue
            current_name = tech_capability_tag_name(item)
            decision = decisions.get(("techCapabilities", current_name.lower()))
            if not decision:
                next_tech_capabilities.append(item)
                continue
            updated_occurrences += 1
            replacements = decision.get("resolvedReplacements") or []
            canonicals = decision.get("directCanonicalNames") or []
            current_skill_zh = clean_text(item.get("skillZh"))
            for index, replacement in enumerate(replacements):
                cloned = dict(item)
                if contains_cjk(current_name) and not current_skill_zh:
                    cloned["skillZh"] = current_name
                cloned["skill"] = replacement
                cloned["normalizedTag"] = clean_text(canonicals[index]) or None
                if canonicals[index]:
                    direct_normalized_occurrences += 1
                next_tech_capabilities.append(cloned)
        job["techCapabilities"] = next_tech_capabilities

        next_dev_tools: List[Dict[str, Any]] = []
        for item in job.get("devTools", []) or []:
            current_name = dev_tool_tag_name(item)
            decision = decisions.get(("devTools", current_name.lower()))
            if not decision:
                next_dev_tools.append(item)
                continue
            updated_occurrences += 1
            replacements = decision.get("resolvedReplacements") or []
            canonicals = decision.get("directCanonicalNames") or []
            if not replacements:
                next_dev_tools.append(item)
                continue
            updated_item = dict(item)
            if contains_cjk(current_name) and not clean_text(updated_item.get("skillZh")):
                updated_item["skillZh"] = current_name
            updated_item["skill"] = replacements[0]
            updated_item["normalizedTag"] = clean_text(canonicals[0]) or None
            if canonicals and canonicals[0]:
                direct_normalized_occurrences += 1
            next_dev_tools.append(updated_item)
        job["devTools"] = next_dev_tools

    return updated_occurrences, direct_normalized_occurrences


def collect_present_review_decision_keys(
    jobs: List[Dict[str, Any]],
    decisions: Dict[Tuple[str, str], Dict[str, Any]],
) -> set[Tuple[str, str]]:
    present_keys: set[Tuple[str, str]] = set()
    if not decisions:
        return present_keys

    for job in jobs:
        for item in job.get("techStack", []) or []:
            if is_tech_stack_branch(item):
                for opt in item.get("options", []) or []:
                    current_name = tech_stack_tag_name(opt) if isinstance(opt, dict) else clean_text(opt)
                    key = ("techStack", current_name.lower())
                    if current_name and key in decisions:
                        present_keys.add(key)
                continue
            current_name = tech_stack_tag_name(item)
            key = ("techStack", current_name.lower())
            if key in decisions:
                present_keys.add(key)
        for item in job.get("techCapabilities", []) or []:
            if clean_text(item.get("type")) == "soft_flag":
                continue
            current_name = tech_capability_tag_name(item)
            key = ("techCapabilities", current_name.lower())
            if key in decisions:
                present_keys.add(key)
        for item in job.get("devTools", []) or []:
            current_name = dev_tool_tag_name(item)
            key = ("devTools", current_name.lower())
            if key in decisions:
                present_keys.add(key)

    return present_keys


def build_review_result_summary() -> Dict[str, Any]:
    return {
        "replaced": [],
        "unchanged": [],
        "failed": [],
    }


def touch_review_stats(
    review_stats: Dict[str, Dict[str, Any]],
    candidate: Dict[str, Any],
    *,
    decision: str,
    replacement: str = "",
    error: str = "",
) -> Dict[str, Any]:
    tag_type = clean_text(candidate.get("tagType"))
    current_name = clean_text(candidate.get("currentName"))
    key = review_stats_key(tag_type, current_name)
    existing = review_stats.get(key, {})
    next_entry = {
        "tagType": tag_type,
        "currentName": current_name,
        "reviewCount": int(existing.get("reviewCount") or 0) + 1,
        "appliedCount": int(existing.get("appliedCount") or 0),
        "lastReviewedAt": now_iso(),
        "lastAppliedAt": clean_text(existing.get("lastAppliedAt")),
        "lastAppliedRunId": clean_text(existing.get("lastAppliedRunId")),
        "lastAppliedDecision": clean_text(existing.get("lastAppliedDecision")),
        "lastAppliedReplacement": clean_text(existing.get("lastAppliedReplacement")),
        "lastDecision": decision,
        "lastReplacement": clean_text(replacement),
        "lastError": clean_text(error),
        "occurrenceCount": int(candidate.get("occurrenceCount") or 0),
        "sampleRawTexts": [clean_text(text) for text in (candidate.get("sampleRawTexts") or []) if clean_text(text)][:3],
    }
    review_stats[key] = next_entry
    save_review_stats(review_stats)
    return next_entry


def mark_review_stats_applied(
    review_stats: Dict[str, Dict[str, Any]],
    applied_keys: set[Tuple[str, str]],
    *,
    run_id: str = "",
) -> None:
    if not applied_keys:
        return
    now = now_iso()
    dirty = False
    for tag_type, current_name_key in applied_keys:
        key = review_stats_key(tag_type, current_name_key)
        entry = review_stats.get(key)
        if not isinstance(entry, dict):
            continue
        entry["appliedCount"] = int(entry.get("appliedCount") or 0) + 1
        entry["lastAppliedAt"] = now
        entry["lastAppliedRunId"] = clean_text(run_id)
        entry["lastAppliedDecision"] = clean_text(entry.get("lastDecision"))
        entry["lastAppliedReplacement"] = clean_text(entry.get("lastReplacement"))
        review_stats[key] = entry
        dirty = True
    if dirty:
        save_review_stats(review_stats)


def request_path(run_id: str) -> Path:
    return run_dir(run_id) / TAG_REVIEW_REQUEST_FILE_NAME


def candidates_path(run_id: str) -> Path:
    return run_dir(run_id) / TAG_REVIEW_CANDIDATES_FILE_NAME


def checkpoint_path(run_id: str) -> Path:
    return run_dir(run_id) / TAG_REVIEW_CHECKPOINT_FILE_NAME


def control_path(run_id: str) -> Path:
    return run_dir(run_id) / TAG_REVIEW_CONTROL_FILE_NAME


def normalize_review_mode(review_mode: str) -> str:
    mode = clean_text(review_mode).lower()
    if mode in VALID_REVIEW_MODES:
        return mode
    return REVIEW_MODE_ALL


def select_candidates_for_review_mode(
    candidates: List[Dict[str, Any]],
    review_mode: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    mode = normalize_review_mode(review_mode)
    if mode == REVIEW_MODE_UNREVIEWED_ONLY:
        filtered = [row for row in candidates if int(row.get("appliedCount") or 0) <= 0]
    else:
        filtered = list(candidates)
    summary = build_candidate_summary(filtered)
    summary["reviewMode"] = mode
    summary["sourceTotalCandidates"] = len(candidates)
    summary["skippedReviewedCandidates"] = max(0, len(candidates) - len(filtered))
    return filtered, summary


def build_pending_review_stats_decisions(
    review_stats: Dict[str, Dict[str, Any]],
    jobs: List[Dict[str, Any]],
) -> Dict[Tuple[str, str], Dict[str, Any]]:
    exact_index = build_existing_exact_index(jobs)
    decisions: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for entry in review_stats.values():
        if not isinstance(entry, dict):
            continue
        tag_type = clean_text(entry.get("tagType"))
        current_name = clean_text(entry.get("currentName"))
        if not tag_type or not current_name:
            continue
        if int(entry.get("appliedCount") or 0) > 0:
            continue
        last_decision = clean_text(entry.get("lastDecision")).lower()
        if last_decision not in {"replace", "split", "deleted"}:
            continue
        action = "delete" if last_decision == "deleted" else ("split" if last_decision == "split" else "replace")
        replacements = parse_review_stats_replacements(entry.get("lastReplacement"))
        if action != "delete" and not replacements:
            continue
        resolved_replacements: List[str] = []
        direct_canonical_names: List[Optional[str]] = []
        direct_count = 0
        if action != "delete":
            resolved_replacements, direct_canonical_names, direct_count = resolve_review_replacements(tag_type, replacements, exact_index)
            if not resolved_replacements:
                continue
            if action == "split" and len(resolved_replacements) <= 1:
                action = "replace"
        decisions[(tag_type, current_name.lower())] = {
            "action": action,
            "resolvedReplacements": resolved_replacements,
            "directCanonicalNames": direct_canonical_names,
            "directNormalizedCount": direct_count,
        }
    return decisions


def apply_pending_review_stats_to_job_library(*, run_id: str = "review_stats_repair") -> Dict[str, Any]:
    jobs = load_jobs()
    review_stats = load_review_stats()
    decisions = build_pending_review_stats_decisions(review_stats, jobs)
    present_keys = collect_present_review_decision_keys(jobs, decisions)
    updated_occurrences, direct_normalized_occurrences = apply_review_decisions(jobs, decisions)
    if updated_occurrences <= 0:
        return {
            "ok": True,
            "pendingDecisionCount": len(decisions),
            "appliedDecisionCount": 0,
            "updatedOccurrences": 0,
            "directNormalizedOccurrences": 0,
        }
    save_jobs(jobs)
    tag_summary = rebuild_tag_assets(jobs)
    mark_review_stats_applied(review_stats, present_keys, run_id=run_id)
    applied_by_type: Dict[str, int] = {}
    for tag_type, _ in present_keys:
        applied_by_type[tag_type] = applied_by_type.get(tag_type, 0) + 1
    return {
        "ok": True,
        "pendingDecisionCount": len(decisions),
        "appliedDecisionCount": len(present_keys),
        "updatedOccurrences": updated_occurrences,
        "directNormalizedOccurrences": direct_normalized_occurrences,
        "appliedByType": applied_by_type,
        "tagSummary": tag_summary,
    }


def serialize_pending_decisions(decisions: Dict[Tuple[str, str], Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for (tag_type, current_name_key), decision in decisions.items():
        rows.append(
            {
                "tagType": tag_type,
                "currentNameKey": current_name_key,
                "action": clean_text(decision.get("action")),
                "resolvedReplacements": [clean_text(item) for item in (decision.get("resolvedReplacements") or []) if clean_text(item)],
                "directCanonicalNames": [clean_text(item) or None for item in (decision.get("directCanonicalNames") or [])],
                "directNormalizedCount": int(decision.get("directNormalizedCount") or 0),
            }
        )
    return rows


def deserialize_pending_decisions(rows: List[Dict[str, Any]]) -> Dict[Tuple[str, str], Dict[str, Any]]:
    decisions: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for row in rows or []:
        tag_type = clean_text(row.get("tagType"))
        current_name_key = clean_text(row.get("currentNameKey")).lower()
        if not tag_type or not current_name_key:
            continue
        decisions[(tag_type, current_name_key)] = {
            "action": clean_text(row.get("action")),
            "resolvedReplacements": [clean_text(item) for item in (row.get("resolvedReplacements") or []) if clean_text(item)],
            "directCanonicalNames": [clean_text(item) or None for item in (row.get("directCanonicalNames") or [])],
            "directNormalizedCount": int(row.get("directNormalizedCount") or 0),
        }
    return decisions


def delete_file_if_exists(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        return


def save_run_request(run_id: str, config: BuilderConfig, max_attempts: int, review_mode: str) -> None:
    payload = config.model_dump() if hasattr(config, "model_dump") else config.dict()
    write_json(
        request_path(run_id),
        {
            "config": payload,
            "maxAttempts": int(max_attempts or 3),
            "reviewMode": normalize_review_mode(review_mode),
        },
    )


def load_run_request(run_id: str) -> Dict[str, Any]:
    payload = read_json(request_path(run_id), {})
    return payload if isinstance(payload, dict) else {}


def load_run_request_config(run_id: str) -> Tuple[BuilderConfig, int, str]:
    payload = load_run_request(run_id)
    config_payload = payload.get("config") or {}
    if not isinstance(config_payload, dict) or not config_payload:
        raise RuntimeError("tag review run config is missing")
    return (
        BuilderConfig(**config_payload),
        max(1, min(5, int(payload.get("maxAttempts") or 3))),
        normalize_review_mode(payload.get("reviewMode") or REVIEW_MODE_ALL),
    )


def save_run_candidates(run_id: str, candidates: List[Dict[str, Any]]) -> None:
    write_json(candidates_path(run_id), candidates)


def load_run_candidates(run_id: str) -> List[Dict[str, Any]]:
    payload = read_json(candidates_path(run_id), [])
    return payload if isinstance(payload, list) else []


def load_run_checkpoint(run_id: str) -> Dict[str, Any]:
    payload = read_json(checkpoint_path(run_id), {})
    return payload if isinstance(payload, dict) else {}


def save_run_checkpoint(run_id: str, payload: Dict[str, Any]) -> None:
    write_json(checkpoint_path(run_id), payload)


def clear_run_checkpoint(run_id: str) -> None:
    delete_file_if_exists(checkpoint_path(run_id))


def load_run_control_action(run_id: str) -> str:
    payload = read_json(control_path(run_id), {})
    if not isinstance(payload, dict):
        return ""
    return clean_text(payload.get("action")).lower()


def write_run_control_action(run_id: str, action: str) -> None:
    write_json(
        control_path(run_id),
        {
            "action": clean_text(action).lower(),
            "requestedAt": now_iso(),
        },
    )


def clear_run_control_action(run_id: str) -> None:
    delete_file_if_exists(control_path(run_id))


def reconcile_orphaned_run_state(run_id: str) -> None:
    task = TAG_REVIEW_TASKS.get(run_id)
    if task and not task.done():
        return

    base = run_dir(run_id)
    progress = read_json(base / "progress.json", {})
    manifest = read_json(base / "manifest.json", {})
    if not progress or not manifest:
        return

    status = clean_text(progress.get("status")).lower()
    if status not in {"queued", "running", "pausing"}:
        return

    has_checkpoint = checkpoint_path(run_id).exists()
    next_status = "paused" if has_checkpoint else "stopped"
    next_message = "worker stopped; resume is available" if has_checkpoint else "worker stopped; restart is required"
    progress.update(
        {
            "status": next_status,
            "stage": next_status,
            "message": next_message,
            "updatedAt": now_iso(),
        }
    )
    manifest["status"] = next_status
    write_json(base / "manifest.json", manifest)
    write_json(base / "progress.json", progress)


def metric_from_result_or_progress(result: Dict[str, Any], progress: Dict[str, Any], key: str) -> int:
    return int(result.get(key) or progress.get(key) or 0)


def build_run_index_row(run_id: str) -> Dict[str, Any]:
    reconcile_orphaned_run_state(run_id)
    manifest = read_json(run_dir(run_id) / "manifest.json", {})
    progress = read_json(run_dir(run_id) / "progress.json", {})
    result = read_json(run_dir(run_id) / "result.json", {})
    return {
        "runId": run_id,
        "status": progress.get("status") or manifest.get("status") or "unknown",
        "createdAt": manifest.get("createdAt"),
        "startedAt": progress.get("startedAt"),
        "lastResumedAt": progress.get("lastResumedAt"),
        "pausedAt": progress.get("pausedAt"),
        "completedAt": progress.get("completedAt"),
        "percent": int(progress.get("percent") or 0),
        "stage": progress.get("stage") or "",
        "message": progress.get("message") or "",
        "reviewed": metric_from_result_or_progress(result, progress, "reviewedCandidates"),
        "changed": metric_from_result_or_progress(result, progress, "changedCandidates"),
        "replaced": metric_from_result_or_progress(result, progress, "replacedCandidates"),
        "deleted": metric_from_result_or_progress(result, progress, "deletedCandidates"),
        "split": metric_from_result_or_progress(result, progress, "splitCandidates"),
        "failed": metric_from_result_or_progress(result, progress, "failedCandidates"),
        "updatedOccurrences": metric_from_result_or_progress(result, progress, "updatedOccurrences"),
        "reviewMode": clean_text(manifest.get("reviewMode")) or REVIEW_MODE_ALL,
        "resumeCount": int(progress.get("resumeCount") or 0),
        "configName": clean_text((manifest.get("config") or {}).get("configName")),
        "model": clean_text((manifest.get("config") or {}).get("model")),
    }


def get_tag_review_run_snapshot(run_id: str) -> Dict[str, Any]:
    reconcile_orphaned_run_state(run_id)
    base = run_dir(run_id)
    manifest = read_json(base / "manifest.json", {})
    progress = read_json(base / "progress.json", {})
    result = read_json(base / "result.json", {})
    logs = read_jsonl(base / "logs.jsonl")
    task = TAG_REVIEW_TASKS.get(run_id)
    is_active = bool(task and not task.done())
    status = clean_text(progress.get("status") or manifest.get("status")).lower()
    has_checkpoint = checkpoint_path(run_id).exists()
    has_request = request_path(run_id).exists()
    return {
        "runId": run_id,
        "manifest": manifest,
        "progress": progress,
        "result": result,
        "logsTail": logs[-160:],
        "isActive": is_active,
        "canPause": is_active and status in {"running", "pausing"},
        "canResume": (not is_active) and has_checkpoint and status in {"paused", "stopped"},
        "canRestart": (not is_active) and has_request,
    }


def list_tag_review_runs(review_mode: str = REVIEW_MODE_ALL) -> Dict[str, Any]:
    review_mode = normalize_review_mode(review_mode)
    cache_key = f"{review_mode}:{file_mtime(JOBS_FILE)}:{file_mtime(TAG_REVIEW_STATS_FILE)}"
    cached_summary = TAG_REVIEW_SUMMARY_CACHE.get(cache_key)
    if cached_summary:
        summary = cached_summary["summary"]
        review_stats_summary = cached_summary["reviewStatsSummary"]
    else:
        jobs = load_jobs()
        review_stats = load_review_stats()
        candidates = annotate_candidates_with_review_stats(collect_tag_review_candidates(jobs), review_stats)
        _, summary = select_candidates_for_review_mode(candidates, review_mode)
        review_stats_summary = build_review_stats_summary(review_stats)
        TAG_REVIEW_SUMMARY_CACHE.clear()
        TAG_REVIEW_SUMMARY_CACHE[cache_key] = {
            "summary": summary,
            "reviewStatsSummary": review_stats_summary,
        }
    rows = []
    for row in load_run_index():
        run_id = row.get("runId")
        if not run_id:
            continue
        rows.append(build_run_index_row(run_id))
    return {
        "activeRunId": latest_running_task(),
        "data": rows,
        "summary": summary,
        "reviewMode": review_mode,
        "availableReviewModes": [
            {"value": REVIEW_MODE_ALL, "label": "All Tags"},
            {"value": REVIEW_MODE_UNREVIEWED_ONLY, "label": "Unreviewed Only"},
        ],
        "reviewStatsSummary": review_stats_summary,
    }


async def _persist_progress(run_id: str, progress: Dict[str, Any]) -> None:
    base = run_dir(run_id)
    write_json(base / "progress.json", progress)
    upsert_run_index(build_run_index_row(run_id))


async def _append_log(run_id: str, payload: Dict[str, Any]) -> None:
    append_jsonl(run_dir(run_id) / "logs.jsonl", payload)


async def _execute_tag_review_run(run_id: str, config: BuilderConfig, max_attempts: int) -> None:
    base = run_dir(run_id)
    manifest = read_json(base / "manifest.json", {})
    progress = read_json(base / "progress.json", {})
    review_config = build_review_config(config)
    rate_limiter = AsyncRequestRateLimiter(max(1, int(review_config.requestsPerMinute or 800)))

    progress["status"] = "running"
    progress["startedAt"] = progress.get("startedAt") or now_iso()
    write_json(base / "progress.json", progress)
    upsert_run_index(build_run_index_row(run_id))

    async def emit_progress(percent: int, stage: str, message: str, **extra: Any) -> None:
        next_progress = {
            **progress,
            "status": "running",
            "percent": max(0, min(100, int(percent))),
            "stage": stage,
            "message": message,
            "updatedAt": now_iso(),
            **extra,
        }
        progress.update(next_progress)
        await _persist_progress(run_id, next_progress)

    async def emit_log(stage: str, message: str, payload: Optional[Dict[str, Any]] = None) -> None:
        await _append_log(
            run_id,
            {
                "ts": now_iso(),
                "stage": stage,
                "message": message,
                "payload": payload or {},
            },
        )

    try:
        async with IMPORT_LOCK:
            jobs = load_jobs()
            review_stats = load_review_stats()
            candidates = annotate_candidates_with_review_stats(collect_tag_review_candidates(jobs), review_stats)
            candidate_summary = build_candidate_summary(candidates)
            exact_index = build_existing_exact_index(jobs)
            token_usage = empty_token_usage()
            decision_summary = build_review_result_summary()
            reviewed_candidates = 0
            changed_candidates = 0
            replaced_candidates = 0
            deleted_candidates = 0
            split_candidates = 0
            unchanged_candidates = 0
            failed_candidates = 0
            updated_occurrences = 0
            direct_normalized_occurrences = 0
            pending_decisions: Dict[Tuple[str, str], Dict[str, Any]] = {}

            await emit_log(
                "prepare",
                "标签复查任务启动",
                {
                    "candidateSummary": candidate_summary,
                    "config": summarize_config(review_config),
                    "maxAttempts": max_attempts,
                },
            )

            if not candidates:
                result = {
                    "ok": True,
                    "reviewedCandidates": 0,
                    "changedCandidates": 0,
                    "replacedCandidates": 0,
                    "deletedCandidates": 0,
                    "splitCandidates": 0,
                    "unchangedCandidates": 0,
                    "failedCandidates": 0,
                    "updatedOccurrences": 0,
                    "directNormalizedOccurrences": 0,
                    "candidateSummary": candidate_summary,
                    "decisionSummary": decision_summary,
                    "reviewStatsSummary": build_review_stats_summary(review_stats),
                    "tokenUsage": token_usage,
                    "config": summarize_config(review_config),
                    "tagSummary": rebuild_tag_assets(jobs),
                    "reviewedAt": now_iso(),
                }
                progress.update(
                    {
                        "status": "completed",
                        "percent": 100,
                        "stage": "completed",
                        "message": "没有发现需要复查的中文标签",
                        "completedAt": now_iso(),
                        "updatedAt": now_iso(),
                    }
                )
                manifest["status"] = "completed"
                manifest["completedAt"] = progress["completedAt"]
                write_json(base / "manifest.json", manifest)
                write_json(base / "result.json", result)
                await _persist_progress(run_id, progress)
                await emit_log("completed", "标签复查完成，无需改动", {"reviewedCandidates": 0})
                return

            total_candidates = len(candidates)
            await emit_progress(5, "prepare", f"已识别 {total_candidates} 个疑似中文标签")

            for index, candidate in enumerate(candidates, start=1):
                current_name = clean_text(candidate.get("currentName"))
                sample_raw_texts = [
                    clean_text(text)
                    for text in (candidate.get("sampleRawTexts") or [])
                    if clean_text(text)
                ] or [clean_text(candidate.get("sampleRawText")) or current_name]
                sample_raw_text = sample_raw_texts[0] if sample_raw_texts else current_name
                system_prompt = get_tag_review_system_prompt(clean_text(candidate.get("tagType")))
                user_prompt = build_tag_review_user_prompt(
                    tag_type=clean_text(candidate.get("tagType")),
                    current_name=current_name,
                    raw_texts=sample_raw_texts,
                    current_name_contains_cjk=contains_cjk(current_name),
                )

                last_error = ""
                replacement: Optional[Dict[str, Any]] = None
                for attempt in range(1, max_attempts + 1):
                    try:
                        response = await call_model_messages(
                            review_config,
                            [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt},
                            ],
                            rate_limiter=rate_limiter,
                        )
                        token_usage = merge_token_usage(token_usage, response.get("usage"))
                        replacement = parse_review_response(
                            response.get("text"),
                            clean_text(candidate.get("tagType")),
                            current_name,
                        )
                        break
                    except Exception as exc:
                        last_error = str(exc)
                        await emit_log(
                            "review_retry",
                            "标签复查请求失败，准备重试",
                            {
                                "tagType": candidate.get("tagType"),
                                "currentName": current_name,
                                "attempt": attempt,
                                "maxAttempts": max_attempts,
                                "error": last_error,
                            },
                        )
                        if attempt >= max_attempts:
                            break

                reviewed_candidates += 1
                percent = 8 + int((index / max(1, total_candidates)) * 84)

                if replacement is None and last_error:
                    stats_entry = touch_review_stats(
                        review_stats,
                        candidate,
                        decision="failed",
                        error=last_error,
                    )
                    failed_candidates += 1
                    append_sample(
                        decision_summary["failed"],
                        {
                            "tagType": candidate.get("tagType"),
                            "currentName": current_name,
                            "sampleRawText": sample_raw_text,
                            "sampleRawTexts": sample_raw_texts,
                            "occurrenceCount": candidate.get("occurrenceCount"),
                            "error": last_error,
                            "reviewCount": int(stats_entry.get("reviewCount") or 0),
                        },
                        ["tagType", "currentName"],
                    )
                    await emit_log(
                        "review_failed",
                        "标签复查最终失败",
                        {
                            "tagType": candidate.get("tagType"),
                            "currentName": current_name,
                            "sampleRawText": sample_raw_text,
                            "sampleRawTexts": sample_raw_texts,
                            "error": last_error,
                            "reviewCount": int(stats_entry.get("reviewCount") or 0),
                        },
                    )
                    await emit_progress(
                        percent,
                        "review_tags",
                        f"已复查 {index}/{total_candidates}，失败 {failed_candidates}",
                        reviewedCandidates=reviewed_candidates,
                        changedCandidates=changed_candidates,
                        replacedCandidates=replaced_candidates,
                        deletedCandidates=deleted_candidates,
                        splitCandidates=split_candidates,
                        unchangedCandidates=unchanged_candidates,
                        failedCandidates=failed_candidates,
                    )
                    continue

                if replacement.get("action") == "unchanged":
                    stats_entry = touch_review_stats(
                        review_stats,
                        candidate,
                        decision="unchanged",
                    )
                    unchanged_candidates += 1
                    append_sample(
                        decision_summary["unchanged"],
                        {
                            "tagType": candidate.get("tagType"),
                            "currentName": current_name,
                            "sampleRawText": sample_raw_text,
                            "sampleRawTexts": sample_raw_texts,
                            "occurrenceCount": candidate.get("occurrenceCount"),
                            "reviewCount": int(stats_entry.get("reviewCount") or 0),
                        },
                        ["tagType", "currentName"],
                    )
                    await emit_progress(
                        percent,
                        "review_tags",
                        f"已复查 {index}/{total_candidates}，替换 {replaced_candidates}",
                        reviewedCandidates=reviewed_candidates,
                        changedCandidates=changed_candidates,
                        replacedCandidates=replaced_candidates,
                        deletedCandidates=deleted_candidates,
                        splitCandidates=split_candidates,
                        unchangedCandidates=unchanged_candidates,
                        failedCandidates=failed_candidates,
                    )
                    continue

                tag_type = clean_text(candidate.get("tagType"))
                action = clean_text(replacement.get("action"))
                resolved_replacements: List[str] = []
                direct_canonical_names: List[Optional[str]] = []
                direct_count = 0
                if action != "delete":
                    resolved_replacements, direct_canonical_names, direct_count = resolve_review_replacements(
                        tag_type,
                        replacement.get("replacements") or [],
                        exact_index,
                    )
                    if action == "split" and len(resolved_replacements) <= 1:
                        action = "replace"

                changed_candidates += 1
                if action == "delete":
                    deleted_candidates += 1
                elif action == "split":
                    split_candidates += 1
                else:
                    replaced_candidates += 1

                pending_decisions[(tag_type, current_name.lower())] = {
                    "action": action,
                    "resolvedReplacements": resolved_replacements,
                    "directCanonicalNames": direct_canonical_names,
                    "directNormalizedCount": direct_count,
                }

                display_replacement = "[DELETE]" if action == "delete" else " | ".join(resolved_replacements)
                stats_entry = touch_review_stats(
                    review_stats,
                    candidate,
                    decision="deleted" if action == "delete" else action,
                    replacement=display_replacement,
                )
                append_sample(
                    decision_summary["replaced"],
                    {
                        "tagType": tag_type,
                        "currentName": current_name,
                        "action": action,
                        "replacement": display_replacement,
                        "replacements": resolved_replacements,
                        "sampleRawText": sample_raw_text,
                        "sampleRawTexts": sample_raw_texts,
                        "occurrenceCount": candidate.get("occurrenceCount"),
                        "directNormalizedCount": direct_count,
                        "reviewCount": int(stats_entry.get("reviewCount") or 0),
                    },
                    ["tagType", "currentName", "action", "replacement"],
                )
                log_stage = "review_deleted" if action == "delete" else ("review_split" if action == "split" else "review_replaced")
                log_message = (
                    "techStack 标签已删除"
                    if action == "delete"
                    else ("技术能力标签已拆分" if action == "split" else "标签已替换为英文")
                )
                log_message = "tag deleted" if action == "delete" else ("tech capability tag split" if action == "split" else "tag replaced with English")
                await emit_log(
                    log_stage,
                    log_message,
                    {
                        "tagType": tag_type,
                        "currentName": current_name,
                        "action": action,
                        "replacement": display_replacement,
                        "replacements": resolved_replacements,
                        "sampleRawText": sample_raw_text,
                        "sampleRawTexts": sample_raw_texts,
                        "occurrenceCount": candidate.get("occurrenceCount"),
                        "directNormalizedCount": direct_count,
                        "reviewCount": int(stats_entry.get("reviewCount") or 0),
                    },
                )
                await emit_progress(
                    percent,
                    "review_tags",
                    f"已复查 {index}/{total_candidates}，变更 {changed_candidates}",
                    reviewedCandidates=reviewed_candidates,
                    changedCandidates=changed_candidates,
                    replacedCandidates=replaced_candidates,
                    deletedCandidates=deleted_candidates,
                    splitCandidates=split_candidates,
                    unchangedCandidates=unchanged_candidates,
                    failedCandidates=failed_candidates,
                )

            updated_occurrences, direct_normalized_occurrences = apply_review_decisions(jobs, pending_decisions)
            await emit_progress(95, "save_jobs", f"准备写回岗位库，更新 {updated_occurrences} 处标签")
            save_jobs(jobs)
            tag_summary = rebuild_tag_assets(jobs)
            await ensure_jobs_fresh(embed_missing=False)
            result = {
                "ok": True,
                "reviewedCandidates": reviewed_candidates,
                "changedCandidates": changed_candidates,
                "replacedCandidates": replaced_candidates,
                "deletedCandidates": deleted_candidates,
                "splitCandidates": split_candidates,
                "unchangedCandidates": unchanged_candidates,
                "failedCandidates": failed_candidates,
                "updatedOccurrences": updated_occurrences,
                "directNormalizedOccurrences": direct_normalized_occurrences,
                "candidateSummary": candidate_summary,
                "decisionSummary": decision_summary,
                "reviewStatsSummary": build_review_stats_summary(review_stats),
                "tokenUsage": token_usage,
                "config": summarize_config(review_config),
                "tagSummary": tag_summary,
                "reviewedAt": now_iso(),
            }
            progress.update(
                {
                    "status": "completed",
                    "percent": 100,
                    "stage": "completed",
                    "message": "标签复查完成",
                    "completedAt": now_iso(),
                    "updatedAt": now_iso(),
                    "reviewedCandidates": reviewed_candidates,
                    "changedCandidates": changed_candidates,
                    "replacedCandidates": replaced_candidates,
                    "deletedCandidates": deleted_candidates,
                    "splitCandidates": split_candidates,
                    "failedCandidates": failed_candidates,
                }
            )
            manifest["status"] = "completed"
            manifest["completedAt"] = progress["completedAt"]
            write_json(base / "manifest.json", manifest)
            write_json(base / "result.json", result)
            await _persist_progress(run_id, progress)
            await emit_log(
                "completed",
                "标签复查任务完成",
                {
                    "reviewedCandidates": reviewed_candidates,
                    "changedCandidates": changed_candidates,
                    "replacedCandidates": replaced_candidates,
                    "deletedCandidates": deleted_candidates,
                    "splitCandidates": split_candidates,
                    "failedCandidates": failed_candidates,
                    "updatedOccurrences": updated_occurrences,
                },
            )
    except Exception as exc:
        progress.update(
            {
                "status": "failed",
                "stage": "failed",
                "message": str(exc),
                "completedAt": now_iso(),
                "updatedAt": now_iso(),
            }
        )
        manifest["status"] = "failed"
        manifest["completedAt"] = progress["completedAt"]
        write_json(base / "manifest.json", manifest)
        write_json(
            base / "result.json",
            {
                "ok": False,
                "error": str(exc),
                "reviewedAt": now_iso(),
            },
        )
        await _persist_progress(run_id, progress)
        await _append_log(
            run_id,
            {
                "ts": now_iso(),
                "stage": "failed",
                "message": "标签复查任务失败",
                "payload": {"error": str(exc)},
            },
        )
    finally:
        TAG_REVIEW_TASKS.pop(run_id, None)
        upsert_run_index(build_run_index_row(run_id))


async def start_tag_review_run(config: BuilderConfig, max_attempts: int = 3) -> Dict[str, Any]:
    ensure_tag_review_storage()
    active_run_id = latest_running_task()
    if active_run_id:
        return get_tag_review_run_snapshot(active_run_id)

    review_config = build_review_config(config)
    jobs = load_jobs()
    review_stats = load_review_stats()
    candidates = annotate_candidates_with_review_stats(collect_tag_review_candidates(jobs), review_stats)
    candidate_summary = build_candidate_summary(candidates)

    run_id = f"tag_review_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    base = run_dir(run_id)
    base.mkdir(parents=True, exist_ok=True)

    manifest = {
        "runId": run_id,
        "status": "queued",
        "taskType": "tag_review",
        "createdAt": now_iso(),
        "completedAt": None,
        "config": summarize_config(review_config),
        "maxAttempts": max_attempts,
        "scope": "all_tag_labels",
        "candidateSummary": candidate_summary,
        "reviewStatsSummary": build_review_stats_summary(review_stats),
    }
    progress = {
        "status": "queued",
        "percent": 0,
        "stage": "queued",
        "message": "等待启动",
        "createdAt": manifest["createdAt"],
        "startedAt": None,
        "completedAt": None,
        "updatedAt": manifest["createdAt"],
        "reviewedCandidates": 0,
        "changedCandidates": 0,
        "replacedCandidates": 0,
        "deletedCandidates": 0,
        "splitCandidates": 0,
        "failedCandidates": 0,
    }
    write_json(base / "manifest.json", manifest)
    write_json(base / "progress.json", progress)
    write_json(base / "result.json", {})
    append_jsonl(
        base / "logs.jsonl",
        {
            "ts": now_iso(),
            "stage": "queued",
            "message": "标签复查任务已创建",
            "payload": {
                "config": summarize_config(review_config),
                "maxAttempts": max_attempts,
                "candidateSummary": candidate_summary,
            },
        },
    )
    upsert_run_index(build_run_index_row(run_id))
    TAG_REVIEW_TASKS[run_id] = asyncio.create_task(_execute_tag_review_run(run_id, config, max_attempts))
    return get_tag_review_run_snapshot(run_id)
