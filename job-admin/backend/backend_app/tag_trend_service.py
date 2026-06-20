from __future__ import annotations
from typing import Any, Dict, List, Optional

from .tag_center_service import load_tag_center_rows, tag_center_public_row, TAG_CENTER_TYPES

# TODO(time-series): simulate_sparkline() generates deterministic data from jobCount.
# Replace with real weekly snapshots from tag_weekly_stats table when available.

_SCALE_FACTORS: Dict[str, List[float]] = {
    "rising":        [0.60, 0.68, 0.76, 0.85, 0.93, 1.00],
    "stable_growth": [0.78, 0.82, 0.86, 0.90, 0.95, 1.00],
    "stable":        [0.95, 0.97, 0.99, 1.00, 1.00, 1.00],
    "declining":     [1.00, 0.90, 0.78, 0.65, 0.55, 0.45],
    "cold":          [0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
}

_TREND_LABELS = {
    "rising": "Rising",
    "stable_growth": "Stable Growth",
    "stable": "Stable",
    "declining": "Declining",
    "cold": "Cold",
}


def compute_trend_type(job_count: int, job_ratio: float) -> str:
    if job_count <= 1:
        return "cold"
    if job_ratio > 0.6 and job_count > 20:
        return "rising"
    if job_ratio > 0.3:
        return "stable_growth"
    if job_ratio < 0.1 and job_count < 5:
        return "declining"
    return "stable"


def simulate_sparkline(job_count: int, trend_type: str) -> List[int]:
    factors = _SCALE_FACTORS.get(trend_type, _SCALE_FACTORS["stable"])
    base = max(job_count, 1)
    return [round(base * f) for f in factors]


def enrich_tag(row: Dict[str, Any]) -> Dict[str, Any]:
    public = tag_center_public_row(row)
    job_count = public["jobCount"]
    job_ratio = public["jobRatio"]
    trend_type = compute_trend_type(job_count, job_ratio)
    weekly_data = simulate_sparkline(job_count, trend_type)
    w1, w6 = weekly_data[0], weekly_data[-1]
    growth_rate = round((w6 - w1) / max(w1, 1), 2)
    public["trend_type"] = trend_type
    public["trend_label"] = _TREND_LABELS[trend_type]
    public["weekly_data"] = weekly_data
    public["growth_rate"] = growth_rate
    return public


def get_hot_tags(limit: int = 20) -> List[Dict[str, Any]]:
    rows = load_tag_center_rows()
    enriched = [
        enrich_tag(row)
        for row in rows
        if row.get("tagType") in TAG_CENTER_TYPES
    ]
    enriched.sort(key=lambda t: t["jobRatio"], reverse=True)
    return enriched[:limit]


def get_tag_trend_detail(tag_id: str) -> Optional[Dict[str, Any]]:
    rows = load_tag_center_rows()
    for row in rows:
        if row.get("tagId") == tag_id:
            return enrich_tag(row)
    return None
