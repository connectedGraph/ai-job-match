import os
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


CAREER_PLANNER_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = CAREER_PLANNER_DIR.parent
DATASET_DIR = PROJECT_ROOT / "dataset"
DATA_DIR = DATASET_DIR / "career_planner"
LEGACY_DATA_DIR = CAREER_PLANNER_DIR / "data"
DB_PATH = DATA_DIR / "career_planner.sqlite3"
LEGACY_DB_PATH = LEGACY_DATA_DIR / "career_planner.sqlite3"


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file(PROJECT_ROOT / ".env")
_load_env_file(CAREER_PLANNER_DIR / ".env")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _first_env(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return default


def _required_first_env(*names: str) -> str:
    value = _first_env(*names, default="")
    if value:
        return value
    joined_names = " / ".join(names)
    raise RuntimeError(f"Missing required environment variable: {joined_names}")


def _required_first_env_int(*names: str) -> int:
    raw_value = _required_first_env(*names)
    try:
        return int(raw_value)
    except (TypeError, ValueError) as exc:
        joined_names = " / ".join(names)
        raise RuntimeError(f"Invalid integer value for {joined_names}: {raw_value}") from exc


def _required_first_env_float(*names: str) -> float:
    raw_value = _required_first_env(*names)
    try:
        return float(raw_value)
    except (TypeError, ValueError) as exc:
        joined_names = " / ".join(names)
        raise RuntimeError(f"Invalid float value for {joined_names}: {raw_value}") from exc


def _prefixed_env_names(prefix: str, field: str, legacy_prefixes: Sequence[str] = ()) -> tuple[str, ...]:
    names = [f"{prefix}_{field}"]
    names.extend(f"{legacy}_{field}" for legacy in legacy_prefixes)
    return tuple(names)


def normalize_base_url(base_url: str) -> str:
    value = (base_url or "").strip().rstrip("/")
    if not value:
        return ""
    if value.endswith("/v1"):
        return value
    return f"{value}/v1"


@dataclass(frozen=True)
class LLMConfig:
    base_url: str
    api_key: str
    model: str
    temperature: float
    max_tokens: int
    timeout_seconds: int


def _load_openai_compatible_config(prefix: str, legacy_prefixes: Sequence[str] = ()) -> LLMConfig:
    return LLMConfig(
        base_url=normalize_base_url(
            _required_first_env(*_prefixed_env_names(prefix, "BASE_URL", legacy_prefixes))
        ),
        api_key=_first_env(*_prefixed_env_names(prefix, "API_KEY", legacy_prefixes), default=""),
        model=_required_first_env(*_prefixed_env_names(prefix, "MODEL", legacy_prefixes)),
        temperature=_required_first_env_float(*_prefixed_env_names(prefix, "TEMPERATURE", legacy_prefixes)),
        max_tokens=_required_first_env_int(*_prefixed_env_names(prefix, "MAX_TOKENS", legacy_prefixes)),
        timeout_seconds=_required_first_env_int(*_prefixed_env_names(prefix, "TIMEOUT_SECONDS", legacy_prefixes)),
    )


_LEGACY_LLM_PREFIXES = ("CAREER_PLANNER_LLM", "JOB_SYSTEM_TEXT", "OPENAI")


def load_resume_llm_config() -> LLMConfig:
    return _load_openai_compatible_config("CAREER_PLANNER_RESUME_LLM", _LEGACY_LLM_PREFIXES)


def load_ai_llm_config() -> LLMConfig:
    return _load_openai_compatible_config("CAREER_PLANNER_AI_LLM", _LEGACY_LLM_PREFIXES)


def load_llm_config() -> LLMConfig:
    return load_ai_llm_config()


JWT_SECRET = _required_first_env("CAREER_PLANNER_JWT_SECRET", "JWT_SECRET")

JWT_EXPIRE_MINUTES = _env_int("CAREER_PLANNER_JWT_EXPIRE_MINUTES", 60 * 24 * 7)
