import asyncio
import contextlib
import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from fastapi import HTTPException

from job_profile_schema import (
    dev_tool_tag_name,
    dev_tool_tag_name_zh,
    is_tech_stack_branch,
    iter_tech_stack_leaf_items,
    normalize_job_library,
    normalize_job_profile,
    tech_capability_tag_name,
    tech_capability_tag_name_zh,
    tech_stack_tag_name,
    tech_stack_tag_name_zh,
)
from project_paths import (
    BUILDER_DB_DIR,
    BUILDER_RUNS_DIR,
    LEGACY_VECTORS_DIR,
    VECTORS_DIR,
    materialize_job_library_file,
)
from tag_sync import (
    NORMALIZATION_MIN_JOB_COUNT,
    TAG_VIEW_NORMALIZED,
    TAG_VIEW_SOURCE,
    TAG_VIEW_COMPACT,
    normalize_tag_view,
    rebuild_tag_assets,
    summary_file_path,
    stable_tag_id,
    tag_master_file_path,
)

from . import runtime_state as state
from .config import FIXED_DIMENSIONS, JOBS_FILE, LEGACY_VECTOR_FILES, TAG_DIR, logger
from .embedding_service import collect_missing_embedding_tags, embed_batch, refresh_matcher_embedding_cache
from .model_config import VECTOR_PROFILE_GLM_LEGACY, load_vector_model_config
from .utils import clean_text, extract_item_name, normalize, now_iso, parse_int


TAG_SNAPSHOT_INTERVAL_MINUTES = 10
TAG_SNAPSHOT_TASK: Optional[asyncio.Task] = None
TAG_SNAPSHOT_LOCK: Optional[asyncio.Lock] = None


def next_created_seq() -> int:
    if not state.jobs_metadata:
        return 0
    max_seq = -1
    for idx, job in enumerate(state.jobs_metadata):
        meta = job.get("systemMeta") or {}
        max_seq = max(max_seq, parse_int(meta.get("createdSeq"), idx))
    return max_seq + 1


def stamp_new_job_meta(job: Dict[str, Any], source: str = "manual") -> Dict[str, Any]:
    stamped = dict(job)
    meta = dict(stamped.get("systemMeta") or {})
    ts = now_iso()
    meta["createdAt"] = meta.get("createdAt") or ts
    meta["updatedAt"] = ts
    meta["createdSeq"] = parse_int(meta.get("createdSeq"), next_created_seq())
    meta["source"] = clean_text(meta.get("source")) or source
    stamped["systemMeta"] = meta
    return stamped


def stamp_updated_job_meta(
    updated: Dict[str, Any],
    existing: Dict[str, Any],
    source: str = "manual",
) -> Dict[str, Any]:
    stamped = dict(updated)
    existing_meta = dict(existing.get("systemMeta") or {})
    incoming_meta = dict(stamped.get("systemMeta") or {})
    ts = now_iso()
    created_seq = parse_int(
        incoming_meta.get("createdSeq"),
        parse_int(existing_meta.get("createdSeq"), -1),
    )
    if created_seq < 0:
        created_seq = next_created_seq()
    stamped["systemMeta"] = {
        **existing_meta,
        **incoming_meta,
        "createdAt": clean_text(incoming_meta.get("createdAt"))
        or clean_text(existing_meta.get("createdAt"))
        or ts,
        "updatedAt": ts,
        "createdSeq": created_seq,
        "source": clean_text(incoming_meta.get("source"))
        or clean_text(existing_meta.get("source"))
        or source,
    }
    return stamped


def load_jobs_from_disk() -> List[Dict[str, Any]]:
    materialize_job_library_file()
    if not JOBS_FILE.exists():
        state.JOBS_FILE_MTIME = 0.0
        return []
    with open(JOBS_FILE, "r", encoding="utf-8-sig") as handle:
        raw_jobs = json.load(handle)
    state.JOBS_FILE_MTIME = JOBS_FILE.stat().st_mtime
    jobs = raw_jobs if isinstance(raw_jobs, list) else list(raw_jobs.values())[0]
    return normalize_job_library(jobs)


