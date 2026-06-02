from pydantic import BaseModel


class MeResponse(BaseModel):
    user_id: str
    email: str | None = None
    role: str | None = None
