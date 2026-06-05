from pydantic import BaseModel, Field

from app.schemas.common import JobInput, ProfileInput


class JobScoringRequest(BaseModel):
    job: JobInput
    profile: ProfileInput


class JobScoringResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    explanation: str
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)


__all__ = ["JobScoringRequest", "JobScoringResponse"]
