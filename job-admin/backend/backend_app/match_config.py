from copy import deepcopy
from typing import Any, Dict


# Precision coverage means semantic-normalized matching, not literal string equality.
STANDARD_SIMILARITY = 0.90
SIMILAR_SIMILARITY = 0.84

SIMILARITY_THRESHOLDS: Dict[str, Dict[str, float]] = {
    "tech_stack": {"standard": STANDARD_SIMILARITY, "similar": STANDARD_SIMILARITY},
    "tech_capability": {"standard": STANDARD_SIMILARITY, "similar": SIMILAR_SIMILARITY},
    "dev_tool": {"standard": STANDARD_SIMILARITY, "similar": STANDARD_SIMILARITY},
    "soft": {"standard": STANDARD_SIMILARITY, "similar": SIMILAR_SIMILARITY},
    "growth": {"standard": STANDARD_SIMILARITY, "similar": SIMILAR_SIMILARITY},
}

CATEGORY_SIMILAR_MATCH_ENABLED: Dict[str, bool] = {
    "tech_stack": False,
    "tech_capability": True,
    "dev_tool": False,
    "soft": True,
    "growth": True,
}

CATEGORY_ALIASES = {
    "tech": "tech_stack",
    "core": "tech_capability",
    "dev": "dev_tool",
}

RECALL_RULES: Dict[str, Dict[str, float]] = {
    # Recall prioritizes concrete hard tags; ranking weights still value capabilities more.
    "tech_stack": {"threshold": STANDARD_SIMILARITY, "points": 9},
    "tech_capability": {"threshold": SIMILAR_SIMILARITY, "points": 7},
    "dev_tool": {"threshold": STANDARD_SIMILARITY, "points": 4},
}

TECH_REQUIREMENT_WEIGHTS: Dict[str, float] = {
    "tech_stack": 7,
    "tech_capability": 9,
    "dev_tool": 4,
}

MATCH_SCORE_WEIGHTS: Dict[str, float] = {
    "tech": 90,
    "quality": 10,
}

COMPETITIVENESS_SCORE_WEIGHTS: Dict[str, float] = {
    "tech": 60,
    "quality": 10,
    "gold_profile": 15,
    "graduation_fit": 15,
}

EDUCATION_RANK = {
    "大专": 1,
    "本科": 2,
    "硕士": 3,
    "博士": 4,
}


DEFAULT_TIER_RULES: Dict[str, Dict[str, float]] = {
    "safety": {"score": 75.0, "exact": 0.40, "tech_cov": 0.70},
    "target": {"score": 65.0, "exact": 0.25, "tech_cov": 0.50},
    "reach": {"score": 55.0, "exact": 0.10, "tech_cov": 0.30},
}

COVERAGE_DENOMINATOR_CAPS: Dict[str, int] = {
    "tech_stack": 10,
    "tech_capability": 8,
    "dev_tool": 3,
}

LOW_FREQUENCY_TAG_THRESHOLD = 10
DEFAULT_RECALL_LIMIT = 50
DEFAULT_EXPANSION_LIMIT = 5
DEFAULT_BUCKET_SIZE = 20


def resolve_similarity_category(cat: str) -> str:
    return CATEGORY_ALIASES.get(cat, cat)


def get_similarity_thresholds(cat: str) -> Dict[str, float]:
    return SIMILARITY_THRESHOLDS[resolve_similarity_category(cat)]


def allows_similar_match(cat: str) -> bool:
    return CATEGORY_SIMILAR_MATCH_ENABLED.get(resolve_similarity_category(cat), True)


def get_tier_rules(tier_rules: Dict[str, Dict[str, float]] | None = None) -> Dict[str, Dict[str, float]]:
    if tier_rules is None:
        return deepcopy(DEFAULT_TIER_RULES)
    return deepcopy(tier_rules)


def evaluate_tier(
    total_score: float,
    ratio_exact: float,
    tech_cov: float,
    tier_rules: Dict[str, Dict[str, float]] | None = None,
) -> Dict[str, Any]:
    rules = get_tier_rules(tier_rules)
    tier = "未达标 (Unqualified)"

    safety = rules["safety"]
    target = rules["target"]
    reach = rules["reach"]

    if (
        total_score >= safety["score"]
        and ratio_exact >= safety["exact"]
        and tech_cov >= safety["tech_cov"]
    ):
        tier = "保守岗 (Safety)"
    elif (
        total_score >= target["score"]
        and ratio_exact >= target["exact"]
        and tech_cov >= target["tech_cov"]
    ):
        tier = "精准岗 (Target)"
    elif (
        total_score >= reach["score"]
        and ratio_exact >= reach["exact"]
        and tech_cov >= reach.get("tech_cov", 0.0)
    ):
        tier = "冲刺岗 (Reach)"

    return {
        "tier": tier,
        "tier_checks": {
            "safety": {
                "score_ok": total_score >= safety["score"],
                "exact_ok": ratio_exact >= safety["exact"],
                "tech_ok": tech_cov >= safety["tech_cov"],
                "required": safety,
            },
            "target": {
                "score_ok": total_score >= target["score"],
                "exact_ok": ratio_exact >= target["exact"],
                "tech_ok": tech_cov >= target["tech_cov"],
                "required": target,
            },
            "reach": {
                "score_ok": total_score >= reach["score"],
                "exact_ok": ratio_exact >= reach["exact"],
                "tech_ok": tech_cov >= reach.get("tech_cov", 0.0),
                "required": reach,
            },
        },
    }