def save_jobs_to_disk() -> None:
    with open(JOBS_FILE, "w", encoding="utf-8") as handle:
        json.dump(normalize_job_library(state.jobs_metadata), handle, ensure_ascii=False, indent=2)
    state.JOBS_FILE_MTIME = JOBS_FILE.stat().st_mtime


def rebuild_job_runtime(jobs_list: List[Dict[str, Any]]) -> None:
    state.jobs_metadata = []
    state.global_tag_freq = {}
    state.inverted_index = {}
    directions = set()
    industries = set()

    for job in jobs_list:
        state.jobs_metadata.append(job)
        idx = len(state.jobs_metadata) - 1
        directions.add(clean_text(job.get("direction")))
        for raw_industry in clean_text(job.get("industry")).split(","):
            industry = clean_text(raw_industry)
            if industry:
                industries.add(industry)

        tech_tags = set()
        for item in iter_tech_stack_leaf_items(job.get("techStack", [])):
            name = tech_stack_tag_name(item)
            if name:
                tech_tags.add(name)

        dev_tags = set()
        for item in job.get("devTools", []):
            name = dev_tool_tag_name(item)
            if name:
                dev_tags.add(name)

        core_tags = set()
        for item in job.get("techCapabilities", []):
            if clean_text(item.get("type")) == "soft_flag":
                continue
            name = tech_capability_tag_name(item)
            if name:
                core_tags.add(name)

        for tag in tech_tags:
            state.global_tag_freq[tag] = state.global_tag_freq.get(tag, 0) + 1
            state.inverted_index.setdefault(tag, []).append((idx, "tech"))
        for tag in dev_tags:
            state.global_tag_freq[tag] = state.global_tag_freq.get(tag, 0) + 1
            state.inverted_index.setdefault(tag, []).append((idx, "dev"))
        for tag in core_tags:
            state.global_tag_freq[tag] = state.global_tag_freq.get(tag, 0) + 1
            state.inverted_index.setdefault(tag, []).append((idx, "core"))

    state.metadata_cache = {
        "directions": sorted([item for item in directions if item]),
        "industries": sorted(industries),
    }


def load_legacy_vectors() -> None:
    state.tag_vectors_cache.clear()
    vector_config = load_vector_model_config()
    if vector_config.profile_id != VECTOR_PROFILE_GLM_LEGACY:
        logger.info(
            f"Skipping legacy vector preload for active embedding profile: {vector_config.profile_id}"
        )
        return
    for base_dir in (VECTORS_DIR, LEGACY_VECTORS_DIR):
        if not base_dir.exists():
            continue
        for vector_file in LEGACY_VECTOR_FILES:
            path = base_dir / vector_file
            if not path.exists():
                continue
            with open(path, "r", encoding="utf-8") as handle:
                for line in handle:
                    if not line.strip():
                        continue
                    try:
                        item = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    key = item.get("id") or item.get("k")
                    vector = item.get("vector") or item.get("v")
                    if key and vector:
                        state.tag_vectors_cache[str(key).strip()] = normalize(
                            np.array(vector, dtype=np.float32)
                        )
        if state.tag_vectors_cache:
            break
    logger.info(f"Loaded {len(state.tag_vectors_cache)} legacy tag vectors into cache.")


def next_tag_snapshot_run(now: Optional[datetime] = None) -> datetime:
    current = now or datetime.now()
    base = current.replace(second=0, microsecond=0)
    minutes_until_next = TAG_SNAPSHOT_INTERVAL_MINUTES - (
        base.minute % TAG_SNAPSHOT_INTERVAL_MINUTES
    )
    return base + timedelta(minutes=minutes_until_next)


def get_tag_snapshot_lock() -> asyncio.Lock:
    global TAG_SNAPSHOT_LOCK
    if TAG_SNAPSHOT_LOCK is None:
        TAG_SNAPSHOT_LOCK = asyncio.Lock()
    return TAG_SNAPSHOT_LOCK


async def rebuild_tag_snapshot_from_disk(
    label: str = "TagSnapshot",
    embed_missing: bool = False,
) -> Dict[str, Any]:
    async with get_tag_snapshot_lock():
        jobs = load_jobs_from_disk()
        rebuild_job_runtime(jobs)
        tag_summary = rebuild_tag_assets(state.jobs_metadata)
        await refresh_matcher_embedding_cache(label=label, embed_missing=embed_missing)
        logger.info(
            f"[{label}] exported tag center snapshot. "
            f"jobs={len(state.jobs_metadata)}, tags={tag_summary.get('tagCount', 0)}"
        )
        return tag_summary


