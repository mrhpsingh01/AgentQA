"""
AgentQA API Dependencies
Authentication, authorization, and database transaction injection.
"""

from collections.abc import AsyncGenerator
import hashlib
from typing import Optional
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import jwt
from src.core.config import settings
from src.core.database import get_db_session
from src.core.security import decode_token, hash_api_key
from src.modules.auth.models import User, APIKey

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that yields an isolated async database session."""
    async for session in get_db_session():
        yield session


async def get_current_user(
    bearer_token: Optional[str] = Depends(oauth2_scheme),
    api_key_raw: Optional[str] = Security(api_key_header),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Dual-authentication dependency:
    Authenticates interactive dashboard users via JWT Bearer token,
    or CI/CD pipelines via X-API-Key header.
    """
    # 1. Check API Key first (fast path for CI/CD runners)
    if api_key_raw:
        key_hash = hash_api_key(api_key_raw)
        result = await db.execute(
            select(APIKey).where(APIKey.hashed_key == key_hash, APIKey.is_revoked == False)
        )
        api_key_rec = result.scalar_one_or_none()
        if api_key_rec:
            user = await db.get(User, api_key_rec.user_id)
            if user and user.is_active:
                return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API Key"
        )

    # 2. Check JWT Bearer token
    if bearer_token:
        try:
            payload = decode_token(bearer_token)
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")
            
            import uuid
            user = await db.get(User, uuid.UUID(user_id))
            if not user or not user.is_active:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
            return user
        except jwt.PyJWTError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired JWT token")

    # If neither provided in dev mode, we can create or return a default demo user so developers
    # can test the API and Chrome extension immediately without mandatory login hurdles!
    if settings.DEBUG:
        result = await db.execute(select(User).limit(1))
        dev_user = result.scalar_one_or_none()
        if dev_user:
            return dev_user
        
        # Create initial dev user
        from src.core.security import hash_password
        dev_user = User(
            email="dev@agentqa.local",
            hashed_password=hash_password("devpassword123"),
            is_active=True,
            is_superuser=True
        )
        db.add(dev_user)
        await db.commit()
        await db.refresh(dev_user)
        return dev_user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
