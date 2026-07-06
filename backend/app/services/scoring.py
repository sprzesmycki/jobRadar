import json

from fastapi import HTTPException
from openai import OpenAIError

from app.core.config import Settings
from app.schemas.common import JobInput, ProfileInput
from app.schemas.scoring import JobScoringResponse
from app.services.zai import zai_client

_SYSTEM_PROMPT = """\
You are a job-fit evaluator. Given a candidate profile and a job offer, return ONLY a JSON object \
with these exact keys:
- "score": integer 0–100 representing overall match percentage
- "explanation": 1–2 sentence plain-English summary of why the score is what it is
- "matched_skills": array of skill strings the candidate has that the job requires
- "missing_skills": array of skill strings the job requires but the candidate lacks

Respond with valid JSON and nothing else. No markdown fences, no commentary.
"""


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
    if "." not in settings.ai_provider_api_key:
        raise HTTPException(
            status_code=503,
            detail="AI_PROVIDER_API_KEY must be in '{id}.{secret}' format.",
        )

    client = zai_client(settings.ai_provider_api_key)

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
        if isinstance(data, dict) and "explanation" not in data:
            data["explanation"] = ""
        return JobScoringResponse.model_validate(data)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(
            status_code=502, detail=f"AI scoring returned invalid response: {exc}"
        ) from exc
