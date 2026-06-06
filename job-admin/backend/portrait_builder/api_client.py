import asyncio
import json
from collections import deque
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from .api_models import BuilderConfig
from .api_utils import clean_text, now_iso


def normalize_base_url(base_url: str) -> str:
    base_url = clean_text(base_url).rstrip("/")
    if base_url.endswith("/v1"):
        return base_url
    return f"{base_url}/v1"


class AsyncRequestRateLimiter:
    def __init__(self, max_calls: int, period_seconds: float = 60.0):
        self.max_calls = max(1, int(max_calls))
        self.period_seconds = period_seconds
        self._lock = asyncio.Lock()
        self._timestamps: deque[float] = deque()

    async def acquire(self) -> None:
        loop = asyncio.get_running_loop()
        while True:
            async with self._lock:
                now = loop.time()
                while self._timestamps and now - self._timestamps[0] >= self.period_seconds:
                    self._timestamps.popleft()
                if len(self._timestamps) < self.max_calls:
                    self._timestamps.append(now)
                    return
                wait_seconds = self.period_seconds - (now - self._timestamps[0]) + 0.02
            await asyncio.sleep(max(wait_seconds, 0.05))


def mask_api_key(api_key: str) -> str:
    api_key = clean_text(api_key)
    if len(api_key) <= 8:
        return "*" * len(api_key)
    return f"{api_key[:4]}{'*' * max(4, len(api_key) - 8)}{api_key[-4:]}"


def empty_token_usage() -> Dict[str, int]:
    return {
        "modelCallCount": 0,
        "inputTokens": 0,
        "outputTokens": 0,
        "totalTokens": 0,
    }


def normalize_token_usage(usage: Any) -> Dict[str, int]:
    if not isinstance(usage, dict):
        return empty_token_usage()
    input_tokens = usage.get("input_tokens")
    if input_tokens is None:
        input_tokens = usage.get("prompt_tokens")
    output_tokens = usage.get("output_tokens")
    if output_tokens is None:
        output_tokens = usage.get("completion_tokens")
    total_tokens = usage.get("total_tokens")
    if total_tokens is None:
        total_tokens = usage.get("totalTokens")
    input_value = max(0, int(input_tokens or 0))
    output_value = max(0, int(output_tokens or 0))
    total_value = max(0, int(total_tokens or (input_value + output_value)))
    return {
        "modelCallCount": 1,
        "inputTokens": input_value,
        "outputTokens": output_value,
        "totalTokens": total_value,
    }


def merge_token_usage(base: Optional[Dict[str, int]], delta: Optional[Dict[str, int]]) -> Dict[str, int]:
    result = empty_token_usage()
    for source in [base or {}, delta or {}]:
        result["modelCallCount"] += int(source.get("modelCallCount") or 0)
        result["inputTokens"] += int(source.get("inputTokens") or 0)
        result["outputTokens"] += int(source.get("outputTokens") or 0)
        result["totalTokens"] += int(source.get("totalTokens") or 0)
    return result


