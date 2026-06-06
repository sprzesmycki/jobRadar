from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.core.security import AuthenticatedUser, get_current_user
from app.schemas.ai import CoverLetterRequest, CoverLetterResponse
from app.services.cover_letter import generate_cover_letter

router = APIRouter(prefix="/v1/cover-letter", tags=["cover-letter"])


@router.post("", response_model=CoverLetterResponse, status_code=200)
async def cover_letter(
    request: CoverLetterRequest,
    _user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CoverLetterResponse:
    return await generate_cover_letter(request.job, request.profile, settings)
