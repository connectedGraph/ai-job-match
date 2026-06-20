import asyncio
import json
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from .config import logger
from .model_config import load_fast_llm_config
from .schemas import MatchCheckRequest
from .utils import clean_text


FAST_LLM_CONFIG = load_fast_llm_config()
MATCH_CHECK_LLM_TIMEOUT_SECONDS_DEFAULT = 18
MATCH_CHECK_LLM_MAX_TOKENS_DEFAULT = 1800

EDUCATION_RANK = {
    "中专": 1,
    "大专": 2,
    "本科": 3,
    "学士": 3,
    "硕士": 4,
    "研究生": 4,
    "博士": 5,
}

EXPERIENCE_CODE_MAP = {
    "internship": "INT",
    "projects": "PROJ",
    "competition": "COMP",
    "research": "RES",
    "campus": "CAMP",
    "learning": "LEARN",
}

MAJOR_FAMILY_ALIASES = {
    "computer": [
        "计算机",
        "软件工程",
        "软件",
        "网络工程",
        "信息安全",
        "数据科学",
        "人工智能",
        "智能科学",
        "数字媒体技术",
        "物联网工程",
        "网络空间安全",
        "大数据",
    ],
    "electronics": [
        "电子信息",
        "通信工程",
        "微电子",
        "集成电路",
        "自动化",
        "控制工程",
        "电气工程",
    ],
    "math": [
        "数学",
        "统计",
        "应用数学",
        "信息与计算科学",
        "运筹",
    ],
    "business": [
        "工商管理",
        "市场营销",
        "电子商务",
        "金融",
        "经济",
        "会计",
    ],
}

CERT_FAMILY_ALIASES = {
    "cet4": ["cet4", "英语四级", "大学英语四级", "四级"],
    "cet6": ["cet6", "英语六级", "大学英语六级", "六级"],
    "pmp": ["pmp", "项目管理专业人士"],
    "aws_saa": [
        "aws certified solutions architect associate",
        "aws solutions architect associate",
        "aws saa",
        "aws-saa",
    ],
    "aws_practitioner": [
        "aws certified cloud practitioner",
        "aws cloud practitioner",
        "aws practitioner",
    ],
    "hcia": ["hcia", "华为认证ict工程师"],
    "hcip": ["hcip", "华为认证ict高级工程师"],
    "hcie": ["hcie", "华为认证ict专家"],
    "teacher": ["教师资格证", "教资"],
    "soft_exam": ["软考", "软件设计师", "系统架构设计师", "信息系统项目管理师"],
}


def as_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    if value in (None, "", {}):
        return []
    return [value]


def normalize_term(value: Any) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", clean_text(value).lower())


def format_raw_value(value: Any) -> str:
    if isinstance(value, str):
        return clean_text(value)
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        preferred = [
            "name",
            "title",
            "requirement",
            "description",
            "detail",
            "text",
            "value",
            "level",
            "note",
        ]
        parts = [clean_text(value.get(key)) for key in preferred if clean_text(value.get(key))]
        if parts:
            return " | ".join(parts)
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return " / ".join(filter(None, [format_raw_value(item) for item in value]))
    return clean_text(value)


def parse_range(value: Any) -> Optional[Dict[str, int]]:
    if not value:
        return None
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        try:
            return {"min": int(value[0]), "max": int(value[1])}
        except (TypeError, ValueError):
            return None
    if isinstance(value, dict):
        min_value = value.get("min", value.get("start", value.get("from")))
        max_value = value.get("max", value.get("end", value.get("to")))
        try:
            if min_value is None and max_value is None:
                return None
            return {
                "min": int(min_value) if min_value is not None else 0,
                "max": int(max_value) if max_value is not None else 0,
            }
        except (TypeError, ValueError):
            return None
    matched = re.search(r"(\d{4}).*?(\d{4})", str(value))
    if matched:
        return {"min": int(matched.group(1)), "max": int(matched.group(2))}
    return None


def parse_optional_int(value: Any) -> Optional[int]:
    try:
        text = clean_text(value)
        if not text:
            return None
        return int(float(text))
    except (TypeError, ValueError):
        return None


