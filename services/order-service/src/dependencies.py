"""Auth dependency. Trusts the API gateway: gateway sets X-User-Id, X-User-Role,
X-Company-Id headers after JWT verify, plus protects the network boundary with
X-Internal-Secret. Order-service rejects anything without that secret."""
from dataclasses import dataclass
from uuid import UUID

from fastapi import Header, HTTPException, status

from .config import get_settings


@dataclass
class CurrentUser:
    id: UUID
    role: str
    company_id: UUID
    ip: str | None


def require_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    expected = get_settings().INTERNAL_SHARED_SECRET
    if not x_internal_secret or x_internal_secret != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Internal-Secret",
        )


def current_user(
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    x_company_id: str | None = Header(default=None),
    x_forwarded_for: str | None = Header(default=None),
    _: None = Header(default=None, alias="X-Internal-Secret"),
) -> CurrentUser:
    require_internal_secret(_)
    if not (x_user_id and x_user_role and x_company_id):
        raise HTTPException(401, "Missing user context headers from gateway")
    try:
        return CurrentUser(
            id=UUID(x_user_id),
            role=x_user_role,
            company_id=UUID(x_company_id),
            ip=x_forwarded_for,
        )
    except ValueError:
        raise HTTPException(400, "Invalid request format")


def require_role(*roles: str):
    def _dep(user: CurrentUser = None) -> CurrentUser:  # patched below
        ...
    # FastAPI compatible factory
    from fastapi import Depends

    def _wrapper(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(403, f"Requires role in {roles}")
        return user
    return _wrapper
