# Multi-stage production Dockerfile with uv
FROM python:3.12-slim-bookworm AS builder

# Install uv binary
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY pyproject.toml ./
RUN uv pip install --system -r <(python -c "
import tomllib
with open('pyproject.toml', 'rb') as f:
    d = tomllib.load(f)
for dep in d['project']['dependencies']:
    print(dep)
") || pip install --no-cache-dir fastapi uvicorn pydantic pydantic-settings email-validator sqlalchemy asyncpg aiosqlite pyjwt pwdlib[argon2] redis httpx structlog jinja2 beautifulsoup4 lxml taskiq taskiq-redis rich

# Runner stage
FROM python:3.12-slim-bookworm AS runner

WORKDIR /app

# Create non-root user
RUN groupadd -r appgroup && useradd -r -g appgroup -s /sbin/nologin appuser

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY . /app

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/healthz || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
