import base64
import hashlib
import hmac
import json
import time

from openai import AsyncOpenAI

ZAI_BASE_URL: str = "https://api.z.ai/api/coding/paas/v4"


def _zhipu_jwt(api_key: str) -> str:
    """Generate a short-lived JWT from a ZhipuAI {id}.{secret} key."""
    api_key_id, api_secret = api_key.split(".", 1)
    ts_ms = int(time.time() * 1000)

    def _b64url(data: dict) -> str:
        return (
            base64.urlsafe_b64encode(json.dumps(data, separators=(",", ":")).encode())
            .rstrip(b"=")
            .decode()
        )

    header = _b64url({"alg": "HS256", "sign_type": "SIGN"})
    payload = _b64url({"api_key": api_key_id, "exp": ts_ms + 3_600_000, "timestamp": ts_ms})
    signing_input = f"{header}.{payload}"
    sig = hmac.new(api_secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{signing_input}.{sig_b64}"


def zai_client(api_key: str) -> AsyncOpenAI:
    """Build an AsyncOpenAI client pointed at z.ai with a fresh signed JWT."""
    return AsyncOpenAI(base_url=ZAI_BASE_URL, api_key=_zhipu_jwt(api_key))
