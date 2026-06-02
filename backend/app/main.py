from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import cover_letter, cv, health, me, scoring
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="JobRadar Backend",
        version=settings.jobradar_version,
        summary="FastAPI service for CV parsing, scoring, and AI orchestration.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(cv.router)
    app.include_router(scoring.router)
    app.include_router(cover_letter.router)
    return app


app = create_app()
