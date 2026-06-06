import json
import re
from typing import Any, Dict, List, Optional, Tuple

from job_profile_schema import (
    TECH_CAPABILITY_TYPE_OPTIONS,
    normalize_tech_stack_branch,
    normalize_tech_stack_leaf,
    default_job_profile,
    normalize_basic_certifications,
    normalize_basic_experiences,
    normalize_graduation_year_range,
    normalize_job_profile,
    normalize_tech_capability_type,
)
from portrait_builder.taxonomy import DIRECTION_OPTIONS, GROWTH_DIMENSIONS, SOFT_DIMENSIONS


TARGET_SCHEMA = default_job_profile()

FIELD_RESTORE_HINTS = {
    "title": "岗位名",
    "companyName": "公司名",
    "salaryRange": "薪资范围",
    "jobType": "岗位类型",
    "direction": "岗位方向",
    "industry": "行业",
    "departmentInfo": "部门/团队信息",
    "location": "工作地点",
    "jobDescription": "岗位描述",
    "responsibility": "工作职责",
    "requirement": "入职需求",
    "bonus": "加分项",
    "education": "学历要求",
    "major": "专业要求",
    "experience": "经验要求",
    "note": "补充信息",
}

RAW_JSON_ONLY = "Return ONLY raw JSON. No markdown code block. No preamble. No explanation."

FIELD_RESTORE_REFERENCE = """
Map raw field names to standard job fields.
Output compact JSON object: {"standardKey":["rawFieldA","rawFieldB"]}.
Allowed keys: title,companyName,salaryRange,jobType,direction,industry,departmentInfo,location,jobDescription,responsibility,requirement,bonus,education,major,experience,note.
Omit uncertain keys.
Return raw JSON only.
"""

STAGE1_BASE_INFO_REFERENCE = """
Extract base facts only.
Output keys: title,companyName,direction,industry,metadata.
metadata keys: jobType,salaryRange,departmentAtmosphere.
jobType must be one of: 实习,社招全职,校招全职.
jobType mapping:
- clear internship/Intern/见习/日常实习/实习生 => 实习
- clear campus recruitment/校招/应届/毕业生/校园招聘/人才计划 => 校招全职
- social recruitment/full-time/社招/博士后/OD, mixed or unclear => 社招全职
direction must be one allowed direction or null.
direction means the primary job function only, not language, platform, business domain, or tag.
Prefer title plus real job duties/requirements.
Use these mapping rules:
- browser/H5/web UI/Vue/React/CSS/TypeScript/小程序 => 前端开发
- server/API/Java/Go/Python/Node.js backend/distributed/storage/middleware => 后端开发
- explicit fullstack/full-stack or clear frontend+backend ownership => 全栈开发
- Android/iOS/鸿蒙/Flutter/React Native/Electron/desktop client/app => 客户端开发
- ML/DL/NLP/CV/recommendation/search/model training => 算法工程
- LLM/RAG/Agent/AIGC/prompt workflow/model application engineering => AI应用开发
- data warehouse/ETL/data platform/data pipeline/realtime compute => 数据开发
- BI/business analysis/经营分析/策略分析/user analysis => 数据分析
- testing/QA/test automation/performance testing => 测试开发 / QA
- cloud infra/Kubernetes/CI-CD/SRE/ops => 运维 / DevOps / SRE
- security/offense-defense/compliance/privacy/risk control security => 安全工程
- firmware/driver/MCU/IoT/chip/hardware => 嵌入式 / 硬件开发
- game client/game server/gameplay/engine => 游戏开发
- graphics/shader/rendering pipeline/GPU rendering => 图形 / 渲染开发
- codec/streaming/RTC/audio-video engine => 音视频开发
- PM/product planning/requirement design => 产品经理
- UI/UX/interaction/visual/experience design => UI / UX设计
- implementation/deployment/customer support/after-sales technical support => 技术支持 / 实施
- pre-sales/solution consulting/solution architecture => 解决方案 / 售前
- operation/growth/data operation/strategy operation/commercial operation => 增长运营 / 数据运营
- technical writing/developer relations/technical evangelism => 技术写作 / DevRel
Do not output old broad labels such as Web开发, 移动开发, 算法AI, 云计算 / 架构师.
jobType defaults to 社招全职 if unclear.
salaryRange is [min,max] only when both bounds appear; otherwise null.
Return raw JSON only.
"""

STRUCTURE_EXTRACTION_REFERENCE = """
Split JD into JSON object with jdSplit and basicRequirements.
jdSplit keys: jobDescriptions,jobRequirements,bonusPoints,notes; values are concise sentence arrays.
Classify by meaning, not source heading. Split one sentence into one fact. Drop ads and empty slogans.
basicRequirements keys: education_min,major,graduationYearRange,certifications,experiences.
education_min: 大专/本科/硕士/博士/null. graduationYearRange: [min,max] or null.
certifications item: {name,level,note}; level 1-3.
experiences: string array of hard experience or project-experience requirements only.
Return raw JSON only.
"""

