from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SERVICE_PORT: int = 8005

    INTERNAL_SHARED_SECRET: str = "dev-secret"
    CATALOG_SERVICE_URL: str = "http://catalog-service:8003"
    REDIS_URL: str = "redis://:dev_password@redis:6379/0"
    DATABASE_URL: str = "postgresql+asyncpg://comstruct_app:comstruct_dev_password@postgres:5432/comstruct"

    # ── LLM Provider Selection ─────────────────────────────────────
    # "ollama" = local dev (Ollama + gemma3:4b)
    # "openai" = production (ChatGPT)
    LLM_PROVIDER: str = "ollama"

    # ── Ollama (local LLM — dev/testing) ──────────────────────────
    OLLAMA_BASE_URL: str = "http://ollama:11434"
    OLLAMA_MODEL: str = "gemma4:2b"
    OLLAMA_EMBED_MODEL: str = "gemma4:2b"
    OLLAMA_TIMEOUT: int = 300

    # ── OpenAI / ChatGPT (production) ─────────────────────────────
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    OPENAI_EMBED_MODEL: str = "text-embedding-3-small"

    # ── Behaviour ──────────────────────────────────────────────────
    MAX_INGEST_ROWS: int = 5000
    EMBED_BATCH_SIZE: int = 64
    LOG_LEVEL: str = "INFO"


settings = Settings()
