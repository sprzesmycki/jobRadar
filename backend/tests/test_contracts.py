from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.routes import cv as cv_route
from app.core import security
from app.core.config import Settings, get_settings
from app.core.security import AuthenticatedUser, get_current_user
from app.main import app
from app.schemas.cv import CvExtractionResponse


@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def authed_client() -> Iterator[TestClient]:
    async def fake_user() -> AuthenticatedUser:
        return AuthenticatedUser(
            user_id="user-123",
            email="test@example.com",
            role="authenticated",
            claims={"id": "user-123", "email": "test@example.com"},
        )

    app.dependency_overrides[get_current_user] = fake_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["app"] == "jobradar-backend"


def test_readyz_does_not_expose_secret_values(client: TestClient) -> None:
    response = client.get("/readyz")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"ok", "degraded"}
    assert set(payload["checks"]) == {
        "supabase_url",
        "supabase_anon_key",
        "supabase_service_role_key",
        "allowed_origins",
    }
    assert all(isinstance(value, bool) for value in payload["checks"].values())


def test_readyz_with_configured_secrets_still_returns_only_booleans(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_ANON_KEY="anon-secret",
        SUPABASE_SERVICE_ROLE_KEY="eyJ.header.payload",
        ALLOWED_ORIGINS="https://job-radar.example.com",
    )

    monkeypatch.setattr("app.api.routes.health.get_settings", lambda: settings)

    response = client.get("/readyz")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "checks": {
            "supabase_url": True,
            "supabase_anon_key": True,
            "supabase_service_role_key": True,
            "allowed_origins": True,
        },
    }
    assert "anon-secret" not in response.text
    assert "eyJ.header.payload" not in response.text


def test_readyz_flags_placeholder_supabase_url(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        SUPABASE_URL="https://your-project.supabase.co",
        SUPABASE_ANON_KEY="anon-secret",
    )

    monkeypatch.setattr("app.api.routes.health.get_settings", lambda: settings)

    response = client.get("/readyz")

    assert response.status_code == 200
    assert response.json()["status"] == "degraded"
    assert response.json()["checks"]["supabase_url"] is False


def test_readyz_flags_non_jwt_service_role_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_ANON_KEY="anon-secret",
        SUPABASE_SERVICE_ROLE_KEY="sb_secret_new_key_format",
    )

    monkeypatch.setattr("app.api.routes.health.get_settings", lambda: settings)

    response = client.get("/readyz")

    assert response.status_code == 200
    assert response.json()["status"] == "degraded"
    assert response.json()["checks"]["supabase_service_role_key"] is False


def test_me_rejects_missing_token(client: TestClient) -> None:
    response = client.get("/v1/me")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "missing_bearer_token"


