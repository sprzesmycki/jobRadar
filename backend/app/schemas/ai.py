from pydantic import BaseModel, Field

from app.schemas.common import JobInput, NotImplementedPayload, ProfileInput


class CoverLetterRequest(BaseModel):
    job: JobInput
    profile: ProfileInput
    tone: str = Field(default="professional", max_length=80)
    language: str = Field(default="en", max_length=16)


class CoverLetterResponse(BaseModel):
    content: str


__all__ = ["CoverLetterRequest", "CoverLetterResponse", "NotImplementedPayload"]
