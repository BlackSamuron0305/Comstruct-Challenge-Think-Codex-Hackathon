from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://comstruct_app:dev@postgres:5432/comstruct"
    SYNC_DATABASE_URL: str = "postgresql://comstruct_app:dev@postgres:5432/comstruct"
    INTERNAL_SHARED_SECRET: str = "dev-secret"
    SERVICE_PORT: int = 8003
    LOG_LEVEL: str = "info"
    DEFAULT_CURRENCY: str = "CHF"


@lru_cache
def get_settings() -> Settings:
    return Settings()
