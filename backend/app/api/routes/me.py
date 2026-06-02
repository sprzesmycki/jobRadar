from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import AuthenticatedUser, get_current_user
from app.schemas.auth import MeResponse

router = APIRouter(prefix="/v1", tags=["auth"])


@router.get("/me", response_model=MeResponse)
async def me(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> MeResponse:
    return MeResponse(user_id=user.user_id, email=user.email, role=user.role)
