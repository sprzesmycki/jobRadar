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
        status_code = status.HTTP_502_BAD_GATEWAY
        detail_code = "storage_download_failed"
        detail_message = "Could not download CV from private storage."
        response = getattr(exc, "response", None)
        if response is not None and response.status_code in {400, 401, 403}:
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            detail_code = "storage_credentials_invalid"
            detail_message = "Supabase storage credentials cannot download CV files."
        elif response is not None and response.status_code == 404:
            status_code = status.HTTP_404_NOT_FOUND
            detail_code = "cv_file_not_found"
            detail_message = "CV file was not found in private storage."

        raise HTTPException(
            status_code=status_code,
            detail={
                "code": detail_code,
                "message": detail_message,
            },
        ) from exc

    try:
        return extract_profile_from_pdf_bytes(pdf_bytes)
    except CvExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "cv_text_not_extractable", "message": str(exc)},
        ) from exc
