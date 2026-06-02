from pydantic import BaseModel, Field


class NotImplementedPayload(BaseModel):
    code: str = "not_implemented"
    feature: str
    message: str


class JobInput(BaseModel):
    external_id: str = Field(min_length=1)
    source: str = Field(min_length=1)
    title: str = Field(min_length=1)
    company: str = Field(min_length=1)
    description: str | None = None
    technologies: list[str] = Field(default_factory=list)


class ProfileInput(BaseModel):
    summary: str | None = None
    skills: list[str] = Field(default_factory=list)
    experience: list[str] = Field(default_factory=list)
