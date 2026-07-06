from fastapi import HTTPException
from openai import OpenAIError

from app.core.config import Settings
from app.schemas.ai import CoverLetterResponse
from app.schemas.common import JobInput, ProfileInput
from app.services.zai import zai_client

_SYSTEM_PROMPT = """\
You are a professional cover letter writer. Given a candidate profile and a job offer, write a \
professional cover letter in plain text. Write 3–4 paragraphs. Do not use JSON, markdown fences, \
bullet points, or any formatting — only plain prose paragraphs separated by blank lines.
"""


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
    # profile.summary carries full_name as mapped by the TS client (cover-letter.ts)
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

    client = zai_client(settings.ai_provider_api_key)

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
        text = text.split("```")[1].strip()

    return CoverLetterResponse(content=text)
