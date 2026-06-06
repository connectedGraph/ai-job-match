from typing import Any, Dict, List


DIMENSION_LABELS = {
    "basicInfo": "基本信息",
    "summary": "个人自述",
    "skills": "专业技能",
    "experiences": "经历质量",
    "evidence": "画像证据链",
    "direction": "方向定位",
}

GRADE_SCORES = {
    "S": 95,
    "A": 82,
    "B": 65,
    "C": 45,
    "D": 25,
}


def _filled(values: List[Any]) -> int:
    return sum(1 for item in values if bool(item))


def _summary_score(summary: str) -> int:
    length = len((summary or "").strip())
    if length < 30:
        return 0
    if length >= 150:
        return 100
    return round(((length - 30) / 120) * 100)


def _text_of(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return " ".join(_text_of(item) for item in value)
    if isinstance(value, dict):
        return " ".join(_text_of(item) for item in value.values())
    return ""


def _skill_name(item: Any) -> str:
    if isinstance(item, str):
        return item.strip()
    if isinstance(item, dict):
        return str(item.get("name") or item.get("skill") or item.get("normalizedTag") or "").strip()
    return ""


def calc_raw_completeness_scores(data: Dict[str, Any]) -> Dict[str, int]:
    basic = data.get("basicInfo") or {}
    explicit = data.get("explicitMetrics") or {}
    experiences = data.get("experiences") or {}
    experience_items = [
        item
        for rows in experiences.values()
        if isinstance(rows, list)
        for item in rows
        if isinstance(item, dict)
    ]
    experience_text = " ".join(_text_of(item) for item in experience_items)
    skill_names = [
        _skill_name(item)
        for rows in [
            data.get("techStack") or [],
            data.get("techCapability") or data.get("techCapabilities") or [],
            data.get("devTools") or [],
        ]
        for item in rows
    ]
    skill_names = [name for name in skill_names if name]

    basic_fields = [
        basic.get("name"),
        basic.get("schoolName"),
        basic.get("schoolMajor"),
        basic.get("graduationYear"),
        explicit.get("graduationCity"),
    ]
    skill_checks = [
        len(data.get("techStack") or []) >= 3,
        len(data.get("techCapability") or data.get("techCapabilities") or []) >= 2,
        len(data.get("devTools") or []) >= 1,
    ]
    exp_checks = [
        len(experiences.get("internship") or []) > 0,
        len(experiences.get("projects") or []) > 0,
        len(experiences.get("competition") or []) > 0,
        len(experiences.get("learning") or []) > 0,
    ]
    evidence_checks = [
        any(len(_text_of(item).strip()) >= 60 for item in experience_items),
        len(skill_names) >= 5 and len(experience_items) >= 1,
        any(name.lower() in experience_text.lower() for name in skill_names),
        any(char.isdigit() for char in experience_text) or _summary_score(data.get("summary") or "") >= 60,
    ]
    direction_checks = [bool(data.get("direction")), len(data.get("domains") or []) >= 2]

    return {
        "basicInfo": round((_filled(basic_fields) / len(basic_fields)) * 100),
        "summary": _summary_score(data.get("summary") or ""),
        "skills": round((_filled(skill_checks) / len(skill_checks)) * 100),
        "experiences": round((_filled(exp_checks) / len(exp_checks)) * 100),
        "evidence": round((_filled(evidence_checks) / len(evidence_checks)) * 100),
        "direction": round((_filled(direction_checks) / len(direction_checks)) * 100),
    }


def build_completeness_result(model_result: Dict[str, Any], raw_scores: Dict[str, int]) -> Dict[str, Any]:
    dimensions = []
    model_dimensions = model_result.get("dimensions") or []
    for name in ["basicInfo", "summary", "skills", "experiences", "evidence", "direction"]:
        model_value = next((item for item in model_dimensions if item.get("name") == name), {})
        grade = str(model_value.get("grade") or "D").upper()
        if grade not in GRADE_SCORES:
            grade = "D"
        dimensions.append(
            {
                "name": name,
                "label": DIMENSION_LABELS.get(name, name),
                "rawScore": raw_scores.get(name, 0),
                "grade": grade,
                "score": GRADE_SCORES[grade],
                "comment": model_value.get("comment") or "",
            }
        )
    return {
        "totalScore": round(sum(item["score"] for item in dimensions) / len(dimensions)),
        "dimensions": dimensions,
        "topSuggestion": model_result.get("topSuggestion") or "",
    }
