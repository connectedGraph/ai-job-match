from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Tuple

import httpx
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from .config import logger
from .model_config import load_flagship_llm_config, normalize_openai_base_url, LLMConfigResolver
from shared.llm_resilience import call_llm_with_resilience, parse_llm_json
from .utils import clean_text as normalize_text, clamp


INSTITUTION_LEVEL_MAP = {
    "S+": {"range": (24, 25), "label": "C9 联盟 / 顶尖高校"},
    "S": {"range": (21, 23), "label": "985 高校"},
    "A": {"range": (17, 20), "label": "211 高校"},
    "B": {"range": (13, 16), "label": "双一流高校"},
    "C": {"range": (8, 12), "label": "普通本科"},
    "D": {"range": (4, 7), "label": "其他 / 未知"},
}

DEGREE_LEVEL_MAP = {
    "博士": {"range": (23, 25)},
    "硕士": {"range": (18, 22)},
    "本科": {"range": (12, 17)},
    "学士": {"range": (12, 17)},
    "大专": {"range": (6, 11)},
}

MAJOR_RELEVANCE_MAP = {
    "strong": {"range": (20, 25), "label": "强相关"},
    "medium": {"range": (13, 19), "label": "中等相关"},
    "weak": {"range": (5, 12), "label": "弱相关"},
}

FRESHNESS_LEVEL_MAP = {
    "new_grad": {"range": (22, 25), "label": "应届或毕业 1 年内"},
    "recent": {"range": (16, 21), "label": "毕业 1-2 年"},
    "mid": {"range": (10, 15), "label": "毕业 2-4 年"},
    "senior": {"range": (5, 9), "label": "毕业 4 年以上或未知"},
}

INSTITUTION_PRIORITY = [
    ("C9", "S+"),
    ("985", "S"),
    ("211", "A"),
    ("双一流", "B"),
    ("一本", "C"),
    ("普通本科", "C"),
    ("二本", "C"),
]

SCHOOL_TAG_KEYWORDS = {
    "清华大学": ["C9", "985", "211", "双一流"],
    "北京大学": ["C9", "985", "211", "双一流"],
    "复旦大学": ["C9", "985", "211", "双一流"],
    "上海交通大学": ["C9", "985", "211", "双一流"],
    "浙江大学": ["C9", "985", "211", "双一流"],
    "南京大学": ["C9", "985", "211", "双一流"],
    "中国科学技术大学": ["C9", "985", "211", "双一流"],
    "哈尔滨工业大学": ["C9", "985", "211", "双一流"],
    "西安交通大学": ["C9", "985", "211", "双一流"],
    "中国人民大学": ["985", "211", "双一流"],
    "北京航空航天大学": ["985", "211", "双一流"],
    "同济大学": ["985", "211", "双一流"],
    "武汉大学": ["985", "211", "双一流"],
    "中山大学": ["985", "211", "双一流"],
    "深圳大学": [],
}

STRONG_MAJOR_KEYWORDS = [
    "计算机",
    "软件",
    "网络工程",
    "信息安全",
    "人工智能",
    "数据科学",
    "大数据",
    "电子信息",
    "通信工程",
]

MEDIUM_MAJOR_KEYWORDS = [
    "自动化",
    "数学",
    "统计",
    "电子",
    "信息工程",
    "机械",
    "工业工程",
    "物联网",
]

TECH_KEYWORDS = [
    "java",
    "python",
    "go",
    "c++",
    "c#",
    "javascript",
    "typescript",
    "react",
    "vue",
    "spring",
    "mysql",
    "redis",
    "docker",
    "k8s",
    "kubernetes",
    "算法",
    "后端",
    "前端",
    "测试",
    "数据",
]

BIG_COMPANY_KEYWORDS = [
    "腾讯",
    "阿里",
    "字节",
    "网易",
    "百度",
    "华为",
    "美团",
    "京东",
    "小米",
]


GRADE_RANGES = [
    ("S", 90, "顶尖竞争力"),
    ("A", 80, "强竞争力"),
    ("B", 65, "中上竞争力"),
    ("C", 50, "基础竞争力"),
    ("D", 0, "竞争力偏弱"),
]


