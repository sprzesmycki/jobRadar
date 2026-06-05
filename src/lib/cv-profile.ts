import type { SupabaseClient } from "@supabase/supabase-js";

export interface CvProfile {
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  content_type: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  links: string[];
  skills: string[];
  role_hints: string[];
  experience_highlights: string[];
  extracted_at: string;
  updated_at: string;
}

export interface CvProfileResult {
  profile: CvProfile | null;
  errorMessage: string | null;
}

export async function getCvProfile(supabase: SupabaseClient, userId: string): Promise<CvProfileResult> {
  const { data, error } = await supabase
    .from("cv_profiles")
    .select(
      "storage_bucket, storage_path, file_name, file_size, content_type, full_name, email, phone, links, skills, role_hints, experience_highlights, extracted_at, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return {
      profile: null,
      errorMessage: "Your CV profile could not be loaded.",
    };
  }

  return {
    profile: data,
    errorMessage: null,
  };
}
