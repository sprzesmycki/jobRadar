import type { SupabaseClient } from "@supabase/supabase-js";

export interface JobScore {
  external_id: string;
  score: number;
  explanation: string;
  matched_skills: string[];
  missing_skills: string[];
}

export async function getJobScores(
  supabase: SupabaseClient,
  userId: string,
  externalIds: string[],
): Promise<Map<string, JobScore>> {
  if (externalIds.length === 0) return new Map();
  const { data } = await supabase
    .from("job_scores")
    .select("external_id, score, explanation, matched_skills, missing_skills")
    .eq("user_id", userId)
    .in("external_id", externalIds);
  const rows: JobScore[] = data ?? [];
  const map = new Map<string, JobScore>();
  for (const row of rows) {
    map.set(row.external_id, row);
  }
  return map;
}
