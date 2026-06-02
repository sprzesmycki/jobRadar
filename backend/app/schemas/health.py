from pydantic import BaseModel


class HealthResponse(BaseModel):
    app: str
    status: str
    version: str
    environment: str


class ReadinessResponse(BaseModel):
    status: str
    checks: dict[str, bool]