def current_match_check_date() -> date:
    return datetime.now(ZoneInfo("Asia/Shanghai")).date()


def derive_education_context(student: Dict[str, Any]) -> Dict[str, Any]:
    basic_info = student.get("basicInfo") or {}
    current_date = current_match_check_date()
    education_level = clean_text(basic_info.get("educationLevel"))
    graduation_year = parse_optional_int(basic_info.get("graduationYear"))
    raw_graduation_month = parse_optional_int(basic_info.get("graduationMonth"))
    effective_graduation_month = raw_graduation_month or 6
    effective_graduation_month = min(max(effective_graduation_month, 1), 12)

    is_currently_enrolled: Optional[bool] = None
    is_fresh_graduate: Optional[bool] = None
    student_status = "未确认"
    reason = "学生画像未提供可用于推断在读状态的预计毕业年月。"

    if graduation_year:
        is_currently_enrolled = (
            graduation_year > current_date.year
            or (
                graduation_year == current_date.year
                and effective_graduation_month >= current_date.month
            )
        )
        is_fresh_graduate = graduation_year == current_date.year
        cohort = f"{graduation_year}届"
        if is_currently_enrolled:
            student_status = f"{education_level}在读" if education_level else "在读"
            relation = "尚未到预计毕业年月"
        else:
            student_status = f"{education_level}已毕业" if education_level else "已毕业"
            relation = "已超过预计毕业年月"
        month_note = (
            f"{effective_graduation_month:02d}"
            if raw_graduation_month
            else f"{effective_graduation_month:02d}（画像未填月份，按国内常见毕业月 6 月推断）"
        )
        reason = (
            f"当前日期为 {current_date.isoformat()}，学生预计毕业年月为 "
            f"{graduation_year}-{month_note}，{relation}，因此当前状态可判定为“{student_status} / {cohort}”。"
        )
    else:
        cohort = ""

    return {
        "currentDate": current_date.isoformat(),
        "educationLevel": education_level,
        "graduationYear": graduation_year,
        "graduationMonth": raw_graduation_month,
        "effectiveGraduationMonth": effective_graduation_month if graduation_year else None,
        "graduationCohort": cohort,
        "isCurrentlyEnrolled": is_currently_enrolled,
        "isFreshGraduate": is_fresh_graduate,
        "studentStatus": student_status,
        "reason": reason,
    }


def normalize_text_model_base_url(base_url: str) -> str:
    text = clean_text(base_url).rstrip("/")
    if not text:
        return ""
    return text if text.endswith("/v1") else f"{text}/v1"


def match_check_llm_timeout_seconds() -> int:
    return max(8, int(FAST_LLM_CONFIG.timeout_seconds or MATCH_CHECK_LLM_TIMEOUT_SECONDS_DEFAULT))


def match_check_llm_max_tokens() -> int:
    return max(512, min(int(FAST_LLM_CONFIG.max_tokens or MATCH_CHECK_LLM_MAX_TOKENS_DEFAULT), MATCH_CHECK_LLM_MAX_TOKENS_DEFAULT))


def resolve_match_check_text_model_config(request_config: Any) -> Dict[str, Any]:
    request_enabled = bool(getattr(request_config, "enabled", True)) if request_config is not None else True

    if request_config is not None and request_enabled:
        base_url = normalize_text_model_base_url(getattr(request_config, "baseUrl", ""))
        api_key = clean_text(getattr(request_config, "apiKey", ""))
        model = clean_text(getattr(request_config, "model", "")) or clean_text(FAST_LLM_CONFIG.model)
        if base_url and api_key:
            return {
                "source": "request_config",
                "base_url": base_url,
                "api_key": api_key,
                "model": model,
                "temperature": float(getattr(request_config, "temperature", 0.0) or 0.0),
                "max_tokens": min(
                    int(getattr(request_config, "maxTokens", match_check_llm_max_tokens()) or match_check_llm_max_tokens()),
                    match_check_llm_max_tokens(),
                ),
            }

    return {
        "source": "fast_llm",
        "base_url": normalize_text_model_base_url(FAST_LLM_CONFIG.base_url),
        "api_key": clean_text(FAST_LLM_CONFIG.api_key),
        "model": clean_text(FAST_LLM_CONFIG.model),
        "temperature": float(FAST_LLM_CONFIG.temperature),
        "max_tokens": match_check_llm_max_tokens(),
    }


