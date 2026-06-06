import json
from typing import Any, Dict, List

from job_profile_schema import normalize_job_profile

from .api_utils import clean_text


def merge_unique_dict_items(existing: Any, generated: Any, key_fields: List[str]) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    seen = set()
    for source in [existing, generated]:
        if not isinstance(source, list):
            continue
        for item in source:
            if not isinstance(item, dict):
                continue
            signature = tuple(clean_text(item.get(field)).lower() for field in key_fields)
            if not any(signature):
                continue
            if signature in seen:
                continue
            seen.add(signature)
            result.append(item)
    return result


def has_explicit_group_value(value: Any) -> bool:
    if isinstance(value, list):
        return any(
            (
                isinstance(item, dict) and any(clean_text(v) for v in item.values())
            ) or clean_text(item)
            for item in value
        )
    if isinstance(value, dict):
        return any(clean_text(v) for v in value.values())
    return bool(clean_text(value))


def source_has_explicit_group(record: Dict[str, Any], key: str) -> bool:
    if not isinstance(record, dict):
        return False
    if key in record:
        return has_explicit_group_value(record.get(key))
    lowered = {str(name).lower(): value for name, value in record.items()}
    return has_explicit_group_value(lowered.get(key.lower()))


def source_has_explicit_tech(record: Dict[str, Any]) -> bool:
    return source_has_explicit_group(record, "techStack") or source_has_explicit_group(record, "techStackOr")


def merge_fixed_dimension_levels(existing: Any, generated: Any) -> List[Dict[str, Any]]:
    existing_map = {
        clean_text(item.get("name")): int(item.get("levelRequired") or 1)
        for item in (existing or [])
        if isinstance(item, dict) and clean_text(item.get("name"))
    }
    result: List[Dict[str, Any]] = []
    for item in generated or []:
        if not isinstance(item, dict):
            continue
        name = clean_text(item.get("name"))
        if not name:
            continue
        result.append(
            {
                "name": name,
                "levelRequired": existing_map.get(name, int(item.get("levelRequired") or 1)),
            }
        )
    return result


def merge_fixed_dimensions_from_source(raw_existing: Any, generated: Any) -> List[Dict[str, Any]]:
    explicit_map = {
        clean_text(item.get("name")): int(item.get("levelRequired") or 1)
        for item in (raw_existing or [])
        if isinstance(item, dict) and clean_text(item.get("name"))
    }
    result: List[Dict[str, Any]] = []
    seen = set()
    for item in generated or []:
        if not isinstance(item, dict):
            continue
        name = clean_text(item.get("name"))
        if not name or name in seen:
            continue
        seen.add(name)
        result.append(
            {
                "name": name,
                "levelRequired": explicit_map.get(name, int(item.get("levelRequired") or 1)),
            }
        )
    return result


def merge_structured_extract_results(
    source_record: Dict[str, Any],
    seeded_portrait: Dict[str, Any],
    tech_portrait: Dict[str, Any],
    soft_portrait: Dict[str, Any],
) -> Dict[str, Any]:
    merged = json.loads(json.dumps(seeded_portrait if isinstance(seeded_portrait, dict) else {}))
    merged["techStack"] = merge_unique_dict_items(
        seeded_portrait.get("techStack"),
        tech_portrait.get("techStack"),
        ["name", "groupName"],
    )
    merged["techCapabilities"] = merge_unique_dict_items(
        seeded_portrait.get("techCapabilities"),
        tech_portrait.get("techCapabilities"),
        ["skill", "rawExtractedText", "type"],
    )
    merged["devTools"] = merge_unique_dict_items(
        seeded_portrait.get("devTools"),
        tech_portrait.get("devTools"),
        ["skill", "rawExtractedText"],
    )
    merged["softQuality"] = merge_fixed_dimension_levels(
        source_record.get("softQuality"),
        soft_portrait.get("softQuality"),
    )
    merged["growthPotential"] = merge_fixed_dimension_levels(
        source_record.get("growthPotential"),
        soft_portrait.get("growthPotential"),
    )
    return normalize_job_profile(merged)


def merge_structured_missing_only_results(
    source_record: Dict[str, Any],
    seeded_portrait: Dict[str, Any],
    tech_portrait: Dict[str, Any],
    soft_portrait: Dict[str, Any],
) -> Dict[str, Any]:
    merged = json.loads(json.dumps(seeded_portrait if isinstance(seeded_portrait, dict) else {}))
    merged["techStack"] = seeded_portrait.get("techStack", []) if source_has_explicit_tech(source_record) else tech_portrait.get("techStack", [])
    for key in ["techCapabilities", "devTools"]:
        merged[key] = seeded_portrait.get(key, []) if source_has_explicit_group(source_record, key) else tech_portrait.get(key, [])
    if source_has_explicit_group(source_record, "softQuality"):
        merged["softQuality"] = seeded_portrait.get("softQuality", [])
    else:
        merged["softQuality"] = soft_portrait.get("softQuality", [])
    if source_has_explicit_group(source_record, "growthPotential"):
        merged["growthPotential"] = seeded_portrait.get("growthPotential", [])
    else:
        merged["growthPotential"] = soft_portrait.get("growthPotential", [])
    return normalize_job_profile(merged)
