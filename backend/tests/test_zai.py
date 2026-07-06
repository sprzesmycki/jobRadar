import base64
import json
import time

from openai import AsyncOpenAI

from app.services.zai import ZAI_BASE_URL, _zhipu_jwt, zai_client


def _b64url_decode(segment: str) -> dict:
    padding = "=" * (-len(segment) % 4)
    return json.loads(base64.urlsafe_b64decode(segment + padding))


def test_zhipu_jwt_has_three_segments_and_expected_header():
    token = _zhipu_jwt("id.secret")
    segments = token.split(".")
    assert len(segments) == 3

    header = _b64url_decode(segments[0])
    assert header == {"alg": "HS256", "sign_type": "SIGN"}


def test_zhipu_jwt_payload_carries_key_id_and_future_exp():
    now_ms = int(time.time() * 1000)
    payload = _b64url_decode(_zhipu_jwt("id.secret").split(".")[1])
    assert payload["api_key"] == "id"
    assert payload["exp"] > payload["timestamp"]
    assert payload["exp"] > now_ms


def test_zai_client_points_at_zai_base_url():
    client = zai_client("id.secret")
    assert isinstance(client, AsyncOpenAI)
    assert str(client.base_url).rstrip("/") == ZAI_BASE_URL
