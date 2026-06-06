import os
from dataclasses import dataclass
from pathlib import Path


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


def _env_str(name: str, default: str = "") -> str:
    value = os.getenv(name, "")
    return value.strip() if value is not None else default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _required_env(name: str) -> str:
    value = _env_str(name)
    if value:
        return value
    raise RuntimeError(f"Missing required environment variable: {name}")


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


def _load_flagship_llm_config() -> LLMConfig:
    return LLMConfig(
        base_url=normalize_base_url(_env_str("JOB_SYSTEM_FLAGSHIP_LLM_BASE_URL")),
        api_key=_env_str("JOB_SYSTEM_FLAGSHIP_LLM_API_KEY"),
        model=_env_str("JOB_SYSTEM_FLAGSHIP_LLM_MODEL", "gpt-5.4") or "gpt-5.4",
        temperature=_env_float("JOB_SYSTEM_FLAGSHIP_LLM_TEMPERATURE", 0.3),
        max_tokens=_env_int("JOB_SYSTEM_FLAGSHIP_LLM_MAX_TOKENS", 4000),
        timeout_seconds=_env_int("JOB_SYSTEM_FLAGSHIP_LLM_TIMEOUT_SECONDS", 120),
    )


def load_resume_llm_config() -> LLMConfig:
    return _load_flagship_llm_config()


def load_ai_llm_config() -> LLMConfig:
    return _load_flagship_llm_config()


def load_llm_config() -> LLMConfig:
    return load_ai_llm_config()


JWT_SECRET = _required_env("CAREER_PLANNER_JWT_SECRET")

JWT_EXPIRE_MINUTES = _env_int("CAREER_PLANNER_JWT_EXPIRE_MINUTES", 60 * 24 * 7)