async def tag_snapshot_scheduler() -> None:
    while True:
        run_at = next_tag_snapshot_run()
        delay = max(0.0, (run_at - datetime.now()).total_seconds())
        logger.info(f"[TagSnapshot] next export scheduled at {run_at.isoformat(timespec='seconds')}")
        await asyncio.sleep(delay)
        try:
            await rebuild_tag_snapshot_from_disk(label="ScheduledTagSnapshot", embed_missing=False)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[TagSnapshot] scheduled export failed")


def start_tag_snapshot_scheduler() -> None:
    global TAG_SNAPSHOT_TASK
    if TAG_SNAPSHOT_TASK is not None and not TAG_SNAPSHOT_TASK.done():
        return
    TAG_SNAPSHOT_TASK = asyncio.create_task(tag_snapshot_scheduler())


async def shutdown_runtime() -> None:
    global TAG_SNAPSHOT_TASK
    if TAG_SNAPSHOT_TASK is None:
        return
    TAG_SNAPSHOT_TASK.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await TAG_SNAPSHOT_TASK
    TAG_SNAPSHOT_TASK = None


async def initialize_runtime() -> None:
    logger.info("Initializing unified job system runtime...")
    materialize_job_library_file()
    load_legacy_vectors()
    await rebuild_tag_snapshot_from_disk(label="Startup", embed_missing=False)
    logger.info(
        f"Runtime state initialized. Jobs: {len(state.jobs_metadata)}, tags: {len(state.inverted_index)}"
    )
    start_tag_snapshot_scheduler()


async def ensure_jobs_fresh(embed_missing: bool = True, refresh_tag_snapshot: bool = False) -> None:
    materialize_job_library_file()
    if not JOBS_FILE.exists():
        return
    current_mtime = JOBS_FILE.stat().st_mtime
    if current_mtime != state.JOBS_FILE_MTIME:
        rebuild_job_runtime(load_jobs_from_disk())
        if refresh_tag_snapshot:
            rebuild_tag_assets(state.jobs_metadata)
        await refresh_matcher_embedding_cache(label="DiskRefresh", embed_missing=embed_missing)


async def persist_and_refresh_jobs(embed_new_tags: bool = False) -> None:
    save_jobs_to_disk()
    rebuild_job_runtime(load_jobs_from_disk())
    await refresh_matcher_embedding_cache(label="JobMutation-Sync", embed_missing=False)
    if embed_new_tags:
        new_tags = collect_missing_embedding_tags()
        if new_tags:
            await embed_batch(new_tags, label="JobMutation")


def generate_next_job_id() -> str:
    max_num = 0
    for job in state.jobs_metadata:
        job_id = clean_text(job.get("id"))
        if job_id.startswith("Job_"):
            suffix = job_id[4:]
            if suffix.isdigit():
                max_num = max(max_num, int(suffix))
    return f"Job_{max_num + 1}"


def get_job_or_404(job_id: str) -> Dict[str, Any]:
    for job in state.jobs_metadata:
        if clean_text(job.get("id")) == clean_text(job_id):
            return job
    raise HTTPException(status_code=404, detail="Job not found")


def get_job_index_or_404(job_id: str) -> int:
    for idx, job in enumerate(state.jobs_metadata):
        if clean_text(job.get("id")) == clean_text(job_id):
            return idx
    raise HTTPException(status_code=404, detail="Job not found")


