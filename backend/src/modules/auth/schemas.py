"""
AgentQA Auth Pydantic Schemas
"""

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: uuid.UUID


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class APIKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class APIKeyResponse(BaseModel):
    id: uuid.UUID
    name: str
    prefix: str
    raw_key: str  # Only returned once upon creation!
    created_at: datetime


class APIKeyOut(BaseModel):
    id: uuid.UUID
    name: str
    prefix: str
    is_revoked: bool
    created_at: datetime

    class Config:
        from_attributes = True
