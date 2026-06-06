from pydantic import BaseModel, Field

from app.schemas.common import JobInput, ProfileInput


class CoverLetterRequest(BaseModel):
    job: JobInput
    profile: ProfileInput
    # Accepted but not yet consumed by the service; reserved for future tone/language support.
    tone: str = Field(default="professional", max_length=80)
    language: str = Field(default="en", max_length=16)


class CoverLetterResponse(BaseModel):
    content: str


__all__ = ["CoverLetterRequest", "CoverLetterResponse"]
