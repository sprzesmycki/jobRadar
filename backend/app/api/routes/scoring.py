from typing import Annotated

from fastapi import APIRouter, Depends
from starlette.responses import JSONResponse

from app.core.security import AuthenticatedUser, get_current_user
from app.schemas.scoring import JobScoringRequest, NotImplementedPayload

router = APIRouter(prefix="/v1/jobs", tags=["scoring"])


@router.post("/score", response_model=NotImplementedPayload, status_code=501)
async def score_job(
    _request: JobScoringRequest,
    _user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> JSONResponse:
    payload = NotImplementedPayload(
        feature="job_scoring",
        message="CV-to-job scoring is planned for S-05 and is not implemented in F-01.",
    )
    return JSONResponse(status_code=501, content=payload.model_dump())