def test_me_rejects_invalid_token(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_validate_supabase_token(
        _token: str,
        _settings: Settings,
    ) -> AuthenticatedUser | None:
        return None

    app.dependency_overrides[security.get_settings] = lambda: Settings(
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_ANON_KEY="anon-secret",
    )
    monkeypatch.setattr(security, "validate_supabase_token", fake_validate_supabase_token)

    response = client.get("/v1/me", headers={"Authorization": "Bearer invalid"})

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_bearer_token"


def test_me_returns_503_when_auth_provider_is_unavailable(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_validate_supabase_token(
        _token: str,
        _settings: Settings,
    ) -> AuthenticatedUser | None:
        raise httpx.ConnectError("auth unavailable")

    app.dependency_overrides[security.get_settings] = lambda: Settings(
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_ANON_KEY="anon-secret",
    )
    monkeypatch.setattr(security, "validate_supabase_token", fake_validate_supabase_token)

    response = client.get("/v1/me", headers={"Authorization": "Bearer token"})

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "auth_unavailable"


def test_cors_allows_local_astro_origin(client: TestClient) -> None:
    response = client.options(
        "/healthz",
        headers={
            "Origin": "http://localhost:4321",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:4321"


def test_cv_extract_requires_allowed_bucket(authed_client: TestClient) -> None:
    response = authed_client.post(
        "/v1/cv/extract",
        json={"cv": {"bucket": "private-cvs", "path": "user-123/cv.pdf"}},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "invalid_cv_bucket"


def test_cv_extract_requires_pdf_content_type(authed_client: TestClient) -> None:
    response = authed_client.post(
        "/v1/cv/extract",
        json={
            "cv": {
                "bucket": "cvs",
                "path": "user-123/cv.txt",
                "content_type": "text/plain",
            },
        },
    )

    assert response.status_code == 415
    assert response.json()["detail"]["code"] == "unsupported_cv_type"


def test_cv_extract_rejects_foreign_storage_path(authed_client: TestClient) -> None:
    response = authed_client.post(
        "/v1/cv/extract",
        json={"cv": {"bucket": "cvs", "path": "other-user/cv.pdf"}},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "cv_path_forbidden"


def test_cv_extract_requires_storage_config(authed_client: TestClient) -> None:
    app.dependency_overrides[cv_route.get_settings] = lambda: Settings(
        SUPABASE_URL="",
        SUPABASE_SERVICE_ROLE_KEY="",
    )

    response = authed_client.post(
        "/v1/cv/extract",
        json={"cv": {"bucket": "cvs", "path": "user-123/cv.pdf"}},
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "storage_not_configured"


def test_cv_extract_returns_structured_profile(
    authed_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_download_storage_object(
        _settings: Settings,
        bucket: str,
        path: str,
    ) -> bytes:
        assert bucket == "cvs"
        assert path == "user-123/cv.pdf"
        return b"%PDF fake bytes"

    def fake_extract_profile_from_pdf_bytes(_pdf_bytes: bytes) -> CvExtractionResponse:
        return CvExtractionResponse(
            full_name="Test User",
            email="test@example.com",
            phone=None,
            links=["https://example.com"],
            skills=["Python", "FastAPI"],
            role_hints=["Python Developer"],
            experience_highlights=["Built APIs with Python and FastAPI."],
            page_count=1,
            text_character_count=128,
        )

    app.dependency_overrides[cv_route.get_settings] = lambda: Settings(
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="service-role-secret",
    )
    monkeypatch.setattr(cv_route, "download_storage_object", fake_download_storage_object)
    monkeypatch.setattr(
        cv_route,
        "extract_profile_from_pdf_bytes",
        fake_extract_profile_from_pdf_bytes,
    )

    response = authed_client.post(
        "/v1/cv/extract",
        json={"cv": {"bucket": "cvs", "path": "user-123/cv.pdf"}},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["full_name"] == "Test User"
    assert payload["skills"] == ["Python", "FastAPI"]
    assert payload["text_character_count"] == 128


def test_job_scoring_returns_structured_result(
    authed_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    mock_content = (
        '{"score": 75, "explanation": "Good match.",'
        ' "matched_skills": ["Python"], "missing_skills": ["Go"]}'
    )
    mock_message = MagicMock()
    mock_message.content = mock_content
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]

    mock_client_instance = MagicMock()
    mock_client_instance.chat.completions.create = AsyncMock(return_value=mock_completion)
    MockAsyncOpenAI = MagicMock(return_value=mock_client_instance)
    monkeypatch.setattr("app.services.scoring.AsyncOpenAI", MockAsyncOpenAI)

    # get_settings uses @lru_cache — set env var and flush cache so the real
    # get_settings() reads the key without relying on a local .env file
    monkeypatch.setenv("AI_PROVIDER_API_KEY", "test-id.test-secret")
    get_settings.cache_clear()
    try:
        response = authed_client.post(
            "/v1/jobs/score",
            json={
                "job": {
                    "external_id": "job-1",
                    "source": "Remotive",
                    "title": "Python Developer",
                    "company": "Example",
                    "technologies": ["Python", "FastAPI"],
                },
                "profile": {"skills": ["Python"]},
            },
        )
    finally:
        get_settings.cache_clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["score"] == 75
    assert payload["explanation"] == "Good match."
    assert payload["matched_skills"] == ["Python"]
    assert payload["missing_skills"] == ["Go"]


def test_cover_letter_returns_content_on_success(
    authed_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    mock_message = MagicMock()
    mock_message.content = (
        "Dear Hiring Manager,\n\n"
        "I am excited to apply for the Python Developer role at Example Corp. "
        "My experience with Python and FastAPI aligns well with your requirements.\n\n"
        "Thank you for your consideration."
    )
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]

    mock_client_instance = MagicMock()
    mock_client_instance.chat.completions.create = AsyncMock(return_value=mock_completion)
    MockAsyncOpenAI = MagicMock(return_value=mock_client_instance)
    monkeypatch.setattr("app.services.cover_letter.AsyncOpenAI", MockAsyncOpenAI)

    monkeypatch.setenv("AI_PROVIDER_API_KEY", "test-id.test-secret")
    get_settings.cache_clear()
    try:
        response = authed_client.post(
            "/v1/cover-letter",
            json={
                "job": {
                    "external_id": "job-1",
                    "source": "Remotive",
                    "title": "Python Developer",
                    "company": "Example Corp",
                    "technologies": ["Python", "FastAPI"],
                },
                "profile": {
                    "skills": ["Python", "FastAPI"],
                    "role_hints": ["Backend Developer"],
                },
            },
        )
    finally:
        get_settings.cache_clear()

    assert response.status_code == 200
    assert "content" in response.json()
    assert len(response.json()["content"]) > 0


def test_cover_letter_returns_503_when_api_key_missing(authed_client: TestClient) -> None:
    no_key_settings = Settings.model_construct(ai_provider_api_key=None, ai_model_id="GLM-4.5-Air")
    app.dependency_overrides[get_settings] = lambda: no_key_settings

    response = authed_client.post(
        "/v1/cover-letter",
        json={
            "job": {
                "external_id": "job-1",
                "source": "Remotive",
                "title": "Python Developer",
                "company": "Example",
            },
            "profile": {"skills": ["Python"]},
        },
    )

    assert response.status_code == 503


def test_cover_letter_returns_502_on_api_error(
    authed_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from openai import OpenAIError

    mock_client_instance = MagicMock()
    mock_client_instance.chat.completions.create = AsyncMock(
        side_effect=OpenAIError("connection failed")
    )
    MockAsyncOpenAI = MagicMock(return_value=mock_client_instance)
    monkeypatch.setattr("app.services.cover_letter.AsyncOpenAI", MockAsyncOpenAI)

    monkeypatch.setenv("AI_PROVIDER_API_KEY", "test-id.test-secret")
    get_settings.cache_clear()
    try:
        response = authed_client.post(
            "/v1/cover-letter",
            json={
                "job": {
                    "external_id": "job-1",
                    "source": "Remotive",
                    "title": "Python Developer",
                    "company": "Example",
                },
                "profile": {"skills": ["Python"]},
            },
        )
    finally:
        get_settings.cache_clear()

    assert response.status_code == 502
