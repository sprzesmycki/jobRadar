from typing import Annotated

from fastapi import APIRouter, Depends
from starlette.responses import JSONResponse

from app.core.security import AuthenticatedUser, get_current_user
from app.schemas.cv import CvExtractionRequest, NotImplementedPayload

router = APIRouter(prefix="/v1/cv", tags=["cv"])


@router.post("/extract", response_model=NotImplementedPayload, status_code=501)
async def extract_cv(
    _request: CvExtractionRequest,
    _user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> JSONResponse:
    payload = NotImplementedPayload(
        feature="cv_extraction",
        message="CV extraction is planned for S-04 and is not implemented in F-01.",
    )
    return JSONResponse(status_code=501, content=payload.model_dump())