def midpoint(score_range: Tuple[float, float]) -> float:
    return round((score_range[0] + score_range[1]) / 2.0, 1)





def grade_for_score(score: float, max_score: float = 100.0) -> str:
    normalized = (float(score or 0) / max_score) * 100.0
    for grade, threshold, _label in GRADE_RANGES:
        if normalized >= threshold:
            return grade
    return "D"


def label_for_grade(grade: str) -> str:
    for item_grade, _threshold, label in GRADE_RANGES:
        if item_grade == grade:
            return label
    return "竞争力待补充"


def competitiveness_coefficient(score: float) -> float:
    return round(0.5 + (clamp(float(score or 0), 0.0, 100.0) / 200.0), 3)


def resolve_competitiveness_llm_config() -> Dict[str, Any]:
    return LLMConfigResolver.resolve("competitiveness")





def join_item_text(item: Any) -> str:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        parts: List[str] = []
        for value in item.values():
            if isinstance(value, (str, int, float)):
                parts.append(str(value))
            elif isinstance(value, list):
                parts.extend(str(entry) for entry in value if isinstance(entry, (str, int, float)))
        return " ".join(parts)
    return ""


def infer_school_tags(school_name: str, school_tags: List[str]) -> List[str]:
    cleaned_tags = [normalize_text(tag) for tag in school_tags if normalize_text(tag)]
    if cleaned_tags:
        return cleaned_tags

    cleaned_name = normalize_text(school_name)
    if not cleaned_name:
        return []

    for keyword, inferred_tags in SCHOOL_TAG_KEYWORDS.items():
        if keyword in cleaned_name:
            return inferred_tags
    return []


def get_institution_score(tags: List[str]) -> Dict[str, Any]:
    tags_set = set(tags or [])
    level = "D"
    primary_tag = "其他"
    for tag, mapped_level in INSTITUTION_PRIORITY:
        if tag in tags_set:
            level = mapped_level
            primary_tag = tag
            break

    config = INSTITUTION_LEVEL_MAP[level]
    return {
        "level": level,
        "score": midpoint(config["range"]),
        "label": config["label"],
        "primary_tag": primary_tag,
        "tags": list(tags_set),
        "note": "使用本地学校标签规则估计院校层级",
    }


def get_degree_score(education_level: str) -> Dict[str, Any]:
    level = normalize_text(education_level) or "本科"
    config = DEGREE_LEVEL_MAP.get(level, DEGREE_LEVEL_MAP["本科"])
    return {
        "level": level,
        "score": midpoint(config["range"]),
    }


def get_graduation_freshness_score(year: Any, month: Any = None) -> Dict[str, Any]:
    if year is None:
        config = FRESHNESS_LEVEL_MAP["senior"]
        return {
            "level": "senior",
            "score": midpoint(config["range"]),
            "label": config["label"],
            "months_from_grad": None,
        }

    try:
        grad_year = int(year)
        grad_month = int(month) if month else 6
    except (TypeError, ValueError):
        config = FRESHNESS_LEVEL_MAP["senior"]
        return {
            "level": "senior",
            "score": midpoint(config["range"]),
            "label": config["label"],
            "months_from_grad": None,
        }

    now = datetime.now()
    diff_months = (now.year - grad_year) * 12 + (now.month - grad_month)

    if diff_months <= 12:
        level = "new_grad"
    elif diff_months <= 24:
        level = "recent"
    elif diff_months <= 48:
        level = "mid"
    else:
        level = "senior"

    config = FRESHNESS_LEVEL_MAP[level]
    return {
        "level": level,
        "score": midpoint(config["range"]),
        "label": config["label"],
        "months_from_grad": diff_months,
    }


