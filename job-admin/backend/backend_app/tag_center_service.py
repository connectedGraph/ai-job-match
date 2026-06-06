from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from project_paths import TAG_DIR

from .utils import clean_text


TAG_CENTER_MASTER_FILE = TAG_DIR / "tag_master_normalized.json"
TAG_CENTER_TYPES = {"techStack", "techCapabilities", "devTools"}
_TAG_CENTER_CACHE: tuple[tuple[int, int], List[Dict[str, Any]]] | None = None


def _norm(value: Any) -> str:
    return clean_text(value).lower()


def load_tag_center_rows() -> List[Dict[str, Any]]:
    global _TAG_CENTER_CACHE
    if not TAG_CENTER_MASTER_FILE.exists():
        return []
    try:
        stat = TAG_CENTER_MASTER_FILE.stat()
        signature = (int(stat.st_mtime_ns), int(stat.st_size))
    except Exception:
        signature = (0, 0)
    if _TAG_CENTER_CACHE and _TAG_CENTER_CACHE[0] == signature:
        return _TAG_CENTER_CACHE[1]
    try:
        payload = json.loads(TAG_CENTER_MASTER_FILE.read_text(encoding="utf-8-sig"))
    except Exception:
        return []
    if not isinstance(payload, list):
        return []
    rows = [row for row in payload if isinstance(row, dict)]
    _TAG_CENTER_CACHE = (signature, rows)
    return rows


def tag_center_public_row(row: Dict[str, Any]) -> Dict[str, Any]:
    normalized_tag = clean_text(row.get("canonicalName") or row.get("tagName"))
    name_zh = clean_text(row.get("canonicalNameZh") or row.get("tagNameZh")) or normalized_tag
    public = {
        "tagId": clean_text(row.get("tagId")),
        "tagType": clean_text(row.get("tagType")),
        "normalizedTag": normalized_tag,
        "name": normalized_tag,
        "nameZh": name_zh,
        "displayName": name_zh,
        "jobCount": int(row.get("jobCount") or 0),
        "jobRatio": float(row.get("jobRatio") or 0),
        "isHighFrequency": bool(row.get("isHighFrequency")),
        "groupId": clean_text(row.get("groupId")),
    }
    type_counts = row.get("typeCounts")
    if isinstance(type_counts, dict):
        cleaned = {
            clean_text(key): int(value or 0)
            for key, value in type_counts.items()
            if clean_text(key) and int(value or 0) > 0
        }
        if cleaned:
            public["typeCounts"] = dict(sorted(cleaned.items(), key=lambda pair: (-pair[1], pair[0])))
    capability_type = clean_text(row.get("type"))
    if capability_type:
        public["type"] = capability_type
    elif public.get("typeCounts"):
        public["type"] = next(iter(public["typeCounts"]))
    return public


def _matches_query(row: Dict[str, Any], query: str) -> bool:
    if not query:
        return True
    public = tag_center_public_row(row)
    candidates = [
        public["tagId"],
        public["normalizedTag"],
        public["nameZh"],
        public["displayName"],
    ]
    return any(query in _norm(value) for value in candidates)


def search_tag_center(
    *,
    query: str = "",
    tag_type: str = "",
    limit: int = 20,
    min_job_count: int = 0,
) -> Dict[str, Any]:
    safe_query = _norm(query)
    safe_type = clean_text(tag_type)
    rows = []
    for row in load_tag_center_rows():
        current_type = clean_text(row.get("tagType"))
        if safe_type and current_type != safe_type:
            continue
        if current_type not in TAG_CENTER_TYPES:
            continue
        if int(row.get("jobCount") or 0) < max(0, min_job_count):
            continue
        if not _matches_query(row, safe_query):
            continue
        rows.append(tag_center_public_row(row))

    rows.sort(
        key=lambda item: (
            0 if safe_query and safe_query == _norm(item["nameZh"]) else 1,
            0 if safe_query and safe_query == _norm(item["normalizedTag"]) else 1,
            -item["jobCount"],
            item["tagType"],
            item["normalizedTag"].lower(),
        )
    )
    return {"total": len(rows), "data": rows[: max(1, limit)]}


def resolve_tag_center(
    *,
    tag_id: str = "",
    value: str = "",
    tag_type: str = "",
) -> Optional[Dict[str, Any]]:
    safe_id = clean_text(tag_id)
    safe_value = _norm(value)
    safe_type = clean_text(tag_type)
    if not safe_id and not safe_value:
        return None

    for row in load_tag_center_rows():
        current_type = clean_text(row.get("tagType"))
        if safe_type and current_type != safe_type:
            continue
        public = tag_center_public_row(row)
        if safe_id and public["tagId"] == safe_id:
            return public
        if safe_value and safe_value in {
            _norm(public["normalizedTag"]),
            _norm(public["nameZh"]),
            _norm(public["displayName"]),
        }:
            return public
    return None