def resolve_alias_families(text: str, alias_map: Dict[str, List[str]]) -> List[str]:
    normalized = normalize_term(text)
    if not normalized:
        return []
    hits: List[str] = []
    for family, aliases in alias_map.items():
        for alias in aliases:
            alias_key = normalize_term(alias)
            if alias_key and (alias_key in normalized or normalized in alias_key):
                hits.append(family)
                break
    return sorted(set(hits))


def build_education_check(student: Dict[str, Any], job: Dict[str, Any]) -> Dict[str, Any]:
    basic_info = student.get("basicInfo") or {}
    requirements = job.get("basicRequirements") or {}
    student_edu = clean_text(basic_info.get("educationLevel"))
    job_edu = clean_text(requirements.get("education_min") or requirements.get("educationMin"))
    if not job_edu:
        return {
            "requirement_text": "学历要求未设置",
            "passed": True,
            "reason": "岗位未设置学历硬门槛。",
            "matched_evidence_ids": [],
            "matched_evidence_summary": [],
            "source": "rule",
            "status": "not_applicable",
        }
    passed = (EDUCATION_RANK.get(student_edu, 0) >= EDUCATION_RANK.get(job_edu, 0))
    return {
        "requirement_text": job_edu,
        "passed": passed,
        "reason": f"你的学历为“{student_edu or '未填写'}”，岗位要求为“{job_edu}”。",
        "matched_evidence_ids": [],
        "matched_evidence_summary": [f"学历：{student_edu or '未填写'}"],
        "source": "rule",
        "status": "passed" if passed else "failed",
    }


def build_graduation_check(student: Dict[str, Any], job: Dict[str, Any]) -> Dict[str, Any]:
    basic_info = student.get("basicInfo") or {}
    requirements = job.get("basicRequirements") or {}
    grad_range = parse_range(requirements.get("graduationYearRange") or requirements.get("graduation_year_range"))
    grad_year = basic_info.get("graduationYear")
    if not grad_range:
        return {
            "requirement_text": "毕业年限未设置",
            "passed": True,
            "reason": "岗位未设置毕业年限硬门槛。",
            "matched_evidence_ids": [],
            "matched_evidence_summary": [],
            "source": "rule",
            "status": "not_applicable",
        }
    try:
        numeric_grad_year = int(grad_year)
    except (TypeError, ValueError):
        numeric_grad_year = None
    passed = bool(
        numeric_grad_year is not None
        and numeric_grad_year >= grad_range["min"]
        and numeric_grad_year <= grad_range["max"]
    )
    return {
        "requirement_text": f"{grad_range['min']} - {grad_range['max']}",
        "passed": passed,
        "reason": f"你的毕业年份为“{numeric_grad_year or '未填写'}”，岗位要求区间为“{grad_range['min']} - {grad_range['max']}”。",
        "matched_evidence_ids": [],
        "matched_evidence_summary": [f"毕业年份：{numeric_grad_year or '未填写'}"],
        "source": "rule",
        "status": "passed" if passed else "failed",
    }


def build_requirement_lists(job: Dict[str, Any]) -> Dict[str, List[str]]:
    requirements = job.get("basicRequirements") or {}
    majors = [format_raw_value(item) for item in as_list(requirements.get("major") or requirements.get("majors"))]
    certifications = [format_raw_value(item) for item in as_list(requirements.get("certifications"))]
    experiences = [format_raw_value(item) for item in as_list(requirements.get("experiences"))]
    return {
        "majors": [item for item in majors if item],
        "certifications": [item for item in certifications if item],
        "experiences": [item for item in experiences if item],
    }


def format_date_range(item: Dict[str, Any]) -> str:
    start = clean_text(item.get("startDate") or item.get("start") or item.get("from"))
    end = clean_text(item.get("endDate") or item.get("end") or item.get("to") or item.get("date"))
    if start and end:
        return f"{start} 至 {end}"
    return start or end or clean_text(item.get("semester")) or clean_text(item.get("dateRange"))