def extract_tag_stats(view: str = TAG_VIEW_NORMALIZED) -> List[Dict[str, Any]]:
    view = normalize_tag_view(view)
    total_jobs = len(state.jobs_metadata) or 1
    stats: Dict[Tuple[str, str], Dict[str, Any]] = {}

    def upsert(tag_name: str, tag_type: str, tag_name_zh: str = "", tag_id: str = "", group_id: str = "") -> None:
        name = clean_text(tag_name)
        if not name:
            return
        key = (tag_type, tag_id or name)
        entry = stats.setdefault(
            key,
            {
                "tagId": tag_id or "",
                "tagName": name,
                "tagNameZh": clean_text(tag_name_zh) or name,
                "tagType": tag_type,
                "groupId": group_id or "",
                "jobCount": 0,
                "jobRatio": 0,
            },
        )
        entry["jobCount"] += 1
        if not clean_text(entry.get("tagNameZh")) and clean_text(tag_name_zh):
            entry["tagNameZh"] = clean_text(tag_name_zh)

    for job in state.jobs_metadata:
        seen = set()
        for item in job.get("techStack", []):
            if is_tech_stack_branch(item):
                group_id = clean_text(item.get("groupId")) or clean_text(item.get("groupName"))
                for option in item.get("options", []):
                    tag_name = (
                        clean_text(option.get("rawExtractedText"))
                        or clean_text(option.get("name"))
                        or clean_text(option.get("skill"))
                        or clean_text(option.get("normalizedName"))
                    ) if view == TAG_VIEW_SOURCE and isinstance(option, dict) else tech_stack_tag_name(option)
                    key = ("techStack", tag_name)
                    if tag_name and key not in seen:
                        upsert(
                            tag_name,
                            "techStack",
                            tech_stack_tag_name_zh(option) if isinstance(option, dict) else tag_name,
                            "",
                            group_id,
                        )
                        seen.add(key)
                continue
            tag_name = (
                clean_text(item.get("rawExtractedText"))
                or clean_text(item.get("nameZh"))
                or clean_text(item.get("skillZh"))
                or clean_text(item.get("name"))
            ) if view == TAG_VIEW_SOURCE else tech_stack_tag_name(item)
            key = ("techStack", tag_name)
            if tag_name and key not in seen:
                upsert(tag_name, "techStack", tech_stack_tag_name_zh(item))
                seen.add(key)
        for item in job.get("techCapabilities", []):
            if clean_text(item.get("type")) == "soft_flag":
                continue
            tag_name = (
                clean_text(item.get("rawExtractedText"))
                or clean_text(item.get("skillZh"))
                or clean_text(item.get("skill"))
                or clean_text(item.get("normalizedTag"))
            ) if view == TAG_VIEW_SOURCE else tech_capability_tag_name(item)
            key = ("techCapabilities", tag_name)
            if tag_name and key not in seen:
                upsert(tag_name, "techCapabilities", tech_capability_tag_name_zh(item))
                seen.add(key)
        for item in job.get("devTools", []):
            tag_name = (
                clean_text(item.get("rawExtractedText"))
                or clean_text(item.get("skillZh"))
                or clean_text(item.get("skill"))
                or clean_text(item.get("normalizedTag"))
            ) if view == TAG_VIEW_SOURCE else dev_tool_tag_name(item)
            key = ("devTools", tag_name)
            if tag_name and key not in seen:
                upsert(tag_name, "devTools", dev_tool_tag_name_zh(item))
                seen.add(key)
        for item in job.get("softQuality", []):
            tag_name = extract_item_name(item)
            key = ("softQuality", tag_name)
            if tag_name and key not in seen:
                upsert(tag_name, "softQuality", tag_name)
                seen.add(key)
        for item in job.get("growthPotential", []):
            tag_name = extract_item_name(item)
            key = ("growthPotential", tag_name)
            if tag_name and key not in seen:
                upsert(tag_name, "growthPotential", tag_name)
                seen.add(key)
    rows = []
    for entry in stats.values():
        entry["jobRatio"] = round(entry["jobCount"] / total_jobs, 6)
        entry["isHighFrequency"] = entry["jobRatio"] >= 0.01
        rows.append(entry)
    rows.sort(key=lambda item: (-item["jobRatio"], item["tagType"], item["tagName"]))
    return rows


def load_tag_master_rows(view: str = TAG_VIEW_NORMALIZED) -> List[Dict[str, Any]]:
    path = tag_master_file_path(view)
    if path.exists():
        try:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
            if isinstance(payload, list):
                return payload
        except Exception:
            pass
    rows = extract_tag_stats(view=view)
    for row in rows:
        tag_type = clean_text(row.get("tagType"))
        tag_name = clean_text(row.get("canonicalName") or row.get("tagName"))
        if tag_type and tag_name and not clean_text(row.get("tagId")):
            row["tagId"] = stable_tag_id(tag_type, tag_name)
    return rows


