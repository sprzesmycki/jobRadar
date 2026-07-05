import { describe, expect, it } from "vitest";

import { normalizeProfile } from "@/pages/api/cv/upload";

const EXPECTED_KEYS = ["full_name", "email", "phone", "links", "skills", "role_hints", "experience_highlights"];

describe("normalizeProfile characterization", () => {
  it("returns exactly the 7 expected keys, dropping extras and filling missing", () => {
    const result = normalizeProfile({
      full_name: "Ada Lovelace",
      skills: ["math"],
      unexpected_field: "ignored",
    });

    expect(Object.keys(result).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("coerces missing/invalid string fields to null and arrays to []", () => {
    const result = normalizeProfile({});

    expect(result).toEqual({
      full_name: null,
      email: null,
      phone: null,
      links: [],
      skills: [],
      role_hints: [],
      experience_highlights: [],
    });
  });

  it("treats non-object input as empty (all defaults)", () => {
    expect(normalizeProfile(null)).toEqual({
      full_name: null,
      email: null,
      phone: null,
      links: [],
      skills: [],
      role_hints: [],
      experience_highlights: [],
    });
  });

  it("passes through valid strings and filters non-string array items", () => {
    const result = normalizeProfile({
      full_name: "Grace Hopper",
      email: "grace@example.com",
      phone: "123",
      links: ["https://a", 42, "https://b"],
      skills: ["cobol", null, "compilers"],
      role_hints: ["engineer"],
      experience_highlights: ["shipped things"],
    });

    expect(result).toEqual({
      full_name: "Grace Hopper",
      email: "grace@example.com",
      phone: "123",
      links: ["https://a", "https://b"],
      skills: ["cobol", "compilers"],
      role_hints: ["engineer"],
      experience_highlights: ["shipped things"],
    });
  });

  it("coerces whitespace-only strings to null (readStringOrNull trims)", () => {
    const result = normalizeProfile({ full_name: "   ", email: "" });

    expect(result.full_name).toBeNull();
    expect(result.email).toBeNull();
  });
});
