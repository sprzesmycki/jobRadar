from dataclasses import dataclass
from typing import Annotated, Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    email: str | None
    role: str | None
    claims: dict[str, Any]


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthenticatedUser:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "missing_bearer_token", "message": "Bearer token is required."},
        )

    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "auth_not_configured",
                "message": "Supabase auth validation is not configured.",
            },
        )

    user = await validate_supabase_token(credentials.credentials, settings)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_bearer_token", "message": "Bearer token is invalid."},
        )

    return user


async def validate_supabase_token(token: str, settings: Settings) -> AuthenticatedUser | None:
    assert settings.supabase_url is not None
    assert settings.supabase_anon_key is not None

    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
    headers = {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {token}",
    }
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.get(url, headers=headers)

    if response.status_code != 200:
        return None

    payload = response.json()
    user_id = str(payload.get("id") or payload.get("sub") or "")
    if not user_id:
        return None

    return AuthenticatedUser(
        user_id=user_id,
        email=payload.get("email"),
        role=payload.get("role"),
        claims=payload,
    )
