from pydantic import BaseModel, Field

from app.schemas.common import NotImplementedPayload


class CvStorageReference(BaseModel):
    bucket: str = Field(min_length=1)
    path: str = Field(min_length=1)
    content_type: str = "application/pdf"


class CvExtractionRequest(BaseModel):
    cv: CvStorageReference


__all__ = ["CvExtractionRequest", "CvStorageReference", "NotImplementedPayload"]
