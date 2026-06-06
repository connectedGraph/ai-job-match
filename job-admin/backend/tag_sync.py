import asyncio
import hashlib
import json
import os
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set, Tuple

import httpx
import numpy as np

from backend_app.model_config import (
    VECTOR_PROFILE_BIGMODEL_EMBEDDING_3,
    VECTOR_PROFILE_GEMINI_ENGLISH,
    VECTOR_PROFILE_GLM_LEGACY,
    VECTOR_PROFILE_OPENROUTER_GEMINI,
    VECTOR_PROVIDER_GEMINI,
    VECTOR_PROVIDER_OPENAI,
    load_vector_model_config,
)
from job_profile_schema import (
    dev_tool_tag_name,
    dev_tool_tag_name_zh,
    is_tech_stack_branch,
    normalize_job_library,
    normalize_job_profile,
    tech_capability_tag_name,
    tech_capability_tag_name_zh,
    tech_stack_tag_name,
    tech_stack_tag_name_zh,
)
from project_paths import DOMAIN_DIR, TAG_DIR, JOB_LIBRARY_FILE, materialize_job_library_file, ensure_runtime_dirs
from portrait_builder.api_client import AsyncRequestRateLimiter, empty_token_usage, merge_token_usage, normalize_token_usage


JOBS_FILE = JOB_LIBRARY_FILE
TAG_VIEW_NORMALIZED = "normalized"
TAG_VIEW_SOURCE = "source"
TAG_VIEW_COMPACT = "compact"
VALID_TAG_VIEWS = {TAG_VIEW_NORMALIZED, TAG_VIEW_SOURCE, TAG_VIEW_COMPACT}

EMBEDDING_CACHE_FILE = TAG_DIR / "tag_embedding_cache.jsonl"
CANONICAL_RATIO_THRESHOLD = 0.01
NORMALIZATION_MIN_JOB_COUNT = 10
TAG_TRANSLATION_CACHE_FILE = TAG_DIR / "tag_translation_cache.json"
TAG_TRANSLATION_PROMPT_VERSION = "tag_zh_translation_v1"
TAG_TRANSLATION_BATCH_SIZE = 500
TRANSLATABLE_TAG_TYPES = {"techStack", "techCapabilities", "devTools"}
DOMAIN_MASTER_FILE = DOMAIN_DIR / "domain_master.json"
DOMAIN_TAG_STATS_FILE = DOMAIN_DIR / "domain_tag_stats.json"
DOMAIN_SUMMARY_FILE = DOMAIN_DIR / "summary.json"
DOMAIN_TRANSLATION_CACHE_FILE = DOMAIN_DIR / "domain_translation_cache.json"
DOMAIN_TRANSLATION_BATCH_SIZE = 500
DOMAIN_MIN_JOB_COUNT_DEFAULT = 5
VECTOR_MODEL_CONFIG = load_vector_model_config()
EMBEDDING_CACHE_MEMO: Dict[str, Tuple[Tuple[str, int, int], Dict[str, np.ndarray]]] = {}
TAG_ALIAS_CANONICALS: Dict[Tuple[str, str], str] = {
    ("techStack", "js"): "JavaScript",
    ("techStack", "vue.js"): "Vue",
    ("techStack", "vuejs"): "Vue",
    ("techStack", "vue js"): "Vue",
}


def current_vector_config():
    return load_vector_model_config()


def embedding_cache_file(config=None):
    resolved = config or VECTOR_MODEL_CONFIG
    cache_name = clean_text(getattr(resolved, "cache_file", "")) or "tag_embedding_cache.jsonl"
    return TAG_DIR / cache_name


def embedding_api_url(config=None) -> str:
    resolved = config or VECTOR_MODEL_CONFIG
    base_url = resolved.base_url.rstrip("/")
    if resolved.provider == VECTOR_PROVIDER_GEMINI:
        return f"{base_url}/{resolved.model}:embedContent"
    return f"{base_url}/embeddings"


def get_embedding_cache_status(config=None) -> Dict[str, Any]:
    resolved = config or current_vector_config()
    cache_file = embedding_cache_file(resolved)
    rows = read_embedding_cache_rows(cache_file) if cache_file.exists() else []
    total_rows = len(rows)
    matched_rows = sum(1 for row in rows if embedding_row_matches_config(row, resolved))
    return {
        "profileId": resolved.profile_id,
        "provider": resolved.provider,
        "model": resolved.model,
        "dimensions": int(resolved.dimensions or 0),
        "taskType": clean_text(getattr(resolved, "task_type", "")) or None,
        "cacheFile": str(cache_file),
        "exists": cache_file.exists(),
        "sizeBytes": cache_file.stat().st_size if cache_file.exists() else 0,
        "matchedRows": matched_rows,
        "totalRows": total_rows,
        "updatedAt": datetime.fromtimestamp(cache_file.stat().st_mtime).isoformat(timespec="seconds")
        if cache_file.exists()
        else None,
        "apiUrl": embedding_api_url(resolved),
    }

NORMALIZE_THRESHOLDS = {
    "techStack": 0.90,
    "techCapabilities": 0.90,
    "devTools": 0.90,
}

TAG_PREFIX = {
    "techStack": "TS",
    "techCapabilities": "TC",
    "devTools": "DT",
    "softQuality": "SQ",
    "growthPotential": "GP",
}

IMPORT_LOCK = asyncio.Lock()


def ensure_tag_dirs() -> None:
    ensure_runtime_dirs()


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def clean_text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def resolve_tag_alias(name: str, tag_type: str) -> str:
    text = clean_text(name)
    if not text:
        return ""
    return TAG_ALIAS_CANONICALS.get((clean_text(tag_type), text.lower()), "")


def normalize_tag_view(view: str) -> str:
    normalized = clean_text(view).lower()
    return normalized if normalized in VALID_TAG_VIEWS else TAG_VIEW_NORMALIZED


def tag_master_file_path(view: str = TAG_VIEW_NORMALIZED) -> Path:
    normalized = normalize_tag_view(view)
    if normalized == TAG_VIEW_SOURCE:
        return TAG_DIR / "tag_master_source.json"
    return TAG_DIR / "tag_master_normalized.json"


def high_frequency_tags_file_path(view: str = TAG_VIEW_NORMALIZED) -> Path:
    normalized = normalize_tag_view(view)
    if normalized == TAG_VIEW_SOURCE:
        return TAG_DIR / "high_frequency_tags_source.json"
    return TAG_DIR / "high_frequency_tags_normalized.json"


def job_tag_relations_file_path(view: str = TAG_VIEW_NORMALIZED) -> Path:
    normalized = normalize_tag_view(view)
    if normalized == TAG_VIEW_SOURCE:
        return TAG_DIR / "job_tag_relations_source.jsonl"
    return TAG_DIR / "job_tag_relations_normalized.jsonl"


def summary_file_path(view: str = TAG_VIEW_NORMALIZED) -> Path:
    normalized = normalize_tag_view(view)
    if normalized == TAG_VIEW_SOURCE:
        return TAG_DIR / "summary_source.json"
    return TAG_DIR / "summary_normalized.json"


async def maybe_await(value: Any) -> Any:
    if hasattr(value, "__await__"):
        return await value
    return value


def normalize_vector(vector: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vector)
    return vector / norm if norm > 0 else vector


def embedding_cache_key(text: str) -> str:
    return clean_text(text).lower()


def embedding_row_matches_config(row: Dict[str, Any], config) -> bool:
    row_profile = clean_text(row.get("profileId"))
    row_provider = clean_text(row.get("provider"))
    row_model = clean_text(row.get("model"))
    row_dimensions = row.get("dimensions")
    profile_aliases = {clean_text(config.profile_id)}
    provider_aliases = {clean_text(config.provider)}

    if clean_text(config.profile_id) == VECTOR_PROFILE_BIGMODEL_EMBEDDING_3:
        profile_aliases.add("VECTOR_PROFILE_BIGMODEL_EMBEDDING_3")
    if clean_text(config.profile_id) == VECTOR_PROFILE_GEMINI_ENGLISH:
        profile_aliases.add("VECTOR_PROFILE_GEMINI_ENGLISH")
    if clean_text(config.profile_id) == VECTOR_PROFILE_OPENROUTER_GEMINI:
        profile_aliases.add("VECTOR_PROFILE_OPENROUTER_GEMINI")
    if clean_text(config.provider) == VECTOR_PROVIDER_GEMINI:
        provider_aliases.add("gemini")

    # Backward compatibility: old cache rows without profile metadata are only trusted for legacy GLM space.
    if not row_profile and not row_provider and not row_model:
        return config.profile_id == VECTOR_PROFILE_GLM_LEGACY
    if row_profile and row_profile not in profile_aliases:
        return False
    if row_provider and row_provider not in provider_aliases:
        return False
    if row_model and row_model != config.model:
        return False
    if row_dimensions not in (None, "") and getattr(config, "dimensions", None):
        try:
            if int(row_dimensions) != int(config.dimensions or 0):
                return False
        except (TypeError, ValueError):
            return False
    return True


def stable_tag_id(tag_type: str, name: str) -> str:
    base = f"{tag_type}:{clean_text(name).lower()}".encode("utf-8")
    digest = hashlib.sha1(base).hexdigest()[:12].upper()
    return f"{TAG_PREFIX.get(tag_type, 'TAG')}_{digest}"


def stable_domain_id(domain: str) -> str:
    base = f"domain:{clean_text(domain).lower()}".encode("utf-8")
    digest = hashlib.sha1(base).hexdigest()[:12].upper()
    return f"DM_{digest}"


def stable_group_id(group_name: str, options: List[str]) -> str:
    base = (
        f"{clean_text(group_name).lower()}|"
        f"{'|'.join(sorted(clean_text(opt).lower() for opt in options if clean_text(opt)))}"
    ).encode("utf-8")
    digest = hashlib.sha1(base).hexdigest()[:12].upper()
    return f"TSG_{digest}"


def load_jobs() -> List[Dict[str, Any]]:
    materialize_job_library_file()
    if not JOBS_FILE.exists():
        return []
    with open(JOBS_FILE, "r", encoding="utf-8") as f:
        payload = json.load(f)
    jobs = payload if isinstance(payload, list) else list(payload.values())[0]
    return normalize_job_library(jobs)


def save_jobs(jobs: List[Dict[str, Any]]) -> None:
    materialize_job_library_file()
    with open(JOBS_FILE, "w", encoding="utf-8") as f:
        json.dump(normalize_job_library(jobs), f, ensure_ascii=False, indent=2)


def parse_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def parse_float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def first_clean_env(*names: str, default: str = "") -> str:
    for name in names:
        value = clean_text(os.getenv(name))
        if value:
            return value
    return default


def next_created_seq(jobs: List[Dict[str, Any]]) -> int:
    if not jobs:
        return 0
    max_seq = -1
    for idx, job in enumerate(jobs):
        meta = job.get("systemMeta") or {}
        max_seq = max(max_seq, parse_int(meta.get("createdSeq"), idx))
    return max_seq + 1


def stamp_imported_job_meta(
    job: Dict[str, Any],
    existing_job: Dict[str, Any] | None,
    created_seq: int,
    run_id: str,
    normalize_with_existing: bool,
) -> Dict[str, Any]:
    stamped = json.loads(json.dumps(job))
    existing_meta = dict((existing_job or {}).get("systemMeta") or {})
    incoming_meta = dict(stamped.get("systemMeta") or {})
    ts = now_iso()
    stamped["systemMeta"] = {
        **existing_meta,
        **incoming_meta,
        "createdAt": clean_text(incoming_meta.get("createdAt")) or clean_text(existing_meta.get("createdAt")) or ts,
        "updatedAt": ts,
        "createdSeq": parse_int(incoming_meta.get("createdSeq"), parse_int(existing_meta.get("createdSeq"), created_seq)),
        "source": "builder_import",
        "lastRunId": run_id,
        "lastImportedAt": ts,
        "normalizedOnImport": bool(normalize_with_existing),
        "lastOperation": "updated" if existing_job else "created",
    }
    return stamped


def read_embedding_cache_rows(cache_file: Path) -> List[Dict[str, Any]]:
    if not cache_file.exists():
        return []
    try:
        raw = cache_file.read_text(encoding="utf-8-sig").strip()
    except OSError:
        return []
    if not raw:
        return []
    if raw[0] in "[{":
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = None
        if isinstance(payload, list):
            return [row for row in payload if isinstance(row, dict)]
        if isinstance(payload, dict):
            if clean_text(payload.get("cacheKey")) and isinstance(payload.get("embedding"), list):
                return [payload]
            rows: List[Dict[str, Any]] = []
            for key, value in payload.items():
                if isinstance(value, dict):
                    row = dict(value)
                    row.setdefault("cacheKey", clean_text(key))
                    rows.append(row)
                elif isinstance(value, list):
                    rows.append({"cacheKey": clean_text(key), "embedding": value})
            return rows

    rows = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    return rows


def write_embedding_cache_rows(cache_file: Path, rows: List[Dict[str, Any]]) -> None:
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    if cache_file.suffix.lower() == ".jsonl":
        with cache_file.open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
        return
    cache_file.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def load_embedding_cache() -> Dict[str, np.ndarray]:
    ensure_tag_dirs()
    vector_config = current_vector_config()
    cache_file = embedding_cache_file(vector_config)
    try:
        stat = cache_file.stat()
        signature = (str(cache_file), int(stat.st_mtime_ns), int(stat.st_size))
    except FileNotFoundError:
        signature = (str(cache_file), 0, 0)

    memo_key = clean_text(getattr(vector_config, "profile_id", "")) or str(cache_file)
    cached_entry = EMBEDDING_CACHE_MEMO.get(memo_key)
    if cached_entry and cached_entry[0] == signature:
        return cached_entry[1]

    cache: Dict[str, np.ndarray] = {}
    for row in read_embedding_cache_rows(cache_file):
        if not embedding_row_matches_config(row, vector_config):
            continue
        cache_key = clean_text(row.get("cacheKey"))
        vector = row.get("embedding")
        if not cache_key or not isinstance(vector, list):
            continue
        if vector_config.dimensions and len(vector) != int(vector_config.dimensions):
            continue
        cache[cache_key] = normalize_vector(np.array(vector, dtype=np.float32))
    EMBEDDING_CACHE_MEMO[memo_key] = (signature, cache)
    return cache


