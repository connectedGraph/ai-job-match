import json
from typing import Any, Dict, List, Optional

from portrait_builder.taxonomy import DIRECTION_OPTIONS, GROWTH_DIMENSIONS, SOFT_DIMENSIONS

TECH_CAPABILITY_TYPE_OPTIONS = ["principle", "scene", "engineering", "soft_flag"]
VALID_TECH_CAPABILITY_TYPES = set(TECH_CAPABILITY_TYPE_OPTIONS)

EDUCATION_OPTIONS = ["大专", "本科", "硕士", "博士"]


def clean_text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def normalize_job_type(value: Any) -> str:
    text = clean_text(value)
    if text in {"实习", "社招全职", "校招全职"}:
        return text
    intern_values = {
        "实习",
        "日常实习",
        "ByteIntern",
        "实习生",
        "实习生专项",
        "研究实习生",
        "暑期实习",
        "筋斗云人才计划实习专项",
        "全职实习",
        "兼职实习",
        "见习生",
        "青年就业见习",
        "2027届实习",
    }
    campus_values = {
        "校招全职",
        "2026届校园招聘",
        "2026届筋斗云人才计划",
        "2026届校招",
        "应届生",
        "2026届Top Seed人才计划",
        "2025届校招",
        "2025届毕业生",
        "校招",
        "应届毕业生",
        "2025年应届毕业生",
        "25届校招",
        "2024届校招",
        "2025届应届生",
        "2026届毕业",
        "2025年应届生",
        "2026届应届毕业生",
    }
    if text in intern_values:
        return "实习"
    if text in campus_values:
        return "校招全职"
    lowered = text.lower()
    has_intern_signal = "实习" in text or "见习" in text or "intern" in lowered
    has_campus_signal = any(token in text for token in ("校招", "校园招聘", "应届", "毕业生", "人才计划"))
    if has_intern_signal and has_campus_signal:
        return "社招全职"
    if has_intern_signal:
        return "实习"
    if has_campus_signal:
        return "校招全职"
    return "社招全职"


def ensure_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def clamp_level(value: Any, default: int = 1) -> int:
    try:
        level = int(value)
    except (TypeError, ValueError):
        level = default
    return max(1, min(4, level))


def coerce_positive_int(value: Any, default: int = 1) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(1, parsed)


def ensure_string_list(value: Any) -> List[str]:
    result: List[str] = []
    seen = set()
    for item in ensure_list(value):
        text = clean_text(item)
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


def normalize_salary_range(value: Any) -> Optional[List[float]]:
    if isinstance(value, dict):
        value = [value.get("min"), value.get("max")]
    if not isinstance(value, list) or len(value) != 2:
        return None
    parsed: List[float] = []
    for item in value:
        try:
            parsed.append(float(item))
        except (TypeError, ValueError):
            return None
    if parsed[0] <= 0 or parsed[1] <= 0:
        return None
    return parsed


def normalize_graduation_year_range(value: Any) -> Optional[List[int]]:
    if isinstance(value, dict):
        value = [value.get("min"), value.get("max")]
    if not isinstance(value, list) or len(value) != 2:
        return None
    try:
        start = int(value[0]) if value[0] is not None else None
        end = int(value[1]) if value[1] is not None else None
    except (TypeError, ValueError):
        return None
    if start is None and end is None:
        return None
    return [start, end]


def normalize_tech_capability_type(value: Any) -> str:
    normalized = clean_text(value).lower()
    return normalized if normalized in VALID_TECH_CAPABILITY_TYPES else ""


def default_job_profile() -> Dict[str, Any]:
    return {
        "id": "",
        "title": "",
        "companyName": "",
        "direction": "",
        "industry": "",
        "metadata": {
            "jobType": "社招全职",
            "salaryRange": None,
            "departmentAtmosphere": None,
        },
        "jdSplit": {
            "jobDescriptions": [],
            "jobRequirements": [],
            "bonusPoints": [],
            "notes": [],
        },
        "basicRequirements": {
            "education_min": None,
            "major": [],
            "graduationYearRange": None,
            "certifications": [],
            "experiences": [],
        },
        "techStack": [],
        "techCapabilities": [],
        "devTools": [],
        "softQuality": [{"name": name, "levelRequired": 1} for name in SOFT_DIMENSIONS],
        "growthPotential": [{"name": name, "levelRequired": 1} for name in GROWTH_DIMENSIONS],
        "systemMeta": {},
    }


