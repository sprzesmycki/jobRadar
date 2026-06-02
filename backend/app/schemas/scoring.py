from pydantic import BaseModel

from app.schemas.common import JobInput, NotImplementedPayload, ProfileInput


class JobScoringRequest(BaseModel):
    job: JobInput
    profile: ProfileInput


__all__ = ["JobScoringRequest", "NotImplementedPayload"]
