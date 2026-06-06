from __future__ import annotations

from difflib import SequenceMatcher
from typing import Any, Dict, List, Tuple

from job_profile_schema import clean_text, normalize_job_library, promote_tech_stack_item_to_capability, should_demote_tech_stack_item, tech_capability_tag_name, tech_stack_tag_name
from tag_sync import embedding_cache_key, load_embedding_cache, load_jobs, rebuild_tag_assets, save_jobs


SIMILARITY_THRESHOLD = 0.90
CAPABILITY_HINT_THRESHOLD = 0.85
CAPABILITY_HINT_WORDS = (
    "algorithm",
    "algorithmic",
    "\u7b97\u6cd5",
    "awareness",
    "analysis",
    "analytical",
    "recommendation",
    "enhancement",
    "optimization",
    "classification",
    "detection",
    "segmentation",
    "recognition",
    "prediction",
    "forecast",
    "retrieval",
    "multimodal",
    "language model",
    "large language model",
    "llm",
)
STACK_ONLY_WORDS = (
    "python",
    "pytorch",
    "tensorflow",
    "c++",
    "c#",
    "java",
    "javascript",
    "typescript",
    "golang",
    "rust",
    "kotlin",
    "scala",
    "php",
    "ruby",
    "swift",
    "dart",
    "matlab",
    "julia",
    "sql",
    "linux",
    "docker",
    "kubernetes",
    "git",
    "github",
    "gitlab",
    "mysql",
    "postgresql",
    "postgres",
    "redis",
    "mongodb",
    "html",
    "css",
    "vue",
    "react",
    "angular",
    "spring",
    "django",
    "flask",
    "fastapi",
    "numpy",
    "pandas",
    "opencv",
    "spark",
    "hadoop",
    "kafka",
    "nginx",
    "apache",
    "aws",
    "azure",
    "gcp",
    "bash",
    "shell",
)


def canonicalize(text: str) -> str:
    value = clean_text(text).lower()
    if not value:
        return ""
    for token in ("algorithmic", "algorithms", "algorithm", "\u7b97\u6cd5"):
        value = value.replace(token, " ")
    for ch in "-_/.,()[]{}:;|+*&@#!?<>=":
        value = value.replace(ch, " ")
    return " ".join(value.split())


def contains_any(text: str, words: Tuple[str, ...]) -> bool:
    lowered = clean_text(text).lower()
    return any(word in lowered for word in words)


def is_stack_only_name(text: str) -> bool:
    lowered = clean_text(text).lower()
    if not lowered:
        return False
    return contains_any(lowered, STACK_ONLY_WORDS)


def is_capability_like_name(text: str) -> bool:
    lowered = clean_text(text).lower()
    if not lowered:
        return False
    return contains_any(lowered, CAPABILITY_HINT_WORDS)


def similarity(left: str, right: str, shared_cache: Dict[str, Any] | None = None) -> float:
    left_key = canonicalize(left)
    right_key = canonicalize(right)
    if not left_key or not right_key:
        return 0.0
    if left_key == right_key:
        return 1.0
    left_tokens = set(left_key.split())
    right_tokens = set(right_key.split())
    token_overlap = len(left_tokens & right_tokens) / max(1, max(len(left_tokens), len(right_tokens)))
    score = max(SequenceMatcher(None, left_key, right_key).ratio(), token_overlap)
    if shared_cache is not None:
        left_vector = shared_cache.get(embedding_cache_key(left))
        right_vector = shared_cache.get(embedding_cache_key(right))
        if left_vector is not None and right_vector is not None:
            score = max(score, float(left_vector @ right_vector))
    return score


def build_job_capability_keys(job: Dict[str, Any]) -> Dict[str, str]:
    keys: Dict[str, str] = {}
    for item in job.get("techCapabilities", []) or []:
        if clean_text(item.get("type")) == "soft_flag":
            continue
        name = tech_capability_tag_name(item)
        key = canonicalize(name)
        if key and key not in keys:
            keys[key] = name
    return keys