def normalize_basic_certifications(items: Any) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for item in ensure_list(items):
        if isinstance(item, dict):
            name = clean_text(item.get("name")) or clean_text(item.get("skill")) or clean_text(item.get("tagName"))
            note = clean_text(item.get("note"))
            level = clamp_level(item.get("level"), default=2)
        else:
            name = clean_text(item)
            note = ""
            level = 2
        if not name:
            continue
        result.append({"name": name, "level": level, "note": note})
    return result


def normalize_basic_experiences(items: Any) -> List[str]:
    result: List[str] = []
    seen = set()
    for item in ensure_list(items):
        if isinstance(item, dict):
            text = (
                clean_text(item.get("text"))
                or clean_text(item.get("name"))
                or clean_text(item.get("requirement"))
                or clean_text(item.get("note"))
            )
        else:
            text = clean_text(item)
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


def normalize_jd_split(source: Any, fallback_notes: Any = None) -> Dict[str, List[str]]:
    source = source if isinstance(source, dict) else {}
    return {
        "jobDescriptions": ensure_string_list(source.get("jobDescriptions") or source.get("responsibilities")),
        "jobRequirements": ensure_string_list(source.get("jobRequirements") or source.get("requirements")),
        "bonusPoints": ensure_string_list(source.get("bonusPoints") or source.get("bonus")),
        "notes": ensure_string_list(source.get("notes") or source.get("note") or fallback_notes),
    }