def summarize_experience(type_key: str, item: Dict[str, Any]) -> Dict[str, str]:
    tags = [clean_text(tag) for tag in as_list(item.get("tags")) if clean_text(tag)]
    tag_summary = f"；标签：{' / '.join(tags[:4])}" if tags else ""
    if type_key == "internship":
        title = clean_text(item.get("positionName") or item.get("roleName") or item.get("title") or "实习经历")
        org = clean_text(item.get("companyName") or item.get("company") or item.get("orgName") or "")
        summary = clean_text(item.get("jobDesc") or item.get("description") or item.get("desc") or item.get("note"))
    elif type_key == "projects":
        title = clean_text(item.get("projectName") or item.get("title") or "项目经历")
        org = clean_text(item.get("roleName") or item.get("teamName") or "")
        summary = clean_text(item.get("jobDesc") or item.get("description") or item.get("desc") or item.get("note"))
    elif type_key == "competition":
        title = clean_text(item.get("competitionName") or item.get("title") or "竞赛经历")
        org = clean_text(item.get("award") or item.get("roleName") or "")
        summary = clean_text(item.get("description") or item.get("desc") or item.get("note"))
    elif type_key == "research":
        title = clean_text(item.get("labName") or item.get("title") or "科研经历")
        org = clean_text(item.get("direction") or item.get("school") or "")
        summary = clean_text(item.get("description") or item.get("desc") or item.get("roleName") or item.get("note"))
    elif type_key == "campus":
        title = clean_text(item.get("orgName") or item.get("title") or "校园经历")
        org = clean_text(item.get("position") or item.get("roleName") or "")
        summary = clean_text(item.get("duty") or item.get("description") or item.get("desc") or item.get("note"))
    else:
        title = clean_text(item.get("skill") or item.get("title") or item.get("name") or "学习经历")
        org = clean_text(item.get("type") or "")
        summary = clean_text(item.get("notes") or item.get("description") or item.get("desc") or item.get("note"))
    return {
        "title": title,
        "organization": org,
        "timeframe": format_date_range(item),
        "summary": f"{summary}{tag_summary}".strip("；"),
    }


def build_student_evidence(student: Dict[str, Any]) -> Dict[str, Any]:
    basic_info = student.get("basicInfo") or {}
    evidence_index: Dict[str, Dict[str, str]] = {}
    education_context = derive_education_context(student)

    education_evidence = {
        "id": "EDU_001",
        "type": "education_status",
        "title": education_context.get("studentStatus") or "教育状态",
        "organization": clean_text(basic_info.get("schoolName")),
        "timeframe": education_context.get("currentDate") or "",
        "summary": clean_text(education_context.get("reason")),
    }
    evidence_index[education_evidence["id"]] = education_evidence

    major_text = clean_text(basic_info.get("schoolMajor"))
    major_evidence = {
        "id": "MAJOR_001",
        "type": "major",
        "title": major_text or "未填写专业",
        "organization": clean_text(basic_info.get("schoolName")),
        "timeframe": "",
        "summary": (
            f"最高学历：{clean_text(basic_info.get('educationLevel')) or '未填写'}；"
            f"预计毕业：{education_context.get('graduationCohort') or '未填写'}；"
            f"当前状态：{education_context.get('studentStatus') or '未确认'}"
        ),
    }
    evidence_index[major_evidence["id"]] = major_evidence

    certificate_evidence: List[Dict[str, str]] = []
    for index, item in enumerate(as_list(basic_info.get("certificates")), start=1):
        if not isinstance(item, dict):
            item = {"name": format_raw_value(item)}
        evidence = {
            "id": f"CERT_{index:03d}",
            "type": "certificate",
            "title": clean_text(item.get("name") or item.get("certificateName") or "证书"),
            "organization": clean_text(item.get("issuer") or item.get("organization") or ""),
            "timeframe": clean_text(item.get("date") or item.get("issueDate") or ""),
            "summary": clean_text(item.get("level") or item.get("note") or item.get("description") or ""),
        }
        certificate_evidence.append(evidence)
        evidence_index[evidence["id"]] = evidence

    experience_evidence: List[Dict[str, str]] = []
    experiences = student.get("experiences") or {}
    for type_key, prefix in EXPERIENCE_CODE_MAP.items():
        for index, item in enumerate(as_list(experiences.get(type_key)), start=1):
            if not isinstance(item, dict):
                continue
            summary = summarize_experience(type_key, item)
            evidence = {
                "id": f"{prefix}_{index:03d}",
                "type": type_key,
                "title": summary["title"],
                "organization": summary["organization"],
                "timeframe": summary["timeframe"],
                "summary": summary["summary"],
            }
            experience_evidence.append(evidence)
            evidence_index[evidence["id"]] = evidence

    return {
        "education": education_evidence,
        "educationContext": education_context,
        "major": major_evidence,
        "certificates": certificate_evidence,
        "experiences": experience_evidence,
        "index": evidence_index,
    }


