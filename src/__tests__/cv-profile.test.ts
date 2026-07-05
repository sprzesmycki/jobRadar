import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getCvProfile, type CvProfile } from "@/lib/cv-profile";

const SELECTED_COLUMNS =
  "storage_bucket, storage_path, file_name, file_size, content_type, full_name, email, phone, links, skills, role_hints, experience_highlights, extracted_at, updated_at";

function createSupabaseMock(result: { data: unknown; error?: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return { client: { from } as unknown as SupabaseClient, from, select, eq, maybeSingle };
}

const sampleRow: CvProfile = {
  storage_bucket: "cvs",
  storage_path: "user-1/123-cv.pdf",
  file_name: "cv.pdf",
  file_size: 1024,
  content_type: "application/pdf",
  full_name: "Ada Lovelace",
  email: "ada@example.com",
  phone: null,
  links: ["https://ada.dev"],
  skills: ["math"],
  role_hints: ["engineer"],
  experience_highlights: ["first program"],
  extracted_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("getCvProfile characterization", () => {
  it("selects cv_profiles with the fixed column list, scoped to the user", async () => {
    const mock = createSupabaseMock({ data: sampleRow });

    await getCvProfile(mock.client, "user-1");

    expect(mock.from).toHaveBeenCalledWith("cv_profiles");
    expect(mock.select).toHaveBeenCalledWith(SELECTED_COLUMNS);
    expect(mock.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("maps the returned row to a CvProfile with no error message", async () => {
    const mock = createSupabaseMock({ data: sampleRow });

    const result = await getCvProfile(mock.client, "user-1");

    expect(result).toEqual({ profile: sampleRow, errorMessage: null });
  });

  it("returns a null profile with no error when no row exists", async () => {
    const mock = createSupabaseMock({ data: null });

    const result = await getCvProfile(mock.client, "user-1");

    expect(result).toEqual({ profile: null, errorMessage: null });
  });

  it("returns a null profile with a user-facing message on query error", async () => {
    const mock = createSupabaseMock({ data: null, error: { message: "boom" } });

    const result = await getCvProfile(mock.client, "user-1");

    expect(result.profile).toBeNull();
    expect(result.errorMessage).toBe("Your CV profile could not be loaded.");
  });
});
