import asyncio
import json
import time
from typing import Any, Dict, Optional

import httpx
import numpy as np
from fastapi import HTTPException
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from job_profile_schema import (
    dev_tool_tag_name,
    is_tech_stack_branch,
    iter_tech_stack_leaf_items,
    tech_capability_tag_name,
    tech_stack_tag_name,
)
from . import runtime_state as state
from .config import logger
from .embedding_service import embed_batch
from .gold_assessment_service import run_gold_assessment
from .job_data_service import ensure_jobs_fresh
from .match_config import (
    COMPETITIVENESS_SCORE_WEIGHTS,
    COVERAGE_DENOMINATOR_CAPS,
    DEFAULT_BUCKET_SIZE,
    DEFAULT_EXPANSION_LIMIT,
    DEFAULT_RECALL_LIMIT,
    EDUCATION_RANK,
    LOW_FREQUENCY_TAG_THRESHOLD,
    MATCH_SCORE_WEIGHTS,
    RECALL_RULES,
    SIMILAR_SIMILARITY,
    TECH_REQUIREMENT_WEIGHTS,
    allows_similar_match,
    evaluate_tier,
    get_similarity_thresholds,
)
from .model_config import load_flagship_llm_config, normalize_openai_base_url, LLMConfigResolver
from shared.llm_resilience import call_llm_with_resilience
from .schemas import DebugScoreRequest, InternshipRecommendationRequest, MatchHarvestRequest, MatchRequest
from .tag_center_service import resolve_tag_center, resolve_tag_reference
from .utils import clean_text, extract_item_name, clamp as clamp_score


FLAGSHIP_LLM_CONFIG = load_flagship_llm_config()
MATCH_LLM_TIMEOUT_SECONDS_DEFAULT = 8
MATCH_LLM_MAX_TOKENS_DEFAULT = 4000
MATCH_LLM_LIST_LIMIT = 3
RECOMMENDATION_TAG_CATEGORIES = ("techStack", "techCapabilities", "devTools")
INTEREST_MIN_RECOMMENDATION_TAG_HITS = 2
HARVEST_JD_STAR_WEIGHT = 0.6
HARVEST_TAG_MATCH_WEIGHT = 0.4
HARVEST_STAR_SCORE_MAP = {1: 0.0, 2: 50.0, 3: 100.0}


SOFT_CATEGORY_CONFIG = [
    {"jd_key": "softQuality", "cat": "soft", "display_cat": "softQuality", "pool_key": "soft"},
    {"jd_key": "growthPotential", "cat": "growth", "display_cat": "growthPotential", "pool_key": "growth"},
]


def freq_coeff(freq: int) -> float:
    if freq >= LOW_FREQUENCY_TAG_THRESHOLD:
        return 1.0
    return 0.3 + 0.7 * (max(freq, 0) / float(LOW_FREQUENCY_TAG_THRESHOLD))


def level_modifier(level_delta: Optional[float]) -> float:
    if level_delta is None:
        return 1.0
    if level_delta >= 0:
        return 1.0
    if level_delta >= -1:
        return 0.75
    if level_delta >= -2:
        return 0.20
    return 0.0






def harvest_star_to_score(stars: Any) -> float:
    try:
        rating = int(stars)
    except (TypeError, ValueError):
        rating = 1
    return HARVEST_STAR_SCORE_MAP.get(max(1, min(3, rating)), 0.0)


def get_competitiveness_score(job: Dict[str, Any]) -> float:
    return clamp_score(
        job.get("competitiveness_score")
        or (job.get("scoring") or {}).get("competitiveness_score")
        or (job.get("score_breakdown") or {}).get("competitiveness")
    )


def get_match_score(job: Dict[str, Any]) -> float:
    return clamp_score(
        job.get("match_score")
        or job.get("recommendation_score")
        or (job.get("scoring") or {}).get("match_score")
        or (job.get("score_breakdown") or {}).get("match")
    )


def get_report_score(job: Dict[str, Any]) -> float:
    return clamp_score(
        job.get("report_score")
        or job.get("final_report_score")
        or (job.get("harvest_report") or {}).get("report_score")
        or get_match_score(job)
    )


def is_standard(sim: float, cat: str, level_delta: Optional[float] = None) -> bool:
    return sim >= get_similarity_thresholds(cat)["standard"] and (
        level_delta is not None and level_delta >= 0
    )


def is_similar(sim: float, cat: str, level_delta: Optional[float] = None) -> bool:
    return allows_similar_match(cat) and sim >= get_similarity_thresholds(cat)["similar"] and (
        level_delta is not None and level_delta >= -1
    )


def score_similarity_threshold(cat: str) -> float:
    thresholds = get_similarity_thresholds(cat)
    return thresholds["similar"] if allows_similar_match(cat) else thresholds["standard"]


def match_tag_name(item: Any, tag_type: str, extractor) -> str:
    if isinstance(item, dict):
        resolved = resolve_student_tag_reference(item, tag_type)
        if resolved:
            return resolved
        return extractor(item) or extract_item_name(item, fallback_raw=True)
    return clean_text(item)


def match_tech_stack_name(item: Any) -> str:
    return match_tag_name(item, "techStack", tech_stack_tag_name)


def match_tech_capability_name(item: Any) -> str:
    return match_tag_name(item, "techCapabilities", tech_capability_tag_name)


def match_dev_tool_name(item: Any) -> str:
    return match_tag_name(item, "devTools", dev_tool_tag_name)


def resolve_student_tag_reference(item: Dict[str, Any], tag_type: str) -> str:
    return resolve_tag_reference(item, tag_type)


def normalize_direction_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [clean_text(item) for item in value if clean_text(item)]
    text = clean_text(value)
    return [text] if text else []


DIRECTION_MATCH_ALIASES: Dict[str, list[str]] = {
    "前端开发": ["前端开发", "Web开发", "Web开发（前端 / 后端 / 全栈）"],
    "后端开发": ["后端开发", "Web开发", "Web开发（前端 / 后端 / 全栈）"],
    "全栈开发": ["全栈开发", "Web开发", "Web开发（前端 / 后端 / 全栈）"],
    "客户端开发": ["客户端开发", "移动端开发", "移动开发（iOS / Android / 跨平台）"],
    "测试开发 / QA": ["测试开发 / QA"],
    "UI / UX设计": ["UI / UX设计"],
    "算法工程": ["算法工程", "算法AI", "算法 / AI（机器学习 / 深度学习 / NLP / CV）"],
    "AI应用开发": ["AI应用开发", "AI 应用开发", "AI应用开发（RAG / Agent / LLM工程）", "AI 应用开发（RAG / Agent / LLM工程）"],
    "AI 应用开发": ["AI应用开发", "AI 应用开发", "AI应用开发（RAG / Agent / LLM工程）", "AI 应用开发（RAG / Agent / LLM工程）"],
    "数据开发": ["数据开发", "数据开发（数仓 / ETL / 数据平台）"],
    "数据分析": ["数据分析", "数据分析（BI / 业务分析）"],
    "运维 / DevOps / SRE": ["运维 / DevOps / SRE", "运维 / DevOps", "云计算 / 架构师（偏设计而非运维操作）"],
    "运维 / DevOps": ["运维 / DevOps / SRE", "运维 / DevOps"],
    "安全工程": ["安全工程", "安全（渗透 / 安全开发 / 合规）"],
    "音视频开发": ["音视频开发", "音视频开发（流媒体 / 编解码）"],
    "图形 / 渲染开发": ["图形 / 渲染开发", "图形 / 渲染开发（图形引擎、Shader）"],
    "嵌入式 / 硬件开发": ["嵌入式 / 硬件开发", "嵌入式 / 硬件开发（IoT、单片机、驱动）"],
    "游戏开发": ["游戏开发", "游戏开发（客户端 / 引擎 / 服务端）"],
    "产品经理": ["产品经理"],
    "技术支持 / 实施": ["技术支持 / 实施"],
    "解决方案 / 售前": ["解决方案 / 售前", "解决方案架构师 / 售前工程师"],
    "增长运营 / 数据运营": ["增长运营 / 数据运营", "增长运营 / 数据运营（偏技术侧）"],
    "增长运营 / 数据运营（偏技术侧）": ["增长运营 / 数据运营", "增长运营 / 数据运营（偏技术侧）"],
    "技术写作 / DevRel": ["技术写作 / DevRel", "技术写作 / 开发者关系（DevRel）"],
    "Web开发（前端 / 后端 / 全栈）": ["前端开发", "后端开发", "全栈开发", "Web开发", "Web开发（前端 / 后端 / 全栈）"],
    "移动开发（iOS / Android / 跨平台）": ["客户端开发", "移动端开发", "移动开发（iOS / Android / 跨平台）"],
    "算法 / AI（机器学习 / 深度学习 / NLP / CV）": ["算法工程", "算法AI", "算法 / AI（机器学习 / 深度学习 / NLP / CV）"],
    "AI应用开发（RAG / Agent / LLM工程）": ["AI应用开发", "AI应用开发（RAG / Agent / LLM工程）"],
    "AI 应用开发（RAG / Agent / LLM工程）": ["AI应用开发", "AI 应用开发（RAG / Agent / LLM工程）"],
    "数据开发（数仓 / ETL / 数据平台）": ["数据开发", "数据开发（数仓 / ETL / 数据平台）"],
    "数据分析（BI / 业务分析）": ["数据分析", "数据分析（BI / 业务分析）"],
    "安全（渗透 / 安全开发 / 合规）": ["安全工程", "安全（渗透 / 安全开发 / 合规）"],
    "嵌入式 / 硬件开发（IoT、单片机、驱动）": ["嵌入式 / 硬件开发", "嵌入式 / 硬件开发（IoT、单片机、驱动）"],
    "游戏开发（客户端 / 引擎 / 服务端）": ["游戏开发", "游戏开发（客户端 / 引擎 / 服务端）"],
    "图形 / 渲染开发（图形引擎、Shader）": ["图形 / 渲染开发", "图形 / 渲染开发（图形引擎、Shader）"],
    "音视频开发（流媒体 / 编解码）": ["音视频开发", "音视频开发（流媒体 / 编解码）"],
    "云计算 / 架构师（偏设计而非运维操作）": ["运维 / DevOps / SRE", "云计算 / 架构师（偏设计而非运维操作）"],
    "解决方案架构师 / 售前工程师": ["解决方案 / 售前", "解决方案架构师 / 售前工程师"],
    "技术写作 / 开发者关系（DevRel）": ["技术写作 / DevRel", "技术写作 / 开发者关系（DevRel）"],
}


def expand_direction_aliases(values: list[str]) -> set[str]:
    expanded: set[str] = set()
    for value in values:
        key = clean_text(value)
        if not key:
            continue
        expanded.add(key.lower())
        for alias in DIRECTION_MATCH_ALIASES.get(key, []):
            alias_text = clean_text(alias)
            if alias_text:
                expanded.add(alias_text.lower())
    return expanded


def collect_named_items(
    items: list[Any],
    name_fn,
    levels: Dict[str, float],
    *,
    default_level: float = 2,
    skip_fn=None,
) -> list[str]:
    result: list[str] = []

    def resolve_level(item: Dict[str, Any]) -> float:
        raw_level = None
        for key in ("levelRequired", "level", "score"):
            if key in item and item.get(key) not in (None, ""):
                raw_level = item.get(key)
                break
        try:
            return float(raw_level) if raw_level is not None else float(default_level)
        except (TypeError, ValueError):
            return float(default_level)

    for item in items:
        if skip_fn and skip_fn(item):
            continue
        name = name_fn(item)
        if not name:
            continue
        result.append(name)
        if isinstance(item, dict):
            levels[name] = resolve_level(item)
        else:
            levels[name] = float(default_level)
    return result


