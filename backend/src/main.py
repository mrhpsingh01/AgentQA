"""
AgentQA FastAPI Application Entrypoint
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog
from src.core.config import settings
from src.core.database import init_db
from src.core.redis import get_redis
from src.api.v1.router import api_v1_router
from src.api.v1.websocket import router as ws_router

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup & shutdown events."""
    logger.info("Initializing AgentQA backend services...")
    
    # 1. Initialize DB tables
    try:
        await init_db()
        logger.info("Database schemas initialized successfully.")
    except Exception as e:
        logger.error("Database initialization failed", error=str(e))

    # 2. Ping Redis
    await get_redis()

    yield

    logger.info("AgentQA backend shutting down.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Autonomous AI QA Agent Platform - Self-Healing Tests & Test Generation API",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS to accept requests from Chrome Extensions & Local Dashboards
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows Chrome extension chrome-extension:// origins & dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API v1 and WebSocket routers
app.include_router(api_v1_router)
app.include_router(ws_router)


@app.get("/healthz", tags=["System"])
async def health_check():
    """Health check endpoint for Docker & CI container monitors."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT
    }


@app.get("/", tags=["System"])
async def root():
    return {
        "message": "AgentQA API is online",
        "documentation": "/docs",
        "health": "/healthz"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
