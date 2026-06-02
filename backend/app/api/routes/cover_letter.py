from typing import Annotated

from fastapi import APIRouter, Depends
from starlette.responses import JSONResponse

from app.core.security import AuthenticatedUser, get_current_user
from app.schemas.ai import CoverLetterRequest, NotImplementedPayload

router = APIRouter(prefix="/v1/cover-letter", tags=["cover-letter"])


@router.post("", response_model=NotImplementedPayload, status_code=501)
async def generate_cover_letter(
    _request: CoverLetterRequest,
    _user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> JSONResponse:
    payload = NotImplementedPayload(
        feature="cover_letter_generation",
        message="Cover-letter generation is planned for S-06 and is not implemented in F-01.",
    )
    return JSONResponse(status_code=501, content=payload.model_dump())
