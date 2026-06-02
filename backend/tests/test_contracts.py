from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.security import AuthenticatedUser, get_current_user
from app.main import app


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
    assert set(payload["checks"]) == {"supabase_url", "supabase_anon_key", "allowed_origins"}
    assert all(isinstance(value, bool) for value in payload["checks"].values())


def test_me_rejects_missing_token(client: TestClient) -> None:
    response = client.get("/v1/me")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "missing_bearer_token"


def test_cv_extract_placeholder_returns_501(authed_client: TestClient) -> None:
    response = authed_client.post(
        "/v1/cv/extract",
        json={"cv": {"bucket": "private-cvs", "path": "user-123/cv.pdf"}},
    )

    assert response.status_code == 501
    assert response.json()["code"] == "not_implemented"
    assert response.json()["feature"] == "cv_extraction"


def test_job_scoring_placeholder_returns_501(authed_client: TestClient) -> None:
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

    assert response.status_code == 501
    assert response.json()["code"] == "not_implemented"
    assert response.json()["feature"] == "job_scoring"


def test_cover_letter_placeholder_returns_501(authed_client: TestClient) -> None:
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
            "tone": "professional",
        },
    )

    assert response.status_code == 501
    assert response.json()["code"] == "not_implemented"
    assert response.json()["feature"] == "cover_letter_generation"
