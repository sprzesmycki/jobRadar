from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.core.security import AuthenticatedUser, get_current_user
from app.schemas.scoring import JobScoringRequest, JobScoringResponse
from app.services.scoring import score_job

router = APIRouter(prefix="/v1/jobs", tags=["scoring"])


@router.post("/score", response_model=JobScoringResponse, status_code=200)
async def score_job_route(
    request: JobScoringRequest,
    _user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> JobScoringResponse:
    return await score_job(request.job, request.profile, settings)