def evaluate_major_relevance(major: str, direction: str, domains: List[str]) -> Dict[str, Any]:
    major_text = normalize_text(major).lower()
    direction_text = normalize_text(direction).lower()
    domain_text = " ".join(normalize_text(domain).lower() for domain in domains)
    combined_text = f"{major_text} {direction_text} {domain_text}"

    level = "weak"
    reason = "专业与目标方向关键词重合较少"

    if any(keyword in major_text for keyword in STRONG_MAJOR_KEYWORDS):
        level = "strong"
        reason = "专业与技术岗位直接相关"
    elif any(keyword in major_text for keyword in MEDIUM_MAJOR_KEYWORDS):
        level = "medium"
        reason = "专业属于技术岗位常见的相邻学科"
    elif "开发" in direction_text and any(keyword in combined_text for keyword in ["算法", "数据", "信息"]):
        level = "medium"
        reason = "专业与目标方向存在一定技术交叉"

    config = MAJOR_RELEVANCE_MAP[level]
    return {
        "level": config["label"],
        "score": midpoint(config["range"]),
        "reason": reason,
    }


def category_base_score(category: str) -> float:
    return {
        "internship": 66.0,
        "projects": 60.0,
        "competition": 56.0,
        "research": 58.0,
        "campus": 48.0,
        "learning": 46.0,
    }.get(category, 50.0)


def score_experience_item(category: str, item: Dict[str, Any]) -> float:
    text = join_item_text(item)
    lowered = text.lower()
    score = category_base_score(category)

    if len(text) >= 40:
        score += 6
    if len(text) >= 100:
        score += 6
    if len(text) >= 180:
        score += 4

    if any(keyword in lowered for keyword in TECH_KEYWORDS):
        score += 6

    if category == "internship" and any(keyword in text for keyword in BIG_COMPANY_KEYWORDS):
        score += 8
    if category == "competition" and any(keyword in text for keyword in ["国", "省", "金奖", "银奖", "一等奖", "二等奖"]):
        score += 8
    if category == "research" and any(keyword in text for keyword in ["论文", "实验室", "专利", "发表"]):
        score += 8
    if category == "campus" and any(keyword in text for keyword in ["负责人", "部长", "主席", "组织"]):
        score += 6
    if category == "learning" and any(keyword in text for keyword in ["项目", "课程", "证书", "实战"]):
        score += 6

    return round(clamp(score, 35.0, 95.0), 1)


def calculate_diminishing_returns(scores: List[float]) -> float:
    if not scores:
        return 0.0

    sorted_scores = sorted(scores, reverse=True)
    s1 = sorted_scores[0]
    s2 = sorted_scores[1] if len(sorted_scores) > 1 else 0.0
    s3 = sum(sorted_scores[2:]) / len(sorted_scores[2:]) if len(sorted_scores) > 2 else 0.0

    if len(sorted_scores) == 1:
        return s1
    if len(sorted_scores) == 2:
        return (s1 * 0.7) + (s2 * 0.3)
    return (s1 * 0.60) + (s2 * 0.25) + (s3 * 0.15)


def redistribute_weights(active_categories: List[str]) -> Dict[str, float]:
    base_weights = {
        "internship": 0.35,
        "projects": 0.25,
        "competition": 0.15,
        "research": 0.12,
        "campus": 0.08,
        "learning": 0.05,
    }
    if not active_categories:
        return {}

    active_weight = sum(base_weights[cat] for cat in active_categories)
    if active_weight <= 0:
        return {cat: 1.0 / len(active_categories) for cat in active_categories}
    return {cat: base_weights[cat] / active_weight for cat in active_categories}


def compute_synergy_bonus(experiences: Dict[str, List[Dict[str, Any]]]) -> float:
    active_categories = [category for category, items in experiences.items() if items]
    bonus = 0.0

    if len(active_categories) >= 2:
        bonus += 2.0
    if len(active_categories) >= 3:
        bonus += 2.0
    if experiences.get("learning") and experiences.get("projects"):
        bonus += 2.0
    if experiences.get("projects") and experiences.get("internship"):
        bonus += 2.0
    if experiences.get("competition") and experiences.get("internship"):
        bonus += 1.0
    if experiences.get("research") and experiences.get("projects"):
        bonus += 1.0

    all_text = " ".join(join_item_text(item).lower() for items in experiences.values() for item in items)
    repeated_tech_hits = sum(1 for keyword in TECH_KEYWORDS if keyword in all_text)
    if repeated_tech_hits >= 3:
        bonus += 1.0
    if repeated_tech_hits >= 5:
        bonus += 1.0

    return round(clamp(bonus, 0.0, 10.0), 1)


