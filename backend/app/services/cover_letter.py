import base64
import hashlib
import hmac
import json
import time

from fastapi import HTTPException
from openai import AsyncOpenAI, OpenAIError

from app.core.config import Settings
from app.schemas.ai import CoverLetterResponse
from app.schemas.common import JobInput, ProfileInput

_SYSTEM_PROMPT = """\
You are a professional cover letter writer. Given a candidate profile and a job offer, write a \
professional cover letter in plain text. Write 3–4 paragraphs. Do not use JSON, markdown fences, \
bullet points, or any formatting — only plain prose paragraphs separated by blank lines.
"""


def _zhipu_jwt(api_key: str) -> str:
    """Generate a short-lived JWT from a ZhipuAI {id}.{secret} key."""
    api_key_id, api_secret = api_key.split(".", 1)
    ts_ms = int(time.time() * 1000)

    def _b64url(data: dict) -> str:
        return (
            base64.urlsafe_b64encode(json.dumps(data, separators=(",", ":")).encode())
            .rstrip(b"=")
            .decode()
        )

    header = _b64url({"alg": "HS256", "sign_type": "SIGN"})
    payload = _b64url({"api_key": api_key_id, "exp": ts_ms + 3_600_000, "timestamp": ts_ms})
    signing_input = f"{header}.{payload}"
    sig = hmac.new(api_secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{signing_input}.{sig_b64}"


def _build_user_message(job: JobInput, profile: ProfileInput) -> str:
    description_section = (
        f"\nJob description: {job.description}"
        if job.description
        else "\nJob description: not provided"
    )
    role_hints_section = (
        f"\nCandidate career direction: {', '.join(profile.role_hints)}"
        if profile.role_hints
        else ""
    )
    candidate_name = f"\nCandidate name: {profile.summary}" if profile.summary else ""
    return (
        f"Job title: {job.title}\n"
        f"Company: {job.company}{description_section}\n"
        f"Required technologies: {', '.join(job.technologies) or 'not specified'}\n"
        f"{candidate_name}"
        f"\nCandidate skills: {', '.join(profile.skills) or 'not specified'}"
        f"{role_hints_section}\n"
        f"Experience highlights: {'; '.join(profile.experience) or 'not specified'}"
    )


async def generate_cover_letter(
    job: JobInput, profile: ProfileInput, settings: Settings
) -> CoverLetterResponse:
    if not settings.ai_provider_api_key:
        raise HTTPException(
            status_code=503,
            detail="Cover letter generation is not configured (missing API key).",
        )
    if "." not in settings.ai_provider_api_key:
        raise HTTPException(
            status_code=503,
            detail="AI_PROVIDER_API_KEY must be in '{id}.{secret}' format.",
        )

    token = _zhipu_jwt(settings.ai_provider_api_key)
    client = AsyncOpenAI(base_url="https://api.z.ai/api/coding/paas/v4", api_key=token)

    try:
        response = await client.chat.completions.create(
            model=settings.ai_model_id,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_message(job, profile)},
            ],
            temperature=0.7,
        )
    except OpenAIError as exc:
        raise HTTPException(
            status_code=502, detail=f"Cover letter generation failed: {exc}"
        ) from exc

    text = (response.choices[0].message.content or "").strip()
    if not text:
        raise HTTPException(
            status_code=502, detail="Cover letter generation returned empty response."
        )

    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:])
        if text.endswith("```"):
            text = text[: text.rfind("```")]
        text = text.strip()

    return CoverLetterResponse(content=text)
