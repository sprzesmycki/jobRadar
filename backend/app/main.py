from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.routes import cover_letter, cv, health, me, scoring
from app.core.config import get_settings
from app.core.rate_limit import limiter


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="JobRadar Backend",
        version=settings.jobradar_version,
        summary="FastAPI service for CV parsing, scoring, and AI orchestration.",
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = [
            {k: v for k, v in err.items() if k not in {"input", "url"}}
            for err in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": errors})

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
