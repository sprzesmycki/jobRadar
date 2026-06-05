import re
from dataclasses import dataclass
from io import BytesIO

from pypdf import PdfReader
from pypdf.errors import PdfStreamError

from app.schemas.cv import CvExtractionResponse

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
LINK_RE = re.compile(r"\b(?:https?://|www\.)[^\s<>)]+", re.IGNORECASE)
PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")

SKILL_KEYWORDS = [
    "AWS",
    "Azure",
    "Django",
    "Docker",
    "FastAPI",
    "Flask",
    "Git",
    "GraphQL",
    "Java",
    "JavaScript",
    "Kotlin",
    "Kubernetes",
    "Node.js",
    "PostgreSQL",
    "Python",
    "React",
    "Redis",
    "REST",
    "SQL",
    "Supabase",
    "TypeScript",
    "Vue",
]

ROLE_KEYWORDS = [
    "Backend Developer",
    "Data Engineer",
    "DevOps Engineer",
    "Frontend Developer",
    "Fullstack Developer",
    "Mobile Developer",
    "Python Developer",
    "Software Engineer",
    "Tech Lead",
]

HIGHLIGHT_SIGNALS = (
    "built",
    "developed",
    "designed",
    "implemented",
    "led",
    "maintained",
    "migrated",
    "optimized",
    "projekt",
    "wdroz",
    "zbud",
)


class CvExtractionError(ValueError):
    pass


@dataclass(frozen=True)
class ExtractedText:
    text: str
    lines: list[str]
    page_count: int


def extract_profile_from_pdf_bytes(pdf_bytes: bytes) -> CvExtractionResponse:
    extracted = extract_text(pdf_bytes)
    if len(extracted.text) < 20:
        raise CvExtractionError("PDF does not contain enough extractable text.")

    return CvExtractionResponse(
        full_name=guess_full_name(extracted.lines),
        email=first_match(EMAIL_RE, extracted.text),
        phone=first_match(PHONE_RE, extracted.text),
        links=unique_matches(LINK_RE, extracted.text, limit=8),
        skills=find_keywords(SKILL_KEYWORDS, extracted.text),
        role_hints=find_keywords(ROLE_KEYWORDS, extracted.text),
        experience_highlights=find_experience_highlights(extracted.lines),
        page_count=extracted.page_count,
        text_character_count=len(extracted.text),
    )


def extract_text(pdf_bytes: bytes) -> ExtractedText:
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
    except (PdfStreamError, Exception) as exc:
        raise CvExtractionError("PDF could not be parsed.") from exc
    page_texts = [(page.extract_text() or "") for page in reader.pages]
    lines = [normalize_spaces(line) for text in page_texts for line in text.splitlines()]
    lines = [line for line in lines if line]
    text = normalize_spaces(" ".join(lines))
    return ExtractedText(text=text, lines=lines, page_count=len(reader.pages))


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def first_match(pattern: re.Pattern[str], text: str) -> str | None:
    match = pattern.search(text)
    return match.group(0).strip(".,;") if match else None


def unique_matches(pattern: re.Pattern[str], text: str, limit: int) -> list[str]:
    seen: set[str] = set()
    values: list[str] = []
    for match in pattern.finditer(text):
        value = match.group(0).strip(".,;")
        key = value.lower()
        if key not in seen:
            seen.add(key)
            values.append(value)
        if len(values) >= limit:
            break
    return values


def find_keywords(keywords: list[str], text: str) -> list[str]:
    found: list[str] = []
    lower_text = text.lower()
    for keyword in keywords:
        pattern = rf"(?<![a-z0-9]){re.escape(keyword.lower())}(?![a-z0-9])"
        if re.search(pattern, lower_text):
            found.append(keyword)
    return found


def guess_full_name(lines: list[str]) -> str | None:
    for line in lines[:12]:
        if EMAIL_RE.search(line) or LINK_RE.search(line) or any(char.isdigit() for char in line):
            continue
        words = line.split()
        if 2 <= len(words) <= 5 and all(word[:1].isalpha() for word in words):
            return line
    return None


def find_experience_highlights(lines: list[str]) -> list[str]:
    highlights: list[str] = []
    seen: set[str] = set()
    skill_terms = [skill.lower() for skill in SKILL_KEYWORDS]

    for line in lines:
        lower_line = line.lower()
        has_signal = any(signal in lower_line for signal in HIGHLIGHT_SIGNALS)
        has_skill = any(skill in lower_line for skill in skill_terms)
        if not (has_signal or has_skill):
            continue

        value = line[:180]
        key = value.lower()
        if key not in seen:
            seen.add(key)
            highlights.append(value)
        if len(highlights) >= 5:
            break

    return highlights