def summarize_evidence(evidence: Dict[str, str]) -> str:
    time_part = f"({evidence.get('timeframe')}) " if clean_text(evidence.get("timeframe")) else ""
    org_part = f"{evidence.get('organization')} " if clean_text(evidence.get("organization")) else ""
    summary = clean_text(evidence.get("summary"))
    if summary:
        return f"{time_part}{org_part}{evidence.get('title')}：{summary}"
    return f"{time_part}{org_part}{evidence.get('title')}".strip()


def sanitize_llm_json(raw: str) -> Dict[str, Any]:
    text = clean_text(raw)
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    return json.loads(text)


def normalize_check_item(
    raw_item: Any,
    requirement_text: str,
    evidence_index: Dict[str, Dict[str, str]],
    *,
    default_reason: str,
    source: str,
) -> Dict[str, Any]:
    payload = raw_item if isinstance(raw_item, dict) else {}
    matched_ids = []
    for item in as_list(payload.get("matched_evidence_ids")):
        evidence_id = clean_text(item)
        if evidence_id:
            matched_ids.append(evidence_id)
    matched_ids = [item for item in matched_ids if item in evidence_index]
    matched_summary = [
        clean_text(item) for item in as_list(payload.get("matched_evidence_summary")) if clean_text(item)
    ]
    if not matched_summary:
        matched_summary = [summarize_evidence(evidence_index[item]) for item in matched_ids]
    return {
        "requirement_text": requirement_text,
        "passed": bool(payload.get("passed", False)),
        "reason": clean_text(payload.get("reason")) or default_reason,
        "matched_evidence_ids": matched_ids,
        "matched_evidence_summary": matched_summary,
        "source": source,
    }


def build_response_payload(
    *,
    job: Dict[str, Any],
    source_meta: Dict[str, Any],
    education_check: Dict[str, Any],
    graduation_check: Dict[str, Any],
    major_check: Optional[Dict[str, Any]],
    certificate_checks: List[Dict[str, Any]],
    experience_checks: List[Dict[str, Any]],
) -> Dict[str, Any]:
    required_checks = [education_check, graduation_check]
    if major_check:
        required_checks.append(major_check)
    required_checks.extend(certificate_checks)
    required_checks.extend(experience_checks)
    effective_checks = [
        item for item in required_checks
        if item.get("status") != "not_applicable" or item.get("source") != "rule"
    ]
    failed_checks = [item for item in effective_checks if not item.get("passed")]
    overall_passed = len(failed_checks) == 0

    checklist = [
        {
            "label": "学历要求",
            "pass": bool(education_check.get("passed")),
            "detail": education_check.get("reason"),
            "source": education_check.get("source"),
        },
        {
            "label": "毕业年限",
            "pass": bool(graduation_check.get("passed")),
            "detail": graduation_check.get("reason"),
            "source": graduation_check.get("source"),
        },
    ]
    if major_check:
        checklist.append(
            {
                "label": "专业要求",
                "pass": bool(major_check.get("passed")),
                "detail": major_check.get("reason"),
                "source": major_check.get("source"),
            }
        )
    checklist.extend(
        {
            "label": f"证书要求 {index + 1}",
            "pass": bool(item.get("passed")),
            "detail": item.get("reason"),
            "source": item.get("source"),
        }
        for index, item in enumerate(certificate_checks)
    )
    checklist.extend(
        {
            "label": f"经验要求 {index + 1}",
            "pass": bool(item.get("passed")),
            "detail": item.get("reason"),
            "source": item.get("source"),
        }
        for index, item in enumerate(experience_checks)
    )

    title = "核查通过，可进入采摘" if overall_passed else "核查未通过，暂不建议采摘"
    if overall_passed:
        summary = f"岗位“{clean_text(job.get('title')) or '当前岗位'}”的准入核查已通过，硬门槛与 LLM 复核没有发现阻塞项。"
        tip = "建议继续查看技术缺口与 JD 细节，再决定是否加入篮子。"
    else:
        summary = "以下项目仍存在明显阻塞项：" + "；".join(
            [item.get("requirement_text") or "未满足要求" for item in failed_checks[:3]]
        )
        tip = failed_checks[0].get("reason") if failed_checks else "建议先补齐专业、证书或相关经历后再重试。"

    return {
        "passed": overall_passed,
        "overall_passed": overall_passed,
        "title": title,
        "summary": summary,
        "tip": tip,
        "education_check": education_check,
        "graduation_check": graduation_check,
        "major_check": major_check,
        "certificate_checks": certificate_checks,
        "experience_checks": experience_checks,
        "checklist": checklist,
        "sourceMeta": source_meta,
    }