def normalize_tech_stack_leaf(item: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(item, dict):
        name = clean_text(item)
        if not name:
            return None
        return {
            "name": name,
            "rawExtractedText": name,
            "normalizedTag": None,
            "levelRequired": 2,
            "note": "",
        }

    name = clean_text(item.get("name")) or clean_text(item.get("skill"))
    if not name:
        return None
    return {
        "name": name,
        "rawExtractedText": clean_text(item.get("rawExtractedText")) or name,
        "normalizedTag": clean_text(item.get("normalizedTag")) or clean_text(item.get("normalizedName")) or None,
        "levelRequired": clamp_level(item.get("levelRequired"), default=2),
        "note": clean_text(item.get("note")),
    }


def normalize_tech_stack_branch(item: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(item, dict):
        return None
    group_name = clean_text(item.get("groupName")) or clean_text(item.get("name"))
    if not group_name:
        return None

    options: List[Dict[str, Any]] = []
    seen = set()
    for option in ensure_list(item.get("options")):
        normalized_option = normalize_tech_stack_leaf(option)
        if not normalized_option:
            continue
        option_key = tech_stack_tag_name(normalized_option).lower()
        if not option_key or option_key in seen:
            continue
        seen.add(option_key)
        options.append(normalized_option)

    if not options:
        return None

    return {
        "type": "branch",
        "groupName": group_name,
        "options": options,
        "levelRequired": clamp_level(item.get("levelRequired"), default=2),
        "sum": coerce_positive_int(item.get("sum"), default=1),
        "note": clean_text(item.get("note")),
    }


def normalize_tech_stack(items: Any, legacy_or_items: Any = None) -> List[Dict[str, Any]]:
    singles: List[Dict[str, Any]] = []
    branches: List[Dict[str, Any]] = []
    seen_single = set()
    seen_branch = set()

    for item in ensure_list(items):
        if is_tech_stack_branch(item):
            branch = normalize_tech_stack_branch(item)
            if not branch:
                continue
            branch_key = (
                clean_text(branch.get("groupName")).lower(),
                tuple(sorted(tech_stack_tag_name(option).lower() for option in branch.get("options", []) if tech_stack_tag_name(option))),
            )
            if branch_key in seen_branch:
                continue
            seen_branch.add(branch_key)
            branches.append(branch)
            continue

        normalized_item = normalize_tech_stack_leaf(item)
        if not normalized_item:
            continue
        item_key = tech_stack_tag_name(normalized_item).lower()
        if not item_key or item_key in seen_single:
            continue
        seen_single.add(item_key)
        singles.append(normalized_item)

    for branch in normalize_tech_stack_or(legacy_or_items):
        branch_key = (
            clean_text(branch.get("groupName")).lower(),
            tuple(sorted(tech_stack_tag_name(option).lower() for option in branch.get("options", []) if tech_stack_tag_name(option))),
        )
        if branch_key in seen_branch:
            continue
        seen_branch.add(branch_key)
        branches.append(branch)

    direct_names = {tech_stack_tag_name(item).lower() for item in singles if tech_stack_tag_name(item)}
    filtered_branches: List[Dict[str, Any]] = []
    for branch in branches:
        option_names = {
            tech_stack_tag_name(option).lower()
            for option in branch.get("options", [])
            if tech_stack_tag_name(option)
        }
        # If a branch already contains a direct hard requirement, the branch is redundant and
        # only causes duplicate tech counting downstream.
        if direct_names.intersection(option_names):
            continue
        filtered_branches.append(branch)

    return singles + filtered_branches


def should_demote_tech_stack_item(item: Dict[str, Any]) -> bool:
    if not isinstance(item, dict):
        return False
    text = " ".join(
        clean_text(value)
        for value in (
            item.get("name"),
            item.get("nameZh"),
            item.get("skill"),
            item.get("skillZh"),
            item.get("note"),
        )
        if clean_text(value)
    ).lower()
    if not text:
        return False
    return "algorithm" in text or "algorithmic" in text or "\u7b97\u6cd5" in text


def promote_tech_stack_item_to_capability(item: Dict[str, Any]) -> Dict[str, Any]:
    name = clean_text(item.get("name")) or clean_text(item.get("skill")) or clean_text(item.get("nameZh"))
    raw_text = clean_text(item.get("note")) or clean_text(item.get("skillZh")) or name
    return {
        "rawExtractedText": raw_text,
        "normalizedTag": clean_text(item.get("normalizedTag")) or None,
        "type": normalize_tech_capability_type(item.get("type")),
        "domain": None,
        "skill": name or raw_text,
        "skillZh": clean_text(item.get("skillZh")) or clean_text(item.get("nameZh")) or raw_text,
        "levelRequired": clamp_level(item.get("levelRequired"), default=2),
    }


def normalize_tech_stack_or(items: Any) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for item in ensure_list(items):
        normalized_branch = normalize_tech_stack_branch(item)
        if normalized_branch:
            result.append(normalized_branch)
    return result


def normalize_tech_capabilities(items: Any) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for item in ensure_list(items):
        if not isinstance(item, dict):
            text = clean_text(item)
            if not text:
                continue
            result.append(
                {
                    "rawExtractedText": text,
                    "normalizedTag": None,
                    "type": "",
                    "domain": None,
                    "skill": text,
                    "skillZh": text,
                    "levelRequired": 2,
                }
            )
            continue
        raw_text = clean_text(item.get("rawExtractedText")) or clean_text(item.get("name")) or clean_text(item.get("skill"))
        if not raw_text:
            continue
        skill = clean_text(item.get("skill")) or clean_text(item.get("normalizedTag")) or clean_text(item.get("normalizedName")) or raw_text
        result.append(
            {
                "rawExtractedText": raw_text,
                "normalizedTag": clean_text(item.get("normalizedTag")) or clean_text(item.get("normalizedName")) or None,
                "type": normalize_tech_capability_type(item.get("type")),
                "domain": clean_text(item.get("domain")) or None,
                "skill": skill,
                "skillZh": clean_text(item.get("skillZh")) or raw_text,
                "levelRequired": clamp_level(item.get("levelRequired"), default=2),
            }
        )
    return result


def normalize_dev_tools(items: Any) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for item in ensure_list(items):
        if not isinstance(item, dict):
            text = clean_text(item)
            if not text:
                continue
            result.append(
                {
                    "rawExtractedText": text,
                    "normalizedTag": None,
                    "skill": text,
                    "skillZh": text,
                    "levelRequired": 2,
                }
            )
            continue
        raw_text = clean_text(item.get("rawExtractedText")) or clean_text(item.get("name")) or clean_text(item.get("skill"))
        if not raw_text:
            continue
        skill = clean_text(item.get("skill")) or clean_text(item.get("normalizedTag")) or clean_text(item.get("normalizedName")) or raw_text
        result.append(
            {
                "rawExtractedText": raw_text,
                "normalizedTag": clean_text(item.get("normalizedTag")) or clean_text(item.get("normalizedName")) or None,
                "skill": skill,
                "skillZh": clean_text(item.get("skillZh")) or raw_text,
                "levelRequired": clamp_level(item.get("levelRequired"), default=2),
            }
        )
    return result


def normalize_fixed_dimensions(items: Any, dimension_names: List[str]) -> List[Dict[str, Any]]:
    source_map: Dict[str, Dict[str, Any]] = {}
    for item in ensure_list(items):
        if not isinstance(item, dict):
            name = clean_text(item)
            if name:
                source_map[name] = {"name": name, "levelRequired": 1}
            continue
        name = clean_text(item.get("name"))
        if name:
            source_map[name] = {
                "name": name,
                "levelRequired": clamp_level(item.get("levelRequired"), default=1),
            }

    return [
        {
            "name": name,
            "levelRequired": clamp_level(source_map.get(name, {}).get("levelRequired"), default=1),
        }
        for name in dimension_names
    ]


def tech_capability_tag_name(item: Dict[str, Any]) -> str:
    return clean_text(item.get("normalizedTag")) or clean_text(item.get("skill")) or clean_text(item.get("rawExtractedText"))


def tech_capability_tag_name_zh(item: Dict[str, Any]) -> str:
    return clean_text(item.get("skillZh")) or clean_text(item.get("rawExtractedText")) or clean_text(item.get("skill")) or clean_text(item.get("normalizedTag"))


def dev_tool_tag_name(item: Dict[str, Any]) -> str:
    return clean_text(item.get("normalizedTag")) or clean_text(item.get("skill")) or clean_text(item.get("rawExtractedText"))


def dev_tool_tag_name_zh(item: Dict[str, Any]) -> str:
    return clean_text(item.get("skillZh")) or clean_text(item.get("rawExtractedText")) or clean_text(item.get("skill")) or clean_text(item.get("normalizedTag"))


def tech_stack_tag_name(item: Dict[str, Any]) -> str:
    return clean_text(item.get("normalizedTag")) or clean_text(item.get("name")) or clean_text(item.get("skill")) or clean_text(item.get("rawExtractedText"))


def tech_stack_tag_name_zh(item: Dict[str, Any]) -> str:
    return (
        clean_text(item.get("nameZh"))
        or clean_text(item.get("normalizedTag"))
        or clean_text(item.get("skillZh"))
        or clean_text(item.get("name"))
        or clean_text(item.get("rawExtractedText"))
    )


def basic_certification_tag_name(item: Dict[str, Any]) -> str:
    return clean_text(item.get("name"))


def basic_certification_tag_name_zh(item: Dict[str, Any]) -> str:
    return clean_text(item.get("nameZh")) or clean_text(item.get("name"))


def is_tech_stack_branch(item: Any) -> bool:
    return isinstance(item, dict) and (
        clean_text(item.get("type")).lower() == "branch" or isinstance(item.get("options"), list)
    )


def iter_tech_stack_leaf_items(items: Any) -> List[Dict[str, Any]]:
    flattened: List[Dict[str, Any]] = []
    for item in ensure_list(items):
        if is_tech_stack_branch(item):
            for option in ensure_list(item.get("options")):
                normalized_option = option if isinstance(option, dict) else normalize_tech_stack_leaf(option)
                if isinstance(normalized_option, dict):
                    flattened.append(normalized_option)
            continue
        normalized_item = item if isinstance(item, dict) else normalize_tech_stack_leaf(item)
        if isinstance(normalized_item, dict):
            flattened.append(normalized_item)
    return flattened


def iter_tech_stack_branch_items(items: Any) -> List[Dict[str, Any]]:
    return [item for item in ensure_list(items) if is_tech_stack_branch(item)]


def normalize_job_profile(job: Dict[str, Any]) -> Dict[str, Any]:
    source = job if isinstance(job, dict) else {}
    result = json.loads(json.dumps(default_job_profile()))

    result["id"] = clean_text(source.get("id"))
    result["title"] = clean_text(source.get("title"))
    result["companyName"] = clean_text(source.get("companyName"))
    result["direction"] = clean_text(source.get("direction"))
    result["industry"] = clean_text(source.get("industry"))

    metadata = source.get("metadata") if isinstance(source.get("metadata"), dict) else {}
    result["metadata"] = {
        "jobType": normalize_job_type(metadata.get("jobType")),
        "salaryRange": normalize_salary_range(metadata.get("salaryRange")),
        "departmentAtmosphere": clean_text(metadata.get("departmentAtmosphere")) or None,
    }

    result["jdSplit"] = normalize_jd_split(source.get("jdSplit"), source.get("note") or source.get("notes"))

    basic = source.get("basicRequirements") if isinstance(source.get("basicRequirements"), dict) else {}
    result["basicRequirements"] = {
        "education_min": clean_text(basic.get("education_min")) or None,
        "major": ensure_string_list(basic.get("major")),
        "graduationYearRange": normalize_graduation_year_range(basic.get("graduationYearRange")),
        "certifications": normalize_basic_certifications(
            basic.get("certifications") if basic.get("certifications") is not None else source.get("certifications")
        ),
        "experiences": normalize_basic_experiences(
            basic.get("experiences") if basic.get("experiences") is not None else source.get("experiences")
        ),
    }

    tech_stack_source: List[Any] = []
    promoted_tech_capabilities: List[Dict[str, Any]] = []
    for item in ensure_list(source.get("techStack")):
        if is_tech_stack_branch(item):
            tech_stack_source.append(item)
            continue
        if isinstance(item, dict) and should_demote_tech_stack_item(item):
            promoted_item = promote_tech_stack_item_to_capability(item)
            if clean_text(promoted_item.get("type")):
                promoted_tech_capabilities.append(promoted_item)
            else:
                tech_stack_source.append(item)
            continue
        tech_stack_source.append(item)
    result["techStack"] = normalize_tech_stack(tech_stack_source, legacy_or_items=source.get("techStackOr"))
    tech_capability_source = source.get("techCapabilities")
    if tech_capability_source is None:
        tech_capability_source = source.get("coreTechFeatures")
    normalized_tech_capabilities = normalize_tech_capabilities(tech_capability_source)
    existing_capability_keys = {tech_capability_tag_name(item).lower() for item in normalized_tech_capabilities if tech_capability_tag_name(item)}
    for item in promoted_tech_capabilities:
        key = tech_capability_tag_name(item).lower()
        if key and key not in existing_capability_keys:
            normalized_tech_capabilities.append(item)
            existing_capability_keys.add(key)
    result["techCapabilities"] = normalized_tech_capabilities
    result["devTools"] = normalize_dev_tools(source.get("devTools"))
    result["softQuality"] = normalize_fixed_dimensions(source.get("softQuality"), SOFT_DIMENSIONS)
    result["growthPotential"] = normalize_fixed_dimensions(source.get("growthPotential"), GROWTH_DIMENSIONS)
    result["systemMeta"] = dict(source.get("systemMeta") or {})
    return result


def normalize_job_library(jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [normalize_job_profile(job) for job in jobs if isinstance(job, dict)]