def run_experience_assessment(experiences: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    categories = ["internship", "projects", "competition", "research", "campus", "learning"]
    active_categories = [cat for cat in categories if experiences.get(cat)]
    weights = redistribute_weights(active_categories)

    category_breakdown: Dict[str, Dict[str, Any]] = {}
    total_score = 0.0

    for category in active_categories:
        item_scores = [score_experience_item(category, item) for item in experiences[category]]
        final_score = calculate_diminishing_returns(item_scores)
        category_breakdown[category] = {
            "score": round(final_score, 1),
            "weight": round(weights[category], 2),
            "count": len(item_scores),
        }
        total_score += final_score * weights[category]

    synergy_bonus = compute_synergy_bonus(experiences)
    return {
        "final_score": round(clamp(total_score + synergy_bonus, 0.0, 100.0), 2),
        "synergy_bonus": synergy_bonus,
        "category_breakdown": category_breakdown,
    }


def deterministic_competitiveness(student_info: Dict[str, Any]) -> Dict[str, Any]:
    school_name = normalize_text(student_info.get("school_name"))
    school_tags = infer_school_tags(school_name, student_info.get("school_tags", []))

    institution_info = get_institution_score(school_tags)
    degree_info = get_degree_score(normalize_text(student_info.get("education_level")))
    major_info = evaluate_major_relevance(
        normalize_text(student_info.get("school_major")),
        normalize_text(student_info.get("direction")),
        student_info.get("tech_domains", []),
    )
    freshness_info = get_graduation_freshness_score(
        student_info.get("graduation_year"),
        student_info.get("graduation_month"),
    )
    education_raw_100 = round(
        institution_info["score"]
        + degree_info["score"]
        + major_info["score"]
        + freshness_info["score"],
        2,
    )
    education_score = round(clamp(education_raw_100 / 2.0, 0.0, 50.0), 2)

    experience_info = run_experience_assessment(student_info.get("experiences", {}) or {})
    experience_raw_100 = experience_info["final_score"]
    experience_score = round(clamp(experience_raw_100 / 2.0, 0.0, 50.0), 2)
    total_score = round(clamp(education_score + experience_score, 0.0, 100.0), 2)

    return {
        "total_score": total_score,
        "competitiveness_score": total_score,
        "confidence_coefficient": competitiveness_coefficient(total_score),
        "gold_weight_k": competitiveness_coefficient(total_score),
        "grade": grade_for_score(total_score, 100.0),
        "grade_label": label_for_grade(grade_for_score(total_score, 100.0)),
        "source": "deterministic_fallback",
        "summary": "使用本地规则按学历竞争力与经历竞争力估算。",
        "dimensions": {
            "education": {
                "total": education_score,
                "raw100": education_raw_100,
                "grade": grade_for_score(education_score, 50.0),
                "breakdown": {
                    "institution": institution_info,
                    "degree": degree_info,
                    "major": major_info,
                    "freshness": freshness_info,
                },
            },
            "experience": {
                "total": experience_score,
                "raw100": round(experience_raw_100, 2),
                "grade": grade_for_score(experience_score, 50.0),
                "breakdown": experience_info["category_breakdown"],
                "synergy_bonus": experience_info["synergy_bonus"],
            },
        },
    }


def extract_json_object(raw: str) -> Dict[str, Any]:
    parsed = parse_llm_json(raw)
    if not isinstance(parsed, dict):
        raise ValueError("model JSON is not an object")
    return parsed


def normalize_llm_message_content(raw: Any) -> str:
    if isinstance(raw, list):
        parts: List[str] = []
        for item in raw:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if text:
                    parts.append(str(text))
        return "\n".join(parts).strip()
    return str(raw or "").strip()


async def call_competitiveness_llm_raw(config: Dict[str, Any], messages: List[Dict[str, Any]]) -> str:
    endpoint = f"{normalize_text(config.get('base_url')).rstrip('/')}/chat/completions"
    if not endpoint.startswith("http"):
        raise ValueError("competitiveness LLM base_url is not configured")
    body = {
        "model": config["model"],
        "temperature": config["temperature"],
        "max_tokens": config["max_tokens"],
        "messages": messages,
    }

    async def _do_call():
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {config['api_key']}",
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
            label="Competitiveness LLM Raw",
            max_attempts=3,
        )
    except Exception as exc:
        raise RuntimeError(f"competitiveness LLM failed: {str(exc)}") from exc


