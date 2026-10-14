"""
AgentQA Core Exceptions & Error Handlers
"""

from typing import Any, Optional
from fastapi import HTTPException, status


class AgentQAException(HTTPException):
    def __init__(
        self,
        status_code: int,
        detail: str,
        code: str = "ERROR",
        extra: Optional[dict[str, Any]] = None
    ):
        super().__init__(status_code=status_code, detail=detail)
        self.code = code
        self.extra = extra or {}


class NotFoundError(AgentQAException):
    def __init__(self, resource: str, identifier: Any):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{resource} '{identifier}' was not found.",
            code="NOT_FOUND"
        )


class AuthenticationError(AgentQAException):
    def __init__(self, detail: str = "Could not validate credentials"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            code="UNAUTHORIZED"
        )


class PermissionDeniedError(AgentQAException):
    def __init__(self, detail: str = "Insufficient permissions"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
            code="FORBIDDEN"
        )


class HealingError(AgentQAException):
    def __init__(self, detail: str, extra: Optional[dict[str, Any]] = None):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail,
            code="HEALING_FAILED",
            extra=extra
        )
