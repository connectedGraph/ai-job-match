import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


FLAGSHIP_LLM_MODEL_DEFAULT = "gpt-5.4"
FAST_LLM_MODEL_DEFAULT = "gpt-5.4-mini"
OPENAI_COMPATIBLE_BASE_URL_DEFAULT = ""

EMBEDDING_MODEL_DEFAULT = "embedding-3"
EMBEDDING_BASE_URL_DEFAULT = "https://open.bigmodel.cn/api/paas/v4"
EMBEDDING_DIMENSIONS_DEFAULT = 2048
EMBEDDING_BATCH_SIZE_DEFAULT = 64
EMBEDDING_TIMEOUT_SECONDS_DEFAULT = 180
EMBEDDING_REQUESTS_PER_MINUTE_DEFAULT = 800
EMBEDDING_MAX_CONCURRENCY_DEFAULT = 30

VECTOR_PROVIDER_OPENAI = "openai_embeddings"
VECTOR_PROFILE_EMBEDDING = "job_system_embedding"
VECTOR_PROFILE_GLM_LEGACY = "glm_legacy"


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_str(name: str, default: str = "") -> str:
    value = os.getenv(name, "")
    return value.strip() if value is not None else default


def normalize_openai_base_url(base_url: str) -> str:
    value = (base_url or "").strip().rstrip("/")
    if not value:
        return ""
    return value if value.endswith("/v1") else f"{value}/v1"


def normalize_embedding_base_url(base_url: str) -> str:
    return (base_url or "").strip().rstrip("/")


@dataclass(frozen=True)
class LLMModelConfig:
    base_url: str = OPENAI_COMPATIBLE_BASE_URL_DEFAULT
    api_key: str = ""
    model: str = ""
    temperature: float = 0.3
    max_tokens: int = 4000
    timeout_seconds: int = 120
    requests_per_minute: int = 800
    max_concurrency: int = 30
    tier: str = "flagship"


@dataclass(frozen=True)
class VectorModelConfig:
    profile_id: str = VECTOR_PROFILE_EMBEDDING
    name: str = "Job System Embedding"
    provider: str = VECTOR_PROVIDER_OPENAI
    base_url: str = EMBEDDING_BASE_URL_DEFAULT
    api_key: str = ""
    model: str = EMBEDDING_MODEL_DEFAULT
    dimensions: Optional[int] = EMBEDDING_DIMENSIONS_DEFAULT
    requests_per_minute: int = EMBEDDING_REQUESTS_PER_MINUTE_DEFAULT
    max_concurrency: int = EMBEDDING_MAX_CONCURRENCY_DEFAULT
    batch_size: int = EMBEDDING_BATCH_SIZE_DEFAULT
    timeout_seconds: int = EMBEDDING_TIMEOUT_SECONDS_DEFAULT
    task_type: str = "SEMANTIC_SIMILARITY"
    cache_file: str = "embedding_cache.json"
    request_interval_seconds: float = 0.0
    site_url: str = ""
    site_name: str = ""


TextModelConfig = LLMModelConfig


def load_flagship_llm_config() -> LLMModelConfig:
    return LLMModelConfig(
        base_url=normalize_openai_base_url(_env_str("JOB_SYSTEM_FLAGSHIP_LLM_BASE_URL")),
        api_key=_env_str("JOB_SYSTEM_FLAGSHIP_LLM_API_KEY"),
        model=_env_str("JOB_SYSTEM_FLAGSHIP_LLM_MODEL", FLAGSHIP_LLM_MODEL_DEFAULT) or FLAGSHIP_LLM_MODEL_DEFAULT,
        temperature=_env_float("JOB_SYSTEM_FLAGSHIP_LLM_TEMPERATURE", 0.3),
        max_tokens=_env_int("JOB_SYSTEM_FLAGSHIP_LLM_MAX_TOKENS", 4000),
        timeout_seconds=_env_int("JOB_SYSTEM_FLAGSHIP_LLM_TIMEOUT_SECONDS", 120),
        requests_per_minute=_env_int("JOB_SYSTEM_FLAGSHIP_LLM_REQUESTS_PER_MINUTE", 800),
        max_concurrency=_env_int("JOB_SYSTEM_FLAGSHIP_LLM_MAX_CONCURRENCY", 30),
        tier="flagship",
    )


def load_fast_llm_config() -> LLMModelConfig:
    return LLMModelConfig(
        base_url=normalize_openai_base_url(_env_str("JOB_SYSTEM_FAST_LLM_BASE_URL")),
        api_key=_env_str("JOB_SYSTEM_FAST_LLM_API_KEY"),
        model=_env_str("JOB_SYSTEM_FAST_LLM_MODEL", FAST_LLM_MODEL_DEFAULT) or FAST_LLM_MODEL_DEFAULT,
        temperature=_env_float("JOB_SYSTEM_FAST_LLM_TEMPERATURE", 0.0),
        max_tokens=_env_int("JOB_SYSTEM_FAST_LLM_MAX_TOKENS", 2000),
        timeout_seconds=_env_int("JOB_SYSTEM_FAST_LLM_TIMEOUT_SECONDS", 60),
        requests_per_minute=_env_int("JOB_SYSTEM_FAST_LLM_REQUESTS_PER_MINUTE", 800),
        max_concurrency=_env_int("JOB_SYSTEM_FAST_LLM_MAX_CONCURRENCY", 30),
        tier="fast",
    )