async def evaluate_competitiveness_llm(student_info: Dict[str, Any], fallback: Dict[str, Any]) -> Dict[str, Any]:
    config = resolve_competitiveness_llm_config()
    if not config["base_url"] or not config["api_key"] or not config["model"]:
        return fallback

    system_prompt = (
        "你是校园招聘竞争力评估专家。请只输出 JSON，不要 markdown。\n"
        "任务：评估学生背景竞争力，不评估具体岗位匹配。\n"
        "总分 100 = 学历竞争力 0-50 + 经历竞争力 0-50。\n"
        "学历竞争力关注院校层次、学历层级、专业相关度、毕业新鲜度。\n"
        "经历竞争力关注大厂/头部机构实习、顶尖高校实验室/科研、竞赛级别、项目复杂度、成果影响力。\n"
        "请给 education.score、experience.score、total_score、S/A/B/C/D 等级和简短理由。\n"
        "S=顶尖，A=强，B=中上，C=基础，D=弱。\n"
        "输出格式："
        "{{\"education\":{{\"score\":0-50,\"grade\":\"S|A|B|C|D\",\"reason\":\"...\"}},"
        "\"experience\":{{\"score\":0-50,\"grade\":\"S|A|B|C|D\",\"reason\":\"...\"}},"
        "\"total_score\":0-100,\"grade\":\"S|A|B|C|D\",\"summary\":\"...\"}}"
    )
    try:
        raw = await call_competitiveness_llm_raw(
            config,
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(student_info, ensure_ascii=False)},
            ],
        )
        parsed = extract_json_object(raw)
        edu = parsed.get("education") or {}
        exp = parsed.get("experience") or {}
        edu_score = round(clamp(float(edu.get("score", fallback["dimensions"]["education"]["total"])), 0.0, 50.0), 2)
        exp_score = round(clamp(float(exp.get("score", fallback["dimensions"]["experience"]["total"])), 0.0, 50.0), 2)
        total_score = round(clamp(float(parsed.get("total_score", edu_score + exp_score)), 0.0, 100.0), 2)
        grade = normalize_text(parsed.get("grade")) or grade_for_score(total_score, 100.0)
        return {
            **fallback,
            "total_score": total_score,
            "competitiveness_score": total_score,
            "confidence_coefficient": competitiveness_coefficient(total_score),
            "gold_weight_k": competitiveness_coefficient(total_score),
            "grade": grade,
            "grade_label": label_for_grade(grade),
            "source": "llm",
            "model": config["model"],
            "summary": normalize_text(parsed.get("summary")) or fallback.get("summary"),
            "dimensions": {
                "education": {
                    **fallback["dimensions"]["education"],
                    "total": edu_score,
                    "grade": normalize_text(edu.get("grade")) or grade_for_score(edu_score, 50.0),
                    "reason": normalize_text(edu.get("reason")),
                },
                "experience": {
                    **fallback["dimensions"]["experience"],
                    "total": exp_score,
                    "grade": normalize_text(exp.get("grade")) or grade_for_score(exp_score, 50.0),
                    "reason": normalize_text(exp.get("reason")),
                },
            },
        }
    except Exception as exc:
        logger.warning("[GoldAssessment] LLM competitiveness fallback: %s", str(exc)[:200])
        return fallback


async def run_gold_assessment(student_info: Dict[str, Any]) -> Dict[str, Any]:
    fallback = deterministic_competitiveness(student_info)
    return await evaluate_competitiveness_llm(student_info, fallback)
