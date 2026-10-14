"""
AgentQA Auth Endpoints
"""

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import get_db, get_current_user
from src.core.security import hash_password, verify_password, create_access_token, create_refresh_token, generate_api_key
from src.modules.auth.models import User, APIKey
from src.modules.auth.schemas import UserRegister, UserLogin, TokenResponse, UserOut, APIKeyCreate, APIKeyResponse, APIKeyOut

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserRegister, db: AsyncSession = Depends(get_db)):
    # Check if email exists
    existing = await db.execute(select(User).where(User.email == user_in.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already registered")

    user = User(
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account is deactivated")

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id
    )


@router.get("/me", response_model=UserOut)
async def get_current_user_profile(user: User = Depends(get_current_user)):
    return user


@router.post("/api-keys", response_model=APIKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_new_api_key(
    key_in: APIKeyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    raw_key, hashed_key = generate_api_key()
    prefix = raw_key[:12]

    api_key_rec = APIKey(
        user_id=user.id,
        name=key_in.name,
        hashed_key=hashed_key,
        prefix=prefix,
        is_revoked=False
    )
    db.add(api_key_rec)
    await db.commit()
    await db.refresh(api_key_rec)

    return APIKeyResponse(
        id=api_key_rec.id,
        name=api_key_rec.name,
        prefix=prefix,
        raw_key=raw_key,
        created_at=api_key_rec.created_at
    )


@router.get("/api-keys", response_model=list[APIKeyOut])
async def list_user_api_keys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(APIKey).where(APIKey.user_id == user.id, APIKey.is_revoked == False))
    return result.scalars().all()
