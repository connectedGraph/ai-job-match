import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Dict

from .config import JWT_EXPIRE_MINUTES, JWT_SECRET


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    iterations = 200_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "pbkdf2_sha256${}${}${}".format(
        iterations,
        _b64url_encode(salt),
        _b64url_encode(digest),
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, digest_text = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        salt = _b64url_decode(salt_text)
        expected = _b64url_decode(digest_text)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def create_access_token(user_id: int, username: str) -> str:
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": str(user_id),
        "username": username,
        "iat": now,
        "exp": now + JWT_EXPIRE_MINUTES * 60,
    }
    signing_input = "{}.{}".format(
        _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8")),
        _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
    )
    signature = hmac.new(
        JWT_SECRET.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def decode_access_token(token: str) -> Dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("invalid token")
    signing_input = f"{parts[0]}.{parts[1]}"
    expected = hmac.new(
        JWT_SECRET.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    actual = _b64url_decode(parts[2])
    if not hmac.compare_digest(actual, expected):
        raise ValueError("invalid signature")
    payload = json.loads(_b64url_decode(parts[1]).decode("utf-8"))
    if int(payload.get("exp") or 0) < int(time.time()):
        raise ValueError("token expired")
    return payload