def should_move_to_capability(
    stack_item: Dict[str, Any],
    candidate_capabilities: List[str],
    shared_cache: Dict[str, Any] | None,
) -> Tuple[bool, str, float]:
    current_name = tech_stack_tag_name(stack_item)
    if is_stack_only_name(current_name):
        return False, "", 0.0
    current_key = canonicalize(current_name)
    if not current_key:
        return False, "", 0.0

    best_match = ""
    best_score = 0.0
    for candidate_name in candidate_capabilities:
        score = similarity(current_key, candidate_name, shared_cache)
        if score > best_score:
            best_score = score
            best_match = candidate_name

    if should_demote_tech_stack_item(stack_item) or is_capability_like_name(current_name):
        return True, best_match, best_score
    if best_score >= CAPABILITY_HINT_THRESHOLD and is_capability_like_name(best_match):
        return True, best_match, best_score
    return False, best_match, best_score


def migrate_jobs(jobs: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    shared_cache = load_embedding_cache()
    migrated_jobs: List[Dict[str, Any]] = []
    stats = {
        "jobs": 0,
        "moved": 0,
        "deduped": 0,
        "skipped": 0,
        "examples": [],
    }

    for job in jobs:
        job = dict(job)
        stats["jobs"] += 1
        current_stack_keys = {
            canonicalize(tech_stack_tag_name(item))
            for item in job.get("techStack", []) or []
            if isinstance(item, dict) and tech_stack_tag_name(item)
        }
        job_capability_names = [
            tech_capability_tag_name(item)
            for item in job.get("techCapabilities", []) or []
            if clean_text(item.get("type")) != "soft_flag" and tech_capability_tag_name(item)
        ]
        job_capability_keys = build_job_capability_keys(job)
        next_stack: List[Dict[str, Any]] = []
        next_caps: List[Dict[str, Any]] = []

        for item in job.get("techCapabilities", []) or []:
            if clean_text(item.get("type")) == "soft_flag":
                next_caps.append(item)
                continue
            name = tech_capability_tag_name(item)
            if not name:
                next_caps.append(item)
                continue
            if is_stack_only_name(name):
                stack_key = canonicalize(name)
                if stack_key and stack_key not in current_stack_keys:
                    next_stack.append(
                        {
                            "name": name,
                            "levelRequired": 2,
                            "note": clean_text(item.get("rawExtractedText")) or clean_text(item.get("skillZh")) or "",
                        }
                    )
                    current_stack_keys.add(stack_key)
                continue
            next_caps.append(item)

        for item in job.get("techStack", []) or []:
            if not isinstance(item, dict):
                next_stack.append(item)
                continue

            should_move, matched_name, score = should_move_to_capability(item, job_capability_names, shared_cache)
            current_name = tech_stack_tag_name(item)
            if not should_move:
                next_stack.append(item)
                stats["skipped"] += 1
                continue

            current_key = canonicalize(current_name)
            if current_key in job_capability_keys:
                stats["deduped"] += 1
                continue

            promoted = promote_tech_stack_item_to_capability(item)
            if matched_name and score >= SIMILARITY_THRESHOLD:
                promoted["normalizedTag"] = matched_name
            next_caps.append(promoted)
            job_capability_keys[current_key] = current_name
            stats["moved"] += 1
            if len(stats["examples"]) < 30:
                stats["examples"].append(
                    {
                        "currentName": current_name,
                        "matchedCapability": matched_name,
                        "similarity": round(score, 3),
                    }
                )

        job["techStack"] = next_stack
        job["techCapabilities"] = next_caps
        migrated_jobs.append(job)

    return normalize_job_library(migrated_jobs), stats


def main() -> None:
    jobs = load_jobs()
    migrated_jobs, stats = migrate_jobs(jobs)
    save_jobs(migrated_jobs)
    rebuild_tag_assets(migrated_jobs)
    print(
        {
            "jobs": stats["jobs"],
            "moved": stats["moved"],
            "deduped": stats["deduped"],
            "skipped": stats["skipped"],
            "examples": stats["examples"],
        }
    )


if __name__ == "__main__":
    main()
