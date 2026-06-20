from datetime import datetime
from typing import Any

import numpy as np


def normalize(vector: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vector)
    return vector / norm if norm > 0 else vector


def clean_text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def parse_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def extract_item_name(item: Any, fallback_raw: bool = False) -> str:
    if isinstance(item, dict):
        name = clean_text(item.get("name"))
        if name:
            return name
        normalized_tag = clean_text(item.get("normalizedTag"))
        if normalized_tag:
            return normalized_tag
        skill = clean_text(item.get("skill"))
        if skill:
            return skill
        normalized_name = clean_text(item.get("normalizedName"))
        if normalized_name:
            return normalized_name
        if fallback_raw:
            return clean_text(item.get("rawExtractedText"))
    return clean_text(item)


def clamp(value: Any, lower: float = 0.0, upper: float = 100.0, fallback: float = 0.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = fallback
    return max(lower, min(upper, numeric))
