import json
import hashlib
import random
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

import httpx
import numpy as np


DIRECTION_CAPABILITY_MAP: Dict[str, List[str]] = {
    "Web开发（前端 / 后端 / 全栈）": ["软件工程", "计算机基础"],
    "移动开发（iOS / Android / 跨平台）": ["软件工程", "计算机基础"],
    "测试开发 / QA": ["质量保障", "软件工程"],
    "数据开发（数仓 / ETL / 数据平台）": ["数据工程", "系统架构"],
    "数据分析（BI / 业务分析）": ["数据工程", "计算机基础"],
    "算法 / AI（机器学习 / 深度学习 / NLP / CV）": ["AI/ML能力", "计算机基础"],
    "AI应用开发（RAG / Agent / LLM工程）": ["LLM应用能力", "软件工程"],
    "安全（渗透 / 安全开发 / 合规）": ["安全能力", "计算机基础"],
    "运维 / DevOps": ["云原生与DevOps", "系统架构"],
    "产品经理": [],
    "UI / UX设计": [],
    "技术支持 / 实施": ["软件工程"],
    "嵌入式 / 硬件开发（IoT、单片机、驱动）": ["软件工程", "计算机基础", "系统架构"],
    "游戏开发（客户端 / 引擎 / 服务端）": ["软件工程", "计算机基础"],
    "区块链 / Web3开发": ["软件工程", "安全能力"],
    "云计算 / 架构师（偏设计而非运维操作）": ["系统架构", "云原生与DevOps"],
    "数据库管理员 / DBA": ["数据工程", "计算机基础"],
    "技术写作 / 开发者关系（DevRel）": ["通用工程素养", "软件工程"],
    "增长运营 / 数据运营（偏技术侧）": ["数据工程", "通用工程素养"],
    "解决方案架构师 / 售前工程师": ["系统架构", "软件工程"],
    "量化开发 / 金融科技": ["数据工程", "AI/ML能力", "计算机基础"],
    "音视频开发（流媒体 / 编解码）": ["软件工程", "计算机基础"],
    "图形 / 渲染开发（图形引擎、Shader）": ["软件工程", "计算机基础"],
}


CAPABILITY_GROUPS: Dict[str, List[str]] = {
    "计算机基础": ["算法分析与应用", "网络协议理解与调试", "操作系统原理应用", "数据库设计与优化"],
    "软件工程": ["需求分析与拆解", "模块/接口设计", "面向对象设计", "设计模式应用", "代码质量与可维护性"],
    "系统架构": ["系统架构设计", "分布式系统设计", "高并发与性能优化", "缓存与异步设计", "高可用与容灾设计"],
    "数据工程": ["SQL与数仓建模", "大数据处理", "ETL/Pipeline设计", "数据质量治理"],
    "AI/ML能力": ["特征工程", "模型训练与调优", "模型评估设计", "模型部署上线"],
    "LLM应用能力": ["Prompt工程", "RAG系统设计", "Agent工作流设计", "LLM评测与调优"],
    "质量保障": ["测试策略设计", "自动化测试实现", "测试用例设计", "性能测试分析"],
    "安全能力": ["Web攻防基础", "渗透测试", "安全审计", "漏洞分析"],
    "云原生与DevOps": ["容器化与编排", "CI/CD流水线", "监控与可观测性", "基础设施即代码"],
    "通用工程素养": ["英文文档阅读", "技术文档写作", "开源项目贡献", "代码审查能力", "技术方案表达", "独立问题定位", "跨团队协作沟通"],
}


CAPABILITY_GROUP_TYPE_MAP = {
    "计算机基础": "principle",
    "软件工程": "engineering",
    "系统架构": "scene",
    "数据工程": "engineering",
    "AI/ML能力": "scene",
    "LLM应用能力": "scene",
    "质量保障": "engineering",
    "安全能力": "scene",
    "云原生与DevOps": "engineering",
    "通用工程素养": "engineering",
}


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CAREER_PLANNER_DIR = Path(__file__).resolve().parents[1]
DATASET_DIR = PROJECT_ROOT / "dataset"
CAREER_PLANNER_DATA_DIR = DATASET_DIR / "career_planner"
TAG_CENTER_MASTER_FILE = DATASET_DIR / "db" / "tag_center" / "tag_master_normalized.json"
TAG_CENTER_DIR = DATASET_DIR / "db" / "tag_center"
DOMAIN_CENTER_DIR = DATASET_DIR / "db" / "domain_center"
DOMAIN_MASTER_FILE = DOMAIN_CENTER_DIR / "domain_master.json"
DOMAIN_TAG_STATS_FILE = DOMAIN_CENTER_DIR / "domain_tag_stats.json"
CAREER_JSON_FILE = DATASET_DIR / "career.json"
SUPPORTED_TAG_CENTER_TYPES = {"techCapabilities", "devTools", "techStack"}
VALID_CAPABILITY_TYPES = {"engineering", "scene", "principle"}
CATEGORY_TO_TAG_TYPE = {
    "techCapability": "techCapabilities",
    "techCapabilities": "techCapabilities",
    "techStack": "techStack",
    "devTools": "devTools",
}
_SHARED_EMBEDDING_CACHE: Dict[str, np.ndarray] | None = None
_SHARED_QUERY_EMBEDDING_CACHE: Dict[str, np.ndarray] | None = None
_SHARED_QUERY_EMBEDDING_CACHE_ID = ""
_SKILL_SEARCH_EMBEDDING_CACHE: Dict[str, np.ndarray] | None = None
_SKILL_SEARCH_EMBEDDING_CACHE_ID = ""
_SKILL_SEARCH_INDEX_CACHE: Dict[str, Dict[str, Any]] = {}

JOB_ADMIN_BACKEND_DIR = PROJECT_ROOT / "job-admin" / "backend"
if str(JOB_ADMIN_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(JOB_ADMIN_BACKEND_DIR))

try:
    from tag_sync import (  # type: ignore
        embedding_api_url as shared_embedding_api_url,
        current_vector_config as load_shared_vector_config,
        embedding_cache_file as shared_embedding_cache_file,
        embedding_cache_key as shared_embedding_cache_key,
        embedding_row_matches_config as shared_embedding_row_matches_config,
        load_embedding_cache as load_shared_embedding_cache,
        load_jobs as load_shared_jobs,
        rebuild_domain_assets as rebuild_shared_domain_assets,
    )
except Exception:
    shared_embedding_api_url = None
    load_shared_vector_config = None
    shared_embedding_cache_file = None
    shared_embedding_cache_key = None
    shared_embedding_row_matches_config = None
    load_shared_embedding_cache = None
    load_shared_jobs = None
    rebuild_shared_domain_assets = None


def clean_text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def parse_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


@dataclass(frozen=True)
class SkillSearchEmbeddingConfig:
    base_url: str
    api_key: str
    model: str
    dimensions: int
    batch_size: int
    timeout_seconds: int
    cache_file: Path

    @property
    def enabled(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)


