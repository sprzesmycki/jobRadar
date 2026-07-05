import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

type CvProfileRow = Database["public"]["Tables"]["cv_profiles"]["Row"];

// Kolumny selektowane z cv_profiles — jedno źródło prawdy dla zapytania i typu.
// Literał `as const` daje typowanemu klientowi Supabase kompilacyjny guard na nazwy kolumn.
const CV_PROFILE_COLUMNS =
  "storage_bucket, storage_path, file_name, file_size, content_type, full_name, email, phone, links, skills, role_hints, experience_highlights, extracted_at, updated_at" as const;

// Pick po faktycznie selektowanych kolumnach — NIE alias do Row (Row niesie user_id/created_at,
// których .select() nie zwraca). Rename kolumny w database.types.ts → błąd kompilacji tutaj.
export type CvProfile = Pick<
  CvProfileRow,
  | "storage_bucket"
  | "storage_path"
  | "file_name"
  | "file_size"
  | "content_type"
  | "full_name"
  | "email"
  | "phone"
  | "links"
  | "skills"
  | "role_hints"
  | "experience_highlights"
  | "extracted_at"
  | "updated_at"
>;

export interface CvProfileResult {
  profile: CvProfile | null;
  errorMessage: string | null;
}

export async function getCvProfile(supabase: SupabaseClient, userId: string): Promise<CvProfileResult> {
  // Lokalne typowanie klienta (blast radius = cv_profiles): włącza sprawdzanie nazw kolumn
  // w .select() względem Database. Globalnego createServerClient<Database> świadomie nie robimy.
  const typedSupabase = supabase as unknown as SupabaseClient<Database>;
  const { data, error } = await typedSupabase
    .from("cv_profiles")
    .select(CV_PROFILE_COLUMNS)
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