def parse_student_tags(student: Dict[str, Any]) -> Dict[str, Any]:
    stu_levels: Dict[str, float] = {}

    stu_tech_stack = collect_named_items(
        list(iter_tech_stack_leaf_items(student.get("techStack") or student.get("tech_stack") or [])),
        match_tech_stack_name,
        stu_levels,
    )
    stu_dev_tool = collect_named_items(
        student.get("devTools") or student.get("dev_tool") or student.get("dev_tools") or [],
        match_dev_tool_name,
        stu_levels,
    )
    stu_tech_capability = collect_named_items(
        student.get("techCapabilities") or student.get("techCapability") or student.get("coreTechFeatures") or student.get("tech_capabilities") or student.get("tech_capability") or [],
        match_tech_capability_name,
        stu_levels,
        # 不再硬编码跳过 soft_flag，改为透传所有非空类型，除非显式标记为非技术
        skip_fn=lambda item: isinstance(item, dict) and str(item.get("type", "")).lower() == "non-tech",
    )
    stu_soft = collect_named_items(
        student.get("softQuality", []),
        extract_item_name,
        stu_levels,
    )
    stu_growth = collect_named_items(
        student.get("growthPotential", []),
        extract_item_name,
        stu_levels,
    )

    basic_info = student.get("basicInfo") or {}
    metrics = student.get("explicitMetrics") or {}
    domains = [d.get("name") for d in student.get("techDomains", []) if d.get("name")]
    directions = normalize_direction_list(student.get("direction"))

    return {
        "tech_stack": stu_tech_stack,
        "tech_capability": stu_tech_capability,
        "dev_tool": stu_dev_tool,
        "soft": stu_soft,
        "growth": stu_growth,
        "levels": stu_levels,
        "all_tags": list(set(stu_tech_stack + stu_dev_tool + stu_tech_capability + stu_soft + stu_growth)),
        "education": basic_info.get("educationLevel") or student.get("education"),
        "graduation_year": basic_info.get("graduationYear") or student.get("graduationYear"),
        "graduation_month": basic_info.get("graduationMonth") or student.get("graduationMonth"),
        "major": basic_info.get("schoolMajor") or student.get("major"),
        "school_name": basic_info.get("schoolName"),
        "school_tags": metrics.get("schoolTags") or student.get("universityTags") or [],
        "education_level": basic_info.get("educationLevel") or student.get("education"),
        "school_major": basic_info.get("schoolMajor") or student.get("major"),
        "direction": " / ".join(directions),
        "directions": directions,
        "tech_domains": domains,
        "experiences": student.get("experiences") or {},
    }


def evaluate_education_match(student_edu: Optional[str], job_edu_min: Optional[str]) -> Dict[str, Any]:
    if not job_edu_min:
        return {"score": 1.0, "status": "✅ 达标", "note": "该岗位无硬性学历要求"}
    if not student_edu:
        return {"score": 0.0, "status": "❌ 缺失", "note": "画像中未填报学历信息"}

    s_rank = EDUCATION_RANK.get(student_edu, 0)
    j_rank = EDUCATION_RANK.get(job_edu_min, 2)

    if s_rank >= j_rank:
        return {
            "score": 1.0,
            "status": "✅ 达标",
            "note": f"学历（{student_edu}）符合或超过要求（≥{job_edu_min}）",
        }
    if s_rank == j_rank - 1:
        return {
            "score": 0.7,
            "status": "⚠️ 略低",
            "note": f"学历（{student_edu}）略低于要求（{job_edu_min}）",
        }
    return {
        "score": 0.0,
        "status": "❌ 不符",
        "note": f"学历（{student_edu}）与要求（{job_edu_min}）差距较大",
    }


def evaluate_experience_match(
    student_grad_year: Optional[Any],
    job_grad_year_range: Optional[list[Any]],
) -> Dict[str, Any]:
    if not job_grad_year_range or (job_grad_year_range[0] is None and job_grad_year_range[1] is None):
        return {"score": 1.0, "status": "✅ 达标", "note": "该岗位对毕业年限无硬性限制"}

    try:
        s_year = int(student_grad_year) if student_grad_year else None
    except (TypeError, ValueError):
        s_year = None

    if s_year is None:
        return {"score": 0.5, "status": "⚠️ 待补全", "note": "画像中缺失毕业时间，建议补全以评估适配度"}

    low, high = job_grad_year_range
    try:
        j_low = int(low) if low is not None else None
        j_high = int(high) if high is not None else None
    except (TypeError, ValueError):
        j_low, j_high = None, None

    if (j_low is None or s_year >= j_low) and (j_high is None or s_year <= j_high):
        return {"score": 1.0, "status": "✅ 达标", "note": f"毕业时间（{s_year}）在岗位预期范围内"}

    if j_low and s_year < j_low:
        delta = j_low - s_year
        if delta <= 1:
            return {"score": 0.8, "status": "⚠️ 略早", "note": "毕业时间略早于要求，经验可能略多"}
    if j_high and s_year > j_high:
        delta = s_year - j_high
        if delta <= 1:
            return {"score": 0.8, "status": "⚠️ 略晚", "note": "毕业时间略晚于要求，工作年限略少"}

    return {"score": 0.0, "status": "❌ 不符", "note": f"毕业时间（{s_year}）不在岗位要求范围内"}


def match_llm_timeout_seconds() -> int:
    return max(5, int(FLAGSHIP_LLM_CONFIG.timeout_seconds or MATCH_LLM_TIMEOUT_SECONDS_DEFAULT))


def match_llm_max_tokens() -> int:
    return max(256, int(FLAGSHIP_LLM_CONFIG.max_tokens or MATCH_LLM_MAX_TOKENS_DEFAULT))


def resolve_match_text_model_config(request_config: Any) -> Dict[str, Any]:
    return LLMConfigResolver.resolve("matching", request_config)


def brief_llm_error(exc: Exception) -> str:
    text = clean_text(str(exc))
    if not text:
        text = exc.__class__.__name__
    return text[:240]


def sanitize_match_analysis(text: str) -> str:
    report = clean_text(text)
    marker = "### 匹配复核报告"
    marker_index = report.find(marker)
    if marker_index >= 0:
        return report[marker_index:]
    return report


def trim_list(value: Any, limit: int = MATCH_LLM_LIST_LIMIT) -> list[Any]:
    if not isinstance(value, list):
        return []
    return value[:limit]


def compact_trace_item(item: Any) -> Dict[str, Any]:
    if not isinstance(item, dict):
        return {}
    return {
        "jd_tag": item.get("jd_tag"),
        "best_stu": item.get("best_stu"),
        "status": item.get("status"),
        "score": item.get("score"),
        "base_similarity": item.get("base_similarity"),
        "level_delta": item.get("level_delta"),
        "block_reason": item.get("block_reason"),
        "low_frequency": item.get("low_frequency"),
        "group_id": item.get("group_id"),
        "note": item.get("note"),
        "branch_group_name": item.get("branch_group_name"),
        "branch_option_name": item.get("branch_option_name"),
        "branch_required_count": item.get("branch_required_count"),
        "branch_option_count": item.get("branch_option_count"),
        "branch_exact_count": item.get("branch_exact_count"),
        "branch_similar_count": item.get("branch_similar_count"),
        "branch_matched_count": item.get("branch_matched_count"),
        "branch_missing_count": item.get("branch_missing_count"),
        "branch_group_status": item.get("branch_group_status"),
    }


def compact_technical_match_details(details: Any) -> Dict[str, Any]:
    if not isinstance(details, dict):
        return {}
    compact: Dict[str, Any] = {}
    for cat, payload in details.items():
        if not isinstance(payload, dict):
            continue
        compact[cat] = {
            "exact": [compact_trace_item(item) for item in trim_list(payload.get("exact"))],
            "fuzzy": [compact_trace_item(item) for item in trim_list(payload.get("fuzzy"))],
            "missing": [compact_trace_item(item) for item in trim_list(payload.get("missing"))],
            "level_mismatch": [compact_trace_item(item) for item in trim_list(payload.get("level_mismatch"))],
        }
    return compact


def normalize_llm_message_content(raw: Any) -> str:
    if isinstance(raw, list):
        parts: list[str] = []
        for item in raw:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if text:
                    parts.append(str(text))
        return "\n".join(parts).strip()
    return str(raw or "").strip()


async def call_match_llm_raw(
    llm_config: Dict[str, Any],
    messages: list[Dict[str, Any]],
    *,
    max_tokens: Optional[int] = None,
) -> str:
    endpoint = f"{clean_text(llm_config.get('base_url')).rstrip('/')}/chat/completions"
    if not endpoint.startswith("http"):
        raise ValueError("match LLM base_url is not configured")
    body = {
        "model": llm_config["model"],
        "temperature": llm_config["temperature"],
        "max_tokens": max_tokens or llm_config["max_tokens"],
        "messages": messages,
    }

    async def _do_call():
        async with httpx.AsyncClient(timeout=match_llm_timeout_seconds()) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {llm_config['api_key']}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
        response.raise_for_status()
        payload = response.json()
        return normalize_llm_message_content(payload.get("choices", [{}])[0].get("message", {}).get("content"))

    try:
        return await call_llm_with_resilience(
            _do_call,
            label="Match LLM Raw",
            max_attempts=3,
        )
    except Exception as exc:
        raise RuntimeError(f"match LLM failed: {str(exc)}") from exc


def classify_match_status(sim: float, cat: str, level_delta: Optional[float]) -> str:
    if is_standard(sim, cat, level_delta):
        return "Standard"
    if is_similar(sim, cat, level_delta):
        return "Similar"
    return "Missing"