def normalize_chat_messages(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    normalized: List[Dict[str, str]] = []
    for message in messages:
        role = clean_text(message.get("role"))
        content = clean_text(message.get("content"))
        if role and content:
            normalized.append({"role": role, "content": content})
    if not normalized:
        raise ValueError("messages must not be empty")
    return normalized


def apply_chat_completions_role_strategy(config: BuilderConfig, messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    normalized = normalize_chat_messages(messages)
    if clean_text(getattr(config, "chatCompletionsSystemRole", None)) != "user":
        return normalized
    transformed: List[Dict[str, str]] = []
    for message in normalized:
        transformed.append(
            {
                "role": "user" if message.get("role") == "system" else message.get("role"),
                "content": message.get("content"),
            }
        )
    return transformed


def build_chat_completions_request_package(config: BuilderConfig, messages: List[Dict[str, str]]) -> Dict[str, Any]:
    return {
        "apiMode": "chat_completions",
        "endpoint": f"{normalize_base_url(config.baseUrl)}/chat/completions",
        "chatCompletionsSystemRole": config.chatCompletionsSystemRole,
        "body": {
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": config.maxTokens,
        },
    }


def build_responses_request_package(config: BuilderConfig, messages: List[Dict[str, str]]) -> Dict[str, Any]:
    return {
        "apiMode": "responses",
        "endpoint": f"{normalize_base_url(config.baseUrl)}/responses",
        "body": {
            "model": config.model,
            "input": messages,
            "max_output_tokens": config.maxTokens,
            "temperature": config.temperature,
        },
    }


async def call_chat_completions_messages(config: BuilderConfig, messages: List[Dict[str, str]]) -> Dict[str, Any]:
    normalized_messages = apply_chat_completions_role_strategy(config, messages)
    request_package = build_chat_completions_request_package(config, normalized_messages)
    prompt = ChatPromptTemplate.from_messages([(message["role"], message["content"]) for message in normalized_messages])
    try:
        llm = ChatOpenAI(
            model=config.model,
            api_key=config.apiKey,
            base_url=normalize_base_url(config.baseUrl),
            temperature=config.temperature,
            max_tokens=config.maxTokens,
            timeout=120,
        )
        response = await llm.ainvoke(prompt.format_messages())
        text = response.content if isinstance(response.content, str) else json.dumps(response.content, ensure_ascii=False)
        usage = normalize_token_usage(getattr(response, "usage_metadata", None))
        return {"text": text, "usage": usage, "requestPackage": request_package, "transport": "langchain_chatopenai"}
    except Exception:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                request_package["endpoint"],
                headers={"Authorization": f"Bearer {config.apiKey}", "Content-Type": "application/json"},
                json=request_package["body"],
            )
        response.raise_for_status()
        data = response.json()
        return {
            "text": clean_text(data.get("choices", [{}])[0].get("message", {}).get("content")),
            "usage": normalize_token_usage(data.get("usage") or data.get("token_usage")),
            "requestPackage": request_package,
            "transport": "httpx_chat_completions",
        }


async def call_chat_completions(config: BuilderConfig, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    return await call_chat_completions_messages(
        config,
        [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
    )


async def call_responses_api_messages(config: BuilderConfig, messages: List[Dict[str, str]]) -> Dict[str, Any]:
    normalized_messages = normalize_chat_messages(messages)
    request_package = build_responses_request_package(config, normalized_messages)
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            request_package["endpoint"],
            headers={"Authorization": f"Bearer {config.apiKey}", "Content-Type": "application/json"},
            json=request_package["body"],
        )
    response.raise_for_status()
    payload = response.json()
    if payload.get("output_text"):
        return {
            "text": clean_text(payload["output_text"]),
            "usage": normalize_token_usage(payload.get("usage") or payload.get("token_usage")),
            "requestPackage": request_package,
            "transport": "httpx_responses",
        }
    parts: List[str] = []
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                parts.append(clean_text(content.get("text")))
    return {
        "text": "\n".join([part for part in parts if part]),
        "usage": normalize_token_usage(payload.get("usage") or payload.get("token_usage")),
        "requestPackage": request_package,
        "transport": "httpx_responses",
    }


async def call_responses_api(config: BuilderConfig, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    return await call_responses_api_messages(
        config,
        [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
    )


async def call_model_messages(
    config: BuilderConfig,
    messages: List[Dict[str, str]],
    rate_limiter: Optional[AsyncRequestRateLimiter] = None,
) -> Dict[str, Any]:
    if rate_limiter is not None:
        await rate_limiter.acquire()
    if config.apiMode == "responses":
        return await call_responses_api_messages(config, messages)
    return await call_chat_completions_messages(config, messages)


async def call_model(
    config: BuilderConfig,
    system_prompt: str,
    user_prompt: str,
    rate_limiter: Optional[AsyncRequestRateLimiter] = None,
) -> Dict[str, Any]:
    return await call_model_messages(
        config,
        [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        rate_limiter=rate_limiter,
    )


async def discover_models(base_url: str, api_key: str) -> List[str]:
    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.get(
            f"{normalize_base_url(base_url)}/models",
            headers={"Authorization": f"Bearer {api_key}"},
        )
    response.raise_for_status()
    payload = response.json()
    models: List[str] = []
    for item in payload.get("data", []):
        model_id = clean_text(item.get("id"))
        if model_id:
            models.append(model_id)
    return sorted(set(models))


async def preflight_config(config: BuilderConfig) -> Dict[str, Any]:
    started = datetime.now()
    try:
        models = await discover_models(config.baseUrl, config.apiKey)
        latency_ms = int((datetime.now() - started).total_seconds() * 1000)
        model_exists = config.model in models if config.model else False
        if not model_exists:
            test_response = await call_model_messages(
                config,
                [{"role": "user", "content": "测试，请直接回复1"}],
            )
            output = clean_text(test_response.get("text"))
            if not output:
                raise RuntimeError("completion test returned empty content")
        return {
            "configId": config.id,
            "configName": config.name,
            "status": "ok",
            "baseUrl": normalize_base_url(config.baseUrl),
            "latencyMs": latency_ms,
            "model": config.model,
            "modelFound": model_exists,
            "modelCount": len(models),
            "sampleModels": models[:20],
            "checkedAt": now_iso(),
            "warning": "" if model_exists else "model was not listed by /models, but completion test succeeded",
        }
    except Exception as exc:
        model_error = str(exc)
        try:
            test_response = await call_model_messages(
                config,
                [{"role": "user", "content": "测试，请直接回复1"}],
            )
            output = clean_text(test_response.get("text"))
            if not output:
                raise RuntimeError("completion test returned empty content")
            latency_ms = int((datetime.now() - started).total_seconds() * 1000)
            return {
                "configId": config.id,
                "configName": config.name,
                "status": "ok",
                "baseUrl": normalize_base_url(config.baseUrl),
                "latencyMs": latency_ms,
                "model": config.model,
                "modelFound": False,
                "modelCount": 0,
                "sampleModels": [],
                "checkedAt": now_iso(),
                "warning": f"/models preflight failed, but completion test succeeded: {model_error}",
            }
        except Exception as test_exc:
            latency_ms = int((datetime.now() - started).total_seconds() * 1000)
            return {
                "configId": config.id,
                "configName": config.name,
                "status": "error",
                "baseUrl": normalize_base_url(config.baseUrl),
                "latencyMs": latency_ms,
                "model": config.model,
                "modelFound": False,
                "modelCount": 0,
                "sampleModels": [],
                "checkedAt": now_iso(),
                "error": f"{model_error}; completion test failed: {test_exc}",
            }


async def preflight_configs(configs: List[BuilderConfig]) -> Dict[str, Any]:
    reports = await asyncio.gather(*(preflight_config(config) for config in configs))
    invalid = [row for row in reports if row.get("status") != "ok"]
    return {
        "checkedAt": now_iso(),
        "ok": not invalid,
        "reports": reports,
        "invalidConfigs": invalid,
    }
