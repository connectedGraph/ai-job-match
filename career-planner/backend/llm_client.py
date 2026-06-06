import json
import logging
import os
from typing import Any, Callable, Dict, List, Optional

import httpx
from fastapi import HTTPException

from .config import LLMConfig, load_ai_llm_config, load_resume_llm_config


logger = logging.getLogger(__name__)
RAW_RESPONSE_LOG_LIMIT = 1200


def _normalize_message_content(raw: Any) -> str:
    if isinstance(raw, list):
        parts = []
        for item in raw:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and item.get("type") in {"text", "output_text"}:
                parts.append(str(item.get("text") or ""))
        return "\n".join(parts).strip()
    return str(raw or "").strip()


def _extract_balanced_json_at(text: str, start: int) -> Optional[str]:
    opening = text[start]
    closing_for = {"{": "}", "[": "]"}
    if opening not in closing_for:
        return None

    stack = [closing_for[opening]]
    in_string = False
    escaped = False

    for idx in range(start + 1, len(text)):
        char = text[idx]

        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char in closing_for:
            stack.append(closing_for[char])
        elif char in "}]":
            if not stack or char != stack[-1]:
                return None
            stack.pop()
            if not stack:
                return text[start : idx + 1]

    return None


def extract_and_parse_json(text: str) -> Any:
    raw = str(text or "")
    last_error: Optional[Exception] = None

    for idx, char in enumerate(raw):
        if char not in "{[":
            continue

        candidate = _extract_balanced_json_at(raw, idx)
        if not candidate:
            continue

        try:
            return json.loads(candidate)
        except json.JSONDecodeError as exc:
            last_error = exc

    if last_error:
        raise ValueError(f"No valid JSON found in response: {last_error}") from last_error
    raise ValueError("No JSON found in response")


def _should_log_raw_response_on_parse_failure() -> bool:
    explicit = os.getenv("CAREER_PLANNER_LOG_LLM_RAW_ON_PARSE_ERROR", "").strip().lower()
    if explicit:
        return explicit not in {"0", "false", "no", "off"}

    env_name = (
        os.getenv("CAREER_PLANNER_ENV")
        or os.getenv("APP_ENV")
        or os.getenv("ENV")
        or ""
    ).strip().lower()
    if env_name in {"prod", "production"}:
        return False
    return True


def _summarize_raw_response(raw: str, limit: int = RAW_RESPONSE_LOG_LIMIT) -> str:
    text = str(raw or "").replace("\r", "\\r").replace("\n", "\\n")
    if len(text) <= limit:
        return text
    return f"{text[:limit]}...<truncated raw_chars={len(text)}>"


def _log_json_parse_failure(
    config_label: str,
    config: LLMConfig,
    raw: str,
    error: Exception,
    attempt: int,
    max_retries: int,
) -> None:
    if not _should_log_raw_response_on_parse_failure():
        return

    logger.warning(
        "%s JSON parse failed on attempt %s/%s model=%s raw_chars=%s error=%s raw_excerpt=%s",
        config_label,
        attempt,
        max_retries,
        config.model,
        len(raw or ""),
        error,
        _summarize_raw_response(raw),
    )


async def _call_chat_json(
    messages: List[Dict[str, Any]],
    config_loader: Callable[[], LLMConfig],
    config_label: str,
    max_retries: int = 3,
    max_tokens: Optional[int] = None,
) -> Any:
    try:
        config = config_loader()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if not config.api_key:
        raise HTTPException(status_code=500, detail=f"{config_label} API key is not configured on backend")
    if not config.base_url:
        raise HTTPException(status_code=500, detail=f"{config_label} base URL is not configured on backend")

    body = {
        "model": config.model,
        "temperature": config.temperature,
        "max_tokens": max_tokens or config.max_tokens,
        "messages": messages,
    }
    endpoint = f"{config.base_url}/chat/completions"
    last_error: Optional[Exception] = None
    retry_count = max(1, max_retries)

    for attempt in range(1, retry_count + 1):
        try:
            async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
                response = await client.post(
                    endpoint,
                    headers={
                        "Authorization": f"Bearer {config.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
            if response.status_code >= 400:
                raise HTTPException(
                    status_code=502,
                    detail=f"{config_label} request failed with status {response.status_code}: {response.text[:500]}",
                )
            payload = response.json()
            raw = _normalize_message_content(payload.get("choices", [{}])[0].get("message", {}).get("content"))
            try:
                return extract_and_parse_json(raw)
            except Exception as exc:
                _log_json_parse_failure(config_label, config, raw, exc, attempt, retry_count)
                raise
        except HTTPException:
            raise
        except Exception as exc:
            last_error = exc

    raise HTTPException(status_code=502, detail=f"{config_label} JSON parse failed: {last_error}")


async def call_resume_chat_json(
    messages: List[Dict[str, Any]],
    max_retries: int = 3,
    max_tokens: Optional[int] = None,
) -> Any:
    return await _call_chat_json(
        messages=messages,
        config_loader=load_resume_llm_config,
        config_label="Resume LLM",
        max_retries=max_retries,
        max_tokens=max_tokens,
    )


async def call_ai_chat_json(
    messages: List[Dict[str, Any]],
    max_retries: int = 3,
    max_tokens: Optional[int] = None,
) -> Any:
    return await _call_chat_json(
        messages=messages,
        config_loader=load_ai_llm_config,
        config_label="AI tools LLM",
        max_retries=max_retries,
        max_tokens=max_tokens,
    )


async def call_chat_json(
    messages: List[Dict[str, Any]],
    max_retries: int = 3,
    max_tokens: Optional[int] = None,
) -> Any:
    return await call_ai_chat_json(messages=messages, max_retries=max_retries, max_tokens=max_tokens)
