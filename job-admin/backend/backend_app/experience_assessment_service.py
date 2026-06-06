import asyncio
import json
import random
from typing import Any, Dict, List

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from .config import logger
from .model_config import load_text_model_config


EXPERIENCE_WEIGHTS = {
    "internship": 0.35,
    "projects": 0.25,
    "competition": 0.15,
    "research": 0.12,
    "campus": 0.08,
    "learning": 0.05,
}


def get_random_score(score_range: tuple) -> float:
    return round(random.uniform(score_range[0], score_range[1]), 1)


def redistribute_weights(active_categories: List[str]) -> Dict[str, float]:
    """Redistribute weights of missing categories proportionally."""
    if not active_categories:
        return {}

    base_weights = {cat: EXPERIENCE_WEIGHTS[cat] for cat in active_categories}
    total_active_weight = sum(base_weights.values())

    if total_active_weight == 0:
        return {cat: 1.0 / len(active_categories) for cat in active_categories}

    return {cat: weight / total_active_weight for cat, weight in base_weights.items()}


def calculate_diminishing_returns(scores: List[float]) -> float:
    """Apply 60/25/15 rule for multiple items in same category."""
    if not scores:
        return 0.0

    sorted_scores = sorted(scores, reverse=True)
    s1 = sorted_scores[0]
    s2 = sorted_scores[1] if len(sorted_scores) > 1 else 0.0
    if len(sorted_scores) > 2:
        s3 = sum(sorted_scores[2:]) / len(sorted_scores[2:])
    else:
        s3 = 0.0

    if len(sorted_scores) == 1:
        return s1
    if len(sorted_scores) == 2:
        return (s1 * 0.7) + (s2 * 0.3)
    return (s1 * 0.60) + (s2 * 0.25) + (s3 * 0.15)


def _build_text_llm(temperature: float = 0.0) -> ChatOpenAI:
    base_cfg = load_text_model_config()
    return ChatOpenAI(
        model=base_cfg.model,
        api_key=base_cfg.api_key,
        base_url=base_cfg.base_url,
        temperature=temperature,
        max_retries=0,
    )


def _fallback_scores(count: int, default_score: float = 50.0) -> List[float]:
    return [default_score] * count


async def evaluate_category_llm(category: str, items: List[Dict], student_direction: str) -> List[float]:
    """Evaluate a list of items in a category using one LLM batch."""
    if not items:
        return []

    prompts = {
        "internship": "Score internships by company signal, role fit, work depth, duration, and tech coverage.",
        "projects": "Score projects by scope, ownership, technical complexity, stack coverage, and direction fit.",
        "competition": "Score competitions by contest level, award level, and direction relevance.",
        "research": "Score research by lab quality, direction fit, ownership depth, and outputs.",
        "campus": "Score campus experience by organization level, role ownership, responsibility quality, and duration.",
        "learning": "Score learning experience by maturity, relevance, and resource quality.",
    }

    system_prompt = (
        "You evaluate student experience items for campus recruiting. "
        f"{prompts.get(category, 'Score the experience items holistically.')} "
        f"Target direction: {student_direction}. "
        "Return a pure JSON array with the same item count as the input. "
        "Each element must be shaped like {{\"score\": 0-10, \"reason\": \"short rationale\"}}. "
        "Do not return markdown."
    )

    try:
        llm = _build_text_llm(temperature=0.0)
        prompt_tmpl = ChatPromptTemplate.from_messages(
            [
                ("system", system_prompt),
                ("user", "{payload}"),
            ]
        )
        chain = prompt_tmpl | llm | StrOutputParser()
        raw_res = await chain.ainvoke({"payload": json.dumps(items, ensure_ascii=False)})

        start = raw_res.find("[")
        end = raw_res.rfind("]") + 1
        if start < 0 or end <= start:
            return _fallback_scores(len(items))

        parsed = json.loads(raw_res[start:end])
        if not isinstance(parsed, list):
            return _fallback_scores(len(items))

        scores: List[float] = []
        for row in parsed[: len(items)]:
            if isinstance(row, dict):
                try:
                    scores.append(float(row.get("score", 5)) * 10)
                except (TypeError, ValueError):
                    scores.append(50.0)
            else:
                scores.append(50.0)

        if len(scores) < len(items):
            scores.extend(_fallback_scores(len(items) - len(scores)))
        return scores
    except Exception as e:
        logger.error(f"[ExpAssessment] LLM failed for {category}: {e}")
        return _fallback_scores(len(items))


async def evaluate_synergy_llm(experiences: Dict[str, List[Dict]]) -> float:
    """Evaluate synergy bonus (0-10 pts)."""
    system_prompt = (
        "Evaluate whether the student's experiences form a coherent growth path. "
        "Return pure JSON shaped like {{\"bonus\": 0-10, \"reason\": \"short rationale\"}}. "
        "Do not return markdown."
    )

    try:
        llm = _build_text_llm(temperature=0.0)
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", system_prompt),
                ("user", "{payload}"),
            ]
        )
        chain = prompt | llm | StrOutputParser()
        raw_res = await chain.ainvoke({"payload": json.dumps(experiences, ensure_ascii=False)})

        start = raw_res.find("{")
        end = raw_res.rfind("}") + 1
        if start < 0 or end <= start:
            return 0.0

        parsed = json.loads(raw_res[start:end])
        return float(parsed.get("bonus", 0) or 0)
    except Exception as e:
        logger.error(f"[ExpAssessment] Synergy LLM failed: {e}")
        return 0.0


async def run_experience_assessment(experiences: Dict[str, List[Dict]], direction: str) -> Dict[str, Any]:
    """Full experience gold value evaluation."""
    categories = ["internship", "projects", "competition", "research", "campus", "learning"]

    active_categories = [cat for cat in categories if experiences.get(cat)]
    weights = redistribute_weights(active_categories)

    tasks = [evaluate_category_llm(cat, experiences[cat], direction) for cat in active_categories]
    all_scores = await asyncio.gather(*tasks)

    category_results: Dict[str, Dict[str, Any]] = {}
    total_score = 0.0

    for index, cat in enumerate(active_categories):
        scores = all_scores[index]
        final_cat_score = calculate_diminishing_returns(scores)
        category_results[cat] = {
            "score": round(final_cat_score, 1),
            "weight": round(weights[cat], 2),
            "count": len(scores),
        }
        total_score += final_cat_score * weights[cat]

    synergy_bonus = await evaluate_synergy_llm(experiences)
    final_score = min(100, total_score + synergy_bonus)

    return {
        "final_score": round(final_score, 2),
        "synergy_bonus": synergy_bonus,
        "category_breakdown": category_results,
    }