SENTENCE_CLASSIFICATION_REFERENCE = """
Classify jobRequirements.
Output compact JSON array: [tech,soft,noise].
Each item is the original sentence string, unchanged.
tech: concrete technology/tool/math/system/architecture/optimization.
soft: communication/teamwork/responsibility/execution/learning/innovation/stress/transfer/goal/logic.
noise: work condition/location/policy/background/unclear.
Each sentence appears at most once. Return raw JSON only.
"""

TECH_STACK_BRANCH_HINT = """
No top-level techStackOr. Put alternatives inside techStack as ["branch",groupName,options,levelRequired,sum,note].
"""

TECH_EXTRACTION_REFERENCE_V2 = """
Extract technical requirements. Output object keys only: techStack,techCapabilities,devTools.
Use compact arrays:
techStack leaf: [name,levelRequired,note]
techStack branch: ["branch",groupName,options,levelRequired,sum,note]
techCapabilities: [rawText,type,domain,skill,skillZh,levelRequired]
devTools: [rawText,skill,skillZh,levelRequired]
levelRequired: 1 exposure, 2 familiar, 3 proficient, 4 expert.
type: principle/scene/engineering/soft_flag.
Rules: ground every item in input; installable/importable/configurable names go to techStack; abstract abilities go to techCapabilities; engineering collaboration tools go to devTools; generic tool categories stay abstract; official plugins can be techStack; leaked soft requirement becomes type soft_flag. Every techCapabilities item must include a valid type; invalid or missing type will be rejected downstream, so omit the item instead of guessing. Return raw JSON only.
"""

LEGACY_TECH_STACK_OR_FIELD = "techStackOr"

SOFT_EXTRACTION_REFERENCE = """
Score fixed soft dimensions.
Output compact JSON array: [softLevels,growthLevels].
softLevels order: 沟通表达,团队协作,责任心,执行力,职业意识.
growthLevels order: 学习能力,创新能力,抗压能力,迁移能力,目标清晰度.
Each level is 1-4: 1 none, 2 basic, 3 clear requirement, 4 core emphasis.
Use soft_sentences, jobDescriptions, and soft_flag only. Return raw JSON only.
"""


def sanitize_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: sanitize_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize_value(item) for item in value]
    if isinstance(value, str):
        return value.strip()
    return value


def clean_text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def ensure_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def ensure_string_list(values: Any) -> List[str]:
    result: List[str] = []
    seen = set()
    for item in ensure_list(values):
        text = clean_text(item)
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