def load_tag_summary_row(view: str = TAG_VIEW_NORMALIZED) -> Dict[str, Any]:
    path = summary_file_path(view)
    if path.exists():
        try:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
            if isinstance(payload, dict):
                return payload
        except Exception:
            pass
    rows = load_tag_master_rows(view=view)
    return {
        "view": normalize_tag_view(view),
        "jobCount": len(state.jobs_metadata),
        "tagCount": len(rows),
        "highFrequencyTagCount": sum(1 for row in rows if row.get("isHighFrequency")),
        "threshold": 0.01,
    }


def split_regular_and_fixed_tag_rows(
    rows: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, List[Dict[str, Any]]]]:
    fixed_index = {tag_type: set(names) for tag_type, names in FIXED_DIMENSIONS.items()}
    regular_rows: List[Dict[str, Any]] = []
    fixed_rows: Dict[str, List[Dict[str, Any]]] = {tag_type: [] for tag_type in FIXED_DIMENSIONS}

    for row in rows:
        tag_type = clean_text(row.get("tagType"))
        tag_name = clean_text(row.get("tagName") or row.get("canonicalName"))
        if tag_type in fixed_index and tag_name in fixed_index[tag_type]:
            fixed_rows[tag_type].append(row)
        else:
            regular_rows.append(row)

    for tag_type, names in FIXED_DIMENSIONS.items():
        existing = {
            clean_text(row.get("tagName") or row.get("canonicalName")): row
            for row in fixed_rows[tag_type]
        }
        completed_rows: List[Dict[str, Any]] = []
        for name in names:
            row = existing.get(name)
            if row:
                completed_rows.append(row)
            else:
                completed_rows.append(
                    {
                        "tagId": "",
                        "tagName": name,
                        "canonicalName": name,
                        "tagType": tag_type,
                        "tagNameZh": name,
                        "jobCount": 0,
                        "jobRatio": 0,
                        "isHighFrequency": False,
                        "groupId": "",
                        "isFixedDimension": True,
                    }
                )
        fixed_rows[tag_type] = completed_rows
    return regular_rows, fixed_rows


def count_index_rows(path) -> int:
    if not path.exists():
        return 0
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return 0
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        return len(payload["data"])
    return 0


def count_builder_runs() -> int:
    if BUILDER_RUNS_DIR.exists():
        count = sum(
            1
            for run_dir in BUILDER_RUNS_DIR.iterdir()
            if run_dir.is_dir() and (run_dir / "manifest.json").exists()
        )
        if count:
            return count
    return count_index_rows(BUILDER_DB_DIR / "runs_index.json")


def get_admin_run_breakdown() -> Dict[str, int]:
    builder_count = count_builder_runs()
    normalization_count = count_index_rows(TAG_DIR / "normalization_runs" / "runs_index.json")
    tag_review_count = count_index_rows(TAG_DIR / "tag_review_runs" / "runs_index.json")
    total = builder_count + normalization_count + tag_review_count
    return {
        "builder": builder_count,
        "normalization": normalization_count,
        "tagReview": tag_review_count,
        "total": total,
    }


