from pydantic import BaseModel, Field

from app.schemas.common import NotImplementedPayload


class CvStorageReference(BaseModel):
    bucket: str = Field(min_length=1)
    path: str = Field(min_length=1)
    content_type: str = "application/pdf"


class CvExtractionRequest(BaseModel):
    cv: CvStorageReference


class CvExtractionResponse(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    links: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    role_hints: list[str] = Field(default_factory=list)
    experience_highlights: list[str] = Field(default_factory=list)
    page_count: int = Field(ge=0)
    text_character_count: int = Field(ge=0)


__all__ = [
    "CvExtractionRequest",
    "CvExtractionResponse",
    "CvStorageReference",
    "NotImplementedPayload",
]
