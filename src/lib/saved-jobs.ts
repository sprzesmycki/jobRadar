import type { SupabaseClient } from "@supabase/supabase-js";

export interface SavedJob {
  external_id: string;
  status: "interested" | "applied" | "rejected";
  notes: string | null;
}

export async function getSavedJobs(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("saved_jobs").select("external_id, status, notes").eq("user_id", userId);

  if (error) {
    return {
      savedJobs: new Map<string, SavedJob>(),
      errorMessage: "Saved jobs are not available yet. Apply the Supabase migration and refresh this page.",
    };
  }

  return {
    savedJobs: new Map((data as SavedJob[]).map((job) => [job.external_id, job])),
    errorMessage: null,
  };
}
