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
    DEFAULT_LLM_PROVIDER: Literal["gemini", "anthropic", "openai", "ollama", "nvidia", "openai_compat"] = "gemini"
    
    # API Keys
    GEMINI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"

    # NVIDIA NIM (OpenAI-compatible, free tier at build.nvidia.com). Each tier has its own key and model:
    # Level 2 uses the fast "repair" model, Level 5 the stronger "escalation" model.
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    NVIDIA_API_KEY: Optional[str] = None
    NVIDIA_MODEL: str = "nvidia/nemotron-3.5-lightning-30b-a3b"
    NVIDIA_ESCALATION_API_KEY: Optional[str] = None
    NVIDIA_ESCALATION_MODEL: str = "nvidia/nemotron-3-ultra-550b-a55b"

    # Any OpenAI-compatible chat-completions endpoint (Groq, Cerebras, OpenRouter, Ollama Cloud, ...).
    # Groq: LLM_BASE_URL=https://api.groq.com/openai/v1, LLM_MODEL=openai/gpt-oss-120b
    # The escalation tier (Level 5) defaults to the same key; set LLM_ESCALATION_* to use another model/key.
    LLM_BASE_URL: Optional[str] = None
    LLM_API_KEY: Optional[str] = None
    LLM_MODEL: Optional[str] = None
    LLM_ESCALATION_API_KEY: Optional[str] = None
    LLM_ESCALATION_MODEL: Optional[str] = None
    LLM_REASONING_EFFORT: Optional[str] = None  # low | medium | high (gpt-oss style models); unset = omit
    LLM_JSON_MODE: bool = False  # send response_format=json_object (not every model supports it)
    # true = use ONLY the selected provider (no silent fallback to another one): required for honest benchmarks
    LLM_STRICT_PROVIDER: bool = False
    LLM_RPM: int = 0  # client-side throttle in requests/minute; 0 = none

    # Self-Healing Settings
    HEALING_CONFIDENCE_THRESHOLD: float = 0.70  # repairs below this are refused, never applied
    HEALING_DOM_MAX_BYTES: int = 12 * 1024  # 12KB max compressed DOM
    SELECTOR_CACHE_TTL_DAYS: int = 30

    # Cost *estimates* for LLM healing (USD per million tokens). Defaults are placeholders: set them to your
    # model's list price. Deterministic levels never call an LLM and cost exactly $0.
    LLM_COST_PER_MTOK_INPUT: float = 0.30
    LLM_COST_PER_MTOK_OUTPUT: float = 2.50


settings = Settings()
