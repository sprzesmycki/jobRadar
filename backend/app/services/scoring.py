import base64
import hashlib
import hmac
import json
import time

from fastapi import HTTPException
from openai import AsyncOpenAI, OpenAIError

from app.core.config import Settings
from app.schemas.common import JobInput, ProfileInput
from app.schemas.scoring import JobScoringResponse

_SYSTEM_PROMPT = """\
You are a job-fit evaluator. Given a candidate profile and a job offer, return ONLY a JSON object \
with these exact keys:
- "score": integer 0–100 representing overall match percentage
- "explanation": 1–2 sentence plain-English summary of why the score is what it is
- "matched_skills": array of skill strings the candidate has that the job requires
- "missing_skills": array of skill strings the job requires but the candidate lacks

Respond with valid JSON and nothing else. No markdown fences, no commentary.
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
        f"\nJob description (excerpt): {job.description}" if job.description else ""
    )
    return (
        f"Job title: {job.title}\n"
        f"Company: {job.company}{description_section}\n"
        f"Required technologies: {', '.join(job.technologies) or 'not specified'}\n\n"
        f"Candidate skills: {', '.join(profile.skills) or 'not specified'}\n"
        f"Candidate role hints: {', '.join(profile.experience) or 'not specified'}"
    )


async def score_job(job: JobInput, profile: ProfileInput, settings: Settings) -> JobScoringResponse:
    if not settings.ai_provider_api_key:
        raise HTTPException(
            status_code=503, detail="AI scoring is not configured (missing API key)."
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
            temperature=0.2,
        )
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail=f"AI scoring request failed: {exc}") from exc

    raw = (response.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    try:
        data = json.loads(raw)
        return JobScoringResponse.model_validate(data)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(
            status_code=502, detail=f"AI scoring returned invalid response: {exc}"
        ) from exc