def append_embedding_cache_rows(rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    ensure_tag_dirs()
    cache_file = embedding_cache_file(current_vector_config())
    if cache_file.suffix.lower() == ".json":
        existing_by_key: Dict[str, Dict[str, Any]] = {}
        for row in read_embedding_cache_rows(cache_file):
            cache_key = clean_text(row.get("cacheKey"))
            if cache_key:
                existing_by_key[cache_key] = row
        for row in rows:
            cache_key = clean_text(row.get("cacheKey"))
            if cache_key:
                existing_by_key[cache_key] = row
        write_embedding_cache_rows(cache_file, list(existing_by_key.values()))
        return
    with cache_file.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def merge_embedding_rows_into_memory_cache(
    rows: List[Dict[str, Any]],
    cache: Dict[str, np.ndarray],
    config=None,
) -> int:
    resolved = config or current_vector_config()
    merged = 0
    for row in rows:
        if not isinstance(row, dict) or not embedding_row_matches_config(row, resolved):
            continue
        cache_key = clean_text(row.get("cacheKey"))
        vector = row.get("embedding")
        if not cache_key or not isinstance(vector, list):
            continue
        if resolved.dimensions and len(vector) != int(resolved.dimensions):
            continue
        if cache_key not in cache:
            merged += 1
        cache[cache_key] = normalize_vector(np.array(vector, dtype=np.float32))
    return merged


def build_embedding_cache_row(text: str, vector: np.ndarray, config=None) -> Dict[str, Any]:
    resolved = config or current_vector_config()
    text = clean_text(text)
    return {
        "cacheKey": embedding_cache_key(text),
        "text": text,
        "embedding": vector.astype(float).tolist(),
        "profileId": resolved.profile_id,
        "provider": resolved.provider,
        "model": resolved.model,
        "dimensions": int(resolved.dimensions or len(vector)),
        "updatedAt": now_iso(),
        "cacheScope": "normalization_run",
    }


def write_jsonl_rows_deduped(path: Path, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    merged: Dict[str, Dict[str, Any]] = {}
    for row in read_embedding_cache_rows(path):
        cache_key = clean_text(row.get("cacheKey"))
        if cache_key:
            merged[cache_key] = row
    for row in rows:
        cache_key = clean_text(row.get("cacheKey"))
        if cache_key:
            merged[cache_key] = row
    with path.open("w", encoding="utf-8") as handle:
        for row in merged.values():
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_run_embedding_cache(run_cache_dir: Optional[Path], cache: Dict[str, np.ndarray]) -> int:
    if not run_cache_dir:
        return 0
    aggregate_file = run_cache_dir / "embedding_cache.jsonl"
    return merge_embedding_rows_into_memory_cache(read_embedding_cache_rows(aggregate_file), cache)


def persist_run_embedding_cache(
    run_cache_dir: Optional[Path],
    *,
    stage: str,
    texts: List[str],
    embedding_cache: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    if not run_cache_dir:
        return {}
    rows: List[Dict[str, Any]] = []
    seen = set()
    for raw_text in texts:
        text = clean_text(raw_text)
        cache_key = embedding_cache_key(text)
        if not text or cache_key in seen:
            continue
        vector = embedding_cache.get(cache_key)
        if vector is None:
            continue
        seen.add(cache_key)
        rows.append(build_embedding_cache_row(text, vector))
    if not rows:
        return {
            "cacheDir": str(run_cache_dir),
            "stageCacheFile": str(run_cache_dir / f"{stage}_embedding_cache.jsonl"),
            "aggregateCacheFile": str(run_cache_dir / "embedding_cache.jsonl"),
            "rowsWritten": 0,
        }
    stage_file = run_cache_dir / f"{stage}_embedding_cache.jsonl"
    aggregate_file = run_cache_dir / "embedding_cache.jsonl"
    write_jsonl_rows_deduped(stage_file, rows)
    write_jsonl_rows_deduped(aggregate_file, rows)
    return {
        "cacheDir": str(run_cache_dir),
        "stageCacheFile": str(stage_file),
        "aggregateCacheFile": str(aggregate_file),
        "rowsWritten": len(rows),
    }


async def ensure_embeddings(texts: List[str], cache: Dict[str, np.ndarray]) -> int:
    vector_config = current_vector_config()
    unique_texts: List[str] = []
    seen_keys = set(cache.keys())
    for raw_text in texts:
        text = clean_text(raw_text)
        if not text:
            continue
        cache_key = embedding_cache_key(text)
        if cache_key in seen_keys:
            continue
        seen_keys.add(cache_key)
        unique_texts.append(text)

    if not unique_texts:
        return 0

    api_key = clean_text(vector_config.api_key)
    if not api_key:
        raise RuntimeError("Embedding API key is required for embedding normalization")

    persisted_rows: List[Dict[str, Any]] = []
    embedded_count = 0
    cache_is_json_file = embedding_cache_file(vector_config).suffix.lower() == ".json"
    request_interval = 0.0
    if getattr(vector_config, "request_interval_seconds", 0):
        request_interval = float(vector_config.request_interval_seconds or 0.0)
    elif vector_config.requests_per_minute:
        request_interval = 60.0 / max(int(vector_config.requests_per_minute), 1)

    def is_openrouter_profile(config) -> bool:
        return clean_text(getattr(config, "profile_id", "")) == VECTOR_PROFILE_OPENROUTER_GEMINI or "openrouter.ai" in clean_text(getattr(config, "base_url", "")).lower()

    async with httpx.AsyncClient(timeout=180) as client:
        async def post_with_retry(
            url: str,
            *,
            headers: Dict[str, str],
            payload: Dict[str, Any],
            max_attempts: int = 12,
        ) -> httpx.Response:
            retryable_statuses = {408, 429, 500, 502, 503, 504}
            last_error: Exception | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    response = await client.post(url, headers=headers, json=payload)
                    if response.status_code in retryable_statuses:
                        response.raise_for_status()
                    return response
                except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError, httpx.HTTPStatusError) as exc:
                    retryable = True
                    delay_seconds = min(8, 2 ** (attempt - 1))
                    if isinstance(exc, httpx.HTTPStatusError):
                        retryable = exc.response.status_code in retryable_statuses
                        if exc.response.status_code == 429:
                            retry_after = clean_text(exc.response.headers.get("Retry-After"))
                            retry_match = re.search(
                                r"Please retry in ([0-9]+(?:\.[0-9]+)?)s",
                                exc.response.text or "",
                            )
                            try:
                                parsed_retry = float(retry_match.group(1)) if retry_match else 0.0
                                if retry_after:
                                    parsed_retry = max(parsed_retry, float(retry_after))
                                delay_seconds = max(parsed_retry, request_interval, 15.0)
                            except ValueError:
                                delay_seconds = max(request_interval, float(15 * attempt))
                    if (not retryable) or attempt >= max_attempts:
                        raise
                    last_error = exc
                    await asyncio.sleep(delay_seconds)
            if last_error:
                raise last_error
            raise RuntimeError("Embedding request failed without a retryable error")

        async def fetch_openai_batch(batch: List[str]) -> None:
            nonlocal embedded_count
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            if is_openrouter_profile(vector_config):
                site_url = clean_text(getattr(vector_config, "site_url", ""))
                site_name = clean_text(getattr(vector_config, "site_name", ""))
                if site_url:
                    headers["HTTP-Referer"] = site_url
                if site_name:
                    headers["X-OpenRouter-Title"] = site_name
            payload = {
                "model": vector_config.model,
                "input": batch,
                "encoding_format": "float",
            }
            if getattr(vector_config, "dimensions", None):
                payload["dimensions"] = int(vector_config.dimensions)
            response = await post_with_retry(embedding_api_url(vector_config), headers=headers, payload=payload)
            response.raise_for_status()
            body = response.json()
            rows = body.get("data") if isinstance(body, dict) else None
            if not isinstance(rows, list):
                if is_openrouter_profile(vector_config) and len(batch) > 1:
                    midpoint = max(1, len(batch) // 2)
                    await fetch_openai_batch(batch[:midpoint])
                    await fetch_openai_batch(batch[midpoint:])
                    return
                error_message = ""
                if isinstance(body, dict):
                    error_payload = body.get("error")
                    if isinstance(error_payload, dict):
                        error_message = clean_text(error_payload.get("message")) or clean_text(error_payload.get("code"))
                    elif error_payload is not None:
                        error_message = clean_text(error_payload)
                raise RuntimeError(error_message or "OpenAI-compatible embedding response missing data")
            rows = sorted(rows, key=lambda item: item["index"])
            for row in rows:
                text = batch[row["index"]]
                cache_key = embedding_cache_key(text)
                if cache_key in cache:
                    continue
                vector = normalize_vector(np.array(row["embedding"], dtype=np.float32))
                cache[cache_key] = vector
                embedded_count += 1
                persisted_rows.append(
                    {
                        "cacheKey": cache_key,
                        "text": text,
                        "embedding": row["embedding"],
                        "profileId": vector_config.profile_id,
                        "provider": vector_config.provider,
                        "model": vector_config.model,
                        "dimensions": int(vector_config.dimensions or len(row["embedding"])),
                        "updatedAt": now_iso(),
                    }
                )

        async def fetch_gemini_batch(batch: List[str]) -> None:
            nonlocal embedded_count
            headers = {
                "x-goog-api-key": api_key,
                "Content-Type": "application/json",
            }
            requests_payload: List[Dict[str, Any]] = []
            batch_texts: List[str] = []
            for text in batch:
                normalized_text = clean_text(text)
                if not normalized_text:
                    continue
                batch_texts.append(normalized_text)
                request_payload: Dict[str, Any] = {
                    "model": vector_config.model,
                    "content": {
                        "parts": [{"text": normalized_text}],
                    },
                }
                if clean_text(vector_config.task_type):
                    request_payload["taskType"] = clean_text(vector_config.task_type)
                if vector_config.dimensions:
                    request_payload["outputDimensionality"] = int(vector_config.dimensions)
                requests_payload.append(request_payload)

            if not requests_payload:
                return

            response = await post_with_retry(
                f"{embedding_api_url(vector_config).rsplit(':', 1)[0]}:batchEmbedContents",
                headers=headers,
                payload={"requests": requests_payload},
            )
            response.raise_for_status()
            embeddings = response.json().get("embeddings", [])
            if not isinstance(embeddings, list):
                raise RuntimeError("Gemini batch embedding response missing embeddings")
            if len(embeddings) != len(batch_texts):
                raise RuntimeError("Gemini batch embedding response size mismatch")

            for text, embedding_item in zip(batch_texts, embeddings):
                values = embedding_item.get("values") if isinstance(embedding_item, dict) else None
                if not isinstance(values, list):
                    raise RuntimeError("Gemini batch embedding response missing embedding values")
                cache_key = embedding_cache_key(text)
                if cache_key in cache:
                    continue
                vector = normalize_vector(np.array(values, dtype=np.float32))
                cache[cache_key] = vector
                embedded_count += 1
                persisted_rows.append(
                    {
                        "cacheKey": cache_key,
                        "text": text,
                        "embedding": values,
                        "profileId": vector_config.profile_id,
                        "provider": vector_config.provider,
                        "model": vector_config.model,
                        "dimensions": int(vector_config.dimensions or len(values)),
                        "updatedAt": now_iso(),
                    }
                )

        if vector_config.provider == VECTOR_PROVIDER_GEMINI:
            batch_size = min(max(int(vector_config.batch_size or 1), 1), 100)
            for start in range(0, len(unique_texts), batch_size):
                batch = unique_texts[start : start + batch_size]
                await fetch_gemini_batch(batch)
                if persisted_rows:
                    append_embedding_cache_rows(persisted_rows)
                    persisted_rows.clear()
                if request_interval > 0 and start + batch_size < len(unique_texts):
                    await asyncio.sleep(request_interval)
        else:
            batch_size = max(int(vector_config.batch_size or 1), 1)
            if is_openrouter_profile(vector_config):
                tasks: List[asyncio.Task] = []
                for start in range(0, len(unique_texts), batch_size):
                    batch = unique_texts[start : start + batch_size]
                    tasks.append(asyncio.create_task(fetch_openai_batch(batch)))
                    if request_interval > 0 and start + batch_size < len(unique_texts):
                        await asyncio.sleep(request_interval)
                for task in asyncio.as_completed(tasks):
                    await task
                    if persisted_rows:
                        append_embedding_cache_rows(persisted_rows)
                        persisted_rows.clear()
            else:
                max_concurrency = max(int(getattr(vector_config, "max_concurrency", 1) or 1), 1)
                if max_concurrency > 1:
                    semaphore = asyncio.Semaphore(max_concurrency)

                    async def guarded_fetch_openai_batch(batch: List[str]) -> None:
                        async with semaphore:
                            await fetch_openai_batch(batch)

                    tasks = []
                    for start in range(0, len(unique_texts), batch_size):
                        batch = unique_texts[start : start + batch_size]
                        tasks.append(asyncio.create_task(guarded_fetch_openai_batch(batch)))
                    for task in asyncio.as_completed(tasks):
                        await task
                        if persisted_rows and not cache_is_json_file:
                            append_embedding_cache_rows(persisted_rows)
                            persisted_rows.clear()
                else:
                    for start in range(0, len(unique_texts), batch_size):
                        batch = unique_texts[start : start + batch_size]
                        await fetch_openai_batch(batch)
                        if persisted_rows and not cache_is_json_file:
                            append_embedding_cache_rows(persisted_rows)
                            persisted_rows.clear()
                        if request_interval > 0 and start + batch_size < len(unique_texts):
                            await asyncio.sleep(request_interval)

    append_embedding_cache_rows(persisted_rows)
    return embedded_count


def _source_tech_stack_name(item: Dict[str, Any]) -> str:
    return (
        clean_text(item.get("rawExtractedText"))
        or clean_text(item.get("nameZh"))
        or clean_text(item.get("skillZh"))
        or clean_text(item.get("name"))
    )


def _source_tech_stack_or_name(option: Any) -> str:
    if isinstance(option, dict):
        return (
            clean_text(option.get("rawExtractedText"))
            or clean_text(option.get("nameZh"))
            or clean_text(option.get("skillZh"))
            or clean_text(option.get("name"))
            or clean_text(option.get("skill"))
        )
    return clean_text(option)


def _source_tech_capability_name(item: Dict[str, Any]) -> str:
    return clean_text(item.get("rawExtractedText")) or clean_text(item.get("skillZh")) or clean_text(item.get("skill")) or clean_text(item.get("normalizedTag"))


def _source_dev_tool_name(item: Dict[str, Any]) -> str:
    return clean_text(item.get("rawExtractedText")) or clean_text(item.get("skillZh")) or clean_text(item.get("skill")) or clean_text(item.get("normalizedTag"))


def _iter_job_tag_entries(
    job: Dict[str, Any],
    include_fixed_dimensions: bool = True,
    view: str = TAG_VIEW_NORMALIZED,
) -> List[Dict[str, Any]]:
    view = normalize_tag_view(view)
    entries: List[Dict[str, Any]] = []
    for item in job.get("techStack", []):
        if is_tech_stack_branch(item):
            option_rows: List[Tuple[Any, str, str]] = []
            group_option_names: List[str] = []
            for opt in item.get("options", []):
                if isinstance(opt, dict):
                    raw_name = _source_tech_stack_or_name(opt)
                    normalized_name = tech_stack_tag_name(opt) or raw_name
                else:
                    raw_name = clean_text(opt)
                    normalized_name = raw_name
                chosen_name = raw_name if view == TAG_VIEW_SOURCE else normalized_name
                if chosen_name:
                    option_rows.append((opt, chosen_name, tech_stack_tag_name_zh(opt) if isinstance(opt, dict) else chosen_name))
                    group_option_names.append(chosen_name)
            group_id = stable_group_id(clean_text(item.get("groupName")), group_option_names) if group_option_names else ""
            for opt, chosen_name, name_zh in option_rows:
                entries.append(
                    {
                        "tagType": "techStack",
                        "name": chosen_name,
                        "nameZh": name_zh,
                        "groupId": group_id,
                        "jobId": clean_text(job.get("id")),
                    }
                )
            continue
        name = _source_tech_stack_name(item) if view == TAG_VIEW_SOURCE else tech_stack_tag_name(item)
        if not name:
            continue
        entries.append(
            {
                "tagType": "techStack",
                "name": name,
                "nameZh": tech_stack_tag_name_zh(item),
                "jobId": clean_text(job.get("id")),
            }
        )
    for item in job.get("techCapabilities", []):
        if clean_text(item.get("type")) == "soft_flag":
            continue
        name = _source_tech_capability_name(item) if view == TAG_VIEW_SOURCE else tech_capability_tag_name(item)
        if name:
            entries.append(
                {
                    "tagType": "techCapabilities",
                    "name": name,
                    "nameZh": tech_capability_tag_name_zh(item),
                    "domain": clean_text(item.get("domain")),
                    "type": clean_text(item.get("type")),
                    "jobId": clean_text(job.get("id")),
                }
            )
    for item in job.get("devTools", []):
        name = _source_dev_tool_name(item) if view == TAG_VIEW_SOURCE else dev_tool_tag_name(item)
        if name:
            entries.append(
                {
                    "tagType": "devTools",
                    "name": name,
                    "nameZh": dev_tool_tag_name_zh(item),
                    "jobId": clean_text(job.get("id")),
                }
            )
    if include_fixed_dimensions:
        for item in job.get("softQuality", []):
            name = clean_text(item.get("name"))
            if name:
                entries.append(
                    {
                        "tagType": "softQuality",
                        "name": name,
                        "nameZh": name,
                        "jobId": clean_text(job.get("id")),
                    }
                )
        for item in job.get("growthPotential", []):
            name = clean_text(item.get("name"))
            if name:
                entries.append(
                    {
                        "tagType": "growthPotential",
                        "name": name,
                        "nameZh": name,
                        "jobId": clean_text(job.get("id")),
                    }
                )
    return entries


def collect_job_tag_entries(
    jobs: List[Dict[str, Any]],
    include_fixed_dimensions: bool = False,
    view: str = TAG_VIEW_NORMALIZED,
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    seen = set()
    for job in jobs:
        for entry in _iter_job_tag_entries(job, include_fixed_dimensions=include_fixed_dimensions, view=view):
            key = (entry.get("tagType"), clean_text(entry.get("name")).lower())
            if not key[1] or key in seen:
                continue
            seen.add(key)
            rows.append(entry)
    rows.sort(key=lambda item: (clean_text(item.get("tagType")), clean_text(item.get("name")).lower()))
    return rows


def collect_job_tag_names(
    jobs: List[Dict[str, Any]],
    include_fixed_dimensions: bool = False,
    view: str = TAG_VIEW_NORMALIZED,
) -> List[str]:
    names = {
        entry["name"]
        for entry in collect_job_tag_entries(jobs, include_fixed_dimensions=include_fixed_dimensions, view=view)
        if clean_text(entry.get("name"))
    }
    return sorted(names)


def build_high_frequency_index(jobs: List[Dict[str, Any]]) -> Dict[Tuple[str, str], Dict[str, Any]]:
    total_jobs = len(jobs) or 1
    counts: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for job in jobs:
        seen = set()
        for entry in _iter_job_tag_entries(job, include_fixed_dimensions=False):
            key = (entry["tagType"], entry["name"].lower())
            if key in seen:
                continue
            seen.add(key)
            current = counts.setdefault(
                key,
                {
                    "tagType": entry["tagType"],
                    "canonicalName": entry["name"],
                    "canonicalNameZh": clean_text(entry.get("nameZh")) or entry["name"],
                    "jobCount": 0,
                    "tagId": stable_tag_id(entry["tagType"], entry["name"]),
                },
            )
            current["jobCount"] += 1
            if not clean_text(current.get("canonicalNameZh")) and clean_text(entry.get("nameZh")):
                current["canonicalNameZh"] = clean_text(entry.get("nameZh"))

    high_freq: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for key, entry in counts.items():
        job_ratio = entry["jobCount"] / total_jobs
        if entry["jobCount"] >= NORMALIZATION_MIN_JOB_COUNT:
            high_freq[key] = {
                "tagId": entry["tagId"],
                "canonicalName": entry["canonicalName"],
                "canonicalNameZh": clean_text(entry.get("canonicalNameZh")) or entry["canonicalName"],
                "tagType": entry["tagType"],
                "jobCount": entry["jobCount"],
                "jobRatio": round(job_ratio, 6),
            }
    return high_freq


def build_similarity_pools(
    high_freq_index: Dict[Tuple[str, str], Dict[str, Any]],
    cache: Dict[str, np.ndarray],
) -> Dict[str, Dict[str, Any]]:
    pools: Dict[str, Dict[str, Any]] = {}
    grouped_rows: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in high_freq_index.values():
        grouped_rows[row["tagType"]].append(row)

    for tag_type, rows in grouped_rows.items():
        usable_rows = [
            row for row in rows if embedding_cache_key(row["canonicalName"]) in cache
        ]
        if not usable_rows:
            continue
        pools[tag_type] = {
            "rows": usable_rows,
            "matrix": np.vstack(
                [cache[embedding_cache_key(row["canonicalName"])] for row in usable_rows]
            ),
        }
    return pools


def unique_clean_texts(values: List[str]) -> List[str]:
    result: List[str] = []
    seen: Set[str] = set()
    for value in values:
        text = clean_text(value)
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(text)
    return result


def expected_similarity_pool_types(high_freq_index: Dict[Tuple[str, str], Dict[str, Any]]) -> List[str]:
    tag_types = {
        clean_text(row.get("tagType"))
        for row in high_freq_index.values()
        if clean_text(row.get("tagType")) and clean_text(row.get("canonicalName"))
    }
    return sorted(tag_type for tag_type in tag_types if tag_type)


def validate_pairwise_similarity_space(
    *,
    high_freq_index: Dict[Tuple[str, str], Dict[str, Any]],
    required_texts: List[str],
    cache: Dict[str, np.ndarray],
    similarity_pools: Dict[str, Dict[str, Any]],
) -> None:
    if not high_freq_index:
        raise RuntimeError("无法启动归一：当前岗位库没有满足最小频次要求的归一候选池，无法建立两两归一向量空间")

    missing_texts = [text for text in required_texts if embedding_cache_key(text) not in cache]
    if missing_texts:
        sample = " / ".join(missing_texts[:5])
        raise RuntimeError(
            f"无法启动归一：仍有 {len(missing_texts)} 个标签缺少 embedding，无法建立两两归一向量空间。示例：{sample}"
        )

    missing_types = [tag_type for tag_type in expected_similarity_pool_types(high_freq_index) if tag_type not in similarity_pools]
    if missing_types:
        raise RuntimeError(
            f"无法启动归一：两两归一向量空间不完整，缺少这些 tagType 的相似度池：{', '.join(missing_types)}"
        )


async def prepare_pairwise_similarity_space(
    high_freq_index: Dict[Tuple[str, str], Dict[str, Any]],
    texts_to_embed: List[str],
    *,
    cache: Optional[Dict[str, np.ndarray]] = None,
    require_complete_space: bool = True,
) -> Dict[str, Any]:
    embedding_cache = cache if cache is not None else load_embedding_cache()
    required_texts = unique_clean_texts(texts_to_embed)
    embedded_count = 0
    if required_texts:
        embedded_count = await ensure_embeddings(required_texts, embedding_cache)

    similarity_pools = build_similarity_pools(high_freq_index, embedding_cache) if high_freq_index else {}
    if require_complete_space:
        validate_pairwise_similarity_space(
            high_freq_index=high_freq_index,
            required_texts=required_texts,
            cache=embedding_cache,
            similarity_pools=similarity_pools,
        )

    return {
        "high_freq_index": high_freq_index,
        "embedding_cache": embedding_cache,
        "required_texts": required_texts,
        "embedded_count": embedded_count,
        "similarity_pools": similarity_pools,
        "pool_types": sorted(similarity_pools.keys()),
    }


def init_normalization_stats() -> Dict[str, Any]:
    per_type = {
        tag_type: {
            "total": 0,
            "accepted": 0,
            "exactAccepted": 0,
            "embeddingAccepted": 0,
            "new": 0,
        }
        for tag_type in TAG_PREFIX.keys()
    }
    return {
        "total": 0,
        "accepted": 0,
        "exactAccepted": 0,
        "embeddingAccepted": 0,
        "new": 0,
        "byType": per_type,
        "decisionSummary": {
            "accepted": [],
            "new": [],
            "suggestions": [],
        },
    }


def record_normalization(stats: Dict[str, Any], tag_type: str, status: str, method: str) -> None:
    stats["total"] += 1
    stats["byType"][tag_type]["total"] += 1
    if status == "accepted":
        stats["accepted"] += 1
        stats["byType"][tag_type]["accepted"] += 1
        if method == "exact":
            stats["exactAccepted"] += 1
            stats["byType"][tag_type]["exactAccepted"] += 1
        elif method == "embedding":
            stats["embeddingAccepted"] += 1
            stats["byType"][tag_type]["embeddingAccepted"] += 1
    else:
        stats["new"] += 1
        stats["byType"][tag_type]["new"] += 1


def append_unique_sample(rows: List[Dict[str, Any]], sample: Dict[str, Any], key_fields: List[str], limit: int = 200) -> None:
    if len(rows) >= limit:
        return
    for existing in rows:
        matched = True
        for field in key_fields:
            if clean_text(existing.get(field)).lower() != clean_text(sample.get(field)).lower():
                matched = False
                break
        if matched:
            return
    rows.append(sample)


def record_normalization_decision(
    stats: Dict[str, Any],
    *,
    tag_type: str,
    source_name: str,
    outcome: str,
    method: str = "",
    canonical_name: str = "",
    suggested_name: str = "",
    score: Optional[float] = None,
    threshold: Optional[float] = None,
) -> None:
    summary = stats.setdefault("decisionSummary", {})
    source_name = clean_text(source_name)
    canonical_name = clean_text(canonical_name)
    suggested_name = clean_text(suggested_name)
    sample = {
        "tagType": tag_type,
        "sourceName": source_name,
        "canonicalName": canonical_name or None,
        "suggestedName": suggested_name or None,
        "method": method or None,
        "score": round(float(score), 4) if score is not None else None,
        "threshold": round(float(threshold), 4) if threshold is not None else None,
    }
    if outcome == "accepted":
        append_unique_sample(summary.setdefault("accepted", []), sample, ["tagType", "sourceName", "canonicalName"])
    elif outcome == "new":
        append_unique_sample(summary.setdefault("new", []), sample, ["tagType", "sourceName"])
    if suggested_name:
        append_unique_sample(summary.setdefault("suggestions", []), sample, ["tagType", "sourceName", "suggestedName"])


def resolve_canonical_name(
    name: str,
    tag_type: str,
    high_freq_index: Dict[Tuple[str, str], Dict[str, Any]],
    similarity_pools: Dict[str, Dict[str, Any]],
    cache: Dict[str, np.ndarray],
    stats: Dict[str, Any],
) -> Optional[str]:
    name = clean_text(name)
    if not name:
        return None
    alias = resolve_tag_alias(name, tag_type)
    if alias:
        alias_key = (tag_type, alias.lower())
        canonical = high_freq_index.get(alias_key)
        if canonical:
            record_normalization(stats, tag_type, "accepted", "exact")
            record_normalization_decision(
                stats,
                tag_type=tag_type,
                source_name=name,
                outcome="accepted",
                method="exact",
                canonical_name=canonical["canonicalName"],
                score=1.0,
                threshold=1.0,
            )
            return canonical["canonicalName"]
    exact_key = (tag_type, name.lower())
    canonical = high_freq_index.get(exact_key)
    if canonical:
        record_normalization(stats, tag_type, "accepted", "exact")
        record_normalization_decision(
            stats,
            tag_type=tag_type,
            source_name=name,
            outcome="accepted",
            method="exact",
            canonical_name=canonical["canonicalName"],
            score=1.0,
            threshold=1.0,
        )
        return canonical["canonicalName"]

    pool = similarity_pools.get(tag_type)
    vector = cache.get(embedding_cache_key(name))
    threshold = NORMALIZE_THRESHOLDS.get(tag_type, 0.95)
    best_partner = ""
    best_score: Optional[float] = None
    if pool and vector is not None:
        sims = np.dot(pool["matrix"], vector)
        best_index = int(np.argmax(sims))
        best_score = float(sims[best_index])
        best_partner = clean_text(pool["rows"][best_index]["canonicalName"])
        if best_score >= threshold:
            record_normalization(stats, tag_type, "accepted", "embedding")
            record_normalization_decision(
                stats,
                tag_type=tag_type,
                source_name=name,
                outcome="accepted",
                method="embedding",
                canonical_name=best_partner,
                score=best_score,
                threshold=threshold,
            )
            return best_partner

    record_normalization(stats, tag_type, "new", "")
    record_normalization_decision(
        stats,
        tag_type=tag_type,
        source_name=name,
        outcome="new",
        method="embedding" if best_partner else "",
        suggested_name=best_partner,
        score=best_score,
        threshold=threshold if best_partner else None,
    )
    return None


def normalize_imported_job(
    job: Dict[str, Any],
    high_freq_index: Dict[Tuple[str, str], Dict[str, Any]],
    similarity_pools: Dict[str, Dict[str, Any]],
    cache: Dict[str, np.ndarray],
    stats: Dict[str, Any],
) -> Dict[str, Any]:
    normalized = normalize_job_profile(json.loads(json.dumps(job)))

    for item in normalized.get("techCapabilities", []):
        if clean_text(item.get("type")) == "soft_flag":
            continue
        canonical = resolve_canonical_name(
            tech_capability_tag_name(item),
            "techCapabilities",
            high_freq_index,
            similarity_pools,
            cache,
            stats,
        )
        item["normalizedTag"] = canonical or None
        if canonical:
            item["skill"] = canonical

    for item in normalized.get("devTools", []):
        canonical = resolve_canonical_name(
            dev_tool_tag_name(item),
            "devTools",
            high_freq_index,
            similarity_pools,
            cache,
            stats,
        )
        item["normalizedTag"] = canonical or None
        if canonical:
            item["skill"] = canonical

    for item in normalized.get("techStack", []):
        target_items = item.get("options", []) if is_tech_stack_branch(item) else [item]
        for option in target_items:
            if not isinstance(option, dict):
                continue
            current_name = (
                clean_text(option.get("rawExtractedText"))
                or clean_text(option.get("name"))
                or clean_text(option.get("skill"))
                or clean_text(option.get("normalizedTag"))
            )
            canonical = resolve_canonical_name(
                current_name,
                "techStack",
                high_freq_index,
                similarity_pools,
                cache,
                stats,
            )
            if canonical:
                option["rawExtractedText"] = current_name or clean_text(option.get("name")) or clean_text(option.get("skill"))
                option["name"] = canonical
                option["normalizedTag"] = canonical

    return normalized


async def export_job_tag_embeddings(jobs: List[Dict[str, Any]], output_path) -> Dict[str, Any]:
    vector_config = current_vector_config()
    entries = collect_job_tag_entries(jobs, include_fixed_dimensions=False)
    texts = [clean_text(entry.get("name")) for entry in entries if clean_text(entry.get("name"))]
    cache = load_embedding_cache()
    error = ""
    embedded_count = 0
    if texts:
        try:
            embedded_count = await ensure_embeddings(texts, cache)
        except Exception as exc:
            error = str(exc)

    written = 0
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        for entry in entries:
            name = clean_text(entry.get("name"))
            vector = cache.get(embedding_cache_key(name))
            if not name or vector is None:
                continue
            handle.write(
                json.dumps(
                    {
                        "tagType": clean_text(entry.get("tagType")),
                        "tagName": name,
                        "tagNameZh": clean_text(entry.get("nameZh")) or name,
                        "cacheKey": embedding_cache_key(name),
                        "embedding": vector.astype(float).tolist(),
                        "profileId": vector_config.profile_id,
                        "provider": vector_config.provider,
                        "model": vector_config.model,
                        "dimensions": int(vector_config.dimensions or len(vector)),
                        "updatedAt": now_iso(),
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            written += 1
    return {
        "profileId": vector_config.profile_id,
        "provider": vector_config.provider,
        "model": vector_config.model,
        "requested": len(texts),
        "embedded": embedded_count,
        "written": written,
        "error": error,
    }


CAREER_NORMALIZATION_CLUSTER_THRESHOLD = 0.87
CAREER_NORMALIZATION_PROMPT_VERSION = "career_cleanup_v1"
DELETE_NORMALIZED_TAG = "DELETE"
NORMALIZATION_MODIFIER_RE = re.compile(
    r"^\s*(familiar(?:ity)? with|understanding(?: of)?|proficient (?:with|in|at)|"
    r"knowledge of|experience with|ability to|able to|mastery of|掌握|熟悉|了解|理解|具备)",
    re.IGNORECASE,
)
CJK_TEXT_RE = re.compile(r"[\u4e00-\u9fff]")


@dataclass(frozen=True)
class CareerNormalizationLLMConfig:
    base_url: str
    api_key: str
    model: str
    cache_file: str
    temperature: float = 0
    max_tokens: int = 4096
    timeout_seconds: int = 180
    rpm: int = 800
    max_workers: int = 30
    source: str = "JOB_SYSTEM_NORMALIZATION_LLM"


def load_career_normalization_llm_config() -> CareerNormalizationLLMConfig:
    return CareerNormalizationLLMConfig(
        base_url=clean_text(os.getenv("JOB_SYSTEM_NORMALIZATION_LLM_BASE_URL")) or "https://test.lemonapi.ai/v1/",
        api_key=clean_text(os.getenv("JOB_SYSTEM_NORMALIZATION_LLM_API_KEY"))
        or "",
        model=clean_text(os.getenv("JOB_SYSTEM_NORMALIZATION_LLM_MODEL")) or "gpt-5.4",
        cache_file=clean_text(os.getenv("JOB_SYSTEM_NORMALIZATION_LLM_CACHE_FILE")) or "normalized_cluster_llm_cache_v2.json",
        temperature=parse_float(os.getenv("JOB_SYSTEM_NORMALIZATION_LLM_TEMPERATURE"), 0),
        max_tokens=parse_int(os.getenv("JOB_SYSTEM_NORMALIZATION_LLM_MAX_TOKENS"), 4096),
        timeout_seconds=parse_int(os.getenv("JOB_SYSTEM_NORMALIZATION_LLM_TIMEOUT_SECONDS"), 180),
        rpm=parse_int(os.getenv("JOB_SYSTEM_NORMALIZATION_LLM_RPM"), 800),
        max_workers=parse_int(os.getenv("JOB_SYSTEM_NORMALIZATION_LLM_MAX_WORKERS"), 30),
    )


def load_domain_translation_llm_config() -> CareerNormalizationLLMConfig:
    """Domain Center zh naming runs in job-admin but reuses the profile AI LLM if configured."""
    has_profile_ai_key = bool(first_clean_env("CAREER_PLANNER_AI_LLM_API_KEY"))
    return CareerNormalizationLLMConfig(
        base_url=first_clean_env(
            "CAREER_PLANNER_AI_LLM_BASE_URL",
            "JOB_SYSTEM_NORMALIZATION_LLM_BASE_URL",
            default="https://test.lemonapi.ai/v1/",
        ),
        api_key=first_clean_env(
            "CAREER_PLANNER_AI_LLM_API_KEY",
            "JOB_SYSTEM_NORMALIZATION_LLM_API_KEY",
            default="",
        ),
        model=first_clean_env(
            "CAREER_PLANNER_AI_LLM_MODEL",
            "JOB_SYSTEM_NORMALIZATION_LLM_MODEL",
            default="gemini-3-flash-preview",
        ),
        cache_file=clean_text(os.getenv("JOB_SYSTEM_NORMALIZATION_LLM_CACHE_FILE")) or "normalized_cluster_llm_cache_v2.json",
        temperature=parse_float(
            first_clean_env("CAREER_PLANNER_AI_LLM_TEMPERATURE", "JOB_SYSTEM_NORMALIZATION_LLM_TEMPERATURE", default="0.2"),
            0.2,
        ),
        max_tokens=parse_int(
            first_clean_env("CAREER_PLANNER_AI_LLM_MAX_TOKENS", "JOB_SYSTEM_NORMALIZATION_LLM_MAX_TOKENS", default="4000"),
            4000,
        ),
        timeout_seconds=parse_int(
            first_clean_env("CAREER_PLANNER_AI_LLM_TIMEOUT_SECONDS", "JOB_SYSTEM_NORMALIZATION_LLM_TIMEOUT_SECONDS", default="120"),
            120,
        ),
        rpm=parse_int(os.getenv("JOB_SYSTEM_NORMALIZATION_LLM_RPM"), 800),
        max_workers=parse_int(os.getenv("JOB_SYSTEM_NORMALIZATION_LLM_MAX_WORKERS"), 30),
        source="CAREER_PLANNER_AI_LLM" if has_profile_ai_key else "JOB_SYSTEM_NORMALIZATION_LLM",
    )


def llm_chat_completions_url(base_url: str) -> str:
    base = clean_text(base_url).rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return f"{base}/chat/completions"


def normalization_cache_path(cache_file: str) -> Path:
    ensure_tag_dirs()
    return TAG_DIR / cache_file


def load_json_object_cache(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def save_json_object_cache(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def contains_cjk_text(text: str) -> bool:
    return bool(CJK_TEXT_RE.search(clean_text(text)))


def looks_like_requirement_tag(text: str) -> bool:
    value = clean_text(text)
    if not value:
        return False
    lowered = value.lower()
    if NORMALIZATION_MODIFIER_RE.search(value):
        return True
    markers = [
        "such as",
        "including",
        "at least",
        "more than",
        "hands-on",
        "responsible for",
        "required",
        "requirements",
        "经验",
        "经历",
        "要求",
        "优先",
    ]
    return any(marker in lowered or marker in value for marker in markers)


def needs_tag_normalization(text: str) -> bool:
    value = clean_text(text)
    if not value:
        return False
    if contains_cjk_text(value) or looks_like_requirement_tag(value):
        return True
    words = re.findall(r"[A-Za-z0-9+#.\-]+", value)
    return len(value) > 72 or len(words) > 8


def parse_llm_json_fragment(text: str) -> Any:
    raw = clean_text(text)
    if not raw:
        raise ValueError("empty LLM response")
    starts = [index for index in (raw.find("{"), raw.find("[")) if index >= 0]
    if not starts:
        raise ValueError(f"LLM response is not JSON: {raw[:120]}")
    decoder = json.JSONDecoder()
    payload, _ = decoder.raw_decode(raw[min(starts) :])
    while isinstance(payload, list) and len(payload) == 1:
        payload = payload[0]
    return payload


def normalize_llm_tag_payload(payload: Any) -> Dict[str, str]:
    while isinstance(payload, list) and len(payload) == 1:
        payload = payload[0]
    if isinstance(payload, str):
        tag = clean_text(payload)
    elif isinstance(payload, dict):
        tag = (
            clean_text(payload.get("normalizedTag"))
            or clean_text(payload.get("canonicalTag"))
            or clean_text(payload.get("tag"))
            or clean_text(payload.get("value"))
            or clean_text(payload.get("result"))
        )
        if clean_text(payload.get("action")).upper() == DELETE_NORMALIZED_TAG:
            tag = DELETE_NORMALIZED_TAG
    else:
        raise ValueError("LLM JSON must be an object, string, or singleton array")

    if tag.upper() in {"[DELETE]", "__DELETE__", DELETE_NORMALIZED_TAG}:
        return {"action": "delete", "normalizedTag": DELETE_NORMALIZED_TAG}
    if not tag:
        raise ValueError("LLM JSON missing normalizedTag")
    if contains_cjk_text(tag):
        raise ValueError(f"LLM normalizedTag still contains Chinese: {tag}")
    return {"action": "replace", "normalizedTag": tag}


def tag_translation_cache_key(tag_type: str, normalized_tag: str) -> str:
    payload = {
        "version": TAG_TRANSLATION_PROMPT_VERSION,
        "tagType": clean_text(tag_type),
        "normalizedTag": clean_text(normalized_tag),
    }
    return hashlib.sha1(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def parse_translation_array_payload(payload: Any) -> List[str]:
    if isinstance(payload, dict):
        for key in ("translations", "items", "results", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                payload = value
                break
    if not isinstance(payload, list):
        raise ValueError("translation response must be a JSON string array")
    rows: List[str] = []
    for item in payload:
        if isinstance(item, str):
            rows.append(clean_text(item))
        elif isinstance(item, dict):
            rows.append(
                clean_text(item.get("translation"))
                or clean_text(item.get("zh"))
                or clean_text(item.get("nameZh"))
                or clean_text(item.get("value"))
            )
        else:
            rows.append("")
    return rows


def apply_tag_translation_cache_to_rows(rows: List[Dict[str, Any]], cache: Dict[str, Any]) -> int:
    updated = 0
    for row in rows:
        tag_type = clean_text(row.get("tagType"))
        normalized_tag = clean_text(row.get("canonicalName") or row.get("tagName"))
        if tag_type not in TRANSLATABLE_TAG_TYPES or not normalized_tag:
            continue
        cached = cache.get(tag_translation_cache_key(tag_type, normalized_tag))
        if not isinstance(cached, dict):
            continue
        translated = clean_text(cached.get("nameZh") or cached.get("translation"))
        if not translated:
            continue
        current = clean_text(row.get("canonicalNameZh") or row.get("tagNameZh"))
        if current == translated:
            continue
        if "canonicalNameZh" in row:
            row["canonicalNameZh"] = translated
        if "tagNameZh" in row:
            row["tagNameZh"] = translated
        updated += 1
    return updated


def apply_tag_translation_cache_to_relations(
    relations: List[Dict[str, Any]],
    rows: List[Dict[str, Any]],
) -> int:
    zh_by_id = {
        clean_text(row.get("tagId")): clean_text(row.get("canonicalNameZh") or row.get("tagNameZh"))
        for row in rows
        if clean_text(row.get("tagId"))
    }
    updated = 0
    for relation in relations:
        translated = zh_by_id.get(clean_text(relation.get("tagId")))
        if not translated or clean_text(relation.get("tagNameZh")) == translated:
            continue
        relation["tagNameZh"] = translated
        updated += 1
    return updated


def apply_tag_translation_cache_to_tag_asset_files(cache: Optional[Dict[str, Any]] = None) -> Dict[str, int]:
    resolved_cache = cache if isinstance(cache, dict) else load_json_object_cache(TAG_TRANSLATION_CACHE_FILE)
    stats = {"masterRows": 0, "highFrequencyRows": 0, "relations": 0}
    master_path = tag_master_file_path(TAG_VIEW_NORMALIZED)
    high_path = high_frequency_tags_file_path(TAG_VIEW_NORMALIZED)
    relations_path = job_tag_relations_file_path(TAG_VIEW_NORMALIZED)

    master_rows: List[Dict[str, Any]] = []
    if master_path.exists():
        try:
            payload = json.loads(master_path.read_text(encoding="utf-8-sig"))
            master_rows = payload if isinstance(payload, list) else []
        except Exception:
            master_rows = []
    if master_rows:
        stats["masterRows"] = apply_tag_translation_cache_to_rows(master_rows, resolved_cache)
        master_path.write_text(json.dumps(master_rows, ensure_ascii=False, indent=2), encoding="utf-8")
        (TAG_DIR / "tag_master.json").write_text(json.dumps(master_rows, ensure_ascii=False, indent=2), encoding="utf-8")

    if high_path.exists():
        try:
            payload = json.loads(high_path.read_text(encoding="utf-8-sig"))
            high_rows = payload if isinstance(payload, list) else []
        except Exception:
            high_rows = []
        if high_rows:
            stats["highFrequencyRows"] = apply_tag_translation_cache_to_rows(high_rows, resolved_cache)
            high_path.write_text(json.dumps(high_rows, ensure_ascii=False, indent=2), encoding="utf-8")
            (TAG_DIR / "high_frequency_tags.json").write_text(json.dumps(high_rows, ensure_ascii=False, indent=2), encoding="utf-8")

    if master_rows and relations_path.exists():
        relations: List[Dict[str, Any]] = []
        with relations_path.open("r", encoding="utf-8-sig") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(row, dict):
                    relations.append(row)
        stats["relations"] = apply_tag_translation_cache_to_relations(relations, master_rows)
        with relations_path.open("w", encoding="utf-8") as handle:
            for row in relations:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
        with (TAG_DIR / "job_tag_relations.jsonl").open("w", encoding="utf-8") as handle:
            for row in relations:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    return stats


async def call_tag_translation_batch(
    client: httpx.AsyncClient,
    config: CareerNormalizationLLMConfig,
    rows: List[Dict[str, str]],
    rate_limiter: AsyncRequestRateLimiter,
) -> Dict[str, Any]:
    await rate_limiter.acquire()
    terms = [row["normalizedTag"] for row in rows]
    user_prompt = (
        "将后续每行的 IT 类专业名词翻译成中文，仅以字符串数组 JSON 格式返回。\n"
        "要求：返回数组长度必须与输入行数完全一致，顺序必须完全对应；不要返回解释、编号或 Markdown。\n\n"
        + "\n".join(terms)
    )
    response = await client.post(
        llm_chat_completions_url(config.base_url),
        headers={"Authorization": f"Bearer {config.api_key}", "Content-Type": "application/json"},
        json={
            "model": config.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You translate IT career taxonomy terms into concise Simplified Chinese. Return JSON only.",
                },
                {"role": "user", "content": user_prompt},
            ],
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
        },
    )
    response.raise_for_status()
    data = response.json()
    text = clean_text(data.get("choices", [{}])[0].get("message", {}).get("content"))
    translations = parse_translation_array_payload(parse_llm_json_fragment(text))
    if len(translations) != len(rows):
        raise ValueError(f"translation count mismatch: expected {len(rows)}, got {len(translations)}")
    return {
        "translations": translations,
        "usage": normalize_token_usage(data.get("usage") or data.get("token_usage")),
        "rawText": text,
    }


async def enrich_tag_assets_with_zh_translations(
    *,
    emit_progress: Optional[Callable[[int, str, str], Awaitable[None]]] = None,
    emit_log: Optional[Callable[[str, str, Optional[Dict[str, Any]]], Awaitable[None]]] = None,
) -> Dict[str, Any]:
    llm_config = load_career_normalization_llm_config()
    if not clean_text(llm_config.api_key):
        return {"status": "skipped_missing_llm_key", "translated": 0, "cacheFile": str(TAG_TRANSLATION_CACHE_FILE)}
    if clean_text(os.getenv("JOB_SYSTEM_TAG_TRANSLATION_ENABLED", "1")).lower() in {"0", "false", "no"}:
        return {"status": "skipped_disabled", "translated": 0, "cacheFile": str(TAG_TRANSLATION_CACHE_FILE)}

    rows = json.loads(tag_master_file_path(TAG_VIEW_NORMALIZED).read_text(encoding="utf-8-sig")) if tag_master_file_path(TAG_VIEW_NORMALIZED).exists() else []
    if not isinstance(rows, list):
        return {"status": "skipped_missing_tag_master", "translated": 0, "cacheFile": str(TAG_TRANSLATION_CACHE_FILE)}

    cache = load_json_object_cache(TAG_TRANSLATION_CACHE_FILE)
    pending: List[Dict[str, str]] = []
    for row in rows:
        tag_type = clean_text(row.get("tagType"))
        normalized_tag = clean_text(row.get("canonicalName") or row.get("tagName"))
        if tag_type not in TRANSLATABLE_TAG_TYPES or not normalized_tag:
            continue
        key = tag_translation_cache_key(tag_type, normalized_tag)
        if isinstance(cache.get(key), dict) and clean_text(cache[key].get("nameZh")):
            continue
        pending.append({"tagType": tag_type, "normalizedTag": normalized_tag, "cacheKey": key})

    if emit_progress:
        await maybe_await(emit_progress(96, "tag_translation", f"Translating Tag Center zh names; pending={len(pending)}"))
    if not pending:
        return {"status": "ok_cached", "translated": 0, "cacheFile": str(TAG_TRANSLATION_CACHE_FILE)}

    translated = 0
    usage = empty_token_usage()
    rate_limiter = AsyncRequestRateLimiter(max(1, int(llm_config.rpm or 1)))
    async with httpx.AsyncClient(timeout=max(30, int(llm_config.timeout_seconds or 180))) as client:
        for start in range(0, len(pending), TAG_TRANSLATION_BATCH_SIZE):
            batch = pending[start : start + TAG_TRANSLATION_BATCH_SIZE]
            result = await call_tag_translation_batch(client, llm_config, batch, rate_limiter)
            usage = merge_token_usage(usage, result.get("usage") or {})
            for item, name_zh in zip(batch, result["translations"]):
                cache[item["cacheKey"]] = {
                    "tagType": item["tagType"],
                    "normalizedTag": item["normalizedTag"],
                    "nameZh": clean_text(name_zh) or item["normalizedTag"],
                    "model": llm_config.model,
                    "updatedAt": now_iso(),
                }
                translated += 1
            save_json_object_cache(TAG_TRANSLATION_CACHE_FILE, cache)
            if emit_log:
                await maybe_await(
                    emit_log(
                        "tag_translation",
                        "translated tag center batch",
                        {"translated": translated, "totalPending": len(pending), "batchSize": len(batch)},
                    )
                )

    apply_tag_translation_cache_to_tag_asset_files(cache)
    return {
        "status": "ok",
        "translated": translated,
        "cacheFile": str(TAG_TRANSLATION_CACHE_FILE),
        "usage": usage,
    }


def normalization_llm_cache_key(stage: str, tag_type: str, input_tag: str, samples: List[str]) -> str:
    payload = {
        "version": CAREER_NORMALIZATION_PROMPT_VERSION,
        "stage": clean_text(stage),
        "tagType": clean_text(tag_type),
        "inputTag": clean_text(input_tag),
        "samples": [clean_text(sample) for sample in samples[:5] if clean_text(sample)],
    }
    return hashlib.sha1(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def build_normalization_messages(stage: str, tag_type: str, input_tag: str, samples: List[str]) -> List[Dict[str, str]]:
    system_prompt = (
        "Normalize one career dataset tag. Return JSON only. "
        "The output must be the shortest stable professional English noun phrase. "
        "Return DELETE when the input is not a valid technical tag. Never return Chinese text."
    )
    category_rule = (
        "For techCapabilities, keep only principle, engineering, or scene technical capability tags. "
        "Delete soft skills, generic business terms, and unsupported phrases."
        if tag_type == "techCapabilities"
        else ""
    )
    user_payload = {
        "stage": stage,
        "tagType": tag_type,
        "inputTag": input_tag,
        "samples": [sample for sample in samples[:5] if clean_text(sample)],
        "rules": [
            "Return JSON only in the shape {\"normalizedTag\":\"...\"}.",
            "Use DELETE as normalizedTag when the tag should be removed.",
            "Prefer official names for concrete technologies and concise noun phrases for capabilities.",
            "Remove requirement wording such as Familiar with, Proficient in, Understanding of, Experience with.",
            "Do not modify or translate skillZh; only decide the English normalizedTag.",
            category_rule,
        ],
        "examples": [
            {"input": "Familiar with Logistic Regression (LR) models", "normalizedTag": "Logistic regression"},
            {"input": "Familiarity with common industry LLM inference acceleration frameworks such as TensorRT-LLM", "normalizedTag": "TensorRT-LLM"},
            {"input": "Familiarity with the principles and characteristics of the Fast-LIO open-source algorithm", "normalizedTag": "Fast-LIO algorithm"},
        ],
    }
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
    ]


async def call_normalization_llm(
    client: httpx.AsyncClient,
    config: CareerNormalizationLLMConfig,
    *,
    stage: str,
    tag_type: str,
    input_tag: str,
    samples: List[str],
    rate_limiter: AsyncRequestRateLimiter,
) -> Dict[str, Any]:
    await rate_limiter.acquire()
    response = await client.post(
        llm_chat_completions_url(config.base_url),
        headers={"Authorization": f"Bearer {config.api_key}", "Content-Type": "application/json"},
        json={
            "model": config.model,
            "messages": build_normalization_messages(stage, tag_type, input_tag, samples),
            "temperature": 0,
            "max_tokens": 256,
        },
    )
    response.raise_for_status()
    data = response.json()
    text = clean_text(data.get("choices", [{}])[0].get("message", {}).get("content"))
    decision = normalize_llm_tag_payload(parse_llm_json_fragment(text))
    return {
        **decision,
        "usage": normalize_token_usage(data.get("usage") or data.get("token_usage")),
        "rawText": text,
    }


async def call_normalization_llm_cached(
    client: httpx.AsyncClient,
    config: CareerNormalizationLLMConfig,
    cache: Dict[str, Any],
    cache_file: Path,
    cache_lock: asyncio.Lock,
    *,
    stage: str,
    tag_type: str,
    input_tag: str,
    samples: List[str],
    rate_limiter: AsyncRequestRateLimiter,
    max_attempts: int = 3,
) -> Dict[str, Any]:
    cache_key = normalization_llm_cache_key(stage, tag_type, input_tag, samples)
    cached = cache.get(cache_key)
    if isinstance(cached, dict) and clean_text(cached.get("normalizedTag")):
        return {**cached, "cacheHit": True, "usage": empty_token_usage()}

    last_error = ""
    for attempt in range(1, max_attempts + 1):
        try:
            result = await call_normalization_llm(
                client,
                config,
                stage=stage,
                tag_type=tag_type,
                input_tag=input_tag,
                samples=samples,
                rate_limiter=rate_limiter,
            )
            row = {
                "stage": stage,
                "tagType": tag_type,
                "inputTag": input_tag,
                "samples": samples[:5],
                "action": result["action"],
                "normalizedTag": result["normalizedTag"],
                "model": config.model,
                "updatedAt": now_iso(),
            }
            async with cache_lock:
                cache[cache_key] = row
                save_json_object_cache(cache_file, cache)
            return {**row, "cacheHit": False, "usage": result.get("usage") or empty_token_usage()}
        except Exception as exc:
            last_error = str(exc)
            if attempt >= max_attempts:
                break
            await asyncio.sleep(min(8, 2 ** (attempt - 1)))
    raise RuntimeError(last_error or "normalization LLM request failed")


def tag_item_candidate_text(tag_type: str, item: Dict[str, Any], normalized_only: bool = False) -> str:
    if normalized_only:
        return clean_text(item.get("normalizedTag"))
    if tag_type == "techStack":
        return (
            clean_text(item.get("normalizedTag"))
            or clean_text(item.get("name"))
            or clean_text(item.get("skill"))
            or clean_text(item.get("rawExtractedText"))
            or clean_text(item.get("nameZh"))
            or clean_text(item.get("skillZh"))
        )
    return (
        clean_text(item.get("normalizedTag"))
        or clean_text(item.get("skill"))
        or clean_text(item.get("name"))
        or clean_text(item.get("rawExtractedText"))
        or clean_text(item.get("skillZh"))
    )


def tag_item_samples(tag_type: str, item: Dict[str, Any]) -> List[str]:
    fields = (
        ["normalizedTag", "name", "skill", "rawExtractedText", "nameZh", "skillZh", "note"]
        if tag_type == "techStack"
        else ["normalizedTag", "skill", "name", "rawExtractedText", "skillZh", "note", "domain", "type"]
    )
    samples: List[str] = []
    seen = set()
    for field in fields:
        text = clean_text(item.get(field))
        key = text.lower()
        if text and key not in seen:
            seen.add(key)
            samples.append(text)
    return samples


def add_normalization_candidate(
    candidates: Dict[Tuple[str, str], Dict[str, Any]],
    *,
    tag_type: str,
    text: str,
    samples: List[str],
    require_refinement: bool = False,
) -> None:
    text = clean_text(text)
    if not text:
        return
    if require_refinement and not needs_tag_normalization(text):
        return
    key = (tag_type, text.lower())
    entry = candidates.setdefault(
        key,
        {"tagType": tag_type, "text": text, "occurrenceCount": 0, "samples": []},
    )
    entry["occurrenceCount"] += 1
    existing = {clean_text(sample).lower() for sample in entry["samples"]}
    for sample in samples:
        sample_text = clean_text(sample)
        sample_key = sample_text.lower()
        if sample_text and sample_key not in existing and len(entry["samples"]) < 8:
            existing.add(sample_key)
            entry["samples"].append(sample_text)


def collect_normalization_candidates(
    jobs: List[Dict[str, Any]],
    *,
    normalized_only: bool = False,
    require_refinement: bool = False,
    only_missing_or_refinement: bool = False,
) -> List[Dict[str, Any]]:
    candidates: Dict[Tuple[str, str], Dict[str, Any]] = {}

    def visit_item(tag_type: str, item: Dict[str, Any]) -> None:
        normalized_tag = clean_text(item.get("normalizedTag"))
        if only_missing_or_refinement and normalized_tag and not needs_tag_normalization(normalized_tag):
            return
        text = tag_item_candidate_text(tag_type, item, normalized_only=normalized_only)
        add_normalization_candidate(
            candidates,
            tag_type=tag_type,
            text=text,
            samples=tag_item_samples(tag_type, item),
            require_refinement=require_refinement,
        )

    for job in jobs:
        for item in job.get("techStack", []) or []:
            if is_tech_stack_branch(item):
                for option in item.get("options", []) or []:
                    if isinstance(option, dict):
                        visit_item("techStack", option)
                continue
            if isinstance(item, dict):
                visit_item("techStack", item)
        for item in job.get("techCapabilities", []) or []:
            if isinstance(item, dict) and clean_text(item.get("type")) != "soft_flag":
                visit_item("techCapabilities", item)
        for item in job.get("devTools", []) or []:
            if isinstance(item, dict):
                visit_item("devTools", item)

    rows = list(candidates.values())
    rows.sort(key=lambda item: (-int(item.get("occurrenceCount") or 0), item.get("tagType") or "", item.get("text") or ""))
    return rows


def build_candidate_clusters(
    candidates: List[Dict[str, Any]],
    embedding_cache: Dict[str, np.ndarray],
    threshold: float,
) -> List[Dict[str, Any]]:
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for candidate in candidates:
        grouped[clean_text(candidate.get("tagType"))].append(candidate)

    clusters: List[Dict[str, Any]] = []
    for tag_type, rows in grouped.items():
        sorted_rows = sorted(rows, key=lambda item: (-int(item.get("occurrenceCount") or 0), clean_text(item.get("text")).lower()))
        type_clusters: List[Dict[str, Any]] = []
        for row in sorted_rows:
            text = clean_text(row.get("text"))
            vector = embedding_cache.get(embedding_cache_key(text))
            if vector is None:
                raise RuntimeError(f"missing embedding for tag candidate: {text}")
            best_cluster = None
            best_score = -1.0
            for cluster in type_clusters:
                rep_vector = embedding_cache.get(embedding_cache_key(cluster["representative"]))
                if rep_vector is None:
                    continue
                score = float(np.dot(rep_vector, vector))
                if score > best_score:
                    best_score = score
                    best_cluster = cluster
            if best_cluster is not None and best_score >= threshold:
                best_cluster["members"].append(row)
                best_cluster["occurrenceCount"] += int(row.get("occurrenceCount") or 0)
                best_cluster["maxSimilarity"] = max(float(best_cluster.get("maxSimilarity") or 0), best_score)
                continue
            type_clusters.append(
                {
                    "tagType": tag_type,
                    "representative": text,
                    "members": [row],
                    "occurrenceCount": int(row.get("occurrenceCount") or 0),
                    "maxSimilarity": 1.0,
                }
            )
        clusters.extend(type_clusters)

    clusters.sort(key=lambda item: (-int(item.get("occurrenceCount") or 0), item.get("tagType") or "", item.get("representative") or ""))
    return clusters


def cluster_samples(cluster: Dict[str, Any]) -> List[str]:
    samples: List[str] = []
    seen = set()
    for member in cluster.get("members") or []:
        for value in [member.get("text"), *(member.get("samples") or [])]:
            text = clean_text(value)
            key = text.lower()
            if text and key not in seen:
                seen.add(key)
                samples.append(text)
            if len(samples) >= 8:
                return samples
    return samples


async def build_stage_decisions(
    *,
    stage: str,
    clusters: List[Dict[str, Any]],
    llm_config: CareerNormalizationLLMConfig,
    llm_cache: Dict[str, Any],
    llm_cache_file: Path,
    llm_cache_lock: asyncio.Lock,
    always_llm: bool = False,
) -> Tuple[Dict[Tuple[str, str], Dict[str, str]], Dict[str, Any]]:
    decisions: Dict[Tuple[str, str], Dict[str, str]] = {}
    stats = {
        "clusters": len(clusters),
        "members": sum(len(cluster.get("members") or []) for cluster in clusters),
        "llmCalls": 0,
        "cacheHits": 0,
        "deletedClusters": 0,
        "tokenUsage": empty_token_usage(),
        "samples": [],
    }
    if not clusters:
        return decisions, stats

    rate_limiter = AsyncRequestRateLimiter(max_calls=max(1, int(llm_config.rpm or 800)), period_seconds=60)
    semaphore = asyncio.Semaphore(max(1, int(llm_config.max_workers or 1)))

    async with httpx.AsyncClient(timeout=180) as client:
        async def decide_cluster(cluster: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
            representative = clean_text(cluster.get("representative"))
            tag_type = clean_text(cluster.get("tagType"))
            if not always_llm and not needs_tag_normalization(representative):
                return cluster, {
                    "action": "replace",
                    "normalizedTag": representative,
                    "cacheHit": False,
                    "usage": empty_token_usage(),
                    "llmUsed": False,
                }
            async with semaphore:
                result = await call_normalization_llm_cached(
                    client,
                    llm_config,
                    llm_cache,
                    llm_cache_file,
                    llm_cache_lock,
                    stage=stage,
                    tag_type=tag_type,
                    input_tag=representative,
                    samples=cluster_samples(cluster),
                    rate_limiter=rate_limiter,
                )
            return cluster, {**result, "llmUsed": True}

        tasks = [asyncio.create_task(decide_cluster(cluster)) for cluster in clusters]
        for task in asyncio.as_completed(tasks):
            cluster, decision = await task
            tag_type = clean_text(cluster.get("tagType"))
            normalized_tag = clean_text(decision.get("normalizedTag"))
            action = clean_text(decision.get("action")) or "replace"
            if decision.get("llmUsed"):
                if decision.get("cacheHit"):
                    stats["cacheHits"] += 1
                else:
                    stats["llmCalls"] += 1
                stats["tokenUsage"] = merge_token_usage(stats["tokenUsage"], decision.get("usage"))
            if action == "delete" or normalized_tag.upper() == DELETE_NORMALIZED_TAG:
                stats["deletedClusters"] += 1
                normalized_tag = DELETE_NORMALIZED_TAG
                action = "delete"
            for member in cluster.get("members") or []:
                text = clean_text(member.get("text"))
                if text:
                    decisions[(tag_type, text.lower())] = {"action": action, "normalizedTag": normalized_tag}
            if len(stats["samples"]) < 30:
                stats["samples"].append(
                    {
                        "tagType": tag_type,
                        "representative": clean_text(cluster.get("representative")),
                        "normalizedTag": normalized_tag,
                        "action": action,
                        "memberCount": len(cluster.get("members") or []),
                        "llmUsed": bool(decision.get("llmUsed")),
                        "cacheHit": bool(decision.get("cacheHit")),
                    }
                )
    return decisions, stats


def apply_tag_normalization_decisions(
    jobs: List[Dict[str, Any]],
    decisions: Dict[Tuple[str, str], Dict[str, str]],
    *,
    normalized_only: bool = False,
) -> int:
    changed = 0

    def apply_item(tag_type: str, item: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], int]:
        current = tag_item_candidate_text(tag_type, item, normalized_only=normalized_only)
        decision = decisions.get((tag_type, current.lower()))
        if not current or not decision:
            return item, 0
        if clean_text(decision.get("action")) == "delete":
            return None, 1
        normalized_tag = clean_text(decision.get("normalizedTag"))
        if not normalized_tag or normalized_tag.upper() == DELETE_NORMALIZED_TAG:
            return None, 1
        if clean_text(item.get("normalizedTag")) == normalized_tag:
            return item, 0
        updated = dict(item)
        updated["normalizedTag"] = normalized_tag
        return updated, 1

    for job in jobs:
        next_tech_stack = []
        for item in job.get("techStack", []) or []:
            if is_tech_stack_branch(item):
                updated_branch = dict(item)
                next_options = []
                for option in item.get("options", []) or []:
                    if not isinstance(option, dict):
                        next_options.append(option)
                        continue
                    updated_option, delta = apply_item("techStack", option)
                    changed += delta
                    if updated_option is not None:
                        next_options.append(updated_option)
                if next_options:
                    updated_branch["options"] = next_options
                    next_tech_stack.append(updated_branch)
                elif item.get("options"):
                    changed += 1
                continue
            if isinstance(item, dict):
                updated_item, delta = apply_item("techStack", item)
                changed += delta
                if updated_item is not None:
                    next_tech_stack.append(updated_item)
        job["techStack"] = next_tech_stack

        next_capabilities = []
        for item in job.get("techCapabilities", []) or []:
            if not isinstance(item, dict) or clean_text(item.get("type")) == "soft_flag":
                next_capabilities.append(item)
                continue
            updated_item, delta = apply_item("techCapabilities", item)
            changed += delta
            if updated_item is not None:
                next_capabilities.append(updated_item)
        job["techCapabilities"] = next_capabilities

        next_tools = []
        for item in job.get("devTools", []) or []:
            if not isinstance(item, dict):
                next_tools.append(item)
                continue
            updated_item, delta = apply_item("devTools", item)
            changed += delta
            if updated_item is not None:
                next_tools.append(updated_item)
        job["devTools"] = next_tools

    return changed


async def run_embedding_cluster_stage(
    *,
    jobs: List[Dict[str, Any]],
    stage: str,
    percent_base: int,
    percent_span: int,
    llm_config: CareerNormalizationLLMConfig,
    llm_cache: Dict[str, Any],
    llm_cache_file: Path,
    llm_cache_lock: asyncio.Lock,
    emit_progress: Callable[[int, str, str], Awaitable[None]],
    emit_log: Callable[[str, str, Optional[Dict[str, Any]]], Awaitable[None]],
    normalized_only: bool = False,
    require_refinement: bool = False,
    only_missing_or_refinement: bool = False,
    always_llm: bool = False,
    singleton_clusters: bool = False,
    run_cache_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    candidates = collect_normalization_candidates(
        jobs,
        normalized_only=normalized_only,
        require_refinement=require_refinement,
        only_missing_or_refinement=only_missing_or_refinement,
    )
    await emit_progress(percent_base, f"{stage}_scan", f"{stage}: scanned {len(candidates)} tag candidates")
    if not candidates:
        return {"candidates": 0, "clusters": 0, "changedOccurrences": 0, "embeddedTextsAdded": 0, "runEmbeddingCache": {}}

    embedding_cache = load_embedding_cache()
    run_cache_loaded = load_run_embedding_cache(run_cache_dir, embedding_cache)
    texts_to_embed = [clean_text(candidate.get("text")) for candidate in candidates if clean_text(candidate.get("text"))]
    embedded_count = await ensure_embeddings(texts_to_embed, embedding_cache)
    run_cache_status = persist_run_embedding_cache(
        run_cache_dir,
        stage=stage,
        texts=texts_to_embed,
        embedding_cache=embedding_cache,
    )
    await emit_progress(
        percent_base + max(1, percent_span // 4),
        f"{stage}_embedding",
        f"{stage}: embedding ready for {len(set(embedding_cache_key(text) for text in texts_to_embed))} tags",
    )
    if singleton_clusters:
        clusters = [
            {
                "tagType": clean_text(candidate.get("tagType")),
                "representative": clean_text(candidate.get("text")),
                "members": [candidate],
                "occurrenceCount": int(candidate.get("occurrenceCount") or 0),
                "maxSimilarity": 1.0,
            }
            for candidate in candidates
        ]
    else:
        clusters = build_candidate_clusters(candidates, embedding_cache, CAREER_NORMALIZATION_CLUSTER_THRESHOLD)
    await emit_progress(
        percent_base + max(2, percent_span // 2),
        f"{stage}_cluster",
        f"{stage}: built {len(clusters)} embedding clusters",
    )
    decisions, decision_stats = await build_stage_decisions(
        stage=stage,
        clusters=clusters,
        llm_config=llm_config,
        llm_cache=llm_cache,
        llm_cache_file=llm_cache_file,
        llm_cache_lock=llm_cache_lock,
        always_llm=always_llm,
    )
    changed_occurrences = apply_tag_normalization_decisions(jobs, decisions, normalized_only=normalized_only)
    await emit_log(
        stage,
        f"{stage}: completed",
        {
            "candidates": len(candidates),
            "clusters": len(clusters),
            "changedOccurrences": changed_occurrences,
            "embeddedTextsAdded": embedded_count,
            "runEmbeddingCacheLoaded": run_cache_loaded,
            "runEmbeddingCache": run_cache_status,
            "decisionStats": decision_stats,
        },
    )
    await emit_progress(
        percent_base + percent_span,
        f"{stage}_done",
        f"{stage}: updated {changed_occurrences} tag occurrences",
    )
    return {
        "candidates": len(candidates),
        "clusters": len(clusters),
        "changedOccurrences": changed_occurrences,
        "embeddedTextsAdded": embedded_count,
        "runEmbeddingCacheLoaded": run_cache_loaded,
        "runEmbeddingCache": run_cache_status,
        "decisionStats": decision_stats,
    }


async def normalize_existing_job_library_clustered(
    progress_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
    log_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
    run_cache_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    async def emit_progress(percent: int, stage: str, message: str) -> None:
        if progress_callback:
            await maybe_await(
                progress_callback(
                    {
                        "percent": max(0, min(100, int(percent))),
                        "stage": stage,
                        "message": message,
                        "cacheStatus": get_embedding_cache_status(),
                        "ts": now_iso(),
                    }
                )
            )

    async def emit_log(stage: str, message: str, payload: Optional[Dict[str, Any]] = None) -> None:
        if log_callback:
            await maybe_await(
                log_callback(
                    {
                        "stage": stage,
                        "message": message,
                        "payload": payload or {},
                        "ts": now_iso(),
                    }
                )
            )

    async with IMPORT_LOCK:
        vector_config = current_vector_config()
        llm_config = load_career_normalization_llm_config()
        if not clean_text(llm_config.api_key):
            raise RuntimeError("Normalization LLM API key is required")
        if run_cache_dir:
            run_cache_dir.mkdir(parents=True, exist_ok=True)

        await emit_progress(2, "prepare", "Preparing embedding-first career tag normalization")
        await emit_log(
            "prepare",
            "career cleanup normalization started",
            {
                "embeddingProfileId": vector_config.profile_id,
                "embeddingProvider": vector_config.provider,
                "embeddingModel": vector_config.model,
                "embeddingBatchSize": int(getattr(vector_config, "batch_size", 0) or 0),
                "embeddingMaxConcurrency": int(getattr(vector_config, "max_concurrency", 0) or 0),
                "llmModel": llm_config.model,
                "llmRpm": llm_config.rpm,
                "llmMaxWorkers": llm_config.max_workers,
                "clusterThreshold": CAREER_NORMALIZATION_CLUSTER_THRESHOLD,
                "runCacheDir": str(run_cache_dir) if run_cache_dir else "",
            },
        )

        existing_jobs = load_jobs()
        before_jobs = json.loads(json.dumps(existing_jobs))
        await emit_progress(8, "load_jobs", f"Loaded {len(existing_jobs)} jobs")
        if not existing_jobs:
            tag_summary = rebuild_tag_assets(existing_jobs)
            return {
                "ok": True,
                "normalized": 0,
                "changed": 0,
                "pipeline": "career_cleanup_embedding_cluster_llm",
                "stages": {},
                "embeddedTextsAdded": 0,
                "embeddingProfileId": vector_config.profile_id,
                "embeddingProvider": vector_config.provider,
                "embeddingModel": vector_config.model,
                "embeddingStatus": "skipped_empty_library",
                "embeddingError": "",
                "clusterThreshold": CAREER_NORMALIZATION_CLUSTER_THRESHOLD,
                "runCacheDir": str(run_cache_dir) if run_cache_dir else "",
                "tagSummary": tag_summary,
                "cacheStatus": get_embedding_cache_status(vector_config),
                "normalizedAt": now_iso(),
            }

        cluster_cache_file = normalization_cache_path(llm_config.cache_file)
        cluster_cache = load_json_object_cache(cluster_cache_file)
        cluster_cache_lock = asyncio.Lock()
        single_cache_file = normalization_cache_path("single_tag_llm_cache.json")

        stage_results: Dict[str, Any] = {}
        stage_results["cluster"] = await run_embedding_cluster_stage(
            jobs=existing_jobs,
            stage="cluster_normalization",
            percent_base=10,
            percent_span=30,
            llm_config=llm_config,
            llm_cache=cluster_cache,
            llm_cache_file=cluster_cache_file,
            llm_cache_lock=cluster_cache_lock,
            emit_progress=emit_progress,
            emit_log=emit_log,
            normalized_only=False,
            require_refinement=False,
            only_missing_or_refinement=False,
            always_llm=False,
            run_cache_dir=run_cache_dir,
        )
        stage_results["singleFallback"] = await run_embedding_cluster_stage(
            jobs=existing_jobs,
            stage="single_tag_fallback",
            percent_base=42,
            percent_span=22,
            llm_config=llm_config,
            llm_cache=load_json_object_cache(single_cache_file),
            llm_cache_file=single_cache_file,
            llm_cache_lock=asyncio.Lock(),
            emit_progress=emit_progress,
            emit_log=emit_log,
            normalized_only=False,
            require_refinement=False,
            only_missing_or_refinement=True,
            always_llm=True,
            singleton_clusters=True,
            run_cache_dir=run_cache_dir,
        )
        stage_results["normalizedTagReview"] = await run_embedding_cluster_stage(
            jobs=existing_jobs,
            stage="normalized_tag_review",
            percent_base=66,
            percent_span=24,
            llm_config=llm_config,
            llm_cache=cluster_cache,
            llm_cache_file=cluster_cache_file,
            llm_cache_lock=cluster_cache_lock,
            emit_progress=emit_progress,
            emit_log=emit_log,
            normalized_only=True,
            require_refinement=True,
            only_missing_or_refinement=False,
            always_llm=True,
            run_cache_dir=run_cache_dir,
        )

        normalized_jobs = normalize_job_library(existing_jobs)
        changed = 0
        for before, after in zip(before_jobs, normalized_jobs):
            if json.dumps(before, ensure_ascii=False, sort_keys=True) != json.dumps(after, ensure_ascii=False, sort_keys=True):
                changed += 1

        await emit_progress(94, "save_jobs", f"Saving normalized library; changed jobs: {changed}")
        save_jobs(normalized_jobs)
        tag_summary = rebuild_tag_assets(normalized_jobs)
        try:
            translation_result = await enrich_tag_assets_with_zh_translations(
                emit_progress=emit_progress,
                emit_log=emit_log,
            )
            tag_summary["translationResult"] = translation_result
        except Exception as exc:
            tag_summary["translationResult"] = {"status": "failed", "error": str(exc)}
            await emit_log("tag_translation_failed", "tag center zh translation failed", {"error": str(exc)})
        try:
            domain_translation_result = await enrich_domain_assets_with_zh_translations(
                emit_progress=emit_progress,
                emit_log=emit_log,
            )
            tag_summary["domainTranslationResult"] = domain_translation_result
        except Exception as exc:
            tag_summary["domainTranslationResult"] = {"status": "failed", "error": str(exc)}
            await emit_log("domain_translation_failed", "domain center zh translation failed", {"error": str(exc)})
        total_embedded = sum(int((stage or {}).get("embeddedTextsAdded") or 0) for stage in stage_results.values())
        result = {
            "ok": True,
            "normalized": len(normalized_jobs),
            "changed": changed,
            "pipeline": "career_cleanup_embedding_cluster_llm",
            "stages": stage_results,
            "embeddedTextsAdded": total_embedded,
            "embeddingProfileId": vector_config.profile_id,
            "embeddingProvider": vector_config.provider,
            "embeddingModel": vector_config.model,
            "embeddingStatus": "ok",
            "embeddingError": "",
            "clusterThreshold": CAREER_NORMALIZATION_CLUSTER_THRESHOLD,
            "llmModel": llm_config.model,
            "llmCacheFile": str(cluster_cache_file),
            "singleTagLlmCacheFile": str(single_cache_file),
            "runCacheDir": str(run_cache_dir) if run_cache_dir else "",
            "runEmbeddingCacheFile": str(run_cache_dir / "embedding_cache.jsonl") if run_cache_dir else "",
            "tagSummary": tag_summary,
            "cacheStatus": get_embedding_cache_status(vector_config),
            "normalizedAt": now_iso(),
        }
        await emit_log(
            "complete",
            "career cleanup normalization completed",
            {
                "normalized": result["normalized"],
                "changed": result["changed"],
                "embeddedTextsAdded": result["embeddedTextsAdded"],
                "clusterThreshold": result["clusterThreshold"],
            },
        )
        await emit_progress(100, "completed", "Career cleanup normalization completed")
        return result


async def normalize_existing_job_library(
    progress_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
    log_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
) -> Dict[str, Any]:
    return await normalize_existing_job_library_strict(
        progress_callback=progress_callback,
        log_callback=log_callback,
    )

    async def emit_progress(percent: int, stage: str, message: str) -> None:
        if progress_callback:
            await maybe_await(
                progress_callback(
                    {
                        "percent": max(0, min(100, int(percent))),
                        "stage": stage,
                        "message": message,
                        "cacheStatus": get_embedding_cache_status(),
                        "ts": now_iso(),
                    }
                )
            )

    async def emit_log(stage: str, message: str, payload: Optional[Dict[str, Any]] = None) -> None:
        if log_callback:
            await maybe_await(
                log_callback(
                    {
                        "stage": stage,
                        "message": message,
                        "payload": payload or {},
                        "ts": now_iso(),
                    }
                )
            )

    async with IMPORT_LOCK:
        vector_config = current_vector_config()
        await emit_progress(2, "prepare", "开始准备全库归一")
        await emit_log(
            "prepare",
            "归一任务启动",
            {
                "embeddingProfileId": vector_config.profile_id,
                "embeddingProvider": vector_config.provider,
                "embeddingModel": vector_config.model,
            },
        )
        existing_jobs = load_jobs()
        await emit_progress(8, "load_jobs", f"已加载 {len(existing_jobs)} 条岗位")
        if not existing_jobs:
            result = {
                "ok": True,
                "normalized": 0,
                "changed": 0,
                "existingHighFrequencyPool": 0,
                "embeddedTextsAdded": 0,
                "embeddedTextsRequested": 0,
                "embeddingProfileId": vector_config.profile_id,
                "embeddingProvider": vector_config.provider,
                "embeddingModel": vector_config.model,
                "embeddingStatus": "skipped_empty_library",
                "embeddingError": "",
                "normalizationStats": init_normalization_stats(),
                "tagSummary": rebuild_tag_assets(existing_jobs),
                "cacheStatus": get_embedding_cache_status(vector_config),
                "normalizedAt": now_iso(),
            }
            await emit_log("complete", "岗位库为空，归一直接结束", {"normalized": 0})
            await emit_progress(100, "completed", "岗位库为空，已结束")
            return result

        high_freq_index = build_high_frequency_index(existing_jobs)
        await emit_progress(18, "build_pool", f"已构建高频候选池 {len(high_freq_index)} 个")
        await emit_log("build_pool", "高频候选池构建完成", {"existingHighFrequencyPool": len(high_freq_index)})
        embedding_cache = load_embedding_cache()
        await emit_progress(28, "load_cache", f"已载入向量缓存 {len(embedding_cache)} 条")
        texts_to_embed = collect_job_tag_names(existing_jobs, include_fixed_dimensions=False)
        texts_to_embed.extend(row["canonicalName"] for row in high_freq_index.values())
        embedded_count = 0
        embedding_status = "skipped_no_existing_pool"
        embedding_error = ""
        if texts_to_embed and high_freq_index:
            await emit_progress(
                42,
                "embed_prepare",
                f"准备补齐 {len({clean_text(text) for text in texts_to_embed if clean_text(text)})} 个标签向量",
            )
            try:
                embedded_count = await ensure_embeddings(texts_to_embed, embedding_cache)
                embedding_status = "ok"
                await emit_log("embed_complete", "向量补齐完成", {"embeddedTextsAdded": embedded_count})
            except Exception as exc:
                embedding_status = "failed"
                embedding_error = str(exc)
                await emit_log("embed_degraded", "向量补齐降级，继续执行归一", {"error": embedding_error})

        await emit_progress(56, "embed_done", f"向量阶段完成，状态 {embedding_status}")

        similarity_pools = build_similarity_pools(high_freq_index, embedding_cache) if high_freq_index else {}
        await emit_progress(64, "similarity_pool", f"已构建 {len(similarity_pools)} 个相似度池")
        normalization_stats = init_normalization_stats()
        normalized_jobs: List[Dict[str, Any]] = []
        total_jobs = len(existing_jobs) or 1
        step = max(1, total_jobs // 10)
        for index, job in enumerate(existing_jobs, start=1):
            normalized_jobs.append(
                normalize_imported_job(
                    job,
                    high_freq_index,
                    similarity_pools,
                    embedding_cache,
                    normalization_stats,
                )
            )
            if index == 1 or index == total_jobs or index % step == 0:
                percent = 64 + int((index / total_jobs) * 24)
                await emit_progress(percent, "normalize_jobs", f"已处理 {index}/{total_jobs} 条岗位")

        changed = 0
        for before, after in zip(existing_jobs, normalized_jobs):
            if json.dumps(before, ensure_ascii=False, sort_keys=True) != json.dumps(after, ensure_ascii=False, sort_keys=True):
                changed += 1

        normalized_jobs = normalize_job_library(normalized_jobs)
        await emit_progress(92, "save_jobs", f"归一完成，准备写回岗位库；变化 {changed} 条")
        save_jobs(normalized_jobs)
        tag_summary = rebuild_tag_assets(normalized_jobs)
        result = {
            "ok": True,
            "normalized": len(normalized_jobs),
            "changed": changed,
            "existingHighFrequencyPool": len(high_freq_index),
            "embeddedTextsAdded": embedded_count,
            "embeddedTextsRequested": len({clean_text(text) for text in texts_to_embed if clean_text(text)}),
            "embeddingProfileId": vector_config.profile_id,
            "embeddingProvider": vector_config.provider,
            "embeddingModel": vector_config.model,
            "embeddingStatus": embedding_status,
            "embeddingError": embedding_error,
            "normalizationStats": normalization_stats,
            "normalizationThresholds": NORMALIZE_THRESHOLDS,
            "tagSummary": tag_summary,
            "cacheStatus": get_embedding_cache_status(vector_config),
            "normalizedAt": now_iso(),
        }
        await emit_log(
            "complete",
            "全库归一完成",
            {
                "normalized": result["normalized"],
                "changed": result["changed"],
                "embeddingStatus": result["embeddingStatus"],
            },
        )
        await emit_progress(100, "completed", "全库归一完成")
        return result


async def normalize_existing_job_library_strict(
    progress_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
    log_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
    run_cache_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    return await normalize_existing_job_library_clustered(
        progress_callback=progress_callback,
        log_callback=log_callback,
        run_cache_dir=run_cache_dir,
    )

    async def emit_progress(percent: int, stage: str, message: str) -> None:
        if progress_callback:
            await maybe_await(
                progress_callback(
                    {
                        "percent": max(0, min(100, int(percent))),
                        "stage": stage,
                        "message": message,
                        "cacheStatus": get_embedding_cache_status(),
                        "ts": now_iso(),
                    }
                )
            )

    async def emit_log(stage: str, message: str, payload: Optional[Dict[str, Any]] = None) -> None:
        if log_callback:
            await maybe_await(
                log_callback(
                    {
                        "stage": stage,
                        "message": message,
                        "payload": payload or {},
                        "ts": now_iso(),
                    }
                )
            )

    async with IMPORT_LOCK:
        vector_config = current_vector_config()
        await emit_progress(2, "prepare", "开始准备全库归一")
        await emit_log(
            "prepare",
            "归一任务启动",
            {
                "embeddingProfileId": vector_config.profile_id,
                "embeddingProvider": vector_config.provider,
                "embeddingModel": vector_config.model,
            },
        )
        existing_jobs = load_jobs()
        await emit_progress(8, "load_jobs", f"已加载 {len(existing_jobs)} 条岗位")
        if not existing_jobs:
            result = {
                "ok": True,
                "normalized": 0,
                "changed": 0,
                "existingHighFrequencyPool": 0,
                "embeddedTextsAdded": 0,
                "embeddedTextsRequested": 0,
                "embeddingProfileId": vector_config.profile_id,
                "embeddingProvider": vector_config.provider,
                "embeddingModel": vector_config.model,
                "embeddingStatus": "skipped_empty_library",
                "embeddingError": "",
                "pairwiseSpaceReady": False,
                "pairwiseSpacePoolCount": 0,
                "pairwiseSpaceTagTypes": [],
                "pairwiseSpaceTextCount": 0,
                "normalizationStats": init_normalization_stats(),
                "tagSummary": rebuild_tag_assets(existing_jobs),
                "cacheStatus": get_embedding_cache_status(vector_config),
                "normalizedAt": now_iso(),
            }
            await emit_log("complete", "岗位库为空，归一直接结束", {"normalized": 0})
            await emit_progress(100, "completed", "岗位库为空，已结束")
            return result

        high_freq_index = build_high_frequency_index(existing_jobs)
        await emit_progress(18, "build_pool", f"已构建高频候选池 {len(high_freq_index)} 个")
        await emit_log("build_pool", "高频候选池构建完成", {"existingHighFrequencyPool": len(high_freq_index)})

        embedding_cache = load_embedding_cache()
        await emit_progress(28, "load_cache", f"已载入向量缓存 {len(embedding_cache)} 条")
        texts_to_embed = collect_job_tag_names(existing_jobs, include_fixed_dimensions=False)
        texts_to_embed.extend(row["canonicalName"] for row in high_freq_index.values())
        required_texts = unique_clean_texts(texts_to_embed)
        await emit_progress(
            42,
            "pairwise_space_prepare",
            f"准备严格两两归一向量空间，共 {len(required_texts)} 个标签",
        )
        pairwise_space = await prepare_pairwise_similarity_space(
            high_freq_index,
            required_texts,
            cache=embedding_cache,
            require_complete_space=True,
        )
        embedding_cache = pairwise_space["embedding_cache"]
        similarity_pools = pairwise_space["similarity_pools"]
        embedded_count = int(pairwise_space["embedded_count"] or 0)
        await emit_log(
            "pairwise_space_ready",
            "严格两两归一向量空间已就绪",
            {
                "embeddedTextsAdded": embedded_count,
                "embeddedTextsRequested": len(pairwise_space["required_texts"]),
                "poolCount": len(similarity_pools),
                "poolTypes": pairwise_space["pool_types"],
            },
        )
        await emit_progress(
            56,
            "pairwise_space_ready",
            f"严格两两归一向量空间已就绪，共 {len(similarity_pools)} 个相似度池",
        )

        normalization_stats = init_normalization_stats()
        normalized_jobs: List[Dict[str, Any]] = []
        total_jobs = len(existing_jobs) or 1
        step = max(1, total_jobs // 10)
        for index, job in enumerate(existing_jobs, start=1):
            normalized_jobs.append(
                normalize_imported_job(
                    job,
                    high_freq_index,
                    similarity_pools,
                    embedding_cache,
                    normalization_stats,
                )
            )
            if index == 1 or index == total_jobs or index % step == 0:
                percent = 64 + int((index / total_jobs) * 24)
                await emit_progress(percent, "normalize_jobs", f"已处理 {index}/{total_jobs} 条岗位")

        changed = 0
        for before, after in zip(existing_jobs, normalized_jobs):
            if json.dumps(before, ensure_ascii=False, sort_keys=True) != json.dumps(after, ensure_ascii=False, sort_keys=True):
                changed += 1

        normalized_jobs = normalize_job_library(normalized_jobs)
        await emit_progress(92, "save_jobs", f"归一完成，准备写回岗位库；变更 {changed} 条")
        save_jobs(normalized_jobs)
        tag_summary = rebuild_tag_assets(normalized_jobs)
        result = {
            "ok": True,
            "normalized": len(normalized_jobs),
            "changed": changed,
            "existingHighFrequencyPool": len(high_freq_index),
            "embeddedTextsAdded": embedded_count,
            "embeddedTextsRequested": len(pairwise_space["required_texts"]),
            "embeddingProfileId": vector_config.profile_id,
            "embeddingProvider": vector_config.provider,
            "embeddingModel": vector_config.model,
            "embeddingStatus": "ok",
            "embeddingError": "",
            "pairwiseSpaceReady": True,
            "pairwiseSpacePoolCount": len(similarity_pools),
            "pairwiseSpaceTagTypes": pairwise_space["pool_types"],
            "pairwiseSpaceTextCount": len(pairwise_space["required_texts"]),
            "normalizationStats": normalization_stats,
            "normalizationThresholds": NORMALIZE_THRESHOLDS,
            "tagSummary": tag_summary,
            "cacheStatus": get_embedding_cache_status(vector_config),
            "normalizedAt": now_iso(),
        }
        await emit_log(
            "complete",
            "全库归一完成",
            {
                "normalized": result["normalized"],
                "changed": result["changed"],
                "embeddingStatus": result["embeddingStatus"],
                "pairwiseSpaceReady": result["pairwiseSpaceReady"],
            },
        )
        await emit_progress(100, "completed", "全库归一完成")
        return result


def _build_tag_asset_rows(jobs: List[Dict[str, Any]], view: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    total_jobs = len(jobs) or 1
    tag_master: Dict[Tuple[str, str], Dict[str, Any]] = {}
    relations: List[Dict[str, Any]] = []

    for job in jobs:
        for entry in _iter_job_tag_entries(job, view=view):
            tag_id = stable_tag_id(entry["tagType"], entry["name"])
            key = (entry["tagType"], tag_id)
            current = tag_master.setdefault(
                key,
                {
                    "tagId": tag_id,
                    "canonicalName": entry["name"],
                    "canonicalNameZh": clean_text(entry.get("nameZh")) or entry["name"],
                    "tagType": entry["tagType"],
                    "jobCount": 0,
                    "jobRatio": 0,
                    "isHighFrequency": False,
                    "groupId": entry.get("groupId", ""),
                },
            )
            current["jobCount"] += 1
            if not clean_text(current.get("canonicalNameZh")) and clean_text(entry.get("nameZh")):
                current["canonicalNameZh"] = clean_text(entry.get("nameZh"))
            capability_type = clean_text(entry.get("type"))
            if capability_type:
                type_counts = current.setdefault("typeCounts", defaultdict(int))
                type_counts[capability_type] += 1
            relations.append(
                {
                    "jobId": entry["jobId"],
                    "tagId": tag_id,
                    "tagType": entry["tagType"],
                    "tagName": entry["name"],
                    "tagNameZh": clean_text(entry.get("nameZh")) or entry["name"],
                    "groupId": entry.get("groupId", ""),
                    "domain": clean_text(entry.get("domain")),
                    "type": clean_text(entry.get("type")),
                }
            )

    rows = []
    for row in tag_master.values():
        row["jobRatio"] = round(row["jobCount"] / total_jobs, 6)
        row["isHighFrequency"] = row["jobRatio"] >= CANONICAL_RATIO_THRESHOLD
        raw_type_counts = row.get("typeCounts")
        if isinstance(raw_type_counts, dict) and raw_type_counts:
            type_counts = dict(
                sorted(
                    (
                        (clean_text(key), int(value or 0))
                        for key, value in raw_type_counts.items()
                        if clean_text(key) and int(value or 0) > 0
                    ),
                    key=lambda pair: (-pair[1], pair[0]),
                )
            )
            if type_counts:
                row["typeCounts"] = type_counts
                row["type"] = next(iter(type_counts))
            else:
                row.pop("typeCounts", None)
                row.pop("type", None)
        rows.append(row)
    rows.sort(key=lambda item: (-item["jobRatio"], item["tagType"], item["canonicalName"]))
    high_rows = [row for row in rows if row["isHighFrequency"]]
    summary = {
        "view": normalize_tag_view(view),
        "updatedAt": now_iso(),
        "jobCount": len(jobs),
        "tagCount": len(rows),
        "highFrequencyTagCount": len(high_rows),
        "threshold": CANONICAL_RATIO_THRESHOLD,
    }
    return rows, relations, high_rows, summary


def domain_translation_cache_key(domain: str) -> str:
    return clean_text(domain).lower()


def apply_domain_translation_cache_to_rows(rows: List[Dict[str, Any]], cache: Dict[str, Any]) -> int:
    updated = 0
    for row in rows:
        domain = clean_text(row.get("domain") or row.get("normalizedTag"))
        if not domain:
            continue
        cached = cache.get(domain_translation_cache_key(domain))
        translated = ""
        if isinstance(cached, dict):
            translated = clean_text(cached.get("nameZh") or cached.get("translation") or cached.get("name"))
        if translated and clean_text(row.get("name")) != translated:
            row["name"] = translated
            updated += 1
    return updated


def apply_domain_translation_cache_to_assets(cache: Optional[Dict[str, Any]] = None) -> Dict[str, int]:
    resolved_cache = cache if isinstance(cache, dict) else load_json_object_cache(DOMAIN_TRANSLATION_CACHE_FILE)
    stats = {"masterRows": 0, "statsRows": 0}
    if DOMAIN_MASTER_FILE.exists():
        try:
            rows = json.loads(DOMAIN_MASTER_FILE.read_text(encoding="utf-8-sig"))
        except Exception:
            rows = []
        if isinstance(rows, list):
            stats["masterRows"] = apply_domain_translation_cache_to_rows(rows, resolved_cache)
            DOMAIN_MASTER_FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    if DOMAIN_TAG_STATS_FILE.exists():
        try:
            rows = json.loads(DOMAIN_TAG_STATS_FILE.read_text(encoding="utf-8-sig"))
        except Exception:
            rows = []
        if isinstance(rows, list):
            stats["statsRows"] = apply_domain_translation_cache_to_rows(rows, resolved_cache)
            DOMAIN_TAG_STATS_FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return stats


def rebuild_domain_assets(jobs: List[Dict[str, Any]]) -> Dict[str, Any]:
    ensure_tag_dirs()
    DOMAIN_DIR.mkdir(parents=True, exist_ok=True)
    translation_cache = load_json_object_cache(DOMAIN_TRANSLATION_CACHE_FILE)
    total_jobs = len(jobs)
    domain_map: Dict[str, Dict[str, Any]] = {}

    for job in jobs:
        job_id = clean_text(job.get("id"))
        seen_domains_for_job: Set[str] = set()
        seen_tag_for_job: Set[Tuple[str, str]] = set()
        for item in job.get("techCapabilities", []) or []:
            if not isinstance(item, dict) or clean_text(item.get("type")) == "soft_flag":
                continue
            domain = clean_text(item.get("domain"))
            if not domain:
                continue
            domain_key = domain.lower()
            domain_id = stable_domain_id(domain)
            normalized_tag = tech_capability_tag_name(item)
            if not normalized_tag:
                continue
            tag_id = stable_tag_id("techCapabilities", normalized_tag)
            translated = ""
            cached = translation_cache.get(domain_translation_cache_key(domain))
            if isinstance(cached, dict):
                translated = clean_text(cached.get("nameZh") or cached.get("translation") or cached.get("name"))
            current = domain_map.setdefault(
                domain_key,
                {
                    "domainId": domain_id,
                    "domain": domain,
                    "name": translated or domain,
                    "normalizedTag": domain,
                    "jobIds": set(),
                    "mentionCount": 0,
                    "typeCounts": defaultdict(int),
                    "tagMap": {},
                },
            )
            current["mentionCount"] += 1
            if job_id and domain_key not in seen_domains_for_job:
                current["jobIds"].add(job_id)
                seen_domains_for_job.add(domain_key)
            capability_type = clean_text(item.get("type"))
            if capability_type:
                current["typeCounts"][capability_type] += 1

            tag_map = current["tagMap"]
            tag_row = tag_map.setdefault(
                tag_id,
                {
                    "tagId": tag_id,
                    "normalizedTag": normalized_tag,
                    "name": tech_capability_tag_name_zh(item) or normalized_tag,
                    "jobIds": set(),
                    "mentionCount": 0,
                    "typeCounts": defaultdict(int),
                },
            )
            tag_row["mentionCount"] += 1
            if job_id and (domain_key, tag_id) not in seen_tag_for_job:
                tag_row["jobIds"].add(job_id)
                seen_tag_for_job.add((domain_key, tag_id))
            if capability_type:
                tag_row["typeCounts"][capability_type] += 1

    master_rows: List[Dict[str, Any]] = []
    stats_rows: List[Dict[str, Any]] = []
    for item in domain_map.values():
        tag_rows: List[Dict[str, Any]] = []
        for tag in item["tagMap"].values():
            type_counts = dict(sorted(tag["typeCounts"].items(), key=lambda pair: (-pair[1], pair[0])))
            tag_rows.append(
                {
                    "tagId": tag["tagId"],
                    "normalizedTag": tag["normalizedTag"],
                    "name": tag["name"],
                    "jobCount": len(tag["jobIds"]),
                    "mentionCount": int(tag["mentionCount"]),
                    "typeCounts": type_counts,
                }
            )
        tag_rows.sort(key=lambda row: (-int(row["jobCount"]), -int(row["mentionCount"]), clean_text(row["normalizedTag"]).lower()))
        type_counts = dict(sorted(item["typeCounts"].items(), key=lambda pair: (-pair[1], pair[0])))
        master = {
            "domainId": item["domainId"],
            "domain": item["domain"],
            "name": item["name"],
            "normalizedTag": item["normalizedTag"],
            "jobCount": len(item["jobIds"]),
            "mentionCount": int(item["mentionCount"]),
            "tagCount": len(tag_rows),
            "typeCounts": type_counts,
            "updatedAt": now_iso(),
        }
        master_rows.append(master)
        stats_rows.append({**master, "tags": tag_rows})

    master_rows.sort(key=lambda row: (-int(row["jobCount"]), -int(row["mentionCount"]), clean_text(row["domain"]).lower()))
    stats_rows.sort(key=lambda row: (-int(row["jobCount"]), -int(row["mentionCount"]), clean_text(row["domain"]).lower()))
    high_count = sum(1 for row in master_rows if int(row.get("jobCount") or 0) >= DOMAIN_MIN_JOB_COUNT_DEFAULT)
    summary = {
        "updatedAt": now_iso(),
        "sourceFile": str(JOB_LIBRARY_FILE),
        "jobCount": total_jobs,
        "domainCount": len(master_rows),
        "recommendedDomainCount": high_count,
        "minFrequency": DOMAIN_MIN_JOB_COUNT_DEFAULT,
    }
    DOMAIN_MASTER_FILE.write_text(json.dumps(master_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    DOMAIN_TAG_STATS_FILE.write_text(json.dumps(stats_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    DOMAIN_SUMMARY_FILE.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    if not DOMAIN_TRANSLATION_CACHE_FILE.exists():
        DOMAIN_TRANSLATION_CACHE_FILE.write_text("{}", encoding="utf-8")
    return summary


async def call_domain_translation_batch(
    client: httpx.AsyncClient,
    config: CareerNormalizationLLMConfig,
    rows: List[Dict[str, str]],
    rate_limiter: AsyncRequestRateLimiter,
) -> Dict[str, Any]:
    await rate_limiter.acquire()
    terms = [row["domain"] for row in rows]
    user_prompt = (
        "将后续每行的 IT/技术方向 domain 术语翻译成中文，仅以字符串数组 JSON 格式返回。\n"
        "要求：返回数组长度必须与输入行数完全一致，顺序必须完全对应；不要返回解释、编号或 Markdown。\n\n"
        + "\n".join(terms)
    )
    response = await client.post(
        llm_chat_completions_url(config.base_url),
        headers={"Authorization": f"Bearer {config.api_key}", "Content-Type": "application/json"},
        json={
            "model": config.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You translate IT career domain taxonomy terms into concise Simplified Chinese. Return JSON only.",
                },
                {"role": "user", "content": user_prompt},
            ],
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
        },
    )
    response.raise_for_status()
    data = response.json()
    text = clean_text(data.get("choices", [{}])[0].get("message", {}).get("content"))
    translations = parse_translation_array_payload(parse_llm_json_fragment(text))
    if len(translations) != len(rows):
        raise ValueError(f"domain translation count mismatch: expected {len(rows)}, got {len(translations)}")
    return {
        "translations": translations,
        "usage": normalize_token_usage(data.get("usage") or data.get("token_usage")),
        "rawText": text,
    }


async def enrich_domain_assets_with_zh_translations(
    *,
    emit_progress: Optional[Callable[[int, str, str], Awaitable[None]]] = None,
    emit_log: Optional[Callable[[str, str, Optional[Dict[str, Any]]], Awaitable[None]]] = None,
) -> Dict[str, Any]:
    llm_config = load_domain_translation_llm_config()
    if not clean_text(llm_config.api_key):
        return {
            "status": "skipped_missing_llm_key",
            "translated": 0,
            "cacheFile": str(DOMAIN_TRANSLATION_CACHE_FILE),
            "configSource": llm_config.source,
            "model": llm_config.model,
        }
    if clean_text(os.getenv("JOB_SYSTEM_DOMAIN_TRANSLATION_ENABLED", "1")).lower() in {"0", "false", "no"}:
        return {
            "status": "skipped_disabled",
            "translated": 0,
            "cacheFile": str(DOMAIN_TRANSLATION_CACHE_FILE),
            "configSource": llm_config.source,
            "model": llm_config.model,
        }
    if not DOMAIN_MASTER_FILE.exists():
        return {
            "status": "skipped_missing_domain_master",
            "translated": 0,
            "cacheFile": str(DOMAIN_TRANSLATION_CACHE_FILE),
            "configSource": llm_config.source,
            "model": llm_config.model,
        }

    rows = json.loads(DOMAIN_MASTER_FILE.read_text(encoding="utf-8-sig"))
    if not isinstance(rows, list):
        return {
            "status": "skipped_missing_domain_master",
            "translated": 0,
            "cacheFile": str(DOMAIN_TRANSLATION_CACHE_FILE),
            "configSource": llm_config.source,
            "model": llm_config.model,
        }

    cache = load_json_object_cache(DOMAIN_TRANSLATION_CACHE_FILE)
    pending: List[Dict[str, str]] = []
    for row in rows:
        domain = clean_text(row.get("domain") or row.get("normalizedTag"))
        if not domain:
            continue
        key = domain_translation_cache_key(domain)
        if isinstance(cache.get(key), dict) and clean_text(cache[key].get("nameZh")):
            continue
        pending.append({"domain": domain, "cacheKey": key})

    if emit_progress:
        await maybe_await(emit_progress(97, "domain_translation", f"Translating Domain Center zh names; pending={len(pending)}"))
    if not pending:
        return {
            "status": "ok_cached",
            "translated": 0,
            "cacheFile": str(DOMAIN_TRANSLATION_CACHE_FILE),
            "configSource": llm_config.source,
            "model": llm_config.model,
        }

    translated = 0
    usage = empty_token_usage()
    rate_limiter = AsyncRequestRateLimiter(max(1, int(llm_config.rpm or 1)))
    async with httpx.AsyncClient(timeout=max(30, int(llm_config.timeout_seconds or 120))) as client:
        for start in range(0, len(pending), DOMAIN_TRANSLATION_BATCH_SIZE):
            batch = pending[start : start + DOMAIN_TRANSLATION_BATCH_SIZE]
            result = await call_domain_translation_batch(client, llm_config, batch, rate_limiter)
            usage = merge_token_usage(usage, result.get("usage") or {})
            for item, name_zh in zip(batch, result["translations"]):
                cache[item["cacheKey"]] = {
                    "domain": item["domain"],
                    "nameZh": clean_text(name_zh) or item["domain"],
                    "model": llm_config.model,
                    "updatedAt": now_iso(),
                }
                translated += 1
            save_json_object_cache(DOMAIN_TRANSLATION_CACHE_FILE, cache)
            if emit_log:
                await maybe_await(
                    emit_log(
                        "domain_translation",
                        "translated domain center batch",
                        {"translated": translated, "totalPending": len(pending), "batchSize": len(batch)},
                    )
                )

    apply_domain_translation_cache_to_assets(cache)
    return {
        "status": "ok",
        "translated": translated,
        "cacheFile": str(DOMAIN_TRANSLATION_CACHE_FILE),
        "configSource": llm_config.source,
        "model": llm_config.model,
        "usage": usage,
    }


def rebuild_tag_assets(jobs: List[Dict[str, Any]]) -> Dict[str, Any]:
    ensure_tag_dirs()
    normalized_rows, normalized_relations, normalized_high_rows, normalized_summary = _build_tag_asset_rows(jobs, TAG_VIEW_NORMALIZED)
    source_rows, source_relations, source_high_rows, source_summary = _build_tag_asset_rows(jobs, TAG_VIEW_SOURCE)
    domain_summary = rebuild_domain_assets(jobs)

    tag_master_file_path(TAG_VIEW_NORMALIZED).write_text(
        json.dumps(normalized_rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tag_master_file_path(TAG_VIEW_SOURCE).write_text(
        json.dumps(source_rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    high_frequency_tags_file_path(TAG_VIEW_NORMALIZED).write_text(
        json.dumps(normalized_high_rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    high_frequency_tags_file_path(TAG_VIEW_SOURCE).write_text(
        json.dumps(source_high_rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    with job_tag_relations_file_path(TAG_VIEW_NORMALIZED).open("w", encoding="utf-8") as handle:
        for row in normalized_relations:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    with job_tag_relations_file_path(TAG_VIEW_SOURCE).open("w", encoding="utf-8") as handle:
        for row in source_relations:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    summary_file_path(TAG_VIEW_NORMALIZED).write_text(
        json.dumps(normalized_summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    summary_file_path(TAG_VIEW_SOURCE).write_text(
        json.dumps(source_summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Backward-compatible aliases keep existing consumers stable.
    (TAG_DIR / "tag_master.json").write_text(
        json.dumps(normalized_rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (TAG_DIR / "high_frequency_tags.json").write_text(
        json.dumps(normalized_high_rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    with (TAG_DIR / "job_tag_relations.jsonl").open("w", encoding="utf-8") as handle:
        for row in normalized_relations:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    (TAG_DIR / "summary.json").write_text(
        json.dumps(normalized_summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    translation_stats = apply_tag_translation_cache_to_tag_asset_files()

    return {
        **normalized_summary,
        "translationStats": translation_stats,
        "domainSummary": domain_summary,
        "views": {
            TAG_VIEW_NORMALIZED: normalized_summary,
            TAG_VIEW_SOURCE: source_summary,
        },
    }


async def import_portraits_into_jobs(
    portraits: List[Dict[str, Any]],
    run_id: str,
    normalize_with_existing: bool = True,
    before_commit: Optional[Callable[[Dict[str, Any]], Dict[str, Any] | Awaitable[Dict[str, Any]]]] = None,
    progress_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
) -> Dict[str, Any]:
    async with IMPORT_LOCK:
        async def emit_progress(percent: int, stage: str, message: str, extra: Optional[Dict[str, Any]] = None) -> None:
            if not progress_callback:
                return
            payload = {
                "percent": max(0, min(100, int(percent))),
                "stage": stage,
                "message": message,
                "ts": now_iso(),
            }
            if isinstance(extra, dict) and extra:
                payload.update(extra)
            await maybe_await(progress_callback(payload))

        await emit_progress(3, "prepare", "开始准备岗位库归入")
        vector_config = current_vector_config()
        existing_jobs = load_jobs()
        await emit_progress(8, "load_jobs", f"已载入岗位库 {len(existing_jobs)} 条")
        portraits = normalize_job_library(portraits)
        existing_index = {clean_text(job.get("id")): idx for idx, job in enumerate(existing_jobs)}
        job_library_count_before = len(existing_jobs)
        high_freq_index = build_high_frequency_index(existing_jobs) if (existing_jobs and normalize_with_existing) else {}
        embedding_cache = load_embedding_cache()
        embedded_count = 0
        embedding_status = "skipped"
        embedding_error = ""
        pairwise_space_ready = False
        pairwise_space_pool_types: List[str] = []
        pairwise_space_text_count = 0
        texts_to_embed: List[str] = []

        # Only fetch embeddings when we are actually normalizing against an existing tag pool.
        if normalize_with_existing and high_freq_index:
            texts_to_embed = [row["canonicalName"] for row in high_freq_index.values()]
            if texts_to_embed:
                await emit_progress(18, "embedding_prepare", f"准备补齐 embedding，共 {len(texts_to_embed)} 条文本")
                required_texts = unique_clean_texts(texts_to_embed)
                pairwise_space = await prepare_pairwise_similarity_space(
                    high_freq_index,
                    required_texts,
                    cache=embedding_cache,
                    require_complete_space=True,
                )
                embedding_cache = pairwise_space["embedding_cache"]
                similarity_pools = pairwise_space["similarity_pools"]
                embedded_count = int(pairwise_space["embedded_count"] or 0)
                embedding_status = "ok"
                pairwise_space_ready = True
                pairwise_space_pool_types = pairwise_space["pool_types"]
                pairwise_space_text_count = len(pairwise_space["required_texts"])
            await emit_progress(
                36,
                "embedding_done",
                f"embedding 阶段完成，状态 {embedding_status}",
                {
                    "embeddingStatus": embedding_status,
                    "embeddingError": embedding_error,
                    "embeddedTextsAdded": embedded_count,
                    "embeddedTextsRequested": len({clean_text(text) for text in texts_to_embed if clean_text(text)}),
                    "pairwiseSpaceReady": pairwise_space_ready,
                    "pairwiseSpacePoolCount": len(pairwise_space_pool_types),
                    "pairwiseSpaceTagTypes": pairwise_space_pool_types,
                    "pairwiseSpaceTextCount": pairwise_space_text_count,
                },
            )
        elif normalize_with_existing:
            embedding_status = "skipped_no_existing_pool"
            await emit_progress(36, "embedding_skip", "当前没有既有高频池，跳过 embedding 归一")
        else:
            embedding_status = "skipped_normalize_disabled"
            await emit_progress(36, "embedding_skip", "未启用既有标签归一，跳过 embedding 归一")

        if high_freq_index:
            similarity_pools = build_similarity_pools(high_freq_index, embedding_cache)
        else:
            similarity_pools = {}
        await emit_progress(48, "similarity_pool", f"相似度候选池准备完成，共 {len(similarity_pools)} 个")

        normalization_stats = init_normalization_stats()
        normalized_jobs = []
        total_portraits = max(1, len(portraits))
        for index, job in enumerate(portraits, start=1):
            normalized_jobs.append(
                normalize_imported_job(
                    job,
                    high_freq_index,
                    similarity_pools,
                    embedding_cache,
                    normalization_stats,
                )
            )
            if index == total_portraits or index % 20 == 0:
                percent = 48 + int((index / total_portraits) * 22)
                await emit_progress(percent, "normalize_portraits", f"已归一 {index}/{total_portraits} 条画像")
                await asyncio.sleep(0)

        created = 0
        updated = 0
        created_job_ids: List[str] = []
        updated_job_ids: List[str] = []
        created_samples: List[Dict[str, Any]] = []
        updated_samples: List[Dict[str, Any]] = []
        next_seq = next_created_seq(existing_jobs)
        precommit_payload: Dict[str, Any] = {}
        if before_commit:
            await emit_progress(74, "snapshot_prepare", "准备创建归入前快照")
            precommit_payload = await maybe_await(
                before_commit(
                    {
                        "runId": run_id,
                        "normalizeWithExistingTags": normalize_with_existing,
                        "jobLibraryCountBefore": job_library_count_before,
                        "existingJobs": existing_jobs,
                        "portraits": normalized_jobs,
                    }
                )
            ) or {}
            await emit_progress(78, "snapshot_done", "归入前快照已创建")
        for job in normalized_jobs:
            job_id = clean_text(job.get("id"))
            if job_id and job_id in existing_index:
                stamped_job = stamp_imported_job_meta(
                    job,
                    existing_jobs[existing_index[job_id]],
                    parse_int(((existing_jobs[existing_index[job_id]].get("systemMeta") or {}).get("createdSeq")), next_seq),
                    run_id,
                    normalize_with_existing,
                )
                existing_jobs[existing_index[job_id]] = stamped_job
                updated += 1
                updated_job_ids.append(job_id)
                updated_samples.append({
                    "jobId": job_id,
                    "title": clean_text(stamped_job.get("title")),
                    "updatedAt": clean_text((stamped_job.get("systemMeta") or {}).get("updatedAt")),
                })
            else:
                stamped_job = stamp_imported_job_meta(job, None, next_seq, run_id, normalize_with_existing)
                existing_jobs.append(stamped_job)
                if job_id:
                    existing_index[job_id] = len(existing_jobs) - 1
                created += 1
                next_seq += 1
                if job_id:
                    created_job_ids.append(job_id)
                created_samples.append({
                    "jobId": job_id,
                    "title": clean_text(stamped_job.get("title")),
                    "createdAt": clean_text((stamped_job.get("systemMeta") or {}).get("createdAt")),
                })
            processed = created + updated
            if processed == len(normalized_jobs) or processed % 20 == 0:
                percent = 78 + int((processed / max(1, len(normalized_jobs))) * 12)
                await emit_progress(percent, "merge_jobs", f"已写入 {processed}/{len(normalized_jobs)} 条岗位")
                await asyncio.sleep(0)

        await emit_progress(92, "save_jobs", "准备写回岗位库与标签资产")
        existing_jobs = normalize_job_library(existing_jobs)
        save_jobs(existing_jobs)
        tag_summary = rebuild_tag_assets(existing_jobs)
        await emit_progress(98, "rebuild_tags", "岗位库写回完成，标签资产已更新")

        import_summary = {
            "runId": run_id,
            "applied": True,
            "created": created,
            "updated": updated,
            "imported": len(normalized_jobs),
            "jobLibraryCountBefore": job_library_count_before,
            "jobLibraryCountAfter": len(existing_jobs),
            "createdJobIds": created_job_ids[:50],
            "updatedJobIds": updated_job_ids[:50],
            "createdSamples": created_samples[:20],
            "updatedSamples": updated_samples[:20],
            "existingHighFrequencyPool": len(high_freq_index),
            "embeddedTextsAdded": embedded_count,
            "embeddedTextsRequested": len({clean_text(text) for text in texts_to_embed if clean_text(text)}),
            "embeddingProfileId": vector_config.profile_id,
            "embeddingProvider": vector_config.provider,
            "embeddingModel": vector_config.model,
            "embeddingStatus": embedding_status,
            "embeddingError": embedding_error,
            "pairwiseSpaceReady": pairwise_space_ready,
            "pairwiseSpacePoolCount": len(pairwise_space_pool_types),
            "pairwiseSpaceTagTypes": pairwise_space_pool_types,
            "pairwiseSpaceTextCount": pairwise_space_text_count,
            "normalizeWithExistingTags": normalize_with_existing,
            "normalizationStats": normalization_stats,
            "normalizationThresholds": NORMALIZE_THRESHOLDS,
            "tagSummary": tag_summary,
            "importedAt": now_iso(),
            "snapshot": precommit_payload or None,
            "revokeReady": bool((precommit_payload or {}).get("snapshotId")),
        }

        ensure_tag_dirs()
        history_path = TAG_DIR / "import_history.jsonl"
        with history_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(import_summary, ensure_ascii=False) + "\n")
        await emit_progress(
            100,
            "completed",
            "岗位库归入完成",
            {
                "created": created,
                "updated": updated,
                "imported": len(normalized_jobs),
                "importedAt": import_summary["importedAt"],
            },
        )
        return import_summary
