from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from job_profile_schema import iter_tech_stack_leaf_items

from . import runtime_state as state
from .job_data_service import get_admin_frequency_data, load_jobs_from_disk, rebuild_job_runtime
from .utils import clean_text, parse_int
from project_paths import EXPORTS_DIR
from tag_sync import TAG_VIEW_NORMALIZED, normalize_tag_view


DEFAULT_EXPORT_DIR = EXPORTS_DIR


def _ensure_jobs_loaded() -> None:
    if state.jobs_metadata:
        return
    rebuild_job_runtime(load_jobs_from_disk())


def _to_float(value: Any) -> Optional[float]:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _lower(value: Any) -> str:
    return clean_text(value).lower()


def _job_salary_range(job: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    metadata = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
    salary_range = metadata.get("salaryRange")
    if not isinstance(salary_range, list) or len(salary_range) != 2:
        return None
    min_salary = _to_float(salary_range[0])
    max_salary = _to_float(salary_range[1])
    if min_salary is None or max_salary is None:
        return None
    return min_salary, max_salary


def _job_text_blob(job: Dict[str, Any]) -> str:
    parts: List[str] = [
        clean_text(job.get("id")),
        clean_text(job.get("title")),
        clean_text(job.get("companyName")),
        clean_text(job.get("direction")),
        clean_text(job.get("industry")),
        clean_text((job.get("metadata") or {}).get("jobType")),
        clean_text((job.get("basicRequirements") or {}).get("education_min")),
    ]
    jd_split = job.get("jdSplit") if isinstance(job.get("jdSplit"), dict) else {}
    for field in ("jobDescriptions", "jobRequirements", "bonusPoints", "notes"):
        for item in jd_split.get(field) or []:
            if isinstance(item, str):
                parts.append(item)
    for item in iter_tech_stack_leaf_items(job.get("techStack", [])):
        parts.extend(
            clean_text(item.get(field))
            for field in ("normalizedTag", "name", "skill", "normalizedName", "rawExtractedText")
        )
    for item in job.get("techCapabilities", []) or []:
        if not isinstance(item, dict) or _lower(item.get("type")) == "soft_flag":
            continue
        parts.extend(
            clean_text(item.get(field))
            for field in ("normalizedTag", "name", "skill", "normalizedName", "rawExtractedText", "skillZh")
        )
    for item in job.get("devTools", []) or []:
        if not isinstance(item, dict):
            continue
        parts.extend(
            clean_text(item.get(field))
            for field in ("normalizedTag", "name", "skill", "normalizedName", "rawExtractedText", "skillZh")
        )
    return " ".join(part for part in parts if part).lower()


def _item_matches(item: Any, query: str) -> bool:
    if not query:
        return True
    if not isinstance(item, dict):
        return query in clean_text(item).lower()
    fields = ("normalizedTag", "name", "skill", "normalizedName", "rawExtractedText", "skillZh", "nameZh")
    for field in fields:
        if query in _lower(item.get(field)):
            return True
    return False


def _branch_matches(branch: Any, query: str) -> bool:
    if not query:
        return True
    if isinstance(branch, dict) and branch.get("type") == "branch":
        for option in branch.get("options", []) or []:
            if _item_matches(option, query):
                return True
        return False
    return _item_matches(branch, query)


def _tech_stack_matches(job: Dict[str, Any], query: str) -> bool:
    if not query:
        return True
    for item in job.get("techStack", []) or []:
        if _branch_matches(item, query):
            return True
        if isinstance(item, dict):
            for option in item.get("options", []) or []:
                if _item_matches(option, query):
                    return True
    return False


def _tech_capability_matches(job: Dict[str, Any], query: str) -> bool:
    if not query:
        return True
    for item in job.get("techCapabilities", []) or []:
        if not isinstance(item, dict) or _lower(item.get("type")) == "soft_flag":
            continue
        if _item_matches(item, query):
            return True
    return False


def _dev_tool_matches(job: Dict[str, Any], query: str) -> bool:
    if not query:
        return True
    for item in job.get("devTools", []) or []:
        if not isinstance(item, dict):
            continue
        if _item_matches(item, query):
            return True
    return False


def _any_tag_matches(job: Dict[str, Any], query: str) -> bool:
    if not query:
        return True
    return (
        _tech_stack_matches(job, query)
        or _tech_capability_matches(job, query)
        or _dev_tool_matches(job, query)
    )


def _job_matches(
    job: Dict[str, Any],
    *,
    keyword: str = "",
    basic_keyword: str = "",
    jd_keyword: str = "",
    direction: str = "",
    industry: str = "",
    company_name: str = "",
    job_type: str = "",
    tag: str = "",
    tech_stack: str = "",
    tech_capability: str = "",
    dev_tool: str = "",
    salary_min: Optional[float] = None,
    salary_max: Optional[float] = None,
) -> bool:
    blob = _job_text_blob(job)
    if keyword and keyword not in blob:
        return False

    if basic_keyword:
        job_id = _lower(job.get("id"))
        title = _lower(job.get("title"))
        company = _lower(job.get("companyName"))
        if basic_keyword not in job_id and basic_keyword not in title and basic_keyword not in company:
            return False

    if jd_keyword:
        jd_split = job.get("jdSplit") if isinstance(job.get("jdSplit"), dict) else {}
        jd_blob = " ".join(
            item
            for field in ("jobDescriptions", "jobRequirements", "bonusPoints", "notes")
            for item in (jd_split.get(field) or [])
            if isinstance(item, str)
        ).lower()
        if jd_keyword not in jd_blob:
            return False

    if direction and direction not in _lower(job.get("direction")):
        return False
    if industry and industry not in _lower(job.get("industry")):
        return False
    if company_name and company_name not in _lower(job.get("companyName")):
        return False

    metadata = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
    if job_type and job_type not in _lower(metadata.get("jobType")):
        return False

    if salary_min is not None or salary_max is not None:
        job_salary = _job_salary_range(job)
        if job_salary is None:
            return False
        job_min, job_max = job_salary
        if salary_min is not None and job_max < salary_min:
            return False
        if salary_max is not None and job_min > salary_max:
            return False

    if tag and not _any_tag_matches(job, tag):
        return False
    if tech_stack and not _tech_stack_matches(job, tech_stack):
        return False
    if tech_capability and not _tech_capability_matches(job, tech_capability):
        return False
    if dev_tool and not _dev_tool_matches(job, dev_tool):
        return False
    return True


def _sorted_jobs(jobs: List[Dict[str, Any]], sort_by: str) -> List[Dict[str, Any]]:
    indexed = list(enumerate(jobs))
    normalized = clean_text(sort_by)
    if normalized == "recent_created":
        indexed.sort(
            key=lambda row: parse_int((row[1].get("systemMeta") or {}).get("createdSeq"), row[0]),
            reverse=True,
        )
    elif normalized == "history":
        indexed.sort(
            key=lambda row: parse_int((row[1].get("systemMeta") or {}).get("createdSeq"), row[0]),
        )
    elif normalized == "recent_updated":
        indexed.sort(
            key=lambda row: clean_text((row[1].get("systemMeta") or {}).get("updatedAt")),
            reverse=True,
        )
    else:
        indexed.sort(
            key=lambda row: (
                parse_int((row[1].get("systemMeta") or {}).get("createdSeq"), row[0]),
                clean_text(row[1].get("id")),
            ),
            reverse=True,
        )
    return [job for _, job in indexed]


def filter_jobs_data(
    *,
    keyword: str = "",
    basic_keyword: str = "",
    jd_keyword: str = "",
    direction: str = "",
    industry: str = "",
    company_name: str = "",
    job_type: str = "",
    tag: str = "",
    tech_stack: str = "",
    tech_capability: str = "",
    dev_tool: str = "",
    salary_min: Optional[float] = None,
    salary_max: Optional[float] = None,
    sort_by: str = "default",
) -> List[Dict[str, Any]]:
    _ensure_jobs_loaded()
    keyword_lc = _lower(keyword)
    basic_keyword_lc = _lower(basic_keyword)
    jd_keyword_lc = _lower(jd_keyword)
    direction_lc = _lower(direction)
    industry_lc = _lower(industry)
    company_name_lc = _lower(company_name)
    job_type_lc = _lower(job_type)
    tag_lc = _lower(tag)
    tech_stack_lc = _lower(tech_stack)
    tech_capability_lc = _lower(tech_capability)
    dev_tool_lc = _lower(dev_tool)

    filtered = [
        job
        for job in state.jobs_metadata
        if _job_matches(
            job,
            keyword=keyword_lc,
            basic_keyword=basic_keyword_lc,
            jd_keyword=jd_keyword_lc,
            direction=direction_lc,
            industry=industry_lc,
            company_name=company_name_lc,
            job_type=job_type_lc,
            tag=tag_lc,
            tech_stack=tech_stack_lc,
            tech_capability=tech_capability_lc,
            dev_tool=dev_tool_lc,
            salary_min=salary_min,
            salary_max=salary_max,
        )
    ]
    return _sorted_jobs(filtered, sort_by)


def search_jobs_data(
    *,
    page: int = 1,
    limit: int = 24,
    keyword: str = "",
    basic_keyword: str = "",
    jd_keyword: str = "",
    direction: str = "",
    industry: str = "",
    company_name: str = "",
    job_type: str = "",
    tag: str = "",
    tech_stack: str = "",
    tech_capability: str = "",
    dev_tool: str = "",
    salary_min: Optional[float] = None,
    salary_max: Optional[float] = None,
    sort_by: str = "default",
) -> Dict[str, Any]:
    filtered = filter_jobs_data(
        keyword=keyword,
        basic_keyword=basic_keyword,
        jd_keyword=jd_keyword,
        direction=direction,
        industry=industry,
        company_name=company_name,
        job_type=job_type,
        tag=tag,
        tech_stack=tech_stack,
        tech_capability=tech_capability,
        dev_tool=dev_tool,
        salary_min=salary_min,
        salary_max=salary_max,
        sort_by=sort_by,
    )
    total = len(filtered)
    start = max(0, (page - 1) * limit)
    end = start + limit
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "sortBy": clean_text(sort_by) or "default",
        "hasMore": end < total,
        "data": filtered[start:end],
    }