async def call_match_check_llm(
    *,
    job: Dict[str, Any],
    student: Dict[str, Any],
    evidence_payload: Dict[str, Any],
    requirements: Dict[str, List[str]],
    llm_config: Dict[str, Any],
) -> Dict[str, Any]:
    if not llm_config.get("api_key") or not llm_config.get("base_url"):
        raise HTTPException(status_code=503, detail="Match check LLM config missing")

    education_context = evidence_payload.get("educationContext") or derive_education_context(student)
    prompt_payload = {
        "runtimeContext": {
            "currentDate": education_context.get("currentDate"),
            "timezone": "Asia/Shanghai",
        },
        "job": {
            "title": clean_text(job.get("title")),
            "companyName": clean_text(job.get("companyName")),
            "basicRequirements": job.get("basicRequirements") or {},
            "majorRequirements": requirements["majors"],
            "certificateRequirements": requirements["certifications"],
            "experienceRequirements": requirements["experiences"],
        },
        "student": {
            "basicInfo": {
                "schoolName": clean_text((student.get("basicInfo") or {}).get("schoolName")),
                "schoolMajor": clean_text((student.get("basicInfo") or {}).get("schoolMajor")),
                "educationLevel": clean_text((student.get("basicInfo") or {}).get("educationLevel")),
                "graduationYear": clean_text((student.get("basicInfo") or {}).get("graduationYear")),
                "graduationMonth": clean_text((student.get("basicInfo") or {}).get("graduationMonth")),
                "derivedEducationStatus": education_context,
            },
            "educationEvidence": evidence_payload["education"],
            "majorEvidence": evidence_payload["major"],
            "certificateEvidence": evidence_payload["certificates"],
            "experienceEvidence": evidence_payload["experiences"],
        },
        "normalizationHints": {
            "studentMajorFamilies": resolve_alias_families(
                clean_text((student.get("basicInfo") or {}).get("schoolMajor")),
                MAJOR_FAMILY_ALIASES,
            ),
            "jobMajorFamilies": {
                item: resolve_alias_families(item, MAJOR_FAMILY_ALIASES)
                for item in requirements["majors"]
            },
            "studentCertificateFamilies": {
                item.get("id"): resolve_alias_families(item.get("title"), CERT_FAMILY_ALIASES)
                for item in evidence_payload["certificates"]
            },
            "jobCertificateFamilies": {
                item: resolve_alias_families(item, CERT_FAMILY_ALIASES)
                for item in requirements["certifications"]
            },
        },
    }
    payload_json = json.dumps(prompt_payload, ensure_ascii=False)

    system_prompt = (
        "你是一名严谨的人岗准入核查官。"
        "你的任务是只根据输入数据，逐项判断岗位的专业、证书、经历要求是否被候选人满足。"
        "不要写建议性空话，不要编造未给出的经历。"
        "如果无法确认，就判定为 false，并在 reason 里明确缺了什么。"
        "输入中的 runtimeContext.currentDate、student.basicInfo.derivedEducationStatus 和 student.educationEvidence 是系统派生事实。"
        "如果 derivedEducationStatus.isCurrentlyEnrolled 为 true，说明候选人在当前日期仍处于在读状态；"
        "遇到岗位要求里的“在读”“应届”“当前在校”“本科在读”“毕业届别”等表达时，必须结合学历层次、毕业年月和 EDU_001 判断，"
        "不得仅因为原始简历字段没有逐字写出“在读”就判定不满足。"
        "如果引用在读/应届判断，matched_evidence_ids 必须包含 EDU_001。"
        "在读状态只证明学籍/毕业时点，不代表专业、证书、经历内容自动满足。"
        "专业要求如果给出多个可选专业，通常按“满足其中任意一个即可”理解；"
        "证书要求和经历要求按列表逐项判定。"
        "reason 必须具体、可解释，并尽量引用 matched_evidence_ids 中的证据。"
        "如果有匹配证据，matched_evidence_ids 必须只返回输入里已有的证据 ID。"
        "只输出 JSON，不要输出 Markdown、解释、代码块。"
        "返回字段必须包含 overall_passed、major_check、certificate_checks、experience_checks。"
        "major_check 是对象或 null；certificate_checks 和 experience_checks 是数组。"
        "每个核查对象都必须包含 requirement_text、passed、reason、matched_evidence_ids、matched_evidence_summary。"
    )

    user_prompt = (
        "下面是岗位要求、学生信息、结构化证据和规范化提示。"
        "请完成一次性核查并返回 JSON：\n{payload_json}"
    )

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            ("user", user_prompt),
        ]
    )

    async def invoke_model(model_name: str) -> Dict[str, Any]:
        llm = ChatOpenAI(
            model=model_name,
            api_key=llm_config["api_key"],
            base_url=llm_config["base_url"],
            temperature=float(llm_config.get("temperature", 0.0) or 0.0),
            max_tokens=int(llm_config.get("max_tokens", match_check_llm_max_tokens())),
            timeout=match_check_llm_timeout_seconds(),
            max_retries=0,
        )
        raw = await asyncio.wait_for(
            (prompt | llm | StrOutputParser()).ainvoke({"payload_json": payload_json}),
            timeout=match_check_llm_timeout_seconds() + 5,
        )
        return sanitize_llm_json(raw)

    primary_model = clean_text(llm_config.get("model"))

    try:
        result = await invoke_model(primary_model)
        llm_config["model"] = primary_model
        return result
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Match check LLM timed out") from exc
    except Exception as exc:
        error_text = clean_text(str(exc))[:240]
        logger.error(
            "[MatchCheck] LLM failed source=%s model=%s error=%s",
            llm_config.get("source"),
            primary_model,
            error_text,
        )
        raise HTTPException(status_code=502, detail=f"Match check LLM failed: {error_text}") from exc