def list_jobs_data(
    page: int = 1,
    limit: int = 24,
    basic_keyword: str = "",
    jd_keyword: str = "",
    direction: str = "",
    industry: str = "",
    sort_by: str = "default",
) -> Dict[str, Any]:
    basic_keyword_lc = clean_text(basic_keyword).lower()
    jd_keyword_lc = clean_text(jd_keyword).lower()
    direction = clean_text(direction)
    industry = clean_text(industry)
    sort_by = clean_text(sort_by)

    filtered = list(state.jobs_metadata)
    if direction:
        filtered = [job for job in filtered if direction in clean_text(job.get("direction"))]
    if industry:
        filtered = [job for job in filtered if industry in clean_text(job.get("industry"))]
    if basic_keyword_lc:
        next_filtered = []
        for job in filtered:
            job_id = clean_text(job.get("id")).lower()
            title = clean_text(job.get("title")).lower()
            company = clean_text(job.get("companyName")).lower()
            if (
                basic_keyword_lc in job_id
                or basic_keyword_lc in title
                or basic_keyword_lc in company
            ):
                next_filtered.append(job)
        filtered = next_filtered
    if jd_keyword_lc:
        next_filtered = []
        for job in filtered:
            jd_split = job.get("jdSplit") or {}
            jd_text = " ".join(
                item
                for field in ("jobDescriptions", "jobRequirements", "bonusPoints", "notes")
                for item in (jd_split.get(field) or [])
                if isinstance(item, str)
            ).lower()
            if jd_keyword_lc in jd_text:
                next_filtered.append(job)
        filtered = next_filtered

    indexed_filtered = list(enumerate(filtered))
    if sort_by == "recent_created":
        indexed_filtered.sort(
            key=lambda row: parse_int((row[1].get("systemMeta") or {}).get("createdSeq"), row[0]),
            reverse=True,
        )
    elif sort_by == "history":
        indexed_filtered.sort(
            key=lambda row: parse_int((row[1].get("systemMeta") or {}).get("createdSeq"), row[0]),
        )
    elif sort_by == "recent_updated":
        indexed_filtered.sort(
            key=lambda row: clean_text((row[1].get("systemMeta") or {}).get("updatedAt")),
            reverse=True,
        )
    filtered = [job for _, job in indexed_filtered]

    total = len(filtered)
    start = (page - 1) * limit
    end = start + limit
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "sortBy": sort_by or "default",
        "hasMore": end < total,
        "data": filtered[start:end],
    }


def get_admin_summary_data() -> Dict[str, Any]:
    normalized_summary = load_tag_summary_row(TAG_VIEW_NORMALIZED)
    source_summary = load_tag_summary_row(TAG_VIEW_SOURCE)
    regular_rows, fixed_rows = split_regular_and_fixed_tag_rows(load_tag_master_rows(TAG_VIEW_NORMALIZED))
    snapshot_job_count = int(normalized_summary.get("jobCount") or len(state.jobs_metadata))
    run_breakdown = get_admin_run_breakdown()
    return {
        "jobCount": snapshot_job_count,
        "directionCount": len(state.metadata_cache.get("directions", [])),
        "industryCount": len(state.metadata_cache.get("industries", [])),
        "tagCount": len(regular_rows),
        "compactTagCount": sum(
            1 for row in regular_rows if int(row.get("jobCount") or 0) >= NORMALIZATION_MIN_JOB_COUNT
        ),
        "highFrequencyTagCount": sum(1 for row in regular_rows if row.get("isHighFrequency")),
        "fixedDimensionCount": sum(len(items) for items in fixed_rows.values()),
        "rawTagCount": source_summary.get("tagCount", 0),
        "normalizedTagCount": normalized_summary.get("tagCount", 0),
        "runCount": run_breakdown["total"],
        "runBreakdown": run_breakdown,
    }


def get_admin_tags_data(
    q: str = "",
    tag_type: str = "",
    min_ratio: float = 0.0,
    limit: int = 200,
    view: str = TAG_VIEW_NORMALIZED,
) -> Dict[str, Any]:
    q = clean_text(q).lower()
    tag_type = clean_text(tag_type)
    view = normalize_tag_view(view)
    rows, fixed_rows = split_regular_and_fixed_tag_rows(load_tag_master_rows(view))
    if view == TAG_VIEW_COMPACT:
        rows = [row for row in rows if int(row.get("jobCount") or 0) >= NORMALIZATION_MIN_JOB_COUNT]
    if tag_type:
        rows = [row for row in rows if row.get("tagType") == tag_type]
    if min_ratio > 0:
        rows = [row for row in rows if row.get("jobRatio", 0) >= min_ratio]
    if q:
        rows = [
            row
            for row in rows
            if q in clean_text(row.get("canonicalName") or row.get("tagName")).lower()
            or q in clean_text(row.get("canonicalNameZh") or row.get("tagNameZh")).lower()
            or q in clean_text(row.get("tagId")).lower()
        ]
    for row in rows:
        if "tagName" not in row:
            row["tagName"] = row.get("canonicalName", "")
        if "tagNameZh" not in row:
            row["tagNameZh"] = row.get("canonicalNameZh") or row.get("tagName", "")
        row["isFixedDimension"] = False
    return {
        "total": len(rows),
        "data": rows[:limit],
        "view": view,
        "availableViews": [
            {"value": TAG_VIEW_COMPACT, "label": "Compact Normalized Tags"},
            {"value": TAG_VIEW_NORMALIZED, "label": "Normalized Tags"},
            {"value": TAG_VIEW_SOURCE, "label": "Raw Extracted Tags"},
        ],
        "fixedDimensions": {
            key: [
                {
                    **row,
                    "tagName": row.get("tagName") or row.get("canonicalName", ""),
                    "tagNameZh": row.get("tagNameZh") or row.get("canonicalNameZh") or row.get("tagName") or row.get("canonicalName", ""),
                    "isFixedDimension": True,
                }
                for row in value
            ]
            for key, value in fixed_rows.items()
        },
        "fixedDimensionConfig": FIXED_DIMENSIONS,
    }