def load_skill_search_embedding_config() -> SkillSearchEmbeddingConfig:
    shared_config = load_shared_vector_config() if load_shared_vector_config else None
    return SkillSearchEmbeddingConfig(
        base_url=clean_text(getattr(shared_config, "base_url", "")).rstrip("/"),
        api_key=clean_text(getattr(shared_config, "api_key", "")),
        model=clean_text(getattr(shared_config, "model", "")),
        dimensions=int(getattr(shared_config, "dimensions", 0) or 0),
        batch_size=max(1, int(getattr(shared_config, "batch_size", 64) or 64)),
        timeout_seconds=max(5, int(getattr(shared_config, "timeout_seconds", 30) or 30)),
        cache_file=CAREER_PLANNER_DATA_DIR / "skill_search_embedding_cache.jsonl",
    )


def normalize_vector(vector: List[float]) -> np.ndarray:
    array = np.array(vector, dtype=np.float32)
    norm = np.linalg.norm(array)
    return array / norm if norm > 0 else array


def skill_search_embedding_cache_key(config: SkillSearchEmbeddingConfig, text: str) -> str:
    payload = {
        "baseUrl": config.base_url,
        "model": config.model,
        "dimensions": config.dimensions,
        "text": clean_text(text).lower(),
    }
    return hashlib.sha1(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def load_skill_search_embedding_cache(config: SkillSearchEmbeddingConfig) -> Dict[str, np.ndarray]:
    global _SKILL_SEARCH_EMBEDDING_CACHE, _SKILL_SEARCH_EMBEDDING_CACHE_ID
    cache_id = f"{config.base_url}|{config.model}|{config.dimensions}|{config.cache_file}"
    if _SKILL_SEARCH_EMBEDDING_CACHE is not None and _SKILL_SEARCH_EMBEDDING_CACHE_ID == cache_id:
        return _SKILL_SEARCH_EMBEDDING_CACHE

    cache: Dict[str, np.ndarray] = {}
    if not config.cache_file.exists():
        _SKILL_SEARCH_EMBEDDING_CACHE = cache
        _SKILL_SEARCH_EMBEDDING_CACHE_ID = cache_id
        return cache
    try:
        lines = config.cache_file.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        return cache
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(row, dict):
            continue
        if clean_text(row.get("baseUrl")) != config.base_url or clean_text(row.get("model")) != config.model:
            continue
        if config.dimensions and parse_int(row.get("dimensions"), 0) != config.dimensions:
            continue
        cache_key = clean_text(row.get("cacheKey"))
        embedding = row.get("embedding")
        if cache_key and isinstance(embedding, list):
            cache[cache_key] = normalize_vector(embedding)
    _SKILL_SEARCH_EMBEDDING_CACHE = cache
    _SKILL_SEARCH_EMBEDDING_CACHE_ID = cache_id
    return cache


def append_skill_search_embedding_cache_rows(config: SkillSearchEmbeddingConfig, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    config.cache_file.parent.mkdir(parents=True, exist_ok=True)
    with config.cache_file.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def should_use_shared_embedding(config: SkillSearchEmbeddingConfig) -> bool:
    return bool(load_shared_vector_config and shared_embedding_cache_key and load_shared_embedding_cache)


def load_cached_shared_embedding_cache() -> Dict[str, np.ndarray]:
    global _SHARED_EMBEDDING_CACHE
    if _SHARED_EMBEDDING_CACHE is None:
        _SHARED_EMBEDDING_CACHE = load_shared_embedding_cache()
    return _SHARED_EMBEDDING_CACHE


def shared_query_cache_file(config: Any) -> Path:
    profile_id = clean_text(getattr(config, "profile_id", "")) or "default"
    return CAREER_PLANNER_DATA_DIR / f"skill_search_query_embedding_cache_{profile_id}.jsonl"


def load_shared_query_embedding_cache(config: Any) -> Dict[str, np.ndarray]:
    global _SHARED_QUERY_EMBEDDING_CACHE, _SHARED_QUERY_EMBEDDING_CACHE_ID
    cache_file = shared_query_cache_file(config)
    cache_id = (
        f"{clean_text(getattr(config, 'profile_id', ''))}|"
        f"{clean_text(getattr(config, 'provider', ''))}|"
        f"{clean_text(getattr(config, 'model', ''))}|"
        f"{clean_text(getattr(config, 'dimensions', ''))}|"
        f"{cache_file}"
    )
    if _SHARED_QUERY_EMBEDDING_CACHE is not None and _SHARED_QUERY_EMBEDDING_CACHE_ID == cache_id:
        return _SHARED_QUERY_EMBEDDING_CACHE

    cache: Dict[str, np.ndarray] = {}
    if cache_file.exists():
        try:
            lines = cache_file.read_text(encoding="utf-8-sig").splitlines()
        except OSError:
            lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            cache_key = clean_text(row.get("cacheKey")) if isinstance(row, dict) else ""
            vector = row.get("embedding") if isinstance(row, dict) else None
            if not cache_key or not isinstance(vector, list):
                continue
            if shared_embedding_row_matches_config and not shared_embedding_row_matches_config(row, config):
                continue
            cache[cache_key] = normalize_vector(vector)

    _SHARED_QUERY_EMBEDDING_CACHE = cache
    _SHARED_QUERY_EMBEDDING_CACHE_ID = cache_id
    return cache


def append_shared_query_embedding_cache_rows(config: Any, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    cache_file = shared_query_cache_file(config)
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    with cache_file.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def _parse_json_line_value(line: str) -> Any:
    _, _, value = line.partition(":")
    value = value.strip().rstrip(",")
    if not value:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def find_shared_embedding_cache_row_by_key(config: Any, cache_key: str) -> Dict[str, Any] | None:
    if not shared_embedding_cache_file or not shared_embedding_row_matches_config:
        return None
    cache_file = shared_embedding_cache_file(config)
    if not cache_file.exists():
        return None

    try:
        handle = cache_file.open("r", encoding="utf-8-sig")
    except OSError:
        return None

    with handle:
        if cache_file.suffix.lower() == ".jsonl":
            for line in handle:
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(row, dict):
                    continue
                if clean_text(row.get("cacheKey")) != cache_key:
                    continue
                if not shared_embedding_row_matches_config(row, config):
                    continue
                return row
            return None

        inside = False
        collecting = False
        found_target = False
        depth = 0
        buffer: List[str] = []
        for line in handle:
            stripped = line.strip()
            if not inside:
                if stripped.startswith("{"):
                    inside = True
                    collecting = True
                    found_target = False
                    depth = stripped.count("{") - stripped.count("}")
                    buffer = [line]
                continue

            if collecting:
                buffer.append(line)

            if not found_target and '"cacheKey"' in stripped:
                row_key = clean_text(_parse_json_line_value(stripped))
                if row_key == cache_key:
                    found_target = True
                    collecting = True
                else:
                    collecting = False
                    buffer = []

            depth += stripped.count("{") - stripped.count("}")
            if depth > 0:
                continue

            if found_target and buffer:
                raw = "".join(buffer).strip().rstrip(",")
                try:
                    row = json.loads(raw)
                except json.JSONDecodeError:
                    row = None
                if isinstance(row, dict) and shared_embedding_row_matches_config(row, config):
                    return row

            inside = False
            collecting = False
            found_target = False
            depth = 0
            buffer = []
    return None


async def fetch_shared_query_embedding(config: Any, text: str) -> Tuple[np.ndarray | None, Dict[str, Any]]:
    provider = clean_text(getattr(config, "provider", ""))
    api_key = clean_text(getattr(config, "api_key", ""))
    if not api_key or not shared_embedding_api_url:
        return None, {"status": "missing_config", "embedded": 0}
    if provider and provider != "openai_embeddings":
        return None, {"status": "unsupported_provider", "embedded": 0, "provider": provider}

    payload: Dict[str, Any] = {
        "model": clean_text(getattr(config, "model", "")),
        "input": [text],
        "encoding_format": "float",
    }
    dimensions = getattr(config, "dimensions", None)
    if dimensions:
        payload["dimensions"] = int(dimensions)

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            shared_embedding_api_url(config),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
    body = response.json()
    rows = body.get("data") if isinstance(body, dict) else None
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("OpenAI-compatible embedding response missing data")
    embedding = rows[0].get("embedding") if isinstance(rows[0], dict) else None
    if not isinstance(embedding, list):
        raise RuntimeError("OpenAI-compatible embedding response missing embedding")
    return normalize_vector(embedding), {"status": "ok", "embedded": 1}


async def ensure_shared_query_embeddings(texts: List[str]) -> Tuple[Dict[str, np.ndarray], Dict[str, Any]]:
    shared_config = load_shared_vector_config()
    cache = load_shared_query_embedding_cache(shared_config)
    rows_to_append: List[Dict[str, Any]] = []
    embedded = 0
    missing_before_fetch = 0
    db_hits = 0
    api_hits = 0
    unresolved = 0
    last_missing_status = ""

    for raw_text in texts:
        text = clean_text(raw_text)
        if not text:
            continue
        cache_key = shared_embedding_cache_key(text)
        if cache_key in cache:
            continue

        vector = None
        fetch_meta: Dict[str, Any] = {}
        can_fetch = bool(
            clean_text(getattr(shared_config, "api_key", ""))
            and clean_text(getattr(shared_config, "provider", "")) in {"", "openai_embeddings"}
        )
        fetch_error: Exception | None = None

        if can_fetch:
            missing_before_fetch += 1
            try:
                vector, fetch_meta = await fetch_shared_query_embedding(shared_config, text)
            except Exception as exc:
                fetch_error = exc

        if vector is None:
            row = find_shared_embedding_cache_row_by_key(shared_config, cache_key)
            if row and isinstance(row.get("embedding"), list):
                vector = normalize_vector(row["embedding"])
                db_hits += 1

        if vector is None and not can_fetch:
            missing_before_fetch += 1
            vector, fetch_meta = await fetch_shared_query_embedding(shared_config, text)

        if vector is not None and fetch_meta.get("status") == "ok":
            embedded += 1
            api_hits += 1
        elif vector is None:
            if fetch_error is not None:
                raise fetch_error
            last_missing_status = clean_text(fetch_meta.get("status")) or "missing_vector"

        if vector is None:
            unresolved += 1
            continue

        cache[cache_key] = vector
        rows_to_append.append(
            {
                "cacheKey": cache_key,
                "text": text,
                "embedding": vector.astype(float).tolist(),
                "profileId": clean_text(getattr(shared_config, "profile_id", "")),
                "provider": clean_text(getattr(shared_config, "provider", "")),
                "model": clean_text(getattr(shared_config, "model", "")),
                "dimensions": int(getattr(shared_config, "dimensions", 0) or len(vector)),
                "updatedAt": now_iso(),
                "cacheScope": "career_planner_skill_query",
            }
        )

    append_shared_query_embedding_cache_rows(shared_config, rows_to_append)
    return cache, {
        "status": "ok" if unresolved == 0 else (last_missing_status or "missing_vector"),
        "embedded": embedded,
        "provider": "job-system-embedding",
        "profileId": clean_text(getattr(shared_config, "profile_id", "")),
        "baseUrlConfigured": bool(clean_text(getattr(shared_config, "base_url", ""))),
        "apiKeyConfigured": bool(clean_text(getattr(shared_config, "api_key", ""))),
        "model": clean_text(getattr(shared_config, "model", "")),
        "cacheFile": str(shared_query_cache_file(shared_config)),
        "sourceCacheFile": str(shared_embedding_cache_file(shared_config)) if shared_embedding_cache_file else "",
        "missingBeforeFetch": missing_before_fetch,
        "dbCacheHits": db_hits,
        "apiHits": api_hits,
        "unresolved": unresolved,
        "usesSharedJobSystemEmbedding": True,
    }


async def fetch_skill_search_embeddings(
    config: SkillSearchEmbeddingConfig,
    texts: List[str],
) -> Tuple[Dict[str, np.ndarray], Dict[str, Any]]:
    if not texts:
        return {}, {"status": "ok", "embedded": 0}
    if not config.enabled:
        return {}, {"status": "missing_config", "embedded": 0}

    vectors: Dict[str, np.ndarray] = {}
    persisted_rows: List[Dict[str, Any]] = []
    embedded = 0
    async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
        for start in range(0, len(texts), config.batch_size):
            batch = texts[start : start + config.batch_size]
            payload: Dict[str, Any] = {
                "model": config.model,
                "input": batch,
                "encoding_format": "float",
            }
            if config.dimensions:
                payload["dimensions"] = config.dimensions
            response = await client.post(
                f"{config.base_url}/embeddings",
                headers={
                    "Authorization": f"Bearer {config.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
            data = body.get("data") if isinstance(body, dict) else None
            if not isinstance(data, list):
                raise RuntimeError("Embedding API response missing data")
            for item in sorted(data, key=lambda row: row.get("index", 0)):
                index = parse_int(item.get("index"), -1)
                embedding = item.get("embedding")
                if index < 0 or index >= len(batch) or not isinstance(embedding, list):
                    continue
                text = batch[index]
                cache_key = skill_search_embedding_cache_key(config, text)
                vector = normalize_vector(embedding)
                vectors[cache_key] = vector
                embedded += 1
                persisted_rows.append(
                    {
                        "cacheKey": cache_key,
                        "text": text,
                        "embedding": embedding,
                        "baseUrl": config.base_url,
                        "model": config.model,
                        "dimensions": config.dimensions or len(embedding),
                        "updatedAt": now_iso(),
                    }
                )
    append_skill_search_embedding_cache_rows(config, persisted_rows)
    return vectors, {"status": "ok", "embedded": embedded}


def load_search_embedding_cache(config: SkillSearchEmbeddingConfig) -> Tuple[Dict[str, np.ndarray], Dict[str, Any]]:
    if should_use_shared_embedding(config):
        shared_config = load_shared_vector_config()
        return load_cached_shared_embedding_cache(), {
            "status": "cache_only",
            "provider": "job-system-embedding",
            "profileId": clean_text(getattr(shared_config, "profile_id", "")),
            "baseUrlConfigured": bool(clean_text(getattr(shared_config, "base_url", ""))),
            "apiKeyConfigured": bool(clean_text(getattr(shared_config, "api_key", ""))),
            "model": clean_text(getattr(shared_config, "model", "")),
            "cacheFile": str(getattr(shared_config, "cache_file", "")),
            "usesSharedJobSystemEmbedding": True,
        }
    return load_skill_search_embedding_cache(config), {
        "status": "cache_only",
        "provider": "openai-compatible",
        "baseUrlConfigured": bool(config.base_url),
        "apiKeyConfigured": bool(config.api_key),
        "model": config.model,
        "cacheFile": str(config.cache_file),
        "usesSharedJobSystemEmbedding": False,
    }


def search_embedding_cache_key(config: SkillSearchEmbeddingConfig, text: str) -> str:
    if should_use_shared_embedding(config):
        return shared_embedding_cache_key(text)
    return skill_search_embedding_cache_key(config, text)


def skill_search_index_file(config: SkillSearchEmbeddingConfig, tag_type: str) -> Path:
    safe_type = clean_text(tag_type) or "techCapabilities"
    if should_use_shared_embedding(config):
        return TAG_CENTER_DIR / f"skill_search_index_{safe_type}_v2.json"
    payload = {
        "baseUrl": config.base_url,
        "model": config.model,
        "dimensions": config.dimensions,
    }
    digest = hashlib.sha1(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()[:10]
    return CAREER_PLANNER_DATA_DIR / f"skill_search_index_{safe_type}_{digest}_v2.json"


def skill_search_matrix_file(index_file: Path) -> Path:
    return index_file.with_suffix(".npy")


def build_skill_search_index(
    *,
    config: SkillSearchEmbeddingConfig,
    tag_type: str,
    cache: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    vectors: List[np.ndarray] = []
    missing = 0
    for row in load_tag_center_rows():
        if clean_text(row.get("tagType")) != tag_type:
            continue
        public = public_tag_center_row(row)
        display = clean_text(public.get("displayName") or public.get("name") or public.get("normalizedTag"))
        vector = cache.get(search_embedding_cache_key(config, display))
        vector_source = "display"
        if vector is None:
            vector = cache.get(search_embedding_cache_key(config, public.get("normalizedTag")))
            vector_source = "normalizedTag"
        if vector is None:
            missing += 1
            continue
        rows.append({**public, "vectorSource": vector_source})
        vectors.append(vector)

    matrix = np.vstack(vectors).astype(np.float32) if vectors else np.zeros((0, 0), dtype=np.float32)
    return {
        "rows": rows,
        "matrix": matrix,
        "tagType": tag_type,
        "candidateCount": len(rows),
        "missingCandidateVectors": missing,
    }


def persist_skill_search_index(index: Dict[str, Any], path: Path) -> None:
    rows = index["rows"]
    path.parent.mkdir(parents=True, exist_ok=True)
    matrix_path = skill_search_matrix_file(path)
    np.save(matrix_path, index["matrix"].astype(np.float32), allow_pickle=False)
    path.write_text(
        json.dumps(
            {
                "version": 2,
                "tagType": index.get("tagType"),
                "matrixFile": matrix_path.name,
                "candidateCount": len(rows),
                "missingCandidateVectors": int(index.get("missingCandidateVectors") or 0),
                "rows": rows,
                "updatedAt": now_iso(),
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def load_skill_search_index_from_file(path: Path, tag_type: str) -> Dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    matrix_path = Path(clean_text(payload.get("matrixFile")) or str(skill_search_matrix_file(path)))
    if not matrix_path.is_absolute():
        matrix_path = path.parent / matrix_path
    if not matrix_path.exists():
        matrix_path = skill_search_matrix_file(path)
    matrix = np.load(matrix_path, mmap_mode="r")
    rows = [row for row in payload.get("rows", []) if isinstance(row, dict)]
    missing = int(payload.get("missingCandidateVectors") or 0)
    return {
        "rows": rows,
        "matrix": matrix,
        "tagType": clean_text(payload.get("tagType")) or tag_type,
        "candidateCount": len(rows),
        "missingCandidateVectors": missing,
        "matrixFile": str(matrix_path),
    }


def load_or_build_skill_search_index(
    *,
    config: SkillSearchEmbeddingConfig,
    tag_type: str,
    cache: Dict[str, np.ndarray] | None = None,
) -> Dict[str, Any]:
    path = skill_search_index_file(config, tag_type)
    cache_key = f"{path}|{TAG_CENTER_MASTER_FILE.stat().st_mtime if TAG_CENTER_MASTER_FILE.exists() else 0}"
    cached = _SKILL_SEARCH_INDEX_CACHE.get(cache_key)
    matrix_path = skill_search_matrix_file(path)
    if cached is not None:
        return {**cached, "indexFile": str(path), "indexMatrixFile": str(matrix_path), "indexStatus": "memory"}

    master_mtime = TAG_CENTER_MASTER_FILE.stat().st_mtime if TAG_CENTER_MASTER_FILE.exists() else 0
    if path.exists() and matrix_path.exists() and path.stat().st_mtime >= master_mtime and matrix_path.stat().st_mtime >= master_mtime:
        index = load_skill_search_index_from_file(path, tag_type)
        _SKILL_SEARCH_INDEX_CACHE.clear()
        _SKILL_SEARCH_INDEX_CACHE[cache_key] = index
        return {**index, "indexFile": str(path), "indexMatrixFile": str(matrix_path), "indexStatus": "disk"}

    candidate_cache = cache
    if candidate_cache is None:
        candidate_cache, _ = load_search_embedding_cache(config)
    index = build_skill_search_index(config=config, tag_type=tag_type, cache=candidate_cache)
    persist_skill_search_index(index, path)
    _SKILL_SEARCH_INDEX_CACHE.clear()
    _SKILL_SEARCH_INDEX_CACHE[cache_key] = index
    return {**index, "indexFile": str(path), "indexMatrixFile": str(matrix_path), "indexStatus": "rebuilt"}


async def ensure_skill_search_embeddings(
    texts: List[str],
) -> Tuple[Dict[str, np.ndarray], Dict[str, Any]]:
    config = load_skill_search_embedding_config()
    if should_use_shared_embedding(config):
        return await ensure_shared_query_embeddings(texts)

    cache = load_skill_search_embedding_cache(config)
    missing: List[str] = []
    seen = set()
    for raw_text in texts:
        text = clean_text(raw_text)
        if not text:
            continue
        cache_key = search_embedding_cache_key(config, text)
        if cache_key in cache or cache_key in seen:
            continue
        seen.add(cache_key)
        missing.append(text)

    fetched, meta = await fetch_skill_search_embeddings(config, missing)
    cache.update(fetched)
    meta.update(
        {
            "provider": "openai-compatible",
            "baseUrlConfigured": bool(config.base_url),
            "apiKeyConfigured": bool(config.api_key),
            "model": config.model,
            "cacheFile": str(config.cache_file),
            "missingBeforeFetch": len(missing),
            "usesSharedJobSystemEmbedding": False,
        }
    )
    return cache, meta


def normalize_skill_category(category: str = "", tag_type: str = "") -> Tuple[str, str]:
    if clean_text(tag_type) in SUPPORTED_TAG_CENTER_TYPES:
        resolved_tag_type = clean_text(tag_type)
        resolved_category = "techCapability" if resolved_tag_type == "techCapabilities" else resolved_tag_type
        return resolved_category, resolved_tag_type
    safe_category = clean_text(category) or "techCapability"
    resolved_tag_type = CATEGORY_TO_TAG_TYPE.get(safe_category, "techCapabilities")
    resolved_category = "techCapability" if resolved_tag_type == "techCapabilities" else resolved_tag_type
    return resolved_category, resolved_tag_type


def load_tag_center_rows() -> List[Dict[str, Any]]:
    if not TAG_CENTER_MASTER_FILE.exists():
        return []
    try:
        payload = json.loads(TAG_CENTER_MASTER_FILE.read_text(encoding="utf-8-sig"))
    except Exception:
        return []
    if not isinstance(payload, list):
        return []
    return [row for row in payload if isinstance(row, dict)]


def normalize_type_counts(value: Any) -> Dict[str, int]:
    if not isinstance(value, dict):
        return {}
    counts: Dict[str, int] = {}
    for key, raw_count in value.items():
        capability_type = clean_text(key)
        if capability_type not in VALID_CAPABILITY_TYPES:
            continue
        try:
            count = int(raw_count or 0)
        except (TypeError, ValueError):
            count = 0
        if count > 0:
            counts[capability_type] = counts.get(capability_type, 0) + count
    return counts


def dominant_capability_type(type_counts: Dict[str, int]) -> str:
    if not type_counts:
        return ""
    return sorted(type_counts.items(), key=lambda pair: (-int(pair[1] or 0), pair[0]))[0][0]


def capability_type_matches(item: Dict[str, Any], capability_type: str) -> bool:
    safe_type = clean_text(capability_type)
    if not safe_type:
        return True
    type_counts = normalize_type_counts(item.get("typeCounts"))
    if type_counts:
        return safe_type in type_counts
    return clean_text(item.get("type")) == safe_type


def item_with_matched_capability_type(item: Dict[str, Any], capability_type: str) -> Dict[str, Any]:
    safe_type = clean_text(capability_type)
    if not safe_type:
        return item
    normalized = {**item}
    dominant_type = clean_text(item.get("type"))
    if dominant_type and dominant_type != safe_type:
        normalized["dominantType"] = dominant_type
    normalized["type"] = safe_type
    return normalized


def merge_type_counts(left: Dict[str, int], right: Dict[str, int]) -> Dict[str, int]:
    merged = normalize_type_counts(left)
    for key, count in normalize_type_counts(right).items():
        merged[key] = merged.get(key, 0) + count
    return merged


def public_tag_center_row(row: Dict[str, Any]) -> Dict[str, Any]:
    normalized_tag = clean_text(row.get("canonicalName") or row.get("tagName"))
    name_zh = clean_text(row.get("canonicalNameZh") or row.get("tagNameZh")) or normalized_tag
    type_counts = normalize_type_counts(row.get("typeCounts"))
    capability_type = dominant_capability_type(type_counts)
    public = {
        "tagId": clean_text(row.get("tagId")),
        "tagType": clean_text(row.get("tagType")),
        "name": name_zh,
        "skill": normalized_tag,
        "skillZh": name_zh,
        "displayName": name_zh,
        "normalizedTag": normalized_tag,
        "levelRequired": 1,
        "jobCount": int(row.get("jobCount") or 0),
        "jobRatio": float(row.get("jobRatio") or 0),
        "isHighFrequency": bool(row.get("isHighFrequency")),
        "source": "tag-center",
    }
    if type_counts:
        public["typeCounts"] = type_counts
    if capability_type:
        public["type"] = capability_type
    return public


def search_tag_center_catalog(
    query: str,
    tag_type: str = "techCapabilities",
    limit: int = 8,
) -> List[Dict[str, Any]]:
    safe_query = clean_text(query).lower()
    safe_type = clean_text(tag_type) or "techCapabilities"
    if safe_type not in SUPPORTED_TAG_CENTER_TYPES:
        safe_type = "techCapabilities"
    if not safe_query:
        return []

    rows: List[Dict[str, Any]] = []
    for row in load_tag_center_rows():
        if clean_text(row.get("tagType")) != safe_type:
            continue
        public = public_tag_center_row(row)
        haystack = " ".join(
            [
                public["tagId"],
                public["normalizedTag"],
                public["name"],
                public["skillZh"],
            ]
        ).lower()
        if safe_query not in haystack:
            continue
        rows.append(public)

    rows.sort(
        key=lambda item: (
            0 if safe_query == item["name"].lower() else 1,
            0 if safe_query == item["normalizedTag"].lower() else 1,
            -item["jobCount"],
            item["normalizedTag"].lower(),
        )
    )
    return rows[: max(1, limit)]


def _lexical_similarity(query: str, value: str) -> float:
    safe_query = clean_text(query).lower()
    safe_value = clean_text(value).lower()
    if not safe_query or not safe_value:
        return 0.0
    if safe_query == safe_value:
        return 1.0
    if safe_value.startswith(safe_query):
        return 0.92
    if safe_query in safe_value:
        return 0.86
    return 0.0


def _cosine_similarity(left: np.ndarray, right: np.ndarray) -> float:
    if left is None or right is None:
        return 0.0
    return float(np.dot(left, right))


async def search_professional_skills(
    query: str,
    category: str = "techCapability",
    tag_type: str = "",
    capability_type: str = "",
    limit: int = 5,
    min_similarity: float = 0.70,
    embed_missing: bool = True,
) -> Dict[str, Any]:
    safe_query = clean_text(query)
    resolved_category, safe_type = normalize_skill_category(category=category, tag_type=tag_type)
    if not safe_query:
        return {
            "source": "professional-skills",
            "query": safe_query,
            "category": resolved_category,
            "tagType": safe_type,
            "minSimilarity": min_similarity,
            "options": [],
            "embedding": {"status": "skipped_empty_query"},
        }

    config = load_skill_search_embedding_config()
    embedding_meta: Dict[str, Any]
    if embed_missing:
        cache, embedding_meta = await ensure_skill_search_embeddings([safe_query])
    else:
        cache, embedding_meta = load_search_embedding_cache(config)
    query_vector = cache.get(search_embedding_cache_key(config, safe_query))
    threshold = max(0.0, min(1.0, float(min_similarity)))

    index = load_or_build_skill_search_index(config=config, tag_type=safe_type)
    candidates = index["rows"]
    matrix = index["matrix"]

    rows: List[Dict[str, Any]] = []
    similarities = matrix @ query_vector if query_vector is not None and matrix.size else np.zeros((len(candidates),), dtype=np.float32)
    for index_position, item in enumerate(candidates):
        display = clean_text(item.get("displayName") or item.get("name") or item.get("normalizedTag"))
        cosine = float(similarities[index_position]) if query_vector is not None else 0.0
        lexical = max(
            _lexical_similarity(safe_query, display),
            _lexical_similarity(safe_query, item.get("normalizedTag")),
            _lexical_similarity(safe_query, item.get("tagId")),
        )
        score = max(cosine, lexical)
        if score < threshold:
            continue
        if not capability_type_matches(item, capability_type):
            continue
        score_source = "embedding" if cosine >= lexical and query_vector is not None else "lexical"
        matched_item = item_with_matched_capability_type(item, capability_type)
        rows.append(
            {
                **matched_item,
                "similarity": round(cosine, 4) if cosine else round(score, 4),
                "rankScore": round(score, 4),
                "scoreSource": score_source,
            }
        )

    rows.sort(
        key=lambda item: (
            -float(item.get("rankScore") or 0),
            -int(item.get("jobCount") or 0),
            item["normalizedTag"].lower(),
        )
    )
    return {
        "source": "professional-skills",
        "query": safe_query,
        "category": resolved_category,
        "tagType": safe_type,
        "minSimilarity": threshold,
        "total": len(rows),
        "candidateCount": len(candidates),
        "missingCandidateVectors": int(index.get("missingCandidateVectors") or 0),
        "indexFile": index.get("indexFile"),
        "indexMatrixFile": index.get("indexMatrixFile"),
        "indexStatus": index.get("indexStatus"),
        "options": rows[: max(1, limit)],
        "embedding": embedding_meta,
    }


async def search_tag_center_catalog_semantic(
    query: str,
    tag_type: str = "techCapabilities",
    limit: int = 5,
    min_similarity: float = 0.70,
    embed_missing: bool = True,
) -> List[Dict[str, Any]]:
    result = await search_professional_skills(
        query=query,
        tag_type=tag_type,
        limit=limit,
        min_similarity=min_similarity,
        embed_missing=embed_missing,
    )
    return result["options"]


def resolve_tag_center_catalog(
    *,
    tag_id: str = "",
    value: str = "",
    tag_type: str = "techCapabilities",
) -> Dict[str, Any] | None:
    safe_id = clean_text(tag_id)
    safe_value = clean_text(value).lower()
    safe_type = clean_text(tag_type) or "techCapabilities"
    if safe_type not in SUPPORTED_TAG_CENTER_TYPES:
        safe_type = "techCapabilities"
    if not safe_id and not safe_value:
        return None

    for row in load_tag_center_rows():
        if clean_text(row.get("tagType")) != safe_type:
            continue
        public = public_tag_center_row(row)
        if safe_id and public["tagId"] == safe_id:
            return public
        if safe_value and safe_value in {
            public["normalizedTag"].lower(),
            public["name"].lower(),
            public["skillZh"].lower(),
            public["displayName"].lower(),
        }:
            return public
    return None


def ensure_domain_center_assets() -> None:
    if not CAREER_JSON_FILE.exists():
        return
    master_mtime = DOMAIN_MASTER_FILE.stat().st_mtime if DOMAIN_MASTER_FILE.exists() else 0
    stats_mtime = DOMAIN_TAG_STATS_FILE.stat().st_mtime if DOMAIN_TAG_STATS_FILE.exists() else 0
    source_mtime = CAREER_JSON_FILE.stat().st_mtime
    if master_mtime >= source_mtime and stats_mtime >= source_mtime:
        return
    if not load_shared_jobs or not rebuild_shared_domain_assets:
        return
    try:
        rebuild_shared_domain_assets(load_shared_jobs())
    except Exception:
        return


def load_domain_center_rows() -> List[Dict[str, Any]]:
    ensure_domain_center_assets()
    if not DOMAIN_MASTER_FILE.exists():
        return []
    try:
        payload = json.loads(DOMAIN_MASTER_FILE.read_text(encoding="utf-8-sig"))
    except Exception:
        return []
    return payload if isinstance(payload, list) else []


def load_domain_tag_stats_rows() -> List[Dict[str, Any]]:
    ensure_domain_center_assets()
    if not DOMAIN_TAG_STATS_FILE.exists():
        return []
    try:
        payload = json.loads(DOMAIN_TAG_STATS_FILE.read_text(encoding="utf-8-sig"))
    except Exception:
        return []
    return payload if isinstance(payload, list) else []


def public_domain_center_row(row: Dict[str, Any]) -> Dict[str, Any]:
    domain = clean_text(row.get("domain") or row.get("normalizedTag"))
    name = clean_text(row.get("name")) or domain
    return {
        "tagId": clean_text(row.get("domainId") or row.get("tagId")),
        "domainId": clean_text(row.get("domainId") or row.get("tagId")),
        "name": name,
        "domain": domain,
        "normalizedTag": domain,
        "jobCount": int(row.get("jobCount") or 0),
        "mentionCount": int(row.get("mentionCount") or 0),
        "tagCount": int(row.get("tagCount") or 0),
        "source": "domain-center",
    }


def recommend_tech_domains(
    *,
    limit: int = 10,
    page: int = 0,
    min_frequency: int = 5,
) -> Dict[str, Any]:
    rows = [
        public_domain_center_row(row)
        for row in load_domain_center_rows()
        if int(row.get("jobCount") or 0) >= int(min_frequency)
    ]
    rows.sort(key=lambda item: (-int(item.get("jobCount") or 0), -int(item.get("mentionCount") or 0), item["normalizedTag"].lower()))
    total = len(rows)
    safe_limit = max(1, int(limit))
    safe_page = max(0, int(page))
    if total:
        offset = (safe_page * safe_limit) % total
        options = (rows[offset:] + rows[:offset])[:safe_limit]
        next_page = safe_page + 1
    else:
        offset = 0
        options = []
        next_page = 0
    return {
        "source": "tech-domains-recommendations",
        "minFrequency": int(min_frequency),
        "page": safe_page,
        "nextPage": next_page,
        "offset": offset,
        "totalCandidateCount": total,
        "options": options,
    }


def search_tech_domains(
    *,
    query: str,
    limit: int = 8,
    min_frequency: int = 5,
) -> Dict[str, Any]:
    safe_query = clean_text(query).lower()
    if not safe_query:
        return {
            "source": "tech-domains-search",
            "query": clean_text(query),
            "minFrequency": int(min_frequency),
            "total": 0,
            "options": [],
        }
    rows: List[Dict[str, Any]] = []
    for row in load_domain_center_rows():
        public = public_domain_center_row(row)
        if public["jobCount"] < int(min_frequency):
            continue
        name = public["name"].lower()
        domain = public["normalizedTag"].lower()
        domain_id = public["domainId"].lower()
        haystack = f"{name} {domain} {domain_id}"
        if safe_query not in haystack:
            continue
        if safe_query == name or safe_query == domain or safe_query == domain_id:
            score = 100
        elif name.startswith(safe_query) or domain.startswith(safe_query):
            score = 70
        else:
            score = 40
        rows.append({**public, "_score": score})
    rows.sort(key=lambda item: (-int(item.get("_score") or 0), -int(item.get("jobCount") or 0), item["normalizedTag"].lower()))
    options = [{key: value for key, value in item.items() if key != "_score"} for item in rows[: max(1, int(limit))]]
    return {
        "source": "tech-domains-search",
        "query": clean_text(query),
        "minFrequency": int(min_frequency),
        "total": len(rows),
        "options": options,
    }


def parse_csv_set(value: str) -> set[str]:
    return {clean_text(item) for item in clean_text(value).split(",") if clean_text(item)}


def tag_center_public_index(tag_type: str) -> Dict[str, Dict[str, Any]]:
    index: Dict[str, Dict[str, Any]] = {}
    for row in load_tag_center_rows():
        if clean_text(row.get("tagType")) != tag_type:
            continue
        public = public_tag_center_row(row)
        if public["tagId"]:
            index[public["tagId"]] = public
        if public["normalizedTag"]:
            index[public["normalizedTag"].lower()] = public
    return index


def selected_domain_keys(domain_ids: str = "", domains: str = "") -> Tuple[set[str], set[str]]:
    ids = parse_csv_set(domain_ids)
    values = {item.lower() for item in parse_csv_set(domains)}
    return ids, values


def domain_filtered_skill_candidates(
    *,
    domain_ids: str = "",
    domains: str = "",
    min_frequency: int = 10,
    exclude_tag_ids: set[str] | None = None,
    exclude_values: set[str] | None = None,
) -> Tuple[List[Dict[str, Any]], bool]:
    selected_ids, selected_values = selected_domain_keys(domain_ids=domain_ids, domains=domains)
    has_domain_filter = bool(selected_ids or selected_values)
    if not has_domain_filter:
        return [], False
    excluded_ids = exclude_tag_ids or set()
    excluded_values = exclude_values or set()
    public_index = tag_center_public_index("techCapabilities")
    candidates: Dict[str, Dict[str, Any]] = {}

    for row in load_domain_tag_stats_rows():
        public_domain = public_domain_center_row(row)
        domain_id = public_domain["domainId"]
        domain_value = public_domain["normalizedTag"].lower()
        domain_name = public_domain["name"].lower()
        if domain_id not in selected_ids and domain_value not in selected_values and domain_name not in selected_values:
            continue
        for tag in row.get("tags", []) or []:
            if not isinstance(tag, dict):
                continue
            domain_job_count = int(tag.get("jobCount") or 0)
            if domain_job_count <= int(min_frequency):
                continue
            tag_id = clean_text(tag.get("tagId"))
            normalized_tag = clean_text(tag.get("normalizedTag"))
            if tag_id in excluded_ids:
                continue
            if normalized_tag.lower() in excluded_values or clean_text(tag.get("name")).lower() in excluded_values:
                continue
            public = public_index.get(tag_id) or public_index.get(normalized_tag.lower())
            tag_type_counts = normalize_type_counts(tag.get("typeCounts"))
            capability_type = dominant_capability_type(tag_type_counts)
            if public:
                base = {**public}
            else:
                base = {
                    "tagId": tag_id,
                    "tagType": "techCapabilities",
                    "name": clean_text(tag.get("name")) or normalized_tag,
                    "skill": normalized_tag,
                    "skillZh": clean_text(tag.get("name")) or normalized_tag,
                    "displayName": clean_text(tag.get("name")) or normalized_tag,
                    "normalizedTag": normalized_tag,
                    "levelRequired": 1,
                    "jobCount": domain_job_count,
                    "jobRatio": 0,
                    "isHighFrequency": False,
                    "source": "domain-center",
                }
            if tag_type_counts:
                base["typeCounts"] = merge_type_counts(base.get("typeCounts") or {}, tag_type_counts)
            if capability_type:
                base["type"] = capability_type
            existing = candidates.get(base["tagId"] or base["normalizedTag"].lower())
            matched_domain = {
                "domainId": public_domain["domainId"],
                "name": public_domain["name"],
                "normalizedTag": public_domain["normalizedTag"],
            }
            if existing:
                existing["jobCount"] = int(existing.get("jobCount") or 0) + domain_job_count
                existing["domainJobCount"] = int(existing.get("domainJobCount") or 0) + domain_job_count
                existing["typeCounts"] = merge_type_counts(existing.get("typeCounts") or {}, tag_type_counts)
                existing["type"] = dominant_capability_type(existing.get("typeCounts") or {}) or clean_text(existing.get("type"))
                existing.setdefault("matchedDomains", []).append(matched_domain)
                continue
            candidates[base["tagId"] or base["normalizedTag"].lower()] = {
                **base,
                "globalJobCount": int(base.get("jobCount") or 0),
                "jobCount": domain_job_count,
                "domainJobCount": domain_job_count,
                "mentionCount": int(tag.get("mentionCount") or 0),
                "matchedDomains": [matched_domain],
            }

    rows = list(candidates.values())
    rows.sort(key=lambda item: (-int(item.get("domainJobCount") or item.get("jobCount") or 0), item["normalizedTag"].lower()))
    return rows, True


def take_paged(pool: List[Dict[str, Any]], count: int, page: int, used_keys: set[str]) -> List[Dict[str, Any]]:
    if count <= 0 or not pool:
        return []
    start = (max(0, int(page)) * count) % len(pool)
    rotated = pool[start:] + pool[:start]
    result: List[Dict[str, Any]] = []
    for item in rotated:
        key = clean_text(item.get("tagId") or item.get("normalizedTag")).lower()
        if key in used_keys:
            continue
        used_keys.add(key)
        result.append(item)
        if len(result) >= count:
            break
    return result


def grouped_recommendation_rows(
    rows: List[Dict[str, Any]],
    *,
    page: int = 0,
    limit: int = 10,
    random_seed: str = "",
) -> Dict[str, List[Dict[str, Any]]]:
    safe_limit = max(1, int(limit))
    high_count = min(3, safe_limit)
    mid_count = min(3, max(0, safe_limit - high_count))
    tail_count = min(2, max(0, safe_limit - high_count - mid_count))
    random_count = max(0, safe_limit - high_count - mid_count - tail_count)
    total = len(rows)
    if not rows:
        return {"high": [], "mid": [], "tail": [], "random": []}

    first_cut = max(1, total // 3)
    second_cut = max(first_cut + 1, (total * 2) // 3) if total > 2 else total
    high_pool = rows[:first_cut]
    mid_pool = rows[first_cut:second_cut] or rows
    tail_pool = rows[second_cut:] or rows
    used: set[str] = set()
    groups = {
        "high": take_paged(high_pool, high_count, page, used),
        "mid": take_paged(mid_pool, mid_count, page, used),
        "tail": take_paged(tail_pool, tail_count, page, used),
        "random": [],
    }
    remaining = [
        item
        for item in rows
        if clean_text(item.get("tagId") or item.get("normalizedTag")).lower() not in used
    ]
    if random_count > 0 and remaining:
        rng = random.Random(clean_text(random_seed) or f"{page}:{total}:{','.join(item.get('normalizedTag', '') for item in rows[:5])}")
        groups["random"] = rng.sample(remaining, min(random_count, len(remaining)))
    for group_name, items in groups.items():
        for item in items:
            item["recommendationTier"] = group_name
    return groups


def recommend_professional_skills(
    *,
    category: str = "techCapability",
    tag_type: str = "",
    capability_type: str = "",
    limit: int = 8,
    offset: int = 0,
    page: int = 0,
    random_seed: str = "",
    min_frequency: int = 10,
    exclude_tag_ids: str = "",
    exclude_values: str = "",
    domain_ids: str = "",
    domains: str = "",
) -> Dict[str, Any]:
    resolved_category, safe_type = normalize_skill_category(category=category, tag_type=tag_type)
    excluded_ids = {clean_text(item) for item in exclude_tag_ids.split(",") if clean_text(item)}
    excluded_values = {clean_text(item).lower() for item in exclude_values.split(",") if clean_text(item)}

    rows, has_domain_filter = domain_filtered_skill_candidates(
        domain_ids=domain_ids,
        domains=domains,
        min_frequency=min_frequency,
        exclude_tag_ids=excluded_ids,
        exclude_values=excluded_values,
    )
    if capability_type and has_domain_filter:
        rows = [row for row in rows if capability_type_matches(row, capability_type)]

    if safe_type != "techCapabilities" or not has_domain_filter:
        rows = []
        for row in load_tag_center_rows():
            if clean_text(row.get("tagType")) != safe_type:
                continue
            public = public_tag_center_row(row)
            if not capability_type_matches(public, capability_type):
                continue
            if int(public.get("jobCount") or 0) <= int(min_frequency):
                continue
            if public["tagId"] in excluded_ids:
                continue
            if public["normalizedTag"].lower() in excluded_values or public["name"].lower() in excluded_values:
                continue
            rows.append(public)

    rows.sort(key=lambda item: (-int(item.get("jobCount") or 0), item["normalizedTag"].lower()))
    total = len(rows)
    safe_limit = max(1, int(limit))
    safe_page = max(0, int(page))
    if offset and not page:
        safe_page = max(0, int(offset)) // safe_limit
    groups = grouped_recommendation_rows(rows, page=safe_page, limit=safe_limit, random_seed=random_seed)
    options = [item for group_name in ("high", "mid", "tail", "random") for item in groups[group_name]]
    next_page = safe_page + 1 if total else 0
    next_offset = (next_page * safe_limit) % total if total else 0

    return {
        "source": "professional-skills-recommendations",
        "category": resolved_category,
        "tagType": safe_type,
        "minFrequency": int(min_frequency),
        "offset": (safe_page * safe_limit) % total if total else 0,
        "nextOffset": next_offset,
        "page": safe_page,
        "nextPage": next_page,
        "totalCandidateCount": total,
        "domainFiltered": bool(has_domain_filter and safe_type == "techCapabilities"),
        "groups": groups,
        "options": options,
    }


def normalize_item(name: str, group_name: str, level_required: int = 1) -> Dict[str, Any]:
    capability_type = CAPABILITY_GROUP_TYPE_MAP.get(group_name, "engineering")
    return {
        "name": name,
        "skill": name,
        "skillZh": name,
        "rawExtractedText": name,
        "normalizedTag": None,
        "type": capability_type,
        "domain": group_name,
        "groupName": group_name,
        "levelRequired": level_required,
        "evidence": "",
        "label": name,
    }


def catalog() -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for group_name, skills in CAPABILITY_GROUPS.items():
        rows.extend(normalize_item(name, group_name) for name in skills)
    return rows


def recommendations_for_direction(direction: str) -> Dict[str, List[Dict[str, Any]]]:
    grouped = {"engineering": [], "scene": [], "principle": []}
    seen = set()
    for group_name in DIRECTION_CAPABILITY_MAP.get(direction, []):
        for name in CAPABILITY_GROUPS.get(group_name, []):
            item = normalize_item(name, group_name)
            key = f"{item['type']}::{item['name']}"
            if key in seen:
                continue
            seen.add(key)
            grouped[item["type"]].append(item)
    return grouped


def _score(name: str, query: str) -> int:
    if name == query:
        return 100
    if name.startswith(query):
        return 70
    if query in name:
        return 40
    return 0


def search_catalog(query: str, capability_type: str = "", direction: str = "", limit: int = 8) -> List[Dict[str, Any]]:
    safe_query = (query or "").strip().lower()
    if not safe_query:
        return []
    tag_center_rows = search_tag_center_catalog(query=query, tag_type="techCapabilities", limit=limit)
    if tag_center_rows:
        filtered_rows = [
            item_with_matched_capability_type(item, capability_type)
            for item in tag_center_rows
            if capability_type_matches(item, capability_type)
        ]
        return filtered_rows[: max(1, limit)]
    recommended_groups = set(DIRECTION_CAPABILITY_MAP.get(direction or "", []))
    rows = []
    for item in catalog():
        if capability_type and item["type"] != capability_type:
            continue
        base_score = _score(item["name"].lower(), safe_query)
        if base_score <= 0:
            continue
        rows.append(
            {
                **item,
                "_score": base_score + (10 if item["groupName"] in recommended_groups else 0),
            }
        )
    rows.sort(key=lambda item: (-item["_score"], item["name"]))
    return [{key: value for key, value in item.items() if key != "_score"} for item in rows[: max(1, limit)]]
