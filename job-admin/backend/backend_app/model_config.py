import os
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

from project_paths import TOOLS_DIR


TEXT_CONFIG_FILE = TOOLS_DIR / "text_model_config.json"
VECTOR_CONFIG_FILE = TOOLS_DIR / "vector_model_config.json"


TEXT_MODEL_DEFAULT = "gpt-5.4"
TEXT_BASE_URL_DEFAULT = "https://test.lemonapi.ai/v1"
TEXT_REQUESTS_PER_MINUTE_DEFAULT = 800
TEXT_MAX_CONCURRENCY_DEFAULT = 30

VECTOR_MODEL_DEFAULT = "embedding-3"
VECTOR_BASE_URL_DEFAULT = "https://open.bigmodel.cn/api/paas/v4"
VECTOR_DIMENSIONS_DEFAULT = 2048
VECTOR_REQUESTS_PER_MINUTE_DEFAULT = 800
VECTOR_MAX_CONCURRENCY_DEFAULT = 30
VECTOR_BATCH_SIZE_DEFAULT = 60

VECTOR_PROVIDER_OPENAI = "openai_embeddings"
VECTOR_PROVIDER_GEMINI = "gemini_embed_content"

VECTOR_PROFILE_GLM_LEGACY = "glm_legacy"
VECTOR_PROFILE_GEMINI_ENGLISH = "gemini_english_google"
VECTOR_PROFILE_OPENROUTER_GEMINI = "openrouter_gemini_embedding_001"
VECTOR_PROFILE_BIGMODEL_EMBEDDING_3 = "bigmodel_embedding_3"
ACTIVE_VECTOR_PROFILE_DEFAULT = VECTOR_PROFILE_BIGMODEL_EMBEDDING_3
OPENROUTER_API_KEY_HARDCODED = ""
OPENROUTER_SITE_URL_HARDCODED = "http://localhost"
OPENROUTER_SITE_NAME_HARDCODED = "job_system"
BIGMODEL_API_KEY_HARDCODED = ""


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


def _text_api_key() -> str:
    return (
        os.getenv("JOB_SYSTEM_TEXT_API_KEY")
        or os.getenv("OPENAI_API_KEY")
        or os.getenv("TEXT_MODEL_API_KEY")
        or ""
    )


def _vector_api_key() -> str:
    return (
        os.getenv("JOB_SYSTEM_VECTOR_API_KEY")
        or os.getenv("OPENAI_API_KEY")
        or os.getenv("VECTOR_MODEL_API_KEY")
        or _text_api_key()
    )


