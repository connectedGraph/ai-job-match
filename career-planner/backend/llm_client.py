import json
import logging
import os
from typing import Any, Callable, Dict, List, Optional

import httpx
from fastapi import HTTPException

from .config import LLMConfig, load_ai_llm_config, load_resume_llm_config
from shared.llm_resilience import call_llm_with_resilience, parse_llm_json



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
    return parse_llm_json(text)



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
    stream: bool = False,
) -> Any:
    try:
        config = config_loader()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if not config.api_key:
        raise HTTPException(status_code=500, detail=f"{config_label} API key is not configured on backend")
    if not config.base_url:
        raise HTTPException(status_code=500, detail=f"{config_label} base URL is not configured on backend")

    model_name = config.model
    temperature = config.temperature
    reasoning_param = None
    if model_name.startswith("gpt-5."):
        temperature = 0
        reasoning_param = {"effort": "none"}

    body = {
        "model": model_name,
        "messages": messages,
        "stream": stream,
    }
    if temperature is not None:
        body["temperature"] = temperature
    if max_tokens or config.max_tokens:
        body["max_tokens"] = max_tokens or config.max_tokens
    if reasoning_param:
        body["reasoning"] = reasoning_param

    endpoint = f"{config.base_url}/chat/completions"

    async def _do_call():
        if not stream:
            async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
                response = await client.post(
                    endpoint,
                    headers={
                        "Authorization": f"Bearer {config.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
                response.raise_for_status()
                data = response.json()
                raw = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                try:
                    return parse_llm_json(raw)
                except Exception as exc:
                    _log_json_parse_failure(config_label, config, raw, exc, 1, 1)
                    raise
        else:
            raw_text = ""
            async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
                async with client.stream(
                    "POST",
                    endpoint,
                    headers={
                        "Authorization": f"Bearer {config.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        line = line.strip()
                        if not line:
                            continue
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                data_json = json.loads(data_str)
                                choices = data_json.get("choices") or []
                                if choices:
                                    delta = choices[0].get("delta") or {}
                                    content = delta.get("content") or ""
                                    if content:
                                        raw_text += content
                            except Exception:
                                pass
            raw = raw_text.strip()
            try:
                return parse_llm_json(raw)
            except Exception as exc:
                _log_json_parse_failure(config_label, config, raw, exc, 1, 1)
                raise

    try:
        return await call_llm_with_resilience(
            _do_call,
            label=config_label,
            max_attempts=max_retries,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"{config_label} failed or returned invalid JSON: {str(exc)}"
        ) from exc


async def _call_responses_api_json(
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

    model_name = config.model
    temperature = config.temperature
    reasoning_param = None
    if model_name.startswith("gpt-5."):
        temperature = 0
        reasoning_param = {"effort": "none"}

    body = {
        "model": model_name,
        "input": messages,
    }
    if temperature is not None:
        body["temperature"] = temperature
    if max_tokens or config.max_tokens:
        body["max_output_tokens"] = max_tokens or config.max_tokens
    if reasoning_param:
        body["reasoning"] = reasoning_param
    # Append responses to base_url
    endpoint = f"{config.base_url}/responses"

    async def _do_call():
        async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {config.api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            response.raise_for_status()
            payload = response.json()
            
            # Extract content from Responses API structure
            content_list = []
            for out_item in payload.get("output", []):
                if out_item.get("type") == "message" and out_item.get("role") == "assistant":
                    content_list = out_item.get("content") or []
                    break
            
            raw = _normalize_message_content(content_list)
            try:
                return parse_llm_json(raw)
            except Exception as exc:
                _log_json_parse_failure(config_label, config, raw, exc, 1, 1)
                raise

    try:
        return await call_llm_with_resilience(
            _do_call,
            label=config_label,
            max_attempts=max_retries,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"{config_label} failed or returned invalid JSON: {str(exc)}"
        ) from exc


async def call_resume_chat_json(
    messages: List[Dict[str, Any]],
    max_retries: int = 3,
    max_tokens: Optional[int] = None,
    stream: bool = True,
) -> Any:
    return await _call_chat_json(
        messages=messages,
        config_loader=load_resume_llm_config,
        config_label="Resume LLM",
        max_retries=max_retries,
        max_tokens=max_tokens,
        stream=stream,
    )


async def call_ai_chat_json(
    messages: List[Dict[str, Any]],
    max_retries: int = 3,
    max_tokens: Optional[int] = None,
    stream: bool = False,
) -> Any:
    return await _call_chat_json(
        messages=messages,
        config_loader=load_ai_llm_config,
        config_label="AI tools LLM",
        max_retries=max_retries,
        max_tokens=max_tokens,
        stream=stream,
    )


async def call_chat_json(
    messages: List[Dict[str, Any]],
    max_retries: int = 3,
    max_tokens: Optional[int] = None,
    stream: bool = False,
) -> Any:
    return await call_ai_chat_json(
        messages=messages,
        max_retries=max_retries,
        max_tokens=max_tokens,
        stream=stream,
    )