def load_embedding_config() -> VectorModelConfig:
    return VectorModelConfig(
        profile_id=VECTOR_PROFILE_EMBEDDING,
        name="Job System Embedding",
        provider=VECTOR_PROVIDER_OPENAI,
        base_url=normalize_embedding_base_url(
            _env_str("JOB_SYSTEM_EMBEDDING_BASE_URL", EMBEDDING_BASE_URL_DEFAULT)
            or EMBEDDING_BASE_URL_DEFAULT
        ),
        api_key=_env_str("JOB_SYSTEM_EMBEDDING_API_KEY"),
        model=_env_str("JOB_SYSTEM_EMBEDDING_MODEL", EMBEDDING_MODEL_DEFAULT) or EMBEDDING_MODEL_DEFAULT,
        dimensions=_env_int("JOB_SYSTEM_EMBEDDING_DIMENSIONS", EMBEDDING_DIMENSIONS_DEFAULT),
        requests_per_minute=_env_int("JOB_SYSTEM_EMBEDDING_REQUESTS_PER_MINUTE", EMBEDDING_REQUESTS_PER_MINUTE_DEFAULT),
        max_concurrency=_env_int("JOB_SYSTEM_EMBEDDING_MAX_CONCURRENCY", EMBEDDING_MAX_CONCURRENCY_DEFAULT),
        batch_size=_env_int("JOB_SYSTEM_EMBEDDING_BATCH_SIZE", EMBEDDING_BATCH_SIZE_DEFAULT),
        timeout_seconds=_env_int("JOB_SYSTEM_EMBEDDING_TIMEOUT_SECONDS", EMBEDDING_TIMEOUT_SECONDS_DEFAULT),
        cache_file="embedding_cache.json",
    )


def load_text_model_config() -> LLMModelConfig:
    return load_flagship_llm_config()


def load_vector_model_config(profile_id: Optional[str] = None) -> VectorModelConfig:
    return load_embedding_config()


def list_vector_model_profiles() -> List[Dict[str, str]]:
    return [
        {
            "id": VECTOR_PROFILE_EMBEDDING,
            "name": "Job System Embedding",
            "provider": VECTOR_PROVIDER_OPENAI,
            "enabledByDefault": "true",
            "note": "Unified OpenAI-compatible embedding profile for semantic search, tag normalization, and matching.",
        }
    ]


class LLMConfigResolver:
    @staticmethod
    def resolve(role: str, request_config: Any = None) -> Dict[str, Any]:
        """Resolve LLM configuration based on the role and optional request config overrides.

        roles:
            - 'matching': flagship LLM config with request overrides
            - 'check': fast LLM config with request overrides
            - 'competitiveness': flagship LLM config (no overrides)
        """
        if role == "matching":
            base_cfg = load_flagship_llm_config()
            max_tokens_default = 4000

            if request_config is not None and bool(getattr(request_config, "enabled", True)):
                base_url = normalize_openai_base_url(getattr(request_config, "baseUrl", ""))
                api_key = (getattr(request_config, "apiKey", "") or "").strip()
                model = (getattr(request_config, "model", "") or "").strip()
                if base_url and api_key and model:
                    return {
                        "source": "request_config",
                        "base_url": base_url,
                        "api_key": api_key,
                        "model": model,
                        "temperature": float(getattr(request_config, "temperature", base_cfg.temperature) or base_cfg.temperature),
                        "max_tokens": min(
                            int(getattr(request_config, "maxTokens", base_cfg.max_tokens) or base_cfg.max_tokens),
                            max(256, int(base_cfg.max_tokens or max_tokens_default)),
                        ),
                    }
            return {
                "source": "flagship_llm",
                "base_url": normalize_openai_base_url(base_cfg.base_url),
                "api_key": base_cfg.api_key.strip(),
                "model": base_cfg.model.strip(),
                "temperature": float(base_cfg.temperature),
                "max_tokens": max(256, int(base_cfg.max_tokens or max_tokens_default)),
            }

        elif role == "check":
            base_cfg = load_fast_llm_config()
            max_tokens_default = 1800

            request_enabled = bool(getattr(request_config, "enabled", True)) if request_config is not None else True
            if request_config is not None and request_enabled:
                base_url = normalize_openai_base_url(getattr(request_config, "baseUrl", ""))
                api_key = (getattr(request_config, "apiKey", "") or "").strip()
                model = (getattr(request_config, "model", "") or "").strip() or base_cfg.model.strip()
                if base_url and api_key:
                    return {
                        "source": "request_config",
                        "base_url": base_url,
                        "api_key": api_key,
                        "model": model,
                        "temperature": float(getattr(request_config, "temperature", 0.0) or 0.0),
                        "max_tokens": min(
                            int(getattr(request_config, "maxTokens", max_tokens_default) or max_tokens_default),
                            max(512, min(int(base_cfg.max_tokens or max_tokens_default), max_tokens_default)),
                        ),
                    }
            return {
                "source": "fast_llm",
                "base_url": normalize_openai_base_url(base_cfg.base_url),
                "api_key": base_cfg.api_key.strip(),
                "model": base_cfg.model.strip(),
                "temperature": float(base_cfg.temperature),
                "max_tokens": max(512, min(int(base_cfg.max_tokens or max_tokens_default), max_tokens_default)),
            }

        elif role == "competitiveness":
            base_cfg = load_flagship_llm_config()
            return {
                "source": "flagship_llm",
                "base_url": normalize_openai_base_url(base_cfg.base_url),
                "api_key": base_cfg.api_key.strip(),
                "model": base_cfg.model.strip(),
                "temperature": float(base_cfg.temperature),
                "max_tokens": max(512, int(base_cfg.max_tokens or 1200)),
            }

        else:
            raise ValueError(f"Unknown config resolver role: {role}")
