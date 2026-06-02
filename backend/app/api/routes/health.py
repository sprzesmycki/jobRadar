from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.health import HealthResponse, ReadinessResponse

router = APIRouter(tags=["health"])


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        app=settings.app_name,
        status="ok",
        version=settings.jobradar_version,
        environment=settings.jobradar_env,
    )


@router.get("/readyz", response_model=ReadinessResponse)
async def readyz() -> ReadinessResponse:
    settings = get_settings()
    checks = {
        "supabase_url": bool(settings.supabase_url),
        "supabase_anon_key": bool(settings.supabase_anon_key),
        "allowed_origins": bool(settings.allowed_origins),
    }
    return ReadinessResponse(status="ok" if all(checks.values()) else "degraded", checks=checks)
