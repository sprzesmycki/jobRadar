"""Unit tests for cv_extraction using a real PDF fixture."""

from pathlib import Path

import pytest

from app.services.cv_extraction import CvExtractionError, extract_profile_from_pdf_bytes

FIXTURE_PDF = Path(__file__).parent.parent.parent / "docs/test-fixtures/test-cv-jane-kowalska.pdf"


@pytest.mark.skipif(not FIXTURE_PDF.exists(), reason="test fixture PDF not available")
def test_extract_real_pdf_returns_structured_profile() -> None:
    pdf_bytes = FIXTURE_PDF.read_bytes()
    result = extract_profile_from_pdf_bytes(pdf_bytes)

    assert result.full_name is not None
    assert result.email == "jane.kowalska@example.test"
    assert result.phone is not None
    assert any("github.com" in link for link in result.links)
    assert result.page_count >= 1
    assert result.text_character_count > 0


@pytest.mark.skipif(not FIXTURE_PDF.exists(), reason="test fixture PDF not available")
def test_extract_real_pdf_finds_known_skills() -> None:
    pdf_bytes = FIXTURE_PDF.read_bytes()
    result = extract_profile_from_pdf_bytes(pdf_bytes)

    skills_lower = {s.lower() for s in result.skills}
    assert skills_lower & {"python", "typescript", "react", "postgresql", "docker", "fastapi"}


def test_extract_empty_bytes_raises() -> None:
    with pytest.raises(CvExtractionError):
        extract_profile_from_pdf_bytes(b"not a pdf")
