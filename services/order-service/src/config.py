from decimal import Decimal
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://comstruct_app:dev@postgres:5432/comstruct"
    SYNC_DATABASE_URL: str = "postgresql://comstruct_app:dev@postgres:5432/comstruct"
    REDIS_URL: str = "redis://:dev_password@redis:6379/0"

    INTERNAL_SHARED_SECRET: str = "dev-secret"
    CATALOG_SERVICE_URL: str = "http://catalog-service:8003"
    NOTIFICATION_SERVICE_URL: str = "http://notification-service:8004"

    SERVICE_PORT: int = 8002
    LOG_LEVEL: str = "info"

    DEFAULT_APPROVAL_THRESHOLD: Decimal = Decimal("200.00")
    DEFAULT_CURRENCY: str = "CHF"
    ORDER_STDDEV_MULTIPLIER: float = 2.0
    ORDER_MIN_HISTORY_POINTS: int = 4
    ORDER_LOGISTIC_RISK_THRESHOLD: float = 0.82

    JWT_PUBLIC_KEY_PATH: str = "/run/secrets/jwt_public.pem"
    JWT_ALGORITHM: str = "RS256"
    JWT_ISSUER: str = "comstruct"
    JWT_AUDIENCE: str = "comstruct-api"


@lru_cache
def get_settings() -> Settings:
    return Settings()
