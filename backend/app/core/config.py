from functools import lru_cache
from urllib.parse import urlparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_origins(value: str | list[str]) -> list[str]:
    if isinstance(value, list):
        return [origin.strip() for origin in value if origin.strip()]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


def is_supabase_url_configured(value: str | None) -> bool:
    parsed = urlparse(value or "")
    return (
        parsed.scheme in {"http", "https"}
        and bool(parsed.hostname)
        and parsed.hostname != "your-project.supabase.co"
    )


def is_supabase_service_role_key_configured(value: str | None) -> bool:
    # Supabase Storage validates Authorization as a compact JWT. New sb_secret_* keys are
    # valid API keys, but they cannot be used as the Bearer token for this Storage path.
    return bool(value and value.startswith("eyJ") and value.count(".") == 2)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "jobradar-backend"
    jobradar_env: str = Field(default="local", validation_alias="JOBRADAR_ENV")
    jobradar_version: str = Field(default="0.1.0", validation_alias="JOBRADAR_VERSION")
    supabase_url: str | None = Field(default=None, validation_alias="SUPABASE_URL")
    supabase_anon_key: str | None = Field(default=None, validation_alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str | None = Field(
        default=None,
        validation_alias="SUPABASE_SERVICE_ROLE_KEY",
    )
    allowed_origins_raw: str = Field(
        default="http://localhost:4321,http://127.0.0.1:4321",
        validation_alias="ALLOWED_ORIGINS",
    )
    ai_provider_api_key: str | None = Field(default=None, validation_alias="AI_PROVIDER_API_KEY")
    ai_model_id: str = Field(default="GLM-5.1", validation_alias="AI_MODEL_ID")

    @property
    def allowed_origins(self) -> list[str]:
        return parse_origins(self.allowed_origins_raw)


@lru_cache
def get_settings() -> Settings:
    return Settings()