async def score_one_job_detailed(
    jd: Dict[str, Any],
    stu_parsed: Dict[str, Any],
    cache: Dict[str, np.ndarray],
    freq_db: Dict[str, int],
    tier_rules: Optional[Dict[str, Dict[str, float]]] = None,
    gold_res: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    stu_levels = stu_parsed["levels"]
    stu_tech_stack = stu_parsed["tech_stack"]
    stu_tech_capability = stu_parsed["tech_capability"]
    stu_dev_tool = stu_parsed["dev_tool"]
    stu_soft = stu_parsed["soft"]
    stu_growth = stu_parsed["growth"]
    stu_edu = stu_parsed.get("education")
    stu_grad_year = stu_parsed.get("graduation_year")

    basic_reqs = jd.get("basicRequirements") or {}
    job_edu_min = basic_reqs.get("education_min")
    job_grad_year_range = basic_reqs.get("graduationYearRange")

    def score_tag(jd_tag: str, jd_lv: Any, cat: str, pool: list[str], apply_freq_penalty: bool = True):
        vec_jd = cache.get(jd_tag)
        threshold = score_similarity_threshold(cat)
        similar_enabled = allows_similar_match(cat)
        if vec_jd is None or not pool:
            return 0, "", 0, 0, 0, 0, 0, None, threshold, similar_enabled

        best_sim, best_tag, best_lv = 0, "", 0
        for stu_tag in pool:
            vec_stu = cache.get(stu_tag)
            if vec_stu is None:
                continue
            sim = float(np.dot(vec_jd, vec_stu))
            if sim > best_sim:
                best_sim, best_tag, best_lv = sim, stu_tag, stu_levels.get(stu_tag, 2)

        base_similarity = max(0.0, min(best_sim, 1.0))
        try:
            level_delta = float(best_lv) - float(jd_lv)
        except (TypeError, ValueError):
            level_delta = None
        level_mod = level_modifier(level_delta)
        freq = freq_db.get(jd_tag, 0)
        freq_w = freq_coeff(freq) if apply_freq_penalty else 1.0
        score_similarity = base_similarity if base_similarity >= threshold else 0.0
        return (
            score_similarity * level_mod * freq_w,
            best_tag,
            base_similarity,
            score_similarity,
            level_mod,
            best_lv,
            freq_w,
            level_delta,
            threshold,
            similar_enabled,
        )

    def build_trace_detail(
        *,
        jd_tag: str,
        cat: str,
        status: str,
        score: float,
        sim: float,
        score_similarity: float,
        best_stu: str,
        jd_level: Any = None,
        best_stu_level: Any = None,
        level_modifier_value: Any = None,
        freq_value: Any = None,
        freq_weight_value: Any = None,
        level_delta: Any = None,
        score_threshold: Any = None,
        similar_enabled: bool = True,
        block_reason: Optional[str] = None,
        tag_id: Optional[str] = None,
        group_id: Optional[str] = None,
        note: Optional[str] = None,
        included_in_tier_metrics: bool = True,
        branch_group_name: Optional[str] = None,
        branch_option_name: Optional[str] = None,
        branch_required_count: Optional[int] = None,
        branch_option_count: Optional[int] = None,
        branch_exact_count: Optional[int] = None,
        branch_similar_count: Optional[int] = None,
        branch_matched_count: Optional[int] = None,
        branch_missing_count: Optional[int] = None,
        branch_group_status: Optional[str] = None,
    ) -> Dict[str, Any]:
        return {
            "jd_tag": jd_tag,
            "cat": cat,
            "status": status,
            "score": round(score, 4),
            "sim": round(sim, 4),
            "best_stu": best_stu,
            "jd_level": jd_level,
            "best_stu_level": best_stu_level,
            "base_similarity": round(sim, 4),
            "score_similarity": round(score_similarity, 4),
            "level_delta": round(level_delta, 4) if level_delta is not None else None,
            "level_modifier": round(level_modifier_value, 4) if level_modifier_value is not None else None,
            "score_threshold": round(score_threshold, 4) if score_threshold is not None else None,
            "similar_enabled": similar_enabled,
            "block_reason": block_reason,
            "freq": freq_value,
            "freq_weight": round(freq_weight_value, 4) if freq_weight_value is not None else None,
            "low_frequency": (
                isinstance(freq_value, int)
                and freq_value < LOW_FREQUENCY_TAG_THRESHOLD
                and status in {"Standard", "Similar"}
            ),
            "tag_id": tag_id,
            "group_id": group_id,
            "note": note,
            "included_in_tier_metrics": included_in_tier_metrics,
            "branch_group_name": branch_group_name,
            "branch_option_name": branch_option_name,
            "branch_required_count": branch_required_count,
            "branch_option_count": branch_option_count,
            "branch_exact_count": branch_exact_count,
            "branch_similar_count": branch_similar_count,
            "branch_matched_count": branch_matched_count,
            "branch_missing_count": branch_missing_count,
            "branch_group_status": branch_group_status,
        }

    def match_block_reason(
        *,
        status: str,
        cat: str,
        sim: float,
        level_delta: Optional[float],
        threshold: float,
    ) -> Optional[str]:
        if status in {"Standard", "Similar"}:
            return None
        if not allows_similar_match(cat) and sim >= SIMILAR_SIMILARITY:
            if sim < get_similarity_thresholds(cat)["standard"]:
                return "similar_disabled_for_hard_tag"
            if level_delta is not None and level_delta < 0:
                return "level_mismatch"
        if sim < threshold:
            return "below_similarity_threshold"
        if level_delta is None:
            return "missing_level"
        if level_delta < 0:
            return "level_mismatch"
        return "not_covered"

    def branch_required_count(group: Dict[str, Any], option_count: int) -> int:
        if option_count <= 0:
            return 0
        try:
            raw = int(group.get("sum") or 1)
        except (TypeError, ValueError):
            raw = 1
        return max(1, min(option_count, raw))

    def branch_status_rank(status: str) -> int:
        if status == "Standard":
            return 3
        if status == "Similar":
            return 2
        return 1

    def branch_rule_text(option_count: int, required_count: int) -> str:
        if option_count > 0:
            return f"{option_count}选{required_count}"
        return f"至少满足 {required_count} 项"

    def score_tech_branch_group(group: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        group_name = str(group.get("groupName", "")).strip() or "未命名技术组"
        group_level = group.get("levelRequired") or 2
        options = group.get("options", [])
        option_count = len(options)
        required_count = branch_required_count(group, option_count)
        if required_count <= 0:
            return None

        candidates = []

        for option in options:
            option_name = match_tech_stack_name(option)
            if not option_name:
                continue
            option_level = (
                option.get("levelRequired") or group_level
                if isinstance(option, dict)
                else group_level
            )
            (
                sc,
                bt,
                raw_sim,
                score_sim,
                level_mod,
                slv,
                wf,
                level_delta,
                threshold,
                similar_enabled,
            ) = score_tag(option_name, option_level, "tech_stack", stu_tech_stack)
            status = classify_match_status(raw_sim, "tech_stack", level_delta)
            candidate = {
                "option_name": option_name,
                "option_level": option_level,
                "score": sc,
                "best_tag": bt,
                "raw_sim": raw_sim,
                "score_similarity": score_sim,
                "level_modifier": level_mod,
                "student_level": slv,
                "w_f": wf,
                "level_delta": level_delta,
                "score_threshold": threshold,
                "similar_enabled": similar_enabled,
                "status": status,
                "block_reason": match_block_reason(
                    status=status,
                    cat="tech_stack",
                    sim=raw_sim,
                    level_delta=level_delta,
                    threshold=threshold,
                ),
            }
            candidates.append(candidate)

        if not candidates:
            return None

        ordered_candidates = sorted(
            candidates,
            key=lambda item: (
                branch_status_rank(item["status"]),
                item["score"],
                item["raw_sim"],
                item["score_similarity"],
                item["level_delta"] if item["level_delta"] is not None else -999.0,
            ),
            reverse=True,
        )

        selected: list[Dict[str, Any]] = []
        selected_indexes = set()
        used_best_tags = set()
        for index, candidate in enumerate(ordered_candidates):
            best_tag_key = clean_text(candidate.get("best_tag")).lower()
            if best_tag_key and best_tag_key in used_best_tags:
                continue
            selected.append(candidate)
            selected_indexes.add(index)
            if best_tag_key:
                used_best_tags.add(best_tag_key)
            if len(selected) >= required_count:
                break

        if len(selected) < required_count:
            for index, candidate in enumerate(ordered_candidates):
                if index in selected_indexes:
                    continue
                selected.append(candidate)
                selected_indexes.add(index)
                if len(selected) >= required_count:
                    break

        exact_count = sum(1 for item in selected if item["status"] == "Standard")
        similar_count = sum(1 for item in selected if item["status"] == "Similar")
        matched_count = exact_count + similar_count
        missing_count = max(0, required_count - matched_count)
        if missing_count == 0 and similar_count == 0:
            group_status = "Standard"
        elif missing_count == 0:
            group_status = "Similar"
        else:
            group_status = "Missing"

        return {
            "group_name": group_name,
            "group_level": group_level,
            "group_id": clean_text(group.get("groupId")) or group_name,
            "group_note": clean_text(group.get("note")),
            "option_count": option_count,
            "required_count": required_count,
            "rule_text": branch_rule_text(option_count, required_count),
            "exact_count": exact_count,
            "similar_count": similar_count,
            "matched_count": matched_count,
            "missing_count": missing_count,
            "status": group_status,
            "selected": selected,
        }

    overflows: list[str] = []
    missings: list[str] = []
    similars: list[str] = []
    level_mismatches: list[Dict[str, Any]] = []
    coverage_counts = {cat: {"total": 0, "standard": 0, "similar": 0} for cat in TECH_REQUIREMENT_WEIGHTS}
    tag_details: list[Dict[str, Any]] = []

    def update_coverage(cat: str, status: str) -> None:
        bucket = coverage_counts[cat]
        bucket["total"] += 1
        if status == "Standard":
            bucket["standard"] += 1
            bucket["similar"] += 1
        elif status == "Similar":
            bucket["similar"] += 1

    def append_level_mismatch(
        *,
        jd_tag: str,
        cat: str,
        best_stu: str,
        jd_level: Any,
        best_stu_level: Any,
        level_delta: Optional[float],
        level_modifier_value: float,
        sim: float,
    ) -> None:
        if best_stu and level_delta is not None and level_delta < 0:
            level_mismatches.append(
                {
                    "jd_tag": jd_tag,
                    "cat": cat,
                    "best_stu": best_stu,
                    "jd_level": jd_level,
                    "best_stu_level": best_stu_level,
                    "level_delta": level_delta,
                    "level_modifier": level_modifier_value,
                    "sim": sim,
                }
            )

    def record_match(
        *,
        scores: list[float],
        name: str,
        level: Any,
        cat: str,
        display_cat: str,
        pool: list[str],
        note: Optional[str],
        apply_freq_penalty: bool,
        overflow_label: Optional[str],
        similar_label: Optional[str],
        missing_label: Optional[str],
        included_in_tier_metrics: bool,
    ) -> None:
        (
            sc,
            bt,
            raw_sim,
            score_sim,
            level_mod,
            slv,
            wf,
            level_delta,
            threshold,
            similar_enabled,
        ) = score_tag(name, level, cat, pool, apply_freq_penalty=apply_freq_penalty)

        scores.append(sc)
        status = classify_match_status(raw_sim, cat, level_delta)
        freq = freq_db.get(name, 0) if apply_freq_penalty else None

        if status == "Standard":
            if overflow_label and level_delta is not None and level_delta > 0:
                overflows.append(f"【{overflow_label}】{bt} (Lv{slv} > 目标Lv{level})")
        elif status == "Similar":
            if similar_label:
                similars.append(
                    f"【{similar_label}】{name} ↔ {bt} (sim:{raw_sim:.2f}, delta:{level_delta}, 等级系数:{level_mod:.2f})"
                )
        else:
            if missing_label:
                if bt and level_delta is not None and level_delta < 0 and raw_sim >= threshold:
                    missings.append(
                        f"【{missing_label}/等级不足】{name} ↔ {bt} (sim:{raw_sim:.2f}, delta:{level_delta}, 等级系数:{level_mod:.2f})"
                    )
                elif bt and not similar_enabled and raw_sim >= SIMILAR_SIMILARITY:
                    missings.append(
                        f"【{missing_label}/硬标签不接受模糊】{name} ↔ {bt} (sim:{raw_sim:.2f}, 阈值:{threshold:.2f})"
                    )
                elif bt and level_delta is not None and level_delta < -1:
                    missings.append(f"【{missing_label}】{name} (best:{bt}, sim:{raw_sim:.2f}, delta:{level_delta})")
                else:
                    missings.append(f"【{missing_label}】{name}")

        append_level_mismatch(
            jd_tag=name,
            cat=display_cat,
            best_stu=bt,
            jd_level=level,
            best_stu_level=slv,
            level_delta=level_delta,
            level_modifier_value=level_mod,
            sim=raw_sim,
        )

        if included_in_tier_metrics:
            update_coverage(cat, status)

        tag_details.append(
            build_trace_detail(
                jd_tag=name,
                cat=display_cat,
                status=status,
                score=sc,
                sim=raw_sim,
                score_similarity=score_sim,
                best_stu=bt,
                jd_level=level,
                best_stu_level=slv or None,
                level_modifier_value=level_mod,
                freq_value=freq,
                freq_weight_value=wf if apply_freq_penalty else None,
                level_delta=level_delta,
                score_threshold=threshold,
                similar_enabled=similar_enabled,
                block_reason=match_block_reason(
                    status=status,
                    cat=cat,
                    sim=raw_sim,
                    level_delta=level_delta,
                    threshold=threshold,
                ),
                note=note,
                included_in_tier_metrics=included_in_tier_metrics,
            )
        )

    tech_stack_scores: list[float] = []
    for item in [row for row in jd.get("techStack", []) if not is_tech_stack_branch(row)]:
        name = match_tech_stack_name(item)
        if not name:
            continue
        level = (item.get("levelRequired") or 2) if isinstance(item, dict) else 2
        record_match(
            scores=tech_stack_scores,
            name=name,
            level=level,
            cat="tech_stack",
            display_cat="techStack",
            pool=stu_tech_stack,
            note=(item.get("note") or item.get("rawExtractedText")) if isinstance(item, dict) else None,
            apply_freq_penalty=True,
            overflow_label="技术栈超额",
            similar_label="技术栈近似",
            missing_label="技术栈缺失",
            included_in_tier_metrics=True,
        )

    for group in [item for item in jd.get("techStack", []) if is_tech_stack_branch(item)]:
        branch = score_tech_branch_group(group)
        if branch is None:
            continue

        if branch["status"] == "Standard":
            overflows.append(
                f"【技术栈分支已满足】{branch['group_name']} ({branch['rule_text']}，已满足)"
            )
        elif branch["status"] == "Similar":
            similars.append(
                f"【技术栈分支相近满足】{branch['group_name']} ({branch['rule_text']}，通过相近能力满足)"
            )
        else:
            missings.append(
                f"【技术栈分支缺口】{branch['group_name']} ({branch['rule_text']}，还差 {branch['missing_count']} 项)"
            )

        for selected in branch["selected"]:
            tech_stack_scores.append(selected["score"])
            group_label = f"{branch['group_name']} -> {selected['option_name']}"
            status = selected["status"]

            append_level_mismatch(
                jd_tag=group_label,
                cat="techStack",
                best_stu=selected["best_tag"],
                jd_level=selected["option_level"],
                best_stu_level=selected["student_level"],
                level_delta=selected["level_delta"],
                level_modifier_value=selected["level_modifier"],
                sim=selected["raw_sim"],
            )
            update_coverage("tech_stack", status)
            tag_details.append(
                build_trace_detail(
                    jd_tag=group_label,
                    cat="techStack",
                    status=status,
                    score=selected["score"],
                    sim=selected["raw_sim"],
                    score_similarity=selected["score_similarity"],
                    best_stu=selected["best_tag"],
                    jd_level=selected["option_level"],
                    best_stu_level=selected["student_level"],
                    level_modifier_value=selected["level_modifier"],
                    freq_value=freq_db.get(selected["option_name"], 0),
                    freq_weight_value=selected["w_f"],
                    level_delta=selected["level_delta"],
                    score_threshold=selected["score_threshold"],
                    similar_enabled=selected["similar_enabled"],
                    block_reason=selected["block_reason"],
                    group_id=branch["group_id"],
                    note=branch["group_note"],
                    branch_group_name=branch["group_name"],
                    branch_option_name=selected["option_name"],
                    branch_required_count=branch["required_count"],
                    branch_option_count=branch["option_count"],
                    branch_exact_count=branch["exact_count"],
                    branch_similar_count=branch["similar_count"],
                    branch_matched_count=branch["matched_count"],
                    branch_missing_count=branch["missing_count"],
                    branch_group_status=branch["status"],
                )
            )

    tech_capability_scores: list[float] = []
    for item in jd.get("techCapabilities", []):
        if clean_text(item.get("type")) == "soft_flag":
            continue
        name = match_tech_capability_name(item)
        if not name:
            continue
        level = item.get("levelRequired") or 2
        record_match(
            scores=tech_capability_scores,
            name=name,
            level=level,
            cat="tech_capability",
            display_cat="techCapabilities",
            pool=stu_tech_capability,
            note=item.get("rawExtractedText"),
            apply_freq_penalty=True,
            overflow_label="技术能力超额",
            similar_label="技术能力近似",
            missing_label="技术能力缺失",
            included_in_tier_metrics=True,
        )

    dev_tool_scores: list[float] = []
    for item in jd.get("devTools", []):
        name = match_dev_tool_name(item)
        if not name:
            continue
        level = (item.get("levelRequired") or 2) if isinstance(item, dict) else 2
        record_match(
            scores=dev_tool_scores,
            name=name,
            level=level,
            cat="dev_tool",
            display_cat="devTools",
            pool=stu_dev_tool,
            note=(item.get("note") or item.get("rawExtractedText")) if isinstance(item, dict) else None,
            apply_freq_penalty=True,
            overflow_label="开发工具超额",
            similar_label="开发工具近似",
            missing_label="开发工具缺失",
            included_in_tier_metrics=True,
        )

    score_lists: Dict[str, list[float]] = {
        "soft": [],
        "growth": [],
    }
    soft_pools = {
        "soft": stu_soft,
        "growth": stu_growth,
    }

    for cfg in SOFT_CATEGORY_CONFIG:
        for item in jd.get(cfg["jd_key"], []):
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            level = item.get("levelRequired") or 2
            try:
                if float(level) <= 1:
                    continue
            except (TypeError, ValueError):
                level = 2

            record_match(
                scores=score_lists[cfg["cat"]],
                name=name,
                level=level,
                cat=cfg["cat"],
                display_cat=cfg["display_cat"],
                pool=soft_pools[cfg["cat"]],
                note=None,
                apply_freq_penalty=False,
                overflow_label=None,
                similar_label=None,
                missing_label=None,
                included_in_tier_metrics=False,
            )

    def mean100(scores: list[float]) -> Optional[float]:
        return clamp_score((sum(scores) / len(scores)) * 100) if scores else None

    def weighted_average(parts: Dict[str, Optional[float]], weights: Dict[str, float]) -> Optional[float]:
        present = {key: value for key, value in parts.items() if value is not None}
        total_weight = sum(weights[key] for key in present if key in weights)
        if not present or total_weight <= 0:
            return None
        return sum(value * (weights[key] / total_weight) for key, value in present.items())

    def weighted_contributions(parts: Dict[str, Optional[float]], weights: Dict[str, float]) -> Dict[str, float]:
        present = {key: value for key, value in parts.items() if value is not None and key in weights}
        total_weight = sum(weights[key] for key in present)
        if not present or total_weight <= 0:
            return {}
        return {
            key: clamp_score(value) * (weights[key] / total_weight)
            for key, value in present.items()
        }

    def score_or_zero(value: Optional[float]) -> float:
        return value if value is not None else 0.0

    def round_score(value: Optional[float]) -> Optional[float]:
        return round(clamp_score(value), 2) if value is not None else None

    def capped_coverage_ratio(hit_key: str) -> float:
        effective_hits = 0
        effective_total = 0
        for cat, counts in coverage_counts.items():
            total = counts["total"]
            if total <= 0:
                continue
            cap = COVERAGE_DENOMINATOR_CAPS.get(cat, total)
            denominator = min(total, cap)
            effective_total += denominator
            effective_hits += min(counts[hit_key], denominator)
        return effective_hits / effective_total if effective_total > 0 else 0

    s_tech_stack = mean100(tech_stack_scores)
    s_tech_capability = mean100(tech_capability_scores)
    s_dev_tool = mean100(dev_tool_scores)
    s_soft = mean100(score_lists["soft"])
    s_growth = mean100(score_lists["growth"])

    s_tech = weighted_average(
        {
            "tech_stack": s_tech_stack,
            "tech_capability": s_tech_capability,
            "dev_tool": s_dev_tool,
        },
        TECH_REQUIREMENT_WEIGHTS,
    )
    s_quality = weighted_average({"soft": s_soft, "growth": s_growth}, {"soft": 1, "growth": 1})

    s_match = weighted_average(
        {
            "tech": s_tech,
            "quality": s_quality,
        },
        MATCH_SCORE_WEIGHTS,
    )
    match_contributions = weighted_contributions(
        {
            "tech": s_tech,
            "quality": s_quality,
        },
        MATCH_SCORE_WEIGHTS,
    )
    raw_match_score = clamp_score(s_match)
    ratio_exact = capped_coverage_ratio("standard")
    tech_cov = capped_coverage_ratio("similar")
    raw_tech_requirement_total = sum(counts["total"] for counts in coverage_counts.values())
    effective_coverage_tag_count = sum(
        min(counts["total"], COVERAGE_DENOMINATOR_CAPS.get(cat, counts["total"]))
        for cat, counts in coverage_counts.items()
        if counts["total"] > 0
    )

    status_counts = {"Standard": 0, "Similar": 0, "Missing": 0}
    category_counts: Dict[str, int] = {}
    for detail in tag_details:
        status = detail["status"]
        cat = detail["cat"]
        status_counts[status] = status_counts.get(status, 0) + 1
        category_counts[cat] = category_counts.get(cat, 0) + 1

    tier_eval = evaluate_tier(raw_match_score, ratio_exact, tech_cov, tier_rules=tier_rules)
    low_frequency_matches = [
        {
            "jd_tag": detail["jd_tag"],
            "cat": detail["cat"],
            "status": detail["status"],
            "freq": detail["freq"],
            "freq_weight": detail["freq_weight"],
            "best_stu": detail["best_stu"],
            "level_delta": detail.get("level_delta"),
            "level_modifier": detail.get("level_modifier"),
        }
        for detail in tag_details
        if detail.get("low_frequency")
    ]

    display_to_internal_cat = {
        "techStack": "tech_stack",
        "techCapabilities": "tech_capability",
        "devTools": "dev_tool",
        "softQuality": "soft",
        "growthPotential": "growth",
    }

    def compact_match_detail(detail: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "jd_tag": detail.get("jd_tag"),
            "best_stu": detail.get("best_stu"),
            "status": detail.get("status"),
            "base_similarity": detail.get("base_similarity"),
            "score_similarity": detail.get("score_similarity"),
            "score": detail.get("score"),
            "jd_level": detail.get("jd_level"),
            "best_stu_level": detail.get("best_stu_level"),
            "level_delta": detail.get("level_delta"),
            "level_modifier": detail.get("level_modifier"),
            "score_threshold": detail.get("score_threshold"),
            "similar_enabled": detail.get("similar_enabled"),
            "block_reason": detail.get("block_reason"),
            "freq": detail.get("freq"),
            "freq_weight": detail.get("freq_weight"),
            "low_frequency": detail.get("low_frequency"),
            "group_id": detail.get("group_id"),
            "note": detail.get("note"),
            "branch_group_name": detail.get("branch_group_name"),
            "branch_option_name": detail.get("branch_option_name"),
            "branch_required_count": detail.get("branch_required_count"),
            "branch_option_count": detail.get("branch_option_count"),
            "branch_exact_count": detail.get("branch_exact_count"),
            "branch_similar_count": detail.get("branch_similar_count"),
            "branch_matched_count": detail.get("branch_matched_count"),
            "branch_missing_count": detail.get("branch_missing_count"),
            "branch_group_status": detail.get("branch_group_status"),
        }

    def build_match_details() -> Dict[str, Dict[str, Any]]:
        details_by_cat: Dict[str, Dict[str, Any]] = {}
        for display_cat, internal_cat in display_to_internal_cat.items():
            thresholds = get_similarity_thresholds(internal_cat)
            details_by_cat[display_cat] = {
                "policy": {
                    "exact_threshold": thresholds["standard"],
                    "fuzzy_threshold": thresholds["similar"],
                    "fuzzy_enabled": allows_similar_match(internal_cat),
                    "score_threshold": score_similarity_threshold(internal_cat),
                },
                "exact": [],
                "fuzzy": [],
                "missing": [],
                "level_mismatch": [],
            }

        for detail in tag_details:
            display_cat = detail.get("cat")
            bucket = details_by_cat.get(display_cat)
            if bucket is None:
                continue
            payload = compact_match_detail(detail)
            if detail.get("status") == "Standard":
                bucket["exact"].append(payload)
            elif detail.get("status") == "Similar":
                bucket["fuzzy"].append(payload)
            else:
                bucket["missing"].append(payload)
            if detail.get("level_delta") is not None and detail.get("level_delta") < 0:
                bucket["level_mismatch"].append(payload)
        return details_by_cat

    match_details = build_match_details()
    technical_match_details = {key: match_details[key] for key in ["techStack", "techCapabilities", "devTools"]}

    return {
        "recommendation_score": round(raw_match_score, 2),
        "match_score": round(raw_match_score, 2),
        "tier": tier_eval["tier"],
        "confidence": 1.0,
        "score_breakdown": {
            "match": round(raw_match_score, 2),
            "contributions": {
                "tech_match": round_score(match_contributions.get("tech")),
                "quality_match": round_score(match_contributions.get("quality")),
            },
            "raw": {
                "tech_match": round_score(s_tech),
                "quality_match": round_score(s_quality),
                "bonus": 0.0,
            },
        },
        "scoring": {
            "recommendation_score": round(raw_match_score, 2),
            "match_score": round(raw_match_score, 2),
            "components": {
                "tech_match": round_score(s_tech),
                "quality_match": round_score(s_quality),
            },
            "contributions": {
                "tech_match": round_score(match_contributions.get("tech")),
                "quality_match": round_score(match_contributions.get("quality")),
            },
            "match_weights": MATCH_SCORE_WEIGHTS,
        },
        "exact_match_ratio": ratio_exact,
        "tech_sim_coverage": tech_cov,
        "score_tech": round_score(s_tech),
        "score_quality": round_score(s_quality),
        "score_tech_stack": round_score(s_tech_stack),
        "score_tech_capability": round_score(s_tech_capability),
        "score_dev_tool": round_score(s_dev_tool),
        "score_soft": round_score(s_soft),
        "score_growth": round_score(s_growth),
        "overflows": overflows,
        "missings": missings,
        "similars": similars,
        "level_mismatches": level_mismatches,
        "low_frequency_matches": low_frequency_matches,
        "match_details": match_details,
        "technical_match_details": technical_match_details,
        "tag_details": tag_details,
        "status_counts": status_counts,
        "category_counts": category_counts,
        "total_tag_count": raw_tech_requirement_total,
        "effective_coverage_tag_count": effective_coverage_tag_count,
        "coverage_counts": coverage_counts,
        "tier_checks": tier_eval["tier_checks"],
        "job_id": jd.get("id"),
    }


async def get_scored_candidates_for_student(
    student: Dict[str, Any],
    recall_limit: int = DEFAULT_RECALL_LIMIT,
    tier_rules: Optional[Dict[str, Dict[str, float]]] = None,
    degradations: Optional[list[Dict[str, Any]]] = None,
) -> list[Dict[str, Any]]:
    await ensure_jobs_fresh()
    if not state.jobs_metadata:
        raise HTTPException(status_code=500, detail="Backend data not loaded")

    stu_parsed = parse_student_tags(student)
    try:
        await embed_batch(stu_parsed["all_tags"], label="StudentTags")
    except Exception as exc:
        logger.warning("[MatchScoring] Student tags embedding failed: %s", exc)
        if degradations is not None:
            degradations.append({
                "component": "embedding_cache",
                "reason": str(exc),
                "impact": "无法生成学生画像标签的向量，将依赖本地缓存或字面匹配"
            })

    hit_scores: Dict[int, int] = {}

    def expand_and_hit(tag_list: list[str], threshold: float, points: int) -> None:
        keys = list(state.tag_vectors_cache.keys())
        if not keys or not tag_list:
            return
        matrix = np.array([state.tag_vectors_cache[key] for key in keys])
        for student_tag in tag_list:
            if student_tag not in state.tag_vectors_cache:
                continue
            sims = np.dot(matrix, state.tag_vectors_cache[student_tag])
            idxs = np.where(sims >= threshold)[0]
            candidates = sorted(
                [
                    (
                        1 if state.global_tag_freq.get(keys[index], 0) >= LOW_FREQUENCY_TAG_THRESHOLD else 0,
                        sims[index],
                        keys[index],
                    )
                    for index in idxs
                ],
                reverse=True,
            )
            for _, _, tag in candidates[:DEFAULT_EXPANSION_LIMIT]:
                for job_idx, _cat in state.inverted_index.get(tag, []):
                    hit_scores[job_idx] = hit_scores.get(job_idx, 0) + points

    expand_and_hit(
        stu_parsed["tech_stack"],
        RECALL_RULES["tech_stack"]["threshold"],
        int(RECALL_RULES["tech_stack"]["points"]),
    )
    expand_and_hit(
        stu_parsed["tech_capability"],
        RECALL_RULES["tech_capability"]["threshold"],
        int(RECALL_RULES["tech_capability"]["points"]),
    )
    expand_and_hit(
        stu_parsed["dev_tool"],
        RECALL_RULES["dev_tool"]["threshold"],
        int(RECALL_RULES["dev_tool"]["points"]),
    )

    top_indices = [row[0] for row in sorted(hit_scores.items(), key=lambda item: item[1], reverse=True)[:recall_limit]]
    if not top_indices:
        top_indices = list(range(min(recall_limit, len(state.jobs_metadata))))

    jd_tags_need = set()
    for idx in top_indices:
        jd = state.jobs_metadata[idx]
        for item in iter_tech_stack_leaf_items(jd.get("techStack", [])):
            name = match_tech_stack_name(item)
            if name:
                jd_tags_need.add(name)
        for item in jd.get("devTools", []):
            name = match_dev_tool_name(item)
            if name:
                jd_tags_need.add(name)
        for src in [jd.get("softQuality", []), jd.get("growthPotential", [])]:
            for item in src:
                name = extract_item_name(item, fallback_raw=True)
                if name:
                    jd_tags_need.add(name)
        for item in jd.get("techCapabilities", []):
            if clean_text(item.get("type")) == "soft_flag":
                continue
            name = match_tech_capability_name(item)
            if name:
                jd_tags_need.add(name)

    try:
        await embed_batch(list(jd_tags_need), label="JD-Top50-Fill")
    except Exception as exc:
        logger.warning("[MatchScoring] JD tags embedding failed: %s", exc)
        if degradations is not None:
            degradations.append({
                "component": "embedding_cache",
                "reason": str(exc),
                "impact": "无法生成候选JD标签的向量，将依赖本地缓存或字面匹配"
            })

    results = []
    for idx in top_indices:
        jd = state.jobs_metadata[idx]
        res = await score_one_job_detailed(
            jd,
            stu_parsed,
            state.tag_vectors_cache,
            state.global_tag_freq,
            tier_rules=tier_rules,
        )
        job_copy = dict(jd)
        job_copy.update(res)
        results.append(job_copy)

    results.sort(key=get_match_score, reverse=True)
    return dedupe_exact_jobs_for_recommendation(results)


def _is_internship_job(job: Dict[str, Any]) -> bool:
    metadata = job.get("metadata") or {}
    text = " ".join(
        [
            clean_text(metadata.get("jobType")),
            clean_text(job.get("jobType")),
            clean_text(job.get("title")),
            clean_text(job.get("positionName")),
        ]
    ).lower()
    return any(keyword in text for keyword in ("实习", "见习", "intern", "internship"))


def _coerce_gap_tag_type(value: Any) -> str:
    text = clean_text(value)
    if text in {"techStack", "tech_stack"}:
        return "techStack"
    if text in {"devTools", "dev_tools", "devTool"}:
        return "devTools"
    return "techCapabilities"


def _gap_target_level(gap: Dict[str, Any]) -> float:
    for key in ("targetLevel", "target_level", "jd_level", "levelRequired", "level"):
        try:
            value = float(gap.get(key))
            if value > 0:
                return value
        except (TypeError, ValueError):
            continue
    return 2.0


def _normalize_action_gaps(gaps: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    rows: list[Dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for gap in gaps:
        if not isinstance(gap, dict):
            continue
        name = clean_text(
            gap.get("tag")
            or gap.get("name")
            or gap.get("jdTag")
            or gap.get("jd_tag")
            or gap.get("title")
        )
        if not name:
            continue
        tag_type = _coerce_gap_tag_type(gap.get("tagType") or gap.get("source") or gap.get("category"))
        key = (tag_type, name.lower())
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "name": name,
                "tagType": tag_type,
                "targetLevel": _gap_target_level(gap),
                "currentLevel": gap.get("currentLevel") or gap.get("current_level") or 0,
                "severity": clean_text(gap.get("severity") or "missing"),
            }
        )
    return rows


def _gap_student_from_gaps(source_student: Dict[str, Any], gaps: list[Dict[str, Any]]) -> Dict[str, Any]:
    gap_student = {
        "basicInfo": source_student.get("basicInfo") or {},
        "direction": source_student.get("direction"),
        "techStack": [],
        "techCapabilities": [],
        "devTools": [],
    }
    for gap in gaps:
        item = {
            "name": gap["name"],
            "normalizedTag": gap["name"],
            "levelRequired": gap["targetLevel"],
        }
        if gap["tagType"] == "techStack":
            gap_student["techStack"].append(item)
        elif gap["tagType"] == "devTools":
            gap_student["devTools"].append(item)
        else:
            gap_student["techCapabilities"].append(item)
    return gap_student


def _collect_job_embedding_tags(jd: Dict[str, Any]) -> set[str]:
    tags: set[str] = set()
    for item in iter_tech_stack_leaf_items(jd.get("techStack", [])):
        name = match_tech_stack_name(item)
        if name:
            tags.add(name)
    for item in jd.get("devTools", []):
        name = match_dev_tool_name(item)
        if name:
            tags.add(name)
    for item in jd.get("techCapabilities", []):
        if clean_text(item.get("type")) == "soft_flag":
            continue
        name = match_tech_capability_name(item)
        if name:
            tags.add(name)
    return tags


def _recall_internship_indices_by_gaps(
    normalized_gaps: list[Dict[str, Any]],
    internship_indices: list[int],
    limit: int,
) -> list[int]:
    allowed_indices = set(internship_indices)
    keys = list(state.tag_vectors_cache.keys())
    if not keys or not normalized_gaps:
        return internship_indices[:limit]

    matrix = np.array([state.tag_vectors_cache[key] for key in keys])
    hit_scores: Dict[int, float] = {}
    for gap in normalized_gaps:
        gap_name = clean_text(gap.get("name"))
        if not gap_name or gap_name not in state.tag_vectors_cache:
            continue
        tag_type = gap.get("tagType")
        threshold = (
            score_similarity_threshold("tech_stack")
            if tag_type == "techStack"
            else score_similarity_threshold("dev_tool")
            if tag_type == "devTools"
            else score_similarity_threshold("tech_capability")
        )
        sims = np.dot(matrix, state.tag_vectors_cache[gap_name])
        idxs = np.where(sims >= threshold)[0]
        candidate_tags = sorted(
            [
                (
                    1 if state.global_tag_freq.get(keys[index], 0) >= LOW_FREQUENCY_TAG_THRESHOLD else 0,
                    float(sims[index]),
                    keys[index],
                )
                for index in idxs
            ],
            reverse=True,
        )
        for _freq_flag, sim, tag in candidate_tags[:DEFAULT_EXPANSION_LIMIT]:
            for job_idx, _cat in state.inverted_index.get(tag, []):
                if job_idx not in allowed_indices:
                    continue
                exact_bonus = 25 if tag.lower() == gap_name.lower() else 0
                hit_scores[job_idx] = hit_scores.get(job_idx, 0.0) + sim * 100 + exact_bonus

    if not hit_scores:
        return internship_indices[:limit]
    return [
        job_idx
        for job_idx, _score in sorted(hit_scores.items(), key=lambda item: item[1], reverse=True)[:limit]
    ]


def _matched_gap_rows(job: Dict[str, Any], normalized_gaps: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    gap_by_name = {gap["name"].lower(): gap for gap in normalized_gaps}
    rows: list[Dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    details_by_cat = job.get("match_details") or {}
    for category in RECOMMENDATION_TAG_CATEGORIES:
        details = details_by_cat.get(category) or {}
        for bucket in ("exact", "fuzzy", "level_mismatch"):
            for detail in details.get(bucket) or []:
                best_stu = clean_text(detail.get("best_stu"))
                jd_tag = clean_text(detail.get("jd_tag"))
                if not best_stu or best_stu.lower() not in gap_by_name or not jd_tag:
                    continue
                key = (category, best_stu.lower())
                if key in seen:
                    continue
                seen.add(key)
                gap = gap_by_name[best_stu.lower()]
                rows.append(
                    {
                        "gap": gap["name"],
                        "jdTag": jd_tag,
                        "tagType": category,
                        "status": detail.get("status") or ("Similar" if bucket == "fuzzy" else "Standard"),
                        "similarity": detail.get("base_similarity") if detail.get("base_similarity") is not None else detail.get("sim"),
                        "targetLevel": gap.get("targetLevel"),
                        "jobLevel": detail.get("jd_level"),
                    }
                )
    return rows


async def recommend_internship_jobs(req: InternshipRecommendationRequest) -> Dict[str, Any]:
    start_time = time.time()
    await ensure_jobs_fresh()
    if not state.jobs_metadata:
        raise HTTPException(status_code=500, detail="Backend data not loaded")

    normalized_gaps = _normalize_action_gaps(req.gaps or [])
    if not normalized_gaps:
        return {
            "ok": True,
            "source": "job-admin-internship-recommendations",
            "gapProfile": [],
            "jobs": [],
            "message": "No action-plan gaps supplied",
            "timing": {"totalSeconds": round(time.time() - start_time, 3)},
        }

    internship_indices = [index for index, job in enumerate(state.jobs_metadata) if _is_internship_job(job)]
    if not internship_indices:
        return {
            "ok": True,
            "source": "job-admin-internship-recommendations",
            "gapProfile": normalized_gaps,
            "jobs": [],
            "message": "No internship jobs found in library",
            "timing": {"totalSeconds": round(time.time() - start_time, 3)},
        }

    gap_student = _gap_student_from_gaps(req.studentProfile or {}, normalized_gaps)
    stu_parsed = parse_student_tags(gap_student)
    await embed_batch(stu_parsed["all_tags"], label="ActionGapTags")

    recall_limit = max(120, min(800, int(req.top_k or 6) * 80))
    candidate_indices = _recall_internship_indices_by_gaps(normalized_gaps, internship_indices, recall_limit)
    internship_jobs = [state.jobs_metadata[index] for index in candidate_indices]

    jd_tags_need: set[str] = set()
    for jd in internship_jobs:
        jd_tags_need.update(_collect_job_embedding_tags(jd))
    await embed_batch(list(jd_tags_need), label="InternshipJD-Fill")

    scored_jobs: list[Dict[str, Any]] = []
    for jd in internship_jobs:
        scored = await score_one_job_detailed(
            jd,
            stu_parsed,
            state.tag_vectors_cache,
            state.global_tag_freq,
        )
        job_copy = dict(jd)
        job_copy.update(scored)
        matched_gaps = _matched_gap_rows(job_copy, normalized_gaps)
        if not matched_gaps:
            continue
        match_score = get_match_score(job_copy)
        exact_hits = sum(1 for item in matched_gaps if item.get("status") == "Standard")
        similar_hits = sum(1 for item in matched_gaps if item.get("status") == "Similar")
        internship_score = clamp_score(match_score * 0.58 + exact_hits * 18 + similar_hits * 10)
        job_copy["internshipRecommendation"] = {
            "score": round(internship_score, 2),
            "gapHitCount": len(matched_gaps),
            "matchedGaps": matched_gaps,
            "reason": (
                "这条实习岗位覆盖了你的行动计划缺口："
                + "、".join(item["gap"] for item in matched_gaps[:3])
            ),
        }
        scored_jobs.append(job_copy)

    scored_jobs.sort(
        key=lambda job: (
            (job.get("internshipRecommendation") or {}).get("score") or 0,
            (job.get("internshipRecommendation") or {}).get("gapHitCount") or 0,
            get_match_score(job),
        ),
        reverse=True,
    )
    limit = max(1, min(20, int(req.top_k or 6)))
    return {
        "ok": True,
        "source": "job-admin-internship-recommendations",
        "gapProfile": normalized_gaps,
        "jobs": scored_jobs[:limit],
        "totals": {
            "internshipPool": len(internship_indices),
            "recalled": len(candidate_indices),
            "matched": len(scored_jobs),
        },
        "timing": {"totalSeconds": round(time.time() - start_time, 3)},
    }


def bucket_match_results(
    results: list[Dict[str, Any]],
    bucket_size: int = DEFAULT_BUCKET_SIZE,
) -> Dict[str, list[Dict[str, Any]]]:
    pools = {"Safety": [], "Target": [], "Reach": []}
    for job in results:
        if "Safety" in job["tier"]:
            pools["Safety"].append(job)
        elif "Target" in job["tier"]:
            pools["Target"].append(job)
        elif "Reach" in job["tier"]:
            pools["Reach"].append(job)

    rs = pools["Safety"][:bucket_size]
    rt = pools["Target"][:bucket_size]
    rr = pools["Reach"][:bucket_size]

    used = set()
    for rows in [rs, rt, rr]:
        for job in rows:
            used.add(job.get("id", "") + "||" + job.get("title", ""))

    fallback = [job for job in results if (job.get("id", "") + "||" + job.get("title", "")) not in used]

    def pad_to_size(rows: list[Dict[str, Any]]) -> None:
        while len(rows) < bucket_size and fallback:
            candidate = dict(fallback.pop(0))
            candidate["tier"] = "未达标 (Unqualified)"
            rows.append(candidate)

    pad_to_size(rs)
    pad_to_size(rt)
    pad_to_size(rr)
    return {"safety": rs, "target": rt, "reach": rr}


def _slim_job(job: Dict[str, Any]) -> Dict[str, Any]:
    """将完整评分结果裁剪为 LLM 分析所需的精简格式。"""
    return {
        "id": job.get("id") or job.get("job_id"),
        "title": job.get("title"),
        "company": job.get("companyName"),
        "direction": job.get("direction"),
        "tier": job.get("tier"),
        "recommendation_score": get_match_score(job),
        "match_score": get_match_score(job),
        "score_tech": job.get("score_tech"),
        "score_quality": job.get("score_quality"),
        "score_tech_stack": job.get("score_tech_stack"),
        "score_tech_capability": job.get("score_tech_capability"),
        "score_dev_tool": job.get("score_dev_tool"),
        "score_soft": job.get("score_soft"),
        "score_breakdown": job.get("score_breakdown"),
        "precision_coverage": job.get("exact_match_ratio"),
        "similar_coverage": job.get("tech_sim_coverage"),
        "overflows": trim_list(job.get("overflows")),
        "missings": trim_list(job.get("missings")),
        "similars": trim_list(job.get("similars")),
        "level_mismatches": trim_list(job.get("level_mismatches")),
        "low_frequency_matches": trim_list(job.get("low_frequency_matches")),
        "salary": job.get("metadata", {}).get("salaryRange"),
    }


def _compute_jd_stars(jobs: list[Dict[str, Any]]) -> Dict[str, int]:
    """
    确定性计算每个岗位的 JD Split 星级：
    ≥85 → 3星；65-84 → 2星；<65 → 1星
    """
    stars: Dict[str, int] = {}
    for job in jobs:
        job_id = job.get("id") or job.get("job_id") or job.get("title", "unknown")
        score = get_match_score(job)
        if score >= 85:
            stars[job_id] = 3
        elif score >= 65:
            stars[job_id] = 2
        else:
            stars[job_id] = 1
    return stars


def _job_duplicate_key(job: Dict[str, Any]) -> str:
    """Canonical duplicate key for recommendation display.

    job.id is the source-of-truth identity. Do not merge different imported
    postings just because title/company/direction look similar; their JD details
    may intentionally differ and students need to compare them.
    """
    job_id = clean_text(job.get("id") or job.get("job_id"))
    if job_id:
        return job_id

    title = clean_text(job.get("title")).lower()
    company = clean_text(job.get("companyName")).lower()
    direction = clean_text(job.get("direction")).lower()
    if not title or not company:
        return clean_text(job.get("id") or job.get("job_id") or title or company)
    salary_range = job.get("metadata", {}).get("salaryRange") or []
    if isinstance(salary_range, (list, tuple)):
        salary_key = ",".join(clean_text(item) for item in salary_range)
    else:
        salary_key = clean_text(salary_range).lower()
    jd_split = job.get("jdSplit") or {}
    requirement_key = " / ".join(
        clean_text(item).lower()
        for item in (jd_split.get("jobRequirements") or [])[:8]
        if clean_text(item)
    )
    tech_key = " / ".join(
        sorted(
            clean_text(match_tech_stack_name(item)).lower()
            for item in iter_tech_stack_leaf_items(job.get("techStack") or [])
            if clean_text(match_tech_stack_name(item))
        )
    )
    capability_key = " / ".join(
        sorted(
            clean_text(match_tech_capability_name(item)).lower()
            for item in (job.get("techCapabilities") or [])
            if clean_text(match_tech_capability_name(item))
        )
    )
    return "content||" + "||".join([title, company, direction, salary_key, requirement_key, tech_key, capability_key])


def dedupe_exact_jobs_for_recommendation(results: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    deduped: list[Dict[str, Any]] = []
    seen: Dict[str, Dict[str, Any]] = {}

    for job in results:
        key = _job_duplicate_key(job)
        if not key:
            deduped.append(job)
            continue

        current = seen.get(key)
        job_score = get_match_score(job)
        if current is None:
            kept = dict(job)
            first_job_id = clean_text(job.get("id") or job.get("job_id"))
            kept["dedupeMeta"] = {
                "key": key,
                "duplicateCount": 1,
                "duplicateJobIds": [first_job_id] if first_job_id else [],
            }
            seen[key] = kept
            deduped.append(kept)
            continue

        current_meta = current.setdefault("dedupeMeta", {"key": key, "duplicateCount": 1, "duplicateJobIds": []})
        duplicate_ids = current_meta.setdefault("duplicateJobIds", [])
        job_id = clean_text(job.get("id") or job.get("job_id"))
        if job_id and job_id not in duplicate_ids:
            duplicate_ids.append(job_id)
        current_meta["duplicateCount"] = int(current_meta.get("duplicateCount") or 1) + 1

        current_score = get_match_score(current)
        if job_score > current_score:
            replacement = dict(job)
            replacement["dedupeMeta"] = current_meta
            for index, item in enumerate(deduped):
                if item is current:
                    deduped[index] = replacement
                    break
            seen[key] = replacement

    duplicate_groups = sum(1 for job in deduped if int((job.get("dedupeMeta") or {}).get("duplicateCount") or 1) > 1)
    if duplicate_groups:
        logger.info("[Match] deduped exact job-id groups=%s before=%s after=%s", duplicate_groups, len(results), len(deduped))
    return deduped


def _build_lanes(
    all_results: list[Dict[str, Any]],
    student_direction: Any,
    bucket_size: int,
    batch_offsets: Dict[str, int],
) -> Dict[str, Any]:
    """
    构建三赛道推荐结果：

    featured（精选推荐）：拆成三个独立子槽，各自对应 Safety / Target / Reach tier
        - safety 槽：tier 含 Safety，按综合分降序
        - target 槽：tier 含 Target，按综合分降序
        - reach  槽：tier 含 Reach，按薪资上限降序（高薪冲刺）
        - 三槽各自支持独立 offset（batch_offsets key: featured_safety/featured_target/featured_reach）
    interest（猜你喜欢）：
        - 避开学生 direction，推荐不同方向高分岗位
        - 按匹配度分数从高到低，取 3 个推荐槽，支持 offset 翻页
    switch（换岗推荐 / 职业转型路径）：
        - 避开学生 direction，按匹配度分数最高到最低
        - 支持 batch_offsets 翻页
    """
    direction_lowers = expand_direction_aliases(normalize_direction_list(student_direction))

    def same_direction(job: Dict[str, Any]) -> bool:
        if not direction_lowers:
            return False
        return clean_text(job.get("direction")).lower() in direction_lowers

    def diff_direction(job: Dict[str, Any]) -> bool:
        return not same_direction(job)

    def salary_max(job: Dict[str, Any]) -> float:
        sal = job.get("metadata", {}).get("salaryRange") or []
        if isinstance(sal, (list, tuple)) and len(sal) >= 2:
            try:
                return float(sal[1])
            except (TypeError, ValueError):
                pass
        return 0.0

    def recommendation_tag_hits(job: Dict[str, Any]) -> int:
        details_by_cat = job.get("match_details") or {}
        hit_keys: set[tuple[str, str]] = set()

        for category in RECOMMENDATION_TAG_CATEGORIES:
            category_details = details_by_cat.get(category) or {}
            policy = category_details.get("policy") or {}
            policy_threshold = policy.get("score_threshold")

            for bucket_name in ("exact", "fuzzy", "missing", "level_mismatch"):
                for detail in category_details.get(bucket_name) or []:
                    jd_tag = clean_text(detail.get("jd_tag"))
                    best_stu = clean_text(detail.get("best_stu"))
                    if not jd_tag or not best_stu:
                        continue

                    try:
                        similarity = float(
                            detail.get("base_similarity")
                            if detail.get("base_similarity") is not None
                            else detail.get("sim")
                            or 0
                        )
                    except (TypeError, ValueError):
                        similarity = 0.0

                    try:
                        threshold = float(
                            detail.get("score_threshold")
                            if detail.get("score_threshold") is not None
                            else policy_threshold
                            or 1.0
                        )
                    except (TypeError, ValueError):
                        threshold = 1.0

                    if similarity >= threshold:
                        hit_keys.add((category, jd_tag))

        return len(hit_keys)

    def sort_by_salary(items: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
        return sorted(
            items,
            key=lambda job: (
                salary_max(job),
                float(job.get("score_tech") or 0),
                get_match_score(job),
            ),
            reverse=True,
        )

    def sort_interest(items: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
        return sorted(
            items,
            key=lambda job: (
                recommendation_tag_hits(job),
                salary_max(job),
                float(job.get("score_tech") or 0),
                get_match_score(job),
            ),
            reverse=True,
        )

    def sort_switch(items: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
        return sorted(
            items,
            key=lambda job: (
                recommendation_tag_hits(job),
                float(job.get("score_tech") or 0),
                salary_max(job),
                get_match_score(job),
            ),
            reverse=True,
        )

    # ── Featured 三槽：按 tier 分桶，互不重叠 ────────────────────────────────
    safety_pool = sort_by_salary([j for j in all_results if "Safety" in j.get("tier", "")])
    target_pool = sort_by_salary([j for j in all_results if "Target" in j.get("tier", "")])
    reach_pool = sort_by_salary([j for j in all_results if "Reach" in j.get("tier", "")])
    # 未达标岗位追加到 safety 槽末尾（灰色展示，让学生看到差距）
    unqualified_pool = sorted(
        [j for j in all_results if
         "Safety" not in j.get("tier", "")
         and "Target" not in j.get("tier", "")
         and "Reach" not in j.get("tier", "")],
        key=get_match_score,
        reverse=True,
    )
    featured_obj = {
        "safety": safety_pool,
        "target": target_pool,
        "reach": reach_pool,
    }
    featured_job_keys = {
        _job_duplicate_key(job)
        for job in [
            *safety_pool,
            *target_pool,
            *reach_pool,
        ]
        if _job_duplicate_key(job)
    }

    # ── Interest（猜你喜欢）：不同 direction，按分数降序，3 槽 ─────────────────
    interest_candidates = [
        j for j in all_results
        if same_direction(j)
        and _job_duplicate_key(j) not in featured_job_keys
    ]
    interest_pool = sort_interest(
        [
            j for j in interest_candidates
            if recommendation_tag_hits(j) >= INTEREST_MIN_RECOMMENDATION_TAG_HITS
        ]
    )
    if not interest_pool:
        interest_pool = sort_interest(
            [
                j for j in interest_candidates
                if recommendation_tag_hits(j) >= 1
            ]
        )

    # ── Switch（换岗推荐）：不同 direction，按分数降序 ─────────────────────────
    switch_pool = sort_switch(
        [
            j for j in all_results
            if diff_direction(j)
            and recommendation_tag_hits(j) >= 1
            and _job_duplicate_key(j) not in featured_job_keys
        ]
    )

    return {
        "lanes": {
            "featured": featured_obj,   # dict with safety/target/reach sub-lists
            "interest": interest_pool,
            "switch": switch_pool,
            "unqualified": unqualified_pool[:20],  # 额外返回一个所有不匹配岗位的池子，方便前端单独区域显示
        },
        "has_more": {
            "featured": {
                "safety": False,
                "target": False,
                "reach": False,
            },
            "interest": False,
            "switch": False,
        },
        "totals": {
            "featured": {
                "safety": len(safety_pool),
                "target": len(target_pool),
                "reach": len(reach_pool),
            },
            "interest": len(interest_pool),
            "switch": len(switch_pool),
        },
    }


async def _generate_structured_report(
    slim_jobs: list[Dict[str, Any]],
    jd_stars: Dict[str, int],
    llm_config: Dict[str, Any],
    timeout_seconds: int,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """
    生成结构化 JSON 深度报告，返回 (structured_report_dict, analysis_meta)。
    LLM 以 JSON 分点格式输出，避免直接生成大段文本。
    """
    analysis_meta: Dict[str, Any] = {
        "status": "skipped",
        "source": llm_config.get("source", ""),
        "model": llm_config.get("model", ""),
        "baseUrl": llm_config.get("base_url", ""),
        "error": "",
        "timeoutSeconds": timeout_seconds,
    }

    empty_report = {
        "jd_stars": jd_stars,
        "interview_advice": [],
        "tenure_growth": "",
        "future_path": "",
    }

    if not llm_config.get("api_key") or not llm_config.get("base_url") or not llm_config.get("model"):
        analysis_meta.update({"status": "skipped", "error": "missing text model config"})
        logger.warning(
            "[Match] LLM report skipped: missing text model config source=%s base_url=%s model=%s",
            llm_config.get("source"),
            llm_config.get("base_url"),
            llm_config.get("model"),
        )
        return empty_report, analysis_meta

    stars_summary = ", ".join(f"{jid}={s}星" for jid, s in jd_stars.items()) or "（无岗位）"
    jobs_json = json.dumps(slim_jobs, ensure_ascii=False)

    system_prompt = (
        "你是一位专业严谨的人岗匹配复核专家。"
        "请根据下方岗位匹配数据，以 **纯 JSON** 格式输出结构化报告，不要输出任何 JSON 以外的文字。\n\n"
        "输出格式（严格遵守，字段不得增删）：\n"
        "{{ \n"
        '  "interview_advice": [\n'
        '    "建议1（STAR法则，具体到该岗位要求）",\n'
        '    "建议2",\n'
        '    "建议3"\n'
        '  ],\n'
        '  "tenure_growth": "入职后3-6个月成长路径的简短描述（1-2句话）",\n'
        '  "future_path": "1-3年职业发展方向的简短描述（1-2句话）"\n'
        "}}\n\n"
        "约束：\n"
        "1. interview_advice 必须是列表（3-5条），每条针对该岗位具体技术缺口给出 STAR 法则面试准备建议。\n"
        "2. tenure_growth 和 future_path 各不超过80字。\n"
        f"3. 各岗位星级已由系统确定：{stars_summary}，你无需修改或说明星级。\n"
        "4. 不得捏造分数，不得重新计算，直接基于给定数据做定性分析。\n"
        "5. 若学历或经历含金量存在'❌ 不符'，必须在 tenure_growth 中给出警示。\n"
        "6. 严禁输出 ```json``` 代码块包裹，只输出裸 JSON。"
    )

    llm = ChatOpenAI(
        model=llm_config["model"],
        api_key=llm_config["api_key"],
        base_url=llm_config["base_url"],
        temperature=llm_config["temperature"],
        max_tokens=llm_config["max_tokens"],
        timeout=timeout_seconds,
        max_retries=0,
    )
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("user", "【推荐岗位数据】：\n{jobs_json}"),
    ])

    try:
        raw = await asyncio.wait_for(
            (prompt | llm | StrOutputParser()).ainvoke({"jobs_json": jobs_json}),
            timeout=timeout_seconds + 5,
        )
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
        parsed = json.loads(raw)
        structured = {
            "jd_stars": jd_stars,
            "interview_advice": parsed.get("interview_advice") or [],
            "tenure_growth": str(parsed.get("tenure_growth") or ""),
            "future_path": str(parsed.get("future_path") or ""),
        }
        analysis_meta["status"] = "success"
        return structured, analysis_meta
    except Exception as exc:
        error_text = brief_llm_error(exc)
        analysis_meta.update({"status": "failed", "error": error_text})
        logger.error(
            "[Match] LLM structured report failed source=%s model=%s error=%s",
            llm_config.get("source"),
            llm_config.get("model"),
            error_text,
        )
        fallback = {**empty_report, "jd_stars": jd_stars}
        return fallback, analysis_meta


def iter_jd_split_items(job: Dict[str, Any]) -> list[Dict[str, Any]]:
    jd_split = job.get("jdSplit") or job.get("jd_split") or {}
    labels = {
        "jobRequirements": "岗位要求",
        "requirements": "岗位要求",
        "bonusPoints": "加分项",
        "bonus": "加分项",
    }
    rows: list[Dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for key, label in labels.items():
        values = jd_split.get(key) or []
        if not isinstance(values, list):
            values = [values]
        for index, value in enumerate(values):
            text = clean_text(value)
            if not text:
                continue
            dedupe_key = (label, text)
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            rows.append({
                "section": label,
                "sourceKey": key,
                "sourceIndex": index,
                "index": len(rows),
                "text": text,
            })
    return rows


def compute_jd_star_score(items: list[Dict[str, Any]], fallback_score: float) -> tuple[float, str]:
    if not items:
        return clamp_score(fallback_score), "fallback_to_tag_match_no_requirements_or_bonus"
    scores = [harvest_star_to_score(item.get("stars")) for item in items]
    return round(sum(scores) / max(1, len(scores)), 2), "jd_requirements_bonus_assessment"


def _short_join(values: list[str], limit: int = 3) -> str:
    cleaned = []
    seen = set()
    for value in values:
        text = clean_text(value)
        if not text or text in seen:
            continue
        seen.add(text)
        cleaned.append(text)
        if len(cleaned) >= limit:
            break
    return "、".join(cleaned)


def _detail_tag_text(item: Dict[str, Any]) -> str:
    return clean_text(item.get("jd_tag") or item.get("branch_group_name") or item.get("branch_option_name"))


def _detail_student_text(item: Dict[str, Any]) -> str:
    return clean_text(item.get("best_stu") or item.get("student_tag") or item.get("matched_tag"))


def _fallback_evidence_for_item(job: Dict[str, Any], item: Dict[str, Any]) -> str:
    item_text = clean_text(item.get("text"))
    item_key = item_text.lower()
    details_by_cat = job.get("match_details") or job.get("technical_match_details") or {}
    exact_hits: list[str] = []
    fuzzy_hits: list[str] = []
    missing_hits: list[str] = []

    def relates(tag: str) -> bool:
        tag_text = clean_text(tag)
        if not tag_text or not item_key:
            return False
        token = tag_text.lower()
        return token in item_key or item_key in token

    for category_details in details_by_cat.values():
        if not isinstance(category_details, dict):
            continue
        for row in category_details.get("exact") or []:
            tag = _detail_tag_text(row)
            student_tag = _detail_student_text(row)
            if tag and relates(tag):
                exact_hits.append(f"{tag}{f'（画像：{student_tag}）' if student_tag else ''}")
        for row in (category_details.get("fuzzy") or []) + (category_details.get("level_mismatch") or []):
            tag = _detail_tag_text(row)
            student_tag = _detail_student_text(row)
            if tag and relates(tag):
                fuzzy_hits.append(f"{tag}{f'（可迁移：{student_tag}）' if student_tag else ''}")
        for row in category_details.get("missing") or []:
            tag = _detail_tag_text(row)
            if tag and relates(tag):
                missing_hits.append(tag)

    if exact_hits:
        return f"该条可参考已达标画像证据：{_short_join(exact_hits)}。"
    if fuzzy_hits:
        return f"该条存在可迁移证据但仍需补强：{_short_join(fuzzy_hits)}。"
    if missing_hits:
        return f"该条对应的主要缺口：{_short_join(missing_hits)}。"

    global_exact = []
    global_fuzzy = []
    global_missing = []
    for category_details in details_by_cat.values():
        if not isinstance(category_details, dict):
            continue
        global_exact.extend(_detail_tag_text(row) for row in category_details.get("exact") or [])
        global_fuzzy.extend(_detail_tag_text(row) for row in category_details.get("fuzzy") or [])
        global_missing.extend(_detail_tag_text(row) for row in category_details.get("missing") or [])

    if global_missing:
        return f"该条尚未形成直接达标证据；可优先围绕「{item_text[:36]}」补充项目经历，并参考当前主要缺口：{_short_join(global_missing)}。"
    if global_fuzzy:
        return f"该条尚未形成直接达标证据；当前存在可迁移标签：{_short_join(global_fuzzy)}，需要补充更贴近原文的经历证明。"
    if global_exact:
        return f"该条未匹配到明确的逐条证据，但画像中已有相关达标标签：{_short_join(global_exact)}，建议补充和原文更直接对应的项目说明。"
    return f"该条尚未在当前画像中找到直接证据；建议围绕「{item_text[:36]}」补充项目、结果数据或技能证明。"


def fallback_jd_split_assessment(job: Dict[str, Any]) -> list[Dict[str, Any]]:
    match_score = get_match_score(job)
    stars = 3 if match_score >= 82 else 2 if match_score >= 62 else 1
    item_score = harvest_star_to_score(stars)
    label = "达到" if stars == 3 else "达到一部分" if stars == 2 else "未达到"
    reason = (
        "岗位整体匹配较高，该要求/加分项可作为重点证明项准备。"
        if stars == 3
        else "岗位整体存在部分匹配，但该要求/加分项仍需结合项目/经历补足证据。"
        if stars == 2
        else "当前画像与该要求/加分项存在明显差距，建议作为行动计划优先缺口。"
    )
    return [
        {
            **item,
            "stars": stars,
            "score": item_score,
            "label": label,
            "reason": reason,
            "evidence": _fallback_evidence_for_item(job, item),
            "assessmentSource": "tag_fallback",
        }
        for item in iter_jd_split_items(job)
    ]


async def evaluate_jd_split_with_llm(job: Dict[str, Any], student: Dict[str, Any], llm_config: Dict[str, Any]) -> list[Dict[str, Any]]:
    items = iter_jd_split_items(job)
    if not items:
        return []
    if not llm_config.get("api_key") or not llm_config.get("base_url") or not llm_config.get("model"):
        return fallback_jd_split_assessment(job)

    system_prompt = (
        "你是严格的人岗匹配深度报告评估专家。只输出 JSON，不要 markdown。\n"
        "请只逐条评估岗位要求和加分项，不要评估工作内容/jobDescriptions。\n"
        "每一条必须返回 1/2/3 星：3=达到，2=达到一部分，1=未达到。\n"
        "返回的 index 必须使用 jd_items 数组里给出的 index 字段。\n"
        "必须给出可解释理由和候选人证据/缺口，不要改写 JD 原文。\n"
        "输出 JSON：{{\"items\":[{{\"index\":0,\"stars\":1,\"label\":\"达到|达到一部分|未达到\",\"reason\":\"...\",\"evidence\":\"...\"}}]}}"
    )
    payload = {
        "student": student,
        "job": {
            "id": job.get("id") or job.get("stableId"),
            "title": job.get("title"),
            "companyName": job.get("companyName"),
            "match_score": get_match_score(job),
            "match_details": compact_technical_match_details(job.get("technical_match_details") or job.get("match_details")),
            "missings": trim_list(job.get("missings"), limit=8),
            "similars": trim_list(job.get("similars"), limit=8),
            "overflows": trim_list(job.get("overflows"), limit=8),
        },
        "jd_items": items,
    }
    try:
        raw = await call_match_llm_raw(
            llm_config,
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            max_tokens=max(1200, int(llm_config["max_tokens"])),
        )
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
        parsed = json.loads(text[text.find("{"): text.rfind("}") + 1])
        rows = parsed.get("items") if isinstance(parsed, dict) else []
        by_index: Dict[int, Dict[str, Any]] = {}
        for row in rows or []:
            if not isinstance(row, dict):
                continue
            try:
                by_index[int(row.get("index"))] = row
            except (TypeError, ValueError):
                continue
        fallback = fallback_jd_split_assessment(job)
        result = []
        for idx, item in enumerate(items):
            row = by_index.get(idx) or {}
            try:
                stars = int(row.get("stars") or fallback[idx]["stars"])
            except (TypeError, ValueError):
                stars = fallback[idx]["stars"]
            stars = max(1, min(3, stars))
            result.append({
                **item,
                "stars": stars,
                "score": harvest_star_to_score(stars),
                "label": clean_text(row.get("label")) or ("达到" if stars == 3 else "达到一部分" if stars == 2 else "未达到"),
                "reason": clean_text(row.get("reason")) or fallback[idx]["reason"],
                "evidence": clean_text(row.get("evidence")) or fallback[idx]["evidence"],
                "assessmentSource": "llm" if row else fallback[idx].get("assessmentSource", "tag_fallback"),
            })
        return result
    except Exception as exc:
        logger.warning("[Harvest] JD split LLM fallback job=%s error=%s", job.get("id") or job.get("stableId"), brief_llm_error(exc))
        return fallback_jd_split_assessment(job)


async def run_match_harvest(req: MatchHarvestRequest) -> Dict[str, Any]:
    start_time = time.time()
    degradations = []
    stu_parsed = parse_student_tags(req.studentProfile or {})
    
    # 1. 评估竞争力
    try:
        competitiveness = await run_gold_assessment(stu_parsed)
        if competitiveness.get("source") == "deterministic_fallback":
            degradations.append({
                "component": "gold_assessment",
                "reason": "LLM competitiveness assessment fallback",
                "impact": "置信度系数退化为基于确定性规则评估"
            })
    except Exception as exc:
        logger.warning("[Harvest] Gold assessment failed: %s", exc)
        competitiveness = deterministic_competitiveness(stu_parsed)
        degradations.append({
            "component": "gold_assessment",
            "reason": f"Gold assessment error: {str(exc)}",
            "impact": "置信度系数退化为基于确定性规则评估"
        })

    coefficient = float(competitiveness.get("confidence_coefficient") or competitiveness.get("gold_weight_k") or 0.5)
    coefficient = max(0.5, min(1.0, coefficient))
    llm_config = resolve_match_text_model_config(req.config)
    jobs = [dict(job) for job in (req.jobs or []) if isinstance(job, dict)]
    
    # 2. 评估 JD 细项
    assessments = await asyncio.gather(*[
        evaluate_jd_split_with_llm(job, req.studentProfile or {}, llm_config)
        for job in jobs
    ]) if jobs else []

    any_fallback = False
    for jd_items in assessments:
        if any(item.get("assessmentSource") == "tag_fallback" for item in jd_items):
            any_fallback = True
            break
    if any_fallback:
        degradations.append({
            "component": "jd_split_assessment",
            "reason": "大模型评估不可用或部分解析失败",
            "impact": "使用标签匹配分数推断星级（粗粒度评估）"
        })

    rankings: list[Dict[str, Any]] = []
    for index, job in enumerate(jobs):
        match_score = get_match_score(job)
        jd_items = assessments[index] if index < len(assessments) else []
        jd_star_score, jd_star_score_source = compute_jd_star_score(jd_items, match_score)
        pre_confidence_score = round(
            clamp_score(
                jd_star_score * HARVEST_JD_STAR_WEIGHT
                + match_score * HARVEST_TAG_MATCH_WEIGHT
            ),
            2,
        )
        report_score = round(clamp_score(pre_confidence_score * coefficient), 2)
        star_counts = {
            "three": sum(1 for item in jd_items if int(item.get("stars") or 0) == 3),
            "two": sum(1 for item in jd_items if int(item.get("stars") or 0) == 2),
            "one": sum(1 for item in jd_items if int(item.get("stars") or 0) == 1),
        }
        assessment_sources = {
            clean_text(item.get("assessmentSource") or "unknown")
            for item in jd_items
            if isinstance(item, dict)
        }
        assessment_source = (
            "llm"
            if assessment_sources == {"llm"}
            else "tag_fallback"
            if assessment_sources and assessment_sources.issubset({"tag_fallback"})
            else "mixed"
            if assessment_sources
            else "none"
        )
        rankings.append({
            "stableId": job.get("stableId") or job.get("id") or "",
            "id": job.get("id") or job.get("stableId") or "",
            "title": job.get("title") or "",
            "companyName": job.get("companyName") or "",
            "matchScore": round(match_score, 2),
            "tagMatchScore": round(match_score, 2),
            "jdStarScore": jd_star_score,
            "jdStarScoreSource": jd_star_score_source,
            "preConfidenceScore": pre_confidence_score,
            "confidenceCoefficient": round(coefficient, 3),
            "studentCompetitivenessScore": competitiveness.get("total_score"),
            "reportScore": report_score,
            "jdSplitAssessment": jd_items,
            "jdStarCounts": star_counts,
            "jdAssessmentSource": assessment_source,
            "scoreFormula": {
                "jdStarWeight": HARVEST_JD_STAR_WEIGHT,
                "tagMatchWeight": HARVEST_TAG_MATCH_WEIGHT,
                "jdStarScore": jd_star_score,
                "tagMatchScore": round(match_score, 2),
                "preConfidenceScore": pre_confidence_score,
                "confidenceCoefficient": round(coefficient, 3),
                "finalReportScore": report_score,
            },
        })
    rankings.sort(key=lambda item: item["reportScore"], reverse=True)
    for index, item in enumerate(rankings):
        item["rank"] = index + 1

    best = rankings[0] if rankings else None
    return {
        "ok": True,
        "source": "job-admin-harvest",
        "model": llm_config.get("model"),
        "studentCompetitiveness": competitiveness,
        "confidenceCoefficient": round(coefficient, 3),
        "rankings": rankings,
        "bestJobId": best.get("stableId") if best else None,
        "bestJobTitle": f"{best.get('title') or ''} @ {best.get('companyName') or ''}".strip(" @") if best else "",
        "overview": (
            "本次丰收仅评估岗位要求与加分项："
            f"最终报告分 = (逐条星级分 × {HARVEST_JD_STAR_WEIGHT:.1f} + 标签匹配分 × {HARVEST_TAG_MATCH_WEIGHT:.1f}) "
            f"× 置信度系数 {coefficient:.3f}。"
        ),
        "meta": {
            "degradation": degradations,
            "processing_time_ms": int((time.time() - start_time) * 1000)
        }
    }


async def run_match(req: MatchRequest) -> Dict[str, Any]:
    start_time = time.time()
    degradations = []
    results = await get_scored_candidates_for_student(req.studentProfile, degradations=degradations)
    scoring_seconds = time.time() - start_time

    student_direction = req.studentProfile.get("direction")
    bucket_size = req.top_k or DEFAULT_BUCKET_SIZE
    batch_offsets = dict(req.batch_offsets or {})

    lane_result = _build_lanes(results, student_direction, bucket_size, batch_offsets)
    lanes = lane_result["lanes"]

    total_seconds = time.time() - start_time
    logger.info("Match scoring done in %.2fs", total_seconds)

    return {
        "lanes": lanes,
        "has_more": lane_result["has_more"],
        "totals": lane_result["totals"],
        # 兼容旧字段
        "topJobs": bucket_match_results(results, bucket_size=bucket_size),
        "structured_report": None,
        "analysis": "",
        "analysisMeta": None,
        "timing": {
            "scoringSeconds": round(scoring_seconds, 3),
            "totalSeconds": round(total_seconds, 3),
        },
        "meta": {
            "degradation": degradations,
            "processing_time_ms": int((time.time() - start_time) * 1000)
        }
    }


async def run_match_insight(req: MatchRequest) -> Dict[str, Any]:
    """独立生成大模型深度分析报告，不阻塞岗位列表返回"""
    start_time = time.time()
    degradations = []
    results = await get_scored_candidates_for_student(req.studentProfile, degradations=degradations)
    
    student_direction = req.studentProfile.get("direction")
    bucket_size = req.top_k or DEFAULT_BUCKET_SIZE
    batch_offsets = dict(req.batch_offsets or {})

    lane_result = _build_lanes(results, student_direction, bucket_size, batch_offsets)
    lanes = lane_result["lanes"]

    # featured 是 dict，需要展平三子槽后送入 LLM
    featured_obj = lanes.get("featured", {})
    featured_all = (
        list(featured_obj.get("safety", []))
        + list(featured_obj.get("target", []))
        + list(featured_obj.get("reach", []))
    )
    slim_featured = [
        _slim_job(j)
        for j in featured_all
        if "Unqualified" not in j.get("tier", "") and "未达标" not in j.get("tier", "")
    ]

    jd_stars = _compute_jd_stars(slim_featured)
    analysis_meta: Dict[str, Any] = {
        "status": "skipped",
        "source": "",
        "model": "",
        "baseUrl": "",
        "error": "",
        "timeoutSeconds": match_llm_timeout_seconds(),
    }
    structured_report: Dict[str, Any] = {
        "jd_stars": jd_stars,
        "interview_advice": [],
        "tenure_growth": "",
        "future_path": "",
    }
    analysis = ""

    if slim_featured:
        llm_config = resolve_match_text_model_config(req.config)
        analysis_meta.update(
            {
                "source": llm_config["source"],
                "model": llm_config["model"],
                "baseUrl": llm_config["base_url"],
            }
        )
        timeout_seconds = analysis_meta["timeoutSeconds"]
        logger.info(
            "[MatchInsight] generating structured report source=%s model=%s jobs=%d",
            llm_config["source"],
            llm_config["model"],
            len(slim_featured),
        )
        structured_report, analysis_meta = await _generate_structured_report(
            slim_featured, jd_stars, llm_config, timeout_seconds
        )
        if analysis_meta.get("status") == "success":
            advice_lines = "\n".join(
                f"{i + 1}. {a}" for i, a in enumerate(structured_report.get("interview_advice", []))
            )
            analysis = (
                f"### 匹配复核报告\n\n"
                f"**面试建议（STAR 法则）**\n{advice_lines}\n\n"
                f"**入职成长路径**\n{structured_report.get('tenure_growth', '')}\n\n"
                f"**职业发展方向**\n{structured_report.get('future_path', '')}"
            )
        else:
            analysis = f"推荐报告生成失败（{analysis_meta.get('error', '')}）。下方匹配岗位与分数已正常生成。"
            degradations.append({
                "component": "match_insight_llm",
                "reason": analysis_meta.get("error") or "大模型接口调用失败",
                "impact": "无法生成匹配分析报告与面试建议"
            })
    else:
        analysis = "当前画像尚未通过这批岗位的技术要求与素质要求卡口。"

    return {
        "structured_report": structured_report,
        "analysis": analysis,
        "analysisMeta": analysis_meta,
        "timing": {
            "totalSeconds": round(time.time() - start_time, 3),
        },
        "meta": {
            "degradation": degradations,
            "processing_time_ms": int((time.time() - start_time) * 1000)
        }
    }


async def run_debug_score(req: DebugScoreRequest) -> Dict[str, Any]:
    await ensure_jobs_fresh()
    if not state.jobs_metadata:
        raise HTTPException(status_code=500, detail="Backend data not loaded")

    jd = None
    if req.job_index is not None:
        if 0 <= req.job_index < len(state.jobs_metadata):
            jd = state.jobs_metadata[req.job_index]
    elif req.job_id:
        for job in state.jobs_metadata:
            if job.get("id") == req.job_id:
                jd = job
                break

    if not jd:
        raise HTTPException(status_code=404, detail="Job not found")

    stu_parsed = parse_student_tags(req.studentProfile)
    jd_tags = set()
    for item in iter_tech_stack_leaf_items(jd.get("techStack", [])):
        name = match_tech_stack_name(item)
        if name:
            jd_tags.add(name)
    for item in jd.get("devTools", []):
        name = match_dev_tool_name(item)
        if name:
            jd_tags.add(name)
    for src in [jd.get("softQuality", []), jd.get("growthPotential", [])]:
        for item in src:
            name = extract_item_name(item, fallback_raw=True)
            if name:
                jd_tags.add(name)
    for item in jd.get("techCapabilities", []):
        if clean_text(item.get("type")) == "soft_flag":
            continue
        name = match_tech_capability_name(item)
        if name:
            jd_tags.add(name)

    await embed_batch(stu_parsed["all_tags"] + list(jd_tags), label="DebugMatch")
    res = await score_one_job_detailed(jd, stu_parsed, state.tag_vectors_cache, state.global_tag_freq)
    return {"job": jd, "analysis": res}
