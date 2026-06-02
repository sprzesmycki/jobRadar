from urllib.parse import quote

import httpx

from app.core.config import Settings


async def download_storage_object(settings: Settings, bucket: str, path: str) -> bytes:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Supabase storage download is not configured.")

    encoded_path = quote(path, safe="/")
    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{encoded_path}"
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, headers=headers)

    if response.status_code != 200:
        raise httpx.HTTPStatusError(
            "Supabase storage download failed.",
            request=response.request,
            response=response,
        )

    return response.content
