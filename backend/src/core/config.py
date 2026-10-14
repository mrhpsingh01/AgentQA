"""
AgentQA Core Configuration
Uses Pydantic Settings for type-safe environment variable management.
"""

from typing import Optional, Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # App
    PROJECT_NAME: str = "AgentQA"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database
    # Defaults to async PostgreSQL, falls back to async SQLite for effortless local dev
    DATABASE_URL: str = "sqlite+aiosqlite:///./agentqa.db"
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 5

    # Redis Cache & PubSub
    REDIS_URL: str = "redis://localhost:6379/0"

    # Security
    JWT_SECRET_KEY: str = "dev-secret-key-change-in-production-min-32-chars-long"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours in dev
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    # LLM Providers
    DEFAULT_LLM_PROVIDER: Literal["gemini", "anthropic", "openai", "ollama"] = "gemini"
    
    # API Keys
    GEMINI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"

    # Self-Healing Settings
    HEALING_CONFIDENCE_THRESHOLD: float = 0.55
    HEALING_DOM_MAX_BYTES: int = 12 * 1024  # 12KB max compressed DOM
    SELECTOR_CACHE_TTL_DAYS: int = 30


settings = Settings()
