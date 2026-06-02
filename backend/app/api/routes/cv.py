from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.core.security import AuthenticatedUser, get_current_user
from app.schemas.cv import CvExtractionRequest, CvExtractionResponse
from app.services.cv_extraction import CvExtractionError, extract_profile_from_pdf_bytes
from app.services.storage import download_storage_object

router = APIRouter(prefix="/v1/cv", tags=["cv"])


@router.post("/extract", response_model=CvExtractionResponse)
async def extract_cv(
    request: CvExtractionRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CvExtractionResponse:
    if request.cv.bucket != "cvs":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "invalid_cv_bucket", "message": "CV bucket is not allowed."},
        )

    if request.cv.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "unsupported_cv_type", "message": "CV must be a PDF file."},
        )

    expected_prefix = f"{user.user_id}/"
    if not request.cv.path.startswith(expected_prefix):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "cv_path_forbidden", "message": "CV path does not belong to user."},
        )

    try:
        pdf_bytes = await download_storage_object(settings, request.cv.bucket, request.cv.path)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "storage_not_configured", "message": str(exc)},
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "storage_download_failed",
                "message": "Could not download CV from private storage.",
            },
        ) from exc

    try:
        return extract_profile_from_pdf_bytes(pdf_bytes)
    except CvExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "cv_text_not_extractable", "message": str(exc)},
        ) from exc
