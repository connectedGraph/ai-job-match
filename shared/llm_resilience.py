import asyncio
import json
import logging
import re
import time
from typing import Any, Callable, Dict, List, Optional, TypeVar, Union
import httpx

logger = logging.getLogger(__name__)

T = TypeVar("T")

class LLMUnavailableError(Exception):
    """Exception raised when LLM is unavailable after retries."""
    pass

class LLMParseError(Exception):
    """Exception raised when LLM response cannot be parsed as valid JSON."""
    pass

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

def parse_llm_json(raw: str) -> Any:
    """Extract and parse JSON from LLM response text using multiple strategies."""
    text = str(raw or "").strip()
    
    # Strategy 1: Strip markdown code blocks
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 2:
            if lines[0].startswith("```"):
                text = "\n".join(lines[1:])
            if text.endswith("```"):
                text = text.rsplit("```", 1)[0].strip()
            elif lines[-1].strip() == "```":
                text = "\n".join(lines[:-1]).strip()

    # Strategy 2: Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strategy 3: Find first balanced JSON structure
    for idx, char in enumerate(text):
        if char not in "{[":
            continue
        candidate = _extract_balanced_json_at(text, idx)
        if candidate:
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass

    # Strategy 4: Find first { and last } or first [ and last ]
    start_brace = text.find("{")
    end_brace = text.rfind("}")
    if start_brace >= 0 and end_brace > start_brace:
        try:
            return json.loads(text[start_brace:end_brace+1])
        except json.JSONDecodeError:
            pass

    start_bracket = text.find("[")
    end_bracket = text.rfind("]")
    if start_bracket >= 0 and end_bracket > start_bracket:
        try:
            return json.loads(text[start_bracket:end_bracket+1])
        except json.JSONDecodeError:
            pass

    raise LLMParseError(f"No valid JSON object or array found in response: {raw[:200]}")


def is_retryable_exception(exc: Exception) -> bool:
    """Determine if an exception is transient / retryable (timeout, rate limit, network, server error)."""
    exc_name = exc.__class__.__name__
    
    # Asyncio or standard timeouts/connections
    if isinstance(exc, (asyncio.TimeoutError, ConnectionError, TimeoutError)):
        return True
        
    # HTTPX exceptions
    if isinstance(exc, httpx.HTTPError):
        # Retry on timeouts, network errors, protocol errors (like RemoteProtocolError), or 429 / 5xx status codes
        if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError, httpx.ProtocolError)):
            return True
        if isinstance(exc, httpx.HTTPStatusError):
            status = exc.response.status_code
            if status == 429 or status >= 500:
                return True
        return False

    # OpenAI API exceptions (checked by name/attributes to avoid strict import dependency if not present)
    if "openai" in exc.__class__.__module__.lower():
        # Retry on RateLimitError, APITimeoutError, APIConnectionError, InternalServerError
        if "rate" in exc_name.lower() or "timeout" in exc_name.lower() or "connection" in exc_name.lower() or "internal" in exc_name.lower():
            return True
        # If APIError has status_code
        status_code = getattr(exc, "status_code", None)
        if status_code and (status_code == 429 or status_code >= 500):
            return True

    # General fallback: check string representation for common words
    exc_str = str(exc).lower()
    if "timeout" in exc_str or "time out" in exc_str or "rate limit" in exc_str or "connection" in exc_str or "disconnected" in exc_str or "429" in exc_str or "502" in exc_str or "503" in exc_str or "504" in exc_str:
        return True
        
    return False


async def call_llm_with_resilience(
    func: Callable[[], Any],
    label: str = "LLM Call",
    max_attempts: int = 3,
    base_backoff: float = 2.0,
    max_backoff: float = 8.0,
) -> Any:
    """Execute an LLM-invoking async function with retry and exponential backoff.
    
    Args:
        func: Coroutine or callable returning a coroutine.
        label: Descriptive label for logging.
        max_attempts: Maximum number of attempts.
        base_backoff: Initial backoff in seconds.
        max_backoff: Maximum backoff in seconds.
    """
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await func()
        except Exception as exc:
            last_error = exc
            if attempt == max_attempts:
                logger.error(
                    "[%s] Failed all %d attempts. Last error: %s",
                    label,
                    max_attempts,
                    str(exc),
                )
                break
                
            if is_retryable_exception(exc):
                backoff = min(base_backoff * (2 ** (attempt - 1)), max_backoff)
                logger.warning(
                    "[%s] Attempt %d/%d failed with retryable error: %s. Retrying in %.1fs...",
                    label,
                    attempt,
                    max_attempts,
                    str(exc),
                    backoff,
                )
                await asyncio.sleep(backoff)
            else:
                logger.error(
                    "[%s] Attempt %d/%d failed with non-retryable error: %s. Aborting.",
                    label,
                    attempt,
                    max_attempts,
                    str(exc),
                )
                raise exc
                
    raise LLMUnavailableError(f"{label} failed after {max_attempts} attempts: {str(last_error)}") from last_error