def _read_json_file(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _string_setting(env_name: str, file_value: object, default: str) -> str:
    env_value = str(os.getenv(env_name, "")).strip()
    if env_value:
        return env_value
    file_text = str(file_value).strip() if file_value is not None else ""
    return file_text or default


def _int_setting(env_name: str, file_value: object, default: int) -> int:
    env_value = str(os.getenv(env_name, "")).strip()
    if env_value:
        try:
            return int(env_value)
        except (TypeError, ValueError):
            pass
    if file_value is not None and str(file_value).strip():
        try:
            return int(file_value)
        except (TypeError, ValueError):
            pass
    return default


def _float_setting(env_name: str, file_value: object, default: float) -> float:
    env_value = str(os.getenv(env_name, "")).strip()
    if env_value:
        try:
            return float(env_value)
        except (TypeError, ValueError):
            pass
    if file_value is not None and str(file_value).strip():
        try:
            return float(file_value)
        except (TypeError, ValueError):
            pass
    return default


@dataclass(frozen=True)
class TextModelConfig:
    base_url: str = TEXT_BASE_URL_DEFAULT
    api_key: str = ""
    model: str = TEXT_MODEL_DEFAULT
    requests_per_minute: int = TEXT_REQUESTS_PER_MINUTE_DEFAULT
    max_concurrency: int = TEXT_MAX_CONCURRENCY_DEFAULT
    temperature: float = 0.3
    max_tokens: int = 4000


@dataclass(frozen=True)
class VectorModelConfig:
    profile_id: str = ACTIVE_VECTOR_PROFILE_DEFAULT
    name: str = "BigModel Embedding-3"
    provider: str = VECTOR_PROVIDER_OPENAI
    base_url: str = VECTOR_BASE_URL_DEFAULT
    api_key: str = ""
    model: str = VECTOR_MODEL_DEFAULT
    dimensions: Optional[int] = VECTOR_DIMENSIONS_DEFAULT
    requests_per_minute: int = VECTOR_REQUESTS_PER_MINUTE_DEFAULT
    max_concurrency: int = VECTOR_MAX_CONCURRENCY_DEFAULT
    batch_size: int = VECTOR_BATCH_SIZE_DEFAULT
    task_type: str = "SEMANTIC_SIMILARITY"
    cache_file: str = "tag_embedding_cache.jsonl"
    request_interval_seconds: float = 0.0
    site_url: str = ""
    site_name: str = ""


def load_text_model_config() -> TextModelConfig:
    file_payload = _read_json_file(TEXT_CONFIG_FILE)
    return TextModelConfig(
        base_url=_string_setting("JOB_SYSTEM_TEXT_BASE_URL", file_payload.get("baseUrl"), TEXT_BASE_URL_DEFAULT),
        api_key=_string_setting("JOB_SYSTEM_TEXT_API_KEY", file_payload.get("apiKey"), _text_api_key()),
        model=_string_setting("JOB_SYSTEM_TEXT_MODEL", file_payload.get("model"), TEXT_MODEL_DEFAULT),
        requests_per_minute=_int_setting("JOB_SYSTEM_TEXT_REQUESTS_PER_MINUTE", file_payload.get("requestsPerMinute"), TEXT_REQUESTS_PER_MINUTE_DEFAULT),
        max_concurrency=_int_setting("JOB_SYSTEM_TEXT_MAX_CONCURRENCY", file_payload.get("maxConcurrency"), TEXT_MAX_CONCURRENCY_DEFAULT),
        temperature=_float_setting("JOB_SYSTEM_TEXT_TEMPERATURE", file_payload.get("temperature"), 0.3),
        max_tokens=_int_setting("JOB_SYSTEM_TEXT_MAX_TOKENS", file_payload.get("maxTokens"), 4000),
    )


def resolve_active_vector_profile_id() -> str:
    requested = (
        os.getenv("JOB_SYSTEM_VECTOR_PROFILE")
        or os.getenv("JOB_SYSTEM_EMBEDDING_PROFILE")
        or ACTIVE_VECTOR_PROFILE_DEFAULT
    ).strip()
    if requested in {
        VECTOR_PROFILE_BIGMODEL_EMBEDDING_3,
        VECTOR_PROFILE_GLM_LEGACY,
        VECTOR_PROFILE_GEMINI_ENGLISH,
        VECTOR_PROFILE_OPENROUTER_GEMINI,
    }:
        return requested
    return ACTIVE_VECTOR_PROFILE_DEFAULT


def list_vector_model_profiles() -> List[Dict[str, str]]:
    return [
        {
            "id": VECTOR_PROFILE_BIGMODEL_EMBEDDING_3,
            "name": "BigModel Embedding-3",
            "provider": VECTOR_PROVIDER_OPENAI,
            "enabledByDefault": "true",
            "note": "OpenAI-compatible BigModel embedding-3 profile for the career cleanup pipeline.",
        },
        {
            "id": VECTOR_PROFILE_OPENROUTER_GEMINI,
            "name": "OpenRouter Gemini Embedding 001",
            "provider": VECTOR_PROVIDER_OPENAI,
            "enabledByDefault": "false",
            "note": "OpenRouter OpenAI-compatible embeddings profile using google/gemini-embedding-001.",
        },
        {
            "id": VECTOR_PROFILE_GLM_LEGACY,
            "name": "GLM Embedding (Legacy)",
            "provider": VECTOR_PROVIDER_OPENAI,
            "enabledByDefault": "false",
            "note": "保留旧 GLM/OpenAI 兼容 embedding 配置与缓存文件，但默认不启用。",
        },
        {
            "id": VECTOR_PROFILE_GEMINI_ENGLISH,
            "name": "Gemini English Embedding",
            "provider": VECTOR_PROVIDER_GEMINI,
            "enabledByDefault": "false",
            "note": "代码内预置的英文向量配置，当前默认启用；与 GLM 向量缓存分离，避免空间混用。",
        },
    ]


def load_vector_model_config(profile_id: Optional[str] = None) -> VectorModelConfig:
    selected_profile = profile_id or resolve_active_vector_profile_id()
    if selected_profile == VECTOR_PROFILE_BIGMODEL_EMBEDDING_3:
        return VectorModelConfig(
            profile_id=VECTOR_PROFILE_BIGMODEL_EMBEDDING_3,
            name="BigModel Embedding-3",
            provider=VECTOR_PROVIDER_OPENAI,
            base_url=_string_setting("JOB_SYSTEM_BIGMODEL_VECTOR_BASE_URL", None, "https://open.bigmodel.cn/api/paas/v4"),
            api_key=_string_setting("JOB_SYSTEM_BIGMODEL_VECTOR_API_KEY", None, ""),
            model=_string_setting("JOB_SYSTEM_BIGMODEL_VECTOR_MODEL", None, "embedding-3"),
            dimensions=2048,
            requests_per_minute=_int_setting("JOB_SYSTEM_BIGMODEL_VECTOR_REQUESTS_PER_MINUTE", None, VECTOR_REQUESTS_PER_MINUTE_DEFAULT),
            max_concurrency=_int_setting("JOB_SYSTEM_BIGMODEL_VECTOR_MAX_CONCURRENCY", None, VECTOR_MAX_CONCURRENCY_DEFAULT),
            batch_size=64,
            task_type="SEMANTIC_SIMILARITY",
            cache_file="embedding_cache.json",
            request_interval_seconds=0.0,
            site_url="",
            site_name="",
        )

    if selected_profile == VECTOR_PROFILE_OPENROUTER_GEMINI:
        return VectorModelConfig(
            profile_id=VECTOR_PROFILE_OPENROUTER_GEMINI,
            name="OpenRouter Gemini Embedding 001",
            provider=VECTOR_PROVIDER_OPENAI,
            base_url="https://openrouter.ai/api/v1",
            api_key=_string_setting("JOB_SYSTEM_OPENROUTER_API_KEY", None, ""),
            model="google/gemini-embedding-001",
            dimensions=None,
            requests_per_minute=800,
            max_concurrency=30,
            batch_size=250,
            task_type="SEMANTIC_SIMILARITY",
            cache_file="tag_embedding_cache__openrouter_gemini_embedding_001.jsonl",
            request_interval_seconds=3.0,
            site_url=OPENROUTER_SITE_URL_HARDCODED,
            site_name=OPENROUTER_SITE_NAME_HARDCODED,
        )

    if selected_profile == VECTOR_PROFILE_GEMINI_ENGLISH:
        return VectorModelConfig(
            profile_id=VECTOR_PROFILE_GEMINI_ENGLISH,
            name="Gemini English Embedding",
            provider=VECTOR_PROVIDER_GEMINI,
            base_url="https://generativelanguage.googleapis.com/v1beta",
            api_key=_string_setting("JOB_SYSTEM_GEMINI_VECTOR_API_KEY", None, ""),
            model="models/gemini-embedding-001",
            dimensions=768,
            requests_per_minute=800,
            max_concurrency=30,
            batch_size=80,
            task_type="SEMANTIC_SIMILARITY",
            cache_file="tag_embedding_cache__gemini_english_google__768.jsonl",
            request_interval_seconds=0.0,
            site_url="",
            site_name="",
        )

    file_payload = _read_json_file(VECTOR_CONFIG_FILE)
    return VectorModelConfig(
        profile_id=VECTOR_PROFILE_GLM_LEGACY,
        name="GLM Embedding (Legacy)",
        provider=VECTOR_PROVIDER_OPENAI,
        base_url=_string_setting("JOB_SYSTEM_VECTOR_BASE_URL", file_payload.get("baseUrl"), VECTOR_BASE_URL_DEFAULT),
        api_key=_string_setting("JOB_SYSTEM_VECTOR_API_KEY", file_payload.get("apiKey"), _vector_api_key()),
        model=_string_setting("JOB_SYSTEM_VECTOR_MODEL", file_payload.get("model"), VECTOR_MODEL_DEFAULT),
        dimensions=_int_setting("JOB_SYSTEM_VECTOR_DIMENSIONS", file_payload.get("dimensions"), VECTOR_DIMENSIONS_DEFAULT),
        requests_per_minute=_int_setting("JOB_SYSTEM_VECTOR_REQUESTS_PER_MINUTE", file_payload.get("requestsPerMinute"), VECTOR_REQUESTS_PER_MINUTE_DEFAULT),
        max_concurrency=_int_setting("JOB_SYSTEM_VECTOR_MAX_CONCURRENCY", file_payload.get("maxConcurrency"), VECTOR_MAX_CONCURRENCY_DEFAULT),
        batch_size=_int_setting("JOB_SYSTEM_VECTOR_BATCH_SIZE", file_payload.get("batchSize"), VECTOR_BATCH_SIZE_DEFAULT),
        cache_file="tag_embedding_cache.jsonl",
        request_interval_seconds=0.0,
        site_url="",
        site_name="",
    )
