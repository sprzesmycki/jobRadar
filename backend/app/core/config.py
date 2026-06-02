from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_origins(value: str | list[str]) -> list[str]:
    if isinstance(value, list):
        return [origin.strip() for origin in value if origin.strip()]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


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

    @property
    def allowed_origins(self) -> list[str]:
        return parse_origins(self.allowed_origins_raw)


@lru_cache
def get_settings() -> Settings:
    return Settings()