def _resolve_output_path(
    output_path: Optional[str],
    output_dir: Optional[str],
    filename: str,
) -> Path:
    if output_path:
        return Path(output_path).expanduser()
    if output_dir:
        return Path(output_dir).expanduser() / filename
    return DEFAULT_EXPORT_DIR / filename


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_jsonl(path: Path, rows: Sequence[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def export_jobs_data(
    *,
    keyword: str = "",
    basic_keyword: str = "",
    jd_keyword: str = "",
    direction: str = "",
    industry: str = "",
    company_name: str = "",
    job_type: str = "",
    tag: str = "",
    tech_stack: str = "",
    tech_capability: str = "",
    dev_tool: str = "",
    salary_min: Optional[float] = None,
    salary_max: Optional[float] = None,
    sort_by: str = "default",
    format: str = "txt",
    export_limit: int = 0,
    output_path: Optional[str] = None,
    output_dir: Optional[str] = None,
    filename: Optional[str] = None,
) -> Dict[str, Any]:
    filtered = filter_jobs_data(
        keyword=keyword,
        basic_keyword=basic_keyword,
        jd_keyword=jd_keyword,
        direction=direction,
        industry=industry,
        company_name=company_name,
        job_type=job_type,
        tag=tag,
        tech_stack=tech_stack,
        tech_capability=tech_capability,
        dev_tool=dev_tool,
        salary_min=salary_min,
        salary_max=salary_max,
        sort_by=sort_by,
    )
    if export_limit and export_limit > 0:
        filtered = filtered[:export_limit]

    normalized_format = clean_text(format).lower() or "txt"
    output_name = clean_text(filename) or f"jobs_export.{normalized_format}"
    path = _resolve_output_path(output_path, output_dir, output_name)

    if normalized_format == "json":
        _write_json(path, filtered)
    elif normalized_format == "jsonl":
        _write_jsonl(path, filtered)
    else:
        headers = ["id", "title", "companyName", "direction", "industry", "jobType"]
        lines = ["\t".join(headers)]
        for job in filtered:
            metadata = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
            lines.append(
                "\t".join(
                    [
                        clean_text(job.get("id")),
                        clean_text(job.get("title")),
                        clean_text(job.get("companyName")),
                        clean_text(job.get("direction")),
                        clean_text(job.get("industry")),
                        clean_text(metadata.get("jobType")),
                    ]
                )
            )
        _write_text(path, "\n".join(lines) + "\n")

    return {
        "format": normalized_format,
        "outputPath": str(path),
        "count": len(filtered),
        "preview": filtered[:5],
        "filters": {
            "keyword": clean_text(keyword),
            "basicKeyword": clean_text(basic_keyword),
            "jdKeyword": clean_text(jd_keyword),
            "direction": clean_text(direction),
            "industry": clean_text(industry),
            "companyName": clean_text(company_name),
            "jobType": clean_text(job_type),
            "tag": clean_text(tag),
            "techStack": clean_text(tech_stack),
            "techCapability": clean_text(tech_capability),
            "devTool": clean_text(dev_tool),
            "salaryMin": salary_min,
            "salaryMax": salary_max,
            "sortBy": clean_text(sort_by) or "default",
        },
    }


def export_tags_data(
    *,
    tag_type: str = "techCapabilities",
    view: str = TAG_VIEW_NORMALIZED,
    q: str = "",
    min_ratio: float = 0.0,
    limit: int = 500,
    format: str = "txt",
    output_path: Optional[str] = None,
    output_dir: Optional[str] = None,
    filename: Optional[str] = None,
) -> Dict[str, Any]:
    _ensure_jobs_loaded()
    normalized_view = normalize_tag_view(view)
    row_limit = limit if limit and limit > 0 else 1000000
    payload = get_admin_frequency_data(
        q=q,
        tag_type=tag_type,
        view=normalized_view,
        min_ratio=min_ratio,
        limit=row_limit,
    )
    rows = payload.get("data", []) if isinstance(payload, dict) else []
    normalized_format = clean_text(format).lower() or "txt"
    if clean_text(filename):
        output_name = clean_text(filename)
    elif clean_text(tag_type) == "techCapabilities" and normalized_format == "txt":
        output_name = f"tech_capabilities_top{limit if limit and limit > 0 else len(rows)}.txt"
    else:
        output_name = f"{clean_text(tag_type) or 'tags'}_export.{normalized_format}"
    path = _resolve_output_path(output_path, output_dir, output_name)

    if normalized_format == "json":
        _write_json(path, rows)
        content_preview = rows[:5]
    else:
        lines = [clean_text(row.get("name")) for row in rows if clean_text(row.get("name"))]
        _write_text(path, "\n".join(lines) + ("\n" if lines else ""))
        content_preview = lines[:5]

    return {
        "format": normalized_format,
        "outputPath": str(path),
        "count": len(rows),
        "preview": content_preview,
        "tagType": clean_text(tag_type),
        "view": normalized_view,
        "updatedAt": clean_text(payload.get("updatedAt")) if isinstance(payload, dict) else "",
        "jobCount": int(payload.get("jobCount") or 0) if isinstance(payload, dict) else 0,
        "filters": {
            "q": clean_text(q),
            "minRatio": min_ratio,
            "limit": limit,
        },
    }
