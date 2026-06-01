import type { SupabaseClient } from "@supabase/supabase-js";

export interface JobPreferences {
  target_roles: string[];
  technologies: string[];
  min_salary_amount: number | null;
  salary_currency: "EUR" | "USD" | "PLN";
  work_modes: string[];
  locations: string | null;
  updated_at: string;
}

export interface PreferencesResult {
  preferences: JobPreferences | null;
  errorMessage: string | null;
}

export async function getJobPreferences(supabase: SupabaseClient, userId: string): Promise<PreferencesResult> {
  const { data, error } = await supabase
    .from("job_preferences")
    .select("target_roles, technologies, min_salary_amount, salary_currency, work_modes, locations, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return {
      preferences: null,
      errorMessage: "Job preferences are not available yet. Apply the Supabase migration and refresh this page.",
    };
  }

  return {
    preferences: data ?? null,
    errorMessage: null,
  };
}

export function joinList(values: string[] | undefined): string {
  return values?.join(", ") ?? "";
}