def split_lines(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        lines: List[str] = []
        for item in value:
            lines.extend(split_lines(item))
        return lines
    text = clean_text(value)
    if not text:
        return []
    parts = re.split(r"[\r\n]+|[；;]+", text)
    result: List[str] = []
    for part in parts:
        normalized = re.sub(r"^\s*(?:[-*•]|[0-9]+[.)、])\s*", "", clean_text(part))
        if normalized:
            result.append(normalized)
    return result


def merge_line_sources(*values: Any) -> List[str]:
    result: List[str] = []
    seen = set()
    for value in values:
        for item in split_lines(value):
            if item and item not in seen:
                seen.add(item)
                result.append(item)
    return result


def ensure_sentence_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return merge_line_sources(*value)
    return split_lines(value)


def format_numbered_lines(lines: List[str]) -> str:
    values = ensure_sentence_list(lines)
    if not values:
        return "(空)"
    return "\n".join(f"{index}. {item}" for index, item in enumerate(values, start=1))


def dedupe_string_list(values: List[str]) -> List[str]:
    result: List[str] = []
    seen = set()
    for value in values:
        text = clean_text(value)
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


def coerce_level(value: Any, default: int = 1) -> int:
    try:
        level = int(value)
    except (TypeError, ValueError):
        return default
    return max(1, min(level, 4))


def empty_tech_capability_type_validation(source: str) -> Dict[str, Any]:
    return {
        "source": source,
        "totalCapabilities": 0,
        "validExplicitCount": 0,
        "missingTypeCount": 0,
        "invalidTypeCount": 0,
        "issueCount": 0,
        "hasIssues": False,
        "byType": {type_name: 0 for type_name in TECH_CAPABILITY_TYPE_OPTIONS},
        "samples": [],
    }


def _append_tech_capability_type_issue_sample(
    summary: Dict[str, Any],
    *,
    raw_text: str,
    skill: str,
    type_value: str,
    issue: str,
) -> None:
    samples = summary.setdefault("samples", [])
    if len(samples) >= 5:
        return
    samples.append(
        {
            "rawExtractedText": raw_text,
            "skill": skill,
            "type": type_value,
            "issue": issue,
        }
    )


def summarize_tech_capability_type_validation_from_payload(
    payload: Any,
    *,
    source: str,
) -> Dict[str, Any]:
    summary = empty_tech_capability_type_validation(source)
    payload = payload if isinstance(payload, dict) else {}
    for raw_item in ensure_list(payload.get("techCapabilities")):
        item = compact_capability_item_to_dict(raw_item)
        if not isinstance(item, dict):
            continue
        raw_text = clean_text(item.get("rawExtractedText")) or clean_text(item.get("skill")) or clean_text(item.get("skillZh"))
        if not raw_text:
            continue
        summary["totalCapabilities"] += 1
        raw_type = clean_text(item.get("type")).lower()
        normalized_type = normalize_tech_capability_type(raw_type)
        if not raw_type:
            summary["missingTypeCount"] += 1
            _append_tech_capability_type_issue_sample(
                summary,
                raw_text=raw_text,
                skill=clean_text(item.get("skill")) or raw_text,
                type_value="",
                issue="missing_type",
            )
            continue
        if not normalized_type:
            summary["invalidTypeCount"] += 1
            _append_tech_capability_type_issue_sample(
                summary,
                raw_text=raw_text,
                skill=clean_text(item.get("skill")) or raw_text,
                type_value=raw_type,
                issue="invalid_type",
            )
            continue
        summary["validExplicitCount"] += 1
        summary["byType"][normalized_type] += 1
    summary["issueCount"] = summary["missingTypeCount"] + summary["invalidTypeCount"]
    summary["hasIssues"] = summary["issueCount"] > 0
    return summary


def summarize_tech_capability_type_validation_from_items(
    items: Any,
    *,
    source: str,
) -> Dict[str, Any]:
    summary = empty_tech_capability_type_validation(source)
    for item in ensure_list(items):
        if not isinstance(item, dict):
            continue
        raw_text = clean_text(item.get("rawExtractedText")) or clean_text(item.get("skill")) or clean_text(item.get("skillZh"))
        if not raw_text:
            continue
        summary["totalCapabilities"] += 1
        raw_type = clean_text(item.get("type")).lower()
        normalized_type = normalize_tech_capability_type(raw_type)
        if not raw_type:
            summary["missingTypeCount"] += 1
            _append_tech_capability_type_issue_sample(
                summary,
                raw_text=raw_text,
                skill=clean_text(item.get("skill")) or raw_text,
                type_value="",
                issue="missing_type",
            )
            continue
        if not normalized_type:
            summary["invalidTypeCount"] += 1
            _append_tech_capability_type_issue_sample(
                summary,
                raw_text=raw_text,
                skill=clean_text(item.get("skill")) or raw_text,
                type_value=raw_type,
                issue="invalid_type",
            )
            continue
        summary["validExplicitCount"] += 1
        summary["byType"][normalized_type] += 1
    summary["issueCount"] = summary["missingTypeCount"] + summary["invalidTypeCount"]
    summary["hasIssues"] = summary["issueCount"] > 0
    return summary


def format_tech_capability_type_validation_error(validation: Dict[str, Any]) -> str:
    extracted = validation.get("stage4Extracted") if isinstance(validation.get("stage4Extracted"), dict) else {}
    final = validation.get("finalPortrait") if isinstance(validation.get("finalPortrait"), dict) else {}
    message = (
        "techCapabilities.type validation failed: "
        f"extracted missing={int(extracted.get('missingTypeCount') or 0)}, "
        f"extracted invalid={int(extracted.get('invalidTypeCount') or 0)}, "
        f"final missing={int(final.get('missingTypeCount') or 0)}, "
        f"final invalid={int(final.get('invalidTypeCount') or 0)}"
    )
    samples = final.get("samples") or extracted.get("samples") or []
    if not samples:
        return message
    sample_text = "; ".join(
        f"{clean_text(sample.get('skill') or sample.get('rawExtractedText'))}<{clean_text(sample.get('type')) or 'EMPTY'}:{clean_text(sample.get('issue'))}>"
        for sample in samples
        if isinstance(sample, dict)
    )
    return f"{message}; samples={sample_text}"


def preview_value(value: Any, max_length: int = 160, max_items: int = 3) -> str:
    if isinstance(value, list):
        parts = [clean_text(item) for item in value if clean_text(item)]
        text = "；".join(parts[:max_items])
        if len(parts) > max_items:
            text += " …"
    elif isinstance(value, dict):
        parts: List[str] = []
        for key, item in list(value.items())[:max_items]:
            item_text = clean_text(item)
            if item_text:
                parts.append(f"{key}: {item_text}")
        text = "；".join(parts) or json.dumps(value, ensure_ascii=False)
    else:
        text = clean_text(value)
    text = re.sub(r"\s+", " ", text)
    if len(text) > max_length:
        text = text[: max_length - 1] + "…"
    return text or "(空)"


def unwrap_singleton_payload(value: Any) -> Any:
    while isinstance(value, list) and len(value) == 1 and isinstance(value[0], (dict, list)):
        value = value[0]
    return value


def find_json_end(text: str, start: int) -> int:
    pairs = {"{": "}", "[": "]"}
    first = text[start]
    if first not in pairs:
        return -1
    stack = [pairs[first]]
    in_string = False
    escaped = False
    for index in range(start + 1, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char in pairs:
            stack.append(pairs[char])
        elif stack and char == stack[-1]:
            stack.pop()
            if not stack:
                return index + 1
    return -1


def iter_json_snippets(text: str) -> List[str]:
    snippets: List[str] = []
    seen = set()
    for index, char in enumerate(text):
        if char not in "{[":
            continue
        end = find_json_end(text, index)
        if end == -1:
            continue
        snippet = text[index:end].strip()
        if snippet and snippet not in seen:
            seen.add(snippet)
            snippets.append(snippet)
    for open_char, close_char in [("{", "}"), ("[", "]")]:
        start = text.find(open_char)
        end = text.rfind(close_char)
        if start != -1 and end > start:
            snippet = text[start : end + 1].strip()
            if snippet and snippet not in seen:
                snippets.append(snippet)
    return snippets


def extract_json_object(text: str) -> Any:
    text = clean_text(text)
    if not text:
        raise ValueError("model returned empty text")
    fenced = re.findall(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
    candidates = [text] + fenced
    for candidate in candidates:
        candidate = candidate.strip()
        for snippet in [candidate] + iter_json_snippets(candidate):
            try:
                parsed = unwrap_singleton_payload(json.loads(snippet))
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, (dict, list)):
                return parsed
    raise ValueError("could not parse JSON object or array from model output")


def make_builder_record_id(index: int, run_id: Optional[str] = None) -> str:
    token = clean_text(run_id)
    token = re.sub(r"[^A-Za-z0-9]+", "_", token).strip("_")
    token = token[-32:] if token else "IMPORT"
    return f"JOB_{token}_{index + 1:05d}"


def build_seed_portrait(record_id: str) -> Dict[str, Any]:
    portrait = json.loads(json.dumps(TARGET_SCHEMA))
    portrait["id"] = clean_text(record_id)
    return sanitize_value(normalize_job_profile(portrait))


def extract_candidate_values(record: Dict[str, Any], source_fields: List[str]) -> List[Any]:
    lowered = {str(key).lower(): (str(key), value) for key, value in record.items()}
    values: List[Any] = []
    seen = set()
    for source_field in source_fields:
        key = clean_text(source_field)
        if not key:
            continue
        if key in record:
            resolved_key = key
            value = record[key]
        elif key.lower() in lowered:
            resolved_key, value = lowered[key.lower()]
        else:
            continue
        if resolved_key in seen:
            continue
        seen.add(resolved_key)
        values.append(value)
    return values


def build_record_field_summary(raw_record: Dict[str, Any]) -> str:
    if not raw_record:
        return "- 无字段"
    lines: List[str] = []
    for key, value in raw_record.items():
        lines.append(f"- 字段名：{key}\n  样例值：{preview_value(value)}")
    return "\n".join(lines)


def normalize_field_restore_mapping(payload: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    source = payload
    for key in ["fieldRestore", "mapping", "fields"]:
        if isinstance(source.get(key), dict):
            source = source[key]
            break

    result: Dict[str, Dict[str, Any]] = {}
    for raw_key, raw_value in source.items():
        key = clean_text(raw_key)
        if not key:
            continue
        label = ""
        source_fields: List[str] = []
        if isinstance(raw_value, str):
            label = clean_text(raw_value)
        elif isinstance(raw_value, dict):
            label = clean_text(
                raw_value.get("label")
                or raw_value.get("meaning")
                or raw_value.get("description")
                or raw_value.get("explanation")
                or FIELD_RESTORE_HINTS.get(key)
            )
            source_fields = ensure_string_list(raw_value.get("sourceFields"))
            source_fields += ensure_string_list(raw_value.get("fields"))
            source_field = clean_text(raw_value.get("sourceField"))
            if source_field:
                source_fields.append(source_field)
        elif isinstance(raw_value, list):
            source_fields = ensure_string_list(raw_value)

        label = label or FIELD_RESTORE_HINTS.get(key, "")
        source_fields = dedupe_string_list(source_fields)
        if label or source_fields:
            result[key] = {"label": label, "sourceFields": source_fields}
    return result


def extract_mapped_scalar(record: Dict[str, Any], field_restore: Dict[str, Dict[str, Any]], normalized_key: str) -> str:
    source_fields = ensure_string_list(field_restore.get(normalized_key, {}).get("sourceFields"))
    for value in extract_candidate_values(record, source_fields):
        if isinstance(value, list):
            text = "；".join(clean_text(item) for item in value if clean_text(item))
        else:
            text = clean_text(value)
        if text:
            return text
    return ""


def extract_mapped_lines(record: Dict[str, Any], field_restore: Dict[str, Dict[str, Any]], normalized_key: str) -> List[str]:
    source_fields = ensure_string_list(field_restore.get(normalized_key, {}).get("sourceFields"))
    return merge_line_sources(*extract_candidate_values(record, source_fields))


def append_job_info_section(lines: List[str], label: str, items: List[str]) -> None:
    values = dedupe_string_list(items)
    if not values:
        return
    lines.append(f"- {label}：")
    for index, item in enumerate(values, start=1):
        lines.append(f"  {index}. {item}")


def build_restored_job_information_text(raw_record: Dict[str, Any], field_restore: Dict[str, Dict[str, Any]], record_id: str) -> str:
    lines = [f"- 岗位ID：{record_id}"]

    scalar_fields = [
        ("岗位名", extract_mapped_scalar(raw_record, field_restore, "title")),
        ("公司名", extract_mapped_scalar(raw_record, field_restore, "companyName")),
        ("岗位方向", extract_mapped_scalar(raw_record, field_restore, "direction")),
        ("行业", extract_mapped_scalar(raw_record, field_restore, "industry")),
        ("岗位类型", extract_mapped_scalar(raw_record, field_restore, "jobType")),
        ("薪资", extract_mapped_scalar(raw_record, field_restore, "salaryRange")),
        ("部门/团队", extract_mapped_scalar(raw_record, field_restore, "departmentInfo")),
        ("工作地点", extract_mapped_scalar(raw_record, field_restore, "location")),
    ]
    for label, value in scalar_fields:
        if value:
            lines.append(f"- {label}：{value}")

    append_job_info_section(lines, "岗位描述", extract_mapped_lines(raw_record, field_restore, "jobDescription"))
    append_job_info_section(lines, "工作职责", extract_mapped_lines(raw_record, field_restore, "responsibility"))
    append_job_info_section(lines, "入职要求", extract_mapped_lines(raw_record, field_restore, "requirement"))
    append_job_info_section(lines, "加分项", extract_mapped_lines(raw_record, field_restore, "bonus"))
    append_job_info_section(lines, "学历要求", extract_mapped_lines(raw_record, field_restore, "education"))
    append_job_info_section(lines, "专业要求", extract_mapped_lines(raw_record, field_restore, "major"))
    append_job_info_section(lines, "经验要求", extract_mapped_lines(raw_record, field_restore, "experience"))
    append_job_info_section(lines, "补充信息", extract_mapped_lines(raw_record, field_restore, "note"))
    return "\n".join(lines)


def normalize_range(value: Any) -> Optional[List[Optional[float]]]:
    if isinstance(value, list) and len(value) == 2:
        return [value[0], value[1]]
    if isinstance(value, dict):
        return [value.get("min"), value.get("max")]
    return None


def build_stage1_candidate(base_info_payload: Dict[str, Any], structure_payload: Dict[str, Any], record_id: str) -> Dict[str, Any]:
    candidate = dict(base_info_payload) if isinstance(base_info_payload, dict) else {}
    candidate["id"] = clean_text(record_id)
    if isinstance(structure_payload, dict):
        candidate["jdSplit"] = structure_payload.get("jdSplit", {})
        candidate["basicRequirements"] = structure_payload.get("basicRequirements", {})
    return candidate


def normalize_base_portrait(candidate: Dict[str, Any], record_id: str) -> Dict[str, Any]:
    portrait = json.loads(json.dumps(TARGET_SCHEMA))
    portrait["id"] = clean_text(record_id)
    portrait["title"] = clean_text(candidate.get("title"))
    portrait["companyName"] = clean_text(candidate.get("companyName"))
    portrait["direction"] = clean_text(candidate.get("direction"))
    portrait["industry"] = clean_text(candidate.get("industry"))
    metadata = candidate.get("metadata") if isinstance(candidate.get("metadata"), dict) else {}
    portrait["metadata"]["jobType"] = clean_text(metadata.get("jobType")) or "社招全职"
    portrait["metadata"]["salaryRange"] = normalize_range(metadata.get("salaryRange"))
    portrait["metadata"]["departmentAtmosphere"] = clean_text(metadata.get("departmentAtmosphere")) or None
    jd_split = candidate.get("jdSplit") if isinstance(candidate.get("jdSplit"), dict) else {}
    portrait["jdSplit"]["jobDescriptions"] = ensure_sentence_list(jd_split.get("jobDescriptions"))
    portrait["jdSplit"]["jobRequirements"] = ensure_sentence_list(jd_split.get("jobRequirements"))
    portrait["jdSplit"]["bonusPoints"] = ensure_sentence_list(jd_split.get("bonusPoints"))
    portrait["jdSplit"]["notes"] = ensure_sentence_list(jd_split.get("notes"))
    basic = candidate.get("basicRequirements") if isinstance(candidate.get("basicRequirements"), dict) else {}
    portrait["basicRequirements"] = {
        "education_min": clean_text(basic.get("education_min")) or None,
        "major": ensure_string_list(basic.get("major")),
        "graduationYearRange": normalize_graduation_year_range(basic.get("graduationYearRange")),
        "certifications": normalize_basic_certifications(basic.get("certifications")),
        "experiences": normalize_basic_experiences(basic.get("experiences")),
    }
    return sanitize_value(normalize_job_profile(portrait))


def normalize_structure_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    jd_split = payload.get("jdSplit") if isinstance(payload.get("jdSplit"), dict) else {}
    basic = payload.get("basicRequirements") if isinstance(payload.get("basicRequirements"), dict) else {}
    return sanitize_value(
        {
            "jdSplit": {
                "jobDescriptions": ensure_sentence_list(jd_split.get("jobDescriptions")),
                "jobRequirements": ensure_sentence_list(jd_split.get("jobRequirements")),
                "bonusPoints": ensure_sentence_list(jd_split.get("bonusPoints")),
                "notes": ensure_sentence_list(jd_split.get("notes")),
            },
            "basicRequirements": {
                "education_min": clean_text(basic.get("education_min")) or None,
                "major": ensure_string_list(basic.get("major")),
                "graduationYearRange": normalize_graduation_year_range(basic.get("graduationYearRange")),
                "certifications": normalize_basic_certifications(basic.get("certifications")),
                "experiences": normalize_basic_experiences(basic.get("experiences")),
            },
        }
    )


def sentence_text_from_compact_item(item: Any) -> str:
    if isinstance(item, dict):
        source = clean_text(item.get("source")) or "requirements"
        if source != "requirements":
            return ""
        return clean_text(item.get("text"))
    return clean_text(item)


def normalize_sentence_classification(payload: Any) -> Dict[str, List[Dict[str, Any]]]:
    result = {"tech_sentences": [], "soft_sentences": [], "noise_sentences": []}

    if isinstance(payload, list):
        sources = {
            "tech_sentences": ensure_list(payload[0] if len(payload) > 0 else []),
            "soft_sentences": ensure_list(payload[1] if len(payload) > 1 else []),
            "noise_sentences": ensure_list(payload[2] if len(payload) > 2 else []),
        }
    elif isinstance(payload, dict):
        sources = {
            "tech_sentences": ensure_list(payload.get("tech_sentences")),
            "soft_sentences": ensure_list(payload.get("soft_sentences")),
            "noise_sentences": ensure_list(payload.get("noise_sentences")),
        }
    else:
        sources = {"tech_sentences": [], "soft_sentences": [], "noise_sentences": []}

    for item in sources["tech_sentences"]:
        text = sentence_text_from_compact_item(item)
        if not text:
            continue
        result["tech_sentences"].append({"text": text, "source": "requirements"})

    for key in ["soft_sentences", "noise_sentences"]:
        for item in sources[key]:
            text = sentence_text_from_compact_item(item)
            if not text:
                continue
            result[key].append({"text": text, "source": "requirements"})
    return sanitize_value(result)


def merge_noise_sentences_into_notes(
    base_portrait: Dict[str, Any],
    sentence_payload: Dict[str, Any],
) -> Dict[str, Any]:
    merged = json.loads(json.dumps(base_portrait if isinstance(base_portrait, dict) else {}))
    jd_split = merged.get("jdSplit") if isinstance(merged.get("jdSplit"), dict) else {}
    existing_notes = ensure_sentence_list(jd_split.get("notes"))
    seen = {clean_text(item).lower() for item in existing_notes if clean_text(item)}
    for item in ensure_list(sentence_payload.get("noise_sentences")):
        if not isinstance(item, dict):
            continue
        text = clean_text(item.get("text"))
        if not text or text.lower() in seen:
            continue
        existing_notes.append(text)
        seen.add(text.lower())
    jd_split["notes"] = existing_notes
    merged["jdSplit"] = jd_split
    return sanitize_value(merged)


def compact_tech_stack_item_to_dict(item: Any) -> Any:
    if not isinstance(item, list):
        return item
    if not item:
        return None
    marker = clean_text(item[0]).lower()
    if marker in {"branch", "or"}:
        return {
            "type": "branch",
            "groupName": item[1] if len(item) > 1 else "",
            "options": item[2] if len(item) > 2 else [],
            "levelRequired": coerce_level(item[3] if len(item) > 3 else None, default=2),
            "sum": item[4] if len(item) > 4 else 1,
            "note": item[5] if len(item) > 5 else "",
        }
    return {
        "name": item[0],
        "levelRequired": coerce_level(item[1] if len(item) > 1 else None, default=2),
        "note": item[2] if len(item) > 2 else "",
    }


def compact_capability_item_to_dict(item: Any) -> Any:
    if not isinstance(item, list):
        return item
    return {
        "rawExtractedText": item[0] if len(item) > 0 else "",
        "type": item[1] if len(item) > 1 else "",
        "domain": item[2] if len(item) > 2 else None,
        "skill": item[3] if len(item) > 3 else "",
        "skillZh": item[4] if len(item) > 4 else "",
        "levelRequired": coerce_level(item[5] if len(item) > 5 else None, default=2),
    }


def compact_dev_tool_item_to_dict(item: Any) -> Any:
    if not isinstance(item, list):
        return item
    return {
        "rawExtractedText": item[0] if len(item) > 0 else "",
        "skill": item[1] if len(item) > 1 else "",
        "skillZh": item[2] if len(item) > 2 else "",
        "levelRequired": coerce_level(item[3] if len(item) > 3 else None, default=2),
    }


def normalize_tech_portrait(payload: Any) -> Dict[str, Any]:
    result = {"techStack": [], "techCapabilities": [], "devTools": []}
    payload = payload if isinstance(payload, dict) else {}
    for item in ensure_list(payload.get("techStack")):
        item = compact_tech_stack_item_to_dict(item)
        if isinstance(item, dict) and (
            clean_text(item.get("type")).lower() == "branch" or isinstance(item.get("options"), list)
        ):
            normalized_branch = normalize_tech_stack_branch(item)
            if normalized_branch:
                result["techStack"].append(normalized_branch)
            continue
        normalized_item = normalize_tech_stack_leaf(item)
        if normalized_item:
            result["techStack"].append(normalized_item)
    # Read the legacy field for backward compatibility, but fold it into techStack.
    for item in ensure_list(payload.get(LEGACY_TECH_STACK_OR_FIELD)):
        item = compact_tech_stack_item_to_dict(item)
        normalized_branch = normalize_tech_stack_branch(item)
        if normalized_branch:
            result["techStack"].append(normalized_branch)
    for item in ensure_list(payload.get("techCapabilities")):
        item = compact_capability_item_to_dict(item)
        if not isinstance(item, dict):
            continue
        raw_text = clean_text(item.get("rawExtractedText"))
        if not raw_text:
            continue
        result["techCapabilities"].append(
            {
                "rawExtractedText": raw_text,
                "normalizedTag": None,
                "type": normalize_tech_capability_type(item.get("type")),
                "domain": clean_text(item.get("domain")) or None,
                "skill": clean_text(item.get("skill")) or raw_text,
                "skillZh": clean_text(item.get("skillZh")) or raw_text,
                "levelRequired": coerce_level(item.get("levelRequired"), default=2),
            }
        )
    for item in ensure_list(payload.get("devTools")):
        item = compact_dev_tool_item_to_dict(item)
        if not isinstance(item, dict):
            continue
        raw_text = clean_text(item.get("rawExtractedText") or item.get("name"))
        if not raw_text:
            continue
        result["devTools"].append(
            {
                "rawExtractedText": raw_text,
                "normalizedTag": None,
                "skill": clean_text(item.get("skill")) or raw_text,
                "skillZh": clean_text(item.get("skillZh")) or raw_text,
                "levelRequired": coerce_level(item.get("levelRequired"), default=2),
            }
        )
    return sanitize_value(result)


def compact_level_map(source: Any, dimensions: List[str]) -> Dict[str, int]:
    result: Dict[str, int] = {}
    for index, item in enumerate(ensure_list(source)):
        fallback_name = dimensions[index] if index < len(dimensions) else ""
        if isinstance(item, dict):
            name = clean_text(item.get("name")) or fallback_name
            level = coerce_level(item.get("levelRequired"), default=1)
        elif isinstance(item, list):
            first = item[0] if len(item) > 0 else None
            second = item[1] if len(item) > 1 else None
            first_text = clean_text(first)
            if first_text in dimensions:
                name = first_text
                level = coerce_level(second, default=1)
            else:
                name = fallback_name
                level = coerce_level(first, default=1)
        else:
            name = fallback_name
            level = coerce_level(item, default=1)
        if name in dimensions:
            result[name] = level
    return result


def normalize_soft_portrait(payload: Any) -> Dict[str, Any]:
    result = {
        "softQuality": [{"name": name, "levelRequired": 1} for name in SOFT_DIMENSIONS],
        "growthPotential": [{"name": name, "levelRequired": 1} for name in GROWTH_DIMENSIONS],
    }
    if isinstance(payload, list):
        soft_source = payload[0] if len(payload) > 0 else []
        growth_source = payload[1] if len(payload) > 1 else []
    elif isinstance(payload, dict):
        soft_source = payload.get("softQuality")
        growth_source = payload.get("growthPotential")
    else:
        soft_source = []
        growth_source = []

    soft_map = compact_level_map(soft_source, SOFT_DIMENSIONS)
    growth_map = compact_level_map(growth_source, GROWTH_DIMENSIONS)

    result["softQuality"] = [{"name": name, "levelRequired": soft_map.get(name, 1)} for name in SOFT_DIMENSIONS]
    result["growthPotential"] = [{"name": name, "levelRequired": growth_map.get(name, 1)} for name in GROWTH_DIMENSIONS]
    return sanitize_value(result)


def merge_portrait(base: Dict[str, Any], tech: Dict[str, Any], soft: Dict[str, Any]) -> Dict[str, Any]:
    merged = json.loads(json.dumps(base))
    merged.update(tech)
    merged.update(soft)
    return sanitize_value(merged)


def build_stage1_field_restore_prompts(raw_record: Dict[str, Any], record_id: str) -> Tuple[str, str]:
    system_prompt = (
        "Role: field mapper.\n"
        + RAW_JSON_ONLY
        + "\n"
        + FIELD_RESTORE_REFERENCE
    )
    user_prompt = (
        f"id:{record_id}\n"
        "standardHints:"
        + compact_json(FIELD_RESTORE_HINTS)
        + "\n字段清单与样例值：\n"
        + build_record_field_summary(raw_record)
        + "\nOutput format:{\"standardKey\":[\"rawField\"]}"
    )
    return system_prompt, user_prompt


def build_stage1_base_info_prompts(restored_job_text: str) -> Tuple[str, str]:
    system_prompt = (
        "Role: base job facts extractor.\n"
        + RAW_JSON_ONLY
        + "\n"
        + STAGE1_BASE_INFO_REFERENCE
    )
    user_prompt = (
        "directions:"
        + compact_json(DIRECTION_OPTIONS)
        + "\nrestoredJob:\n"
        + restored_job_text
    )
    return system_prompt, user_prompt


def build_stage2_structure_messages(field_restore: Dict[str, Dict[str, Any]], restored_job_text: str) -> List[Dict[str, str]]:
    return [
        {"role": "system", "content": RAW_JSON_ONLY + "\n" + STRUCTURE_EXTRACTION_REFERENCE},
        {
            "role": "user",
            "content": "fieldRestore:" + compact_json(field_restore),
        },
        {
            "role": "user",
            "content": "restoredJob:\n" + restored_job_text,
        },
    ]


def build_stage3_sentence_classifier_prompts(base_portrait: Dict[str, Any]) -> Tuple[str, str]:
    requirements = base_portrait.get("jdSplit", {}).get("jobRequirements", [])
    system_prompt = (
        "Role: requirement sentence classifier.\n"
        + RAW_JSON_ONLY
        + "\n"
        + SENTENCE_CLASSIFICATION_REFERENCE
    )
    user_prompt = "jobRequirements（source=requirements）:\n" + format_numbered_lines(requirements)
    return system_prompt, user_prompt


def build_stage4_tech_prompts(base_portrait: Dict[str, Any], sentence_payload: Dict[str, Any]) -> Tuple[str, str]:
    descriptions = base_portrait.get("jdSplit", {}).get("jobDescriptions", [])
    tech_sentences = [
        clean_text(item.get("text") if isinstance(item, dict) else item)
        for item in ensure_list(sentence_payload.get("tech_sentences"))
        if clean_text(item.get("text") if isinstance(item, dict) else item)
    ]
    system_prompt = (
        "Role: technical portrait extractor.\n"
        + RAW_JSON_ONLY
        + "\n"
        + TECH_EXTRACTION_REFERENCE_V2
        + TECH_STACK_BRANCH_HINT
    )
    user_prompt = (
        "岗位标题: "
        + clean_text(base_portrait.get("title"))
        + "\n岗位方向: "
        + clean_text(base_portrait.get("direction"))
        + "\n岗位职责（上下文补充）:\n"
        + format_numbered_lines(descriptions)
        + "\ntech_sentences:\n"
        + compact_json(tech_sentences)
    )
    return system_prompt, user_prompt


def build_stage4_tech_direct_prompts(base_portrait: Dict[str, Any]) -> Tuple[str, str]:
    jd_split = base_portrait.get("jdSplit", {})
    system_prompt = (
        "Role: technical portrait extractor.\n"
        + RAW_JSON_ONLY
        + "\n"
        + TECH_EXTRACTION_REFERENCE_V2
        + TECH_STACK_BRANCH_HINT
    )
    user_prompt = (
        "岗位标题: "
        + clean_text(base_portrait.get("title"))
        + "\n岗位方向: "
        + clean_text(base_portrait.get("direction"))
        + "\n岗位职责（上下文补充）:\n"
        + format_numbered_lines(ensure_list(jd_split.get("jobDescriptions")))
        + "\n岗位要求（原文）:\n"
        + format_numbered_lines(ensure_list(jd_split.get("jobRequirements")))
    )
    return system_prompt, user_prompt


def build_stage4_soft_prompts(
    base_portrait: Dict[str, Any],
    sentence_payload: Dict[str, Any],
    tech_portrait: Optional[Dict[str, Any]] = None,
) -> Tuple[str, str]:
    system_prompt = (
        "Role: soft quality scorer.\n"
        + RAW_JSON_ONLY
        + "\n"
        + SOFT_EXTRACTION_REFERENCE
    )
    soft_sentences = [
        clean_text(item.get("text") if isinstance(item, dict) else item)
        for item in ensure_list(sentence_payload.get("soft_sentences"))
        if clean_text(item.get("text") if isinstance(item, dict) else item)
    ]
    job_descriptions = ensure_list((base_portrait.get("jdSplit") or {}).get("jobDescriptions"))
    soft_flags = [
        clean_text(item.get("rawExtractedText") or item.get("skill") or item.get("skillZh"))
        for item in ensure_list((tech_portrait or {}).get("techCapabilities"))
        if isinstance(item, dict) and clean_text(item.get("type")) == "soft_flag"
    ]
    user_prompt = (
        "岗位标题: "
        + clean_text(base_portrait.get("title"))
        + "\n岗位方向: "
        + clean_text(base_portrait.get("direction"))
        + "\n岗位工作内容（jobDescriptions）:\n"
        + format_numbered_lines(job_descriptions)
        + "\nsoft_sentences:\n"
        + compact_json(soft_sentences)
        + "\nsoft_flags:\n"
        + compact_json([item for item in soft_flags if item])
    )
    return system_prompt, user_prompt


def build_stage4_soft_direct_prompts(base_portrait: Dict[str, Any]) -> Tuple[str, str]:
    jd_split = base_portrait.get("jdSplit", {})
    system_prompt = (
        "Role: soft quality scorer.\n"
        + RAW_JSON_ONLY
        + "\n"
        + SOFT_EXTRACTION_REFERENCE
    )
    user_prompt = (
        "岗位标题: "
        + clean_text(base_portrait.get("title"))
        + "\n岗位方向: "
        + clean_text(base_portrait.get("direction"))
        + "\n岗位职责（上下文补充）:\n"
        + format_numbered_lines(ensure_list(jd_split.get("jobDescriptions")))
        + "\n岗位要求（原文）:\n"
        + format_numbered_lines(ensure_list(jd_split.get("jobRequirements")))
    )
    return system_prompt, user_prompt