async def run_match_check(req: MatchCheckRequest) -> Dict[str, Any]:
    job = req.job or {}
    student = req.studentProfile or {}
    requirements = build_requirement_lists(job)
    education_check = build_education_check(student, job)
    graduation_check = build_graduation_check(student, job)
    education_context = derive_education_context(student)

    has_llm_requirements = bool(
        requirements["majors"] or requirements["certifications"] or requirements["experiences"]
    )
    if not has_llm_requirements:
        return build_response_payload(
            job=job,
            source_meta={
                "mode": "rule_only",
                "model": "",
                "baseUrl": "",
                "major": "not_applicable",
                "certifications": "not_applicable",
                "experiences": "not_applicable",
                "currentDate": education_context.get("currentDate"),
                "derivedEducationStatus": education_context,
            },
            education_check=education_check,
            graduation_check=graduation_check,
            major_check=None,
            certificate_checks=[],
            experience_checks=[],
        )

    evidence_payload = build_student_evidence(student)
    education_context = evidence_payload.get("educationContext") or education_context
    llm_config = resolve_match_check_text_model_config(req.config)
    try:
        llm_result = await call_match_check_llm(
            job=job,
            student=student,
            evidence_payload=evidence_payload,
            requirements=requirements,
            llm_config=llm_config,
        )

        evidence_index = evidence_payload["index"]
        major_check = None
        if requirements["majors"]:
            major_check = normalize_check_item(
                llm_result.get("major_check"),
                " / ".join(requirements["majors"]),
                evidence_index,
                default_reason="LLM 未返回可用的专业核查结果。",
                source="llm",
            )

        certificate_checks = []
        raw_certificate_checks = as_list(llm_result.get("certificate_checks"))
        for index, requirement_text in enumerate(requirements["certifications"]):
            certificate_checks.append(
                normalize_check_item(
                    raw_certificate_checks[index] if index < len(raw_certificate_checks) else {},
                    requirement_text,
                    evidence_index,
                    default_reason="LLM 未返回可用的证书核查结果。",
                    source="llm",
                )
            )

        experience_checks = []
        raw_experience_checks = as_list(llm_result.get("experience_checks"))
        for index, requirement_text in enumerate(requirements["experiences"]):
            experience_checks.append(
                normalize_check_item(
                    raw_experience_checks[index] if index < len(raw_experience_checks) else {},
                    requirement_text,
                    evidence_index,
                    default_reason="LLM 未返回可用的经历核查结果。",
                    source="llm",
                )
            )

        return build_response_payload(
            job=job,
            source_meta={
                "mode": "rule_plus_llm",
                "model": llm_config.get("model", ""),
                "baseUrl": llm_config.get("base_url", ""),
                "major": "llm" if major_check else "not_applicable",
                "certifications": "llm" if certificate_checks else "not_applicable",
                "experiences": "llm" if experience_checks else "not_applicable",
                "currentDate": education_context.get("currentDate"),
                "derivedEducationStatus": education_context,
            },
            education_check=education_check,
            graduation_check=graduation_check,
            major_check=major_check,
            certificate_checks=certificate_checks,
            experience_checks=experience_checks,
        )
    except Exception as exc:
        logger.warning("[MatchCheck] LLM check failed, falling back to rule_only: %s", exc)
        res = build_response_payload(
            job=job,
            source_meta={
                "mode": "rule_only_fallback",
                "model": "",
                "baseUrl": "",
                "major": "failed",
                "certifications": "failed",
                "experiences": "failed",
                "currentDate": education_context.get("currentDate"),
                "derivedEducationStatus": education_context,
            },
            education_check=education_check,
            graduation_check=graduation_check,
            major_check={
                "passed": False,
                "reason": f"由于大模型不可用，无法进行专业匹配。大模型错误：{str(exc)[:100]}",
                "requirement_text": " / ".join(requirements["majors"]),
                "matched_evidence_ids": [],
                "matched_evidence_summary": "",
                "status": "failed",
                "source": "llm_fallback"
            } if requirements["majors"] else None,
            certificate_checks=[
                {
                    "passed": False,
                    "reason": f"由于大模型不可用，无法匹配证书要求。大模型错误：{str(exc)[:100]}",
                    "requirement_text": req_text,
                    "matched_evidence_ids": [],
                    "matched_evidence_summary": "",
                    "status": "failed",
                    "source": "llm_fallback"
                } for req_text in requirements["certifications"]
            ],
            experience_checks=[
                {
                    "passed": False,
                    "reason": f"由于大模型不可用，无法进行经历匹配。大模型错误：{str(exc)[:100]}",
                    "requirement_text": req_text,
                    "matched_evidence_ids": [],
                    "matched_evidence_summary": "",
                    "status": "failed",
                    "source": "llm_fallback"
                } for req_text in requirements["experiences"]
            ],
        )
        res["meta"] = {
            "degradation": [
                {
                    "component": "match_check_llm",
                    "reason": str(exc),
                    "impact": "无法进行专业、证书、经历等大模型匹配，仅基于学历与毕业年份规则核查"
                }
            ]
        }
        return res
