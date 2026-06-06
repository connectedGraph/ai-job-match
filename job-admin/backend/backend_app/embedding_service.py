from typing import Dict, List, Optional

import numpy as np

from tag_sync import (
    embedding_cache_key,
    ensure_embeddings as ensure_shared_embeddings,
    load_embedding_cache,
)

from . import runtime_state as state
from .config import logger
from .utils import clean_text


def collect_missing_embedding_tags() -> List[str]:
    return [tag for tag in state.inverted_index.keys() if tag not in state.tag_vectors_cache]


def sync_runtime_cache_from_shared(
    shared_cache: Dict[str, np.ndarray],
    tags: Optional[List[str]] = None,
    overwrite: bool = True,
) -> int:
    synced = 0
    target_tags = tags if tags is not None else list(state.inverted_index.keys())
    for raw_tag in target_tags:
        tag = clean_text(raw_tag)
        if not tag:
            continue
        vector = shared_cache.get(embedding_cache_key(tag))
        if vector is None:
            continue
        if overwrite or tag not in state.tag_vectors_cache:
            state.tag_vectors_cache[tag] = vector
            synced += 1
    return synced


async def refresh_matcher_embedding_cache(
    tags: Optional[List[str]] = None,
    label: str = "",
    embed_missing: bool = True,
) -> Dict[str, int]:
    target_tags = [
        clean_text(tag)
        for tag in (tags if tags is not None else list(state.inverted_index.keys()))
        if clean_text(tag)
    ]
    if not target_tags:
        return {"synced": 0, "embedded": 0, "remaining_missing": 0}

    shared_cache = load_embedding_cache()
    synced = sync_runtime_cache_from_shared(shared_cache, target_tags, overwrite=True)
    missing = [tag for tag in target_tags if tag not in state.tag_vectors_cache]
    embedded = 0
    if embed_missing and missing:
        embedded = await ensure_shared_embeddings(missing, shared_cache)
        synced += sync_runtime_cache_from_shared(shared_cache, missing, overwrite=True)
    remaining_missing = sum(1 for tag in target_tags if tag not in state.tag_vectors_cache)
    if label:
        logger.info(
            f"[Embed:{label}] synced={synced}, embedded={embedded}, remaining_missing={remaining_missing}"
        )
    return {
        "synced": synced,
        "embedded": embedded,
        "remaining_missing": remaining_missing,
    }


async def embed_batch(tags: List[str], label: str = "") -> None:
    normalized_tags: List[str] = []
    seen = set()
    for raw_tag in tags:
        tag = clean_text(raw_tag)
        if not tag or tag in seen:
            continue
        seen.add(tag)
        normalized_tags.append(tag)

    if not normalized_tags:
        if label:
            logger.info(f"[Embed:{label}] No tags to embed.")
        return

    await refresh_matcher_embedding_cache(
        tags=normalized_tags,
        label=label,
        embed_missing=True,
    )