def get_admin_frequency_data(
    q: str = "",
    tag_type: str = "",
    min_ratio: float = 0.0,
    limit: int = 500,
    view: str = TAG_VIEW_NORMALIZED,
) -> Dict[str, Any]:
    q = clean_text(q).lower()
    tag_type = clean_text(tag_type)
    view = normalize_tag_view(view)
    summary = load_tag_summary_row(view)
    rows = []
    for row in load_tag_master_rows(view):
        current_tag_type = clean_text(row.get("tagType"))
        name = clean_text(row.get("canonicalName") or row.get("tagName"))
        if not name:
            continue
        if view == TAG_VIEW_COMPACT and int(row.get("jobCount") or 0) < NORMALIZATION_MIN_JOB_COUNT:
            continue
        if tag_type and current_tag_type != tag_type:
            continue
        job_ratio = float(row.get("jobRatio") or 0)
        if min_ratio > 0 and job_ratio < min_ratio:
            continue
        name_zh = clean_text(row.get("canonicalNameZh") or row.get("tagNameZh")) or name
        if q and q not in name.lower() and q not in name_zh.lower() and q not in clean_text(row.get("tagId")).lower():
            continue
        rows.append(
            {
                "tagId": clean_text(row.get("tagId")),
                "tagType": current_tag_type,
                "name": name,
                "nameZh": name_zh,
                "frequency": int(row.get("jobCount") or 0),
                "jobRatio": job_ratio,
                "isHighFrequency": bool(row.get("isHighFrequency")),
                "updatedAt": clean_text(summary.get("updatedAt")),
            }
        )
    rows.sort(key=lambda item: (-item["frequency"], item["tagType"], item["name"]))
    return {
        "total": len(rows),
        "updatedAt": clean_text(summary.get("updatedAt")),
        "jobCount": int(summary.get("jobCount") or len(state.jobs_metadata)),
        "data": rows[:limit],
    }


async def create_job_record(job_payload: Dict[str, Any]) -> Dict[str, Any]:
    job = stamp_new_job_meta(normalize_job_profile(dict(job_payload)), source="manual")
    if not clean_text(job.get("id")):
        job["id"] = generate_next_job_id()
    if any(
        clean_text(existing.get("id")) == clean_text(job["id"])
        for existing in state.jobs_metadata
    ):
        raise HTTPException(status_code=409, detail="Job ID already exists")
    state.jobs_metadata.append(job)
    await persist_and_refresh_jobs(embed_new_tags=True)
    return {"job": get_job_or_404(clean_text(job["id"]))}


async def update_job_record(job_id: str, job_payload: Dict[str, Any]) -> Dict[str, Any]:
    idx = get_job_index_or_404(job_id)
    updated = stamp_updated_job_meta(normalize_job_profile(dict(job_payload)), state.jobs_metadata[idx], source="manual")
    updated["id"] = job_id
    state.jobs_metadata[idx] = updated
    await persist_and_refresh_jobs(embed_new_tags=True)
    return {"job": get_job_or_404(job_id)}


async def delete_job_record(job_id: str) -> Dict[str, Any]:
    idx = get_job_index_or_404(job_id)
    removed = state.jobs_metadata.pop(idx)
    await persist_and_refresh_jobs(embed_new_tags=False)
    return {"deleted": True, "jobId": job_id, "title": removed.get("title")}
