from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def get_user_id_key(request: Request) -> str:
    return getattr(request.state, "user_id", get_remote_address(request))


limiter = Limiter(key_func=get_user_id_key)
