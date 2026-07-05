import type { APIRoute } from "astro";
import { BACKEND_API_URL } from "astro:env/server";
import { createClient } from "@/lib/supabase";

export const prerender = false;

interface JobPayload {
  id: string;
  source: string;
  title: string;
  company: string;
  description: string | null;
  technologies: string[];
}

interface ScoreResult {
  score: number;
  explanation: string;
  matched_skills: string[];
  missing_skills: string[];
}

interface CachedRow {
  external_id: string;
  score: number;
  explanation: string;
  matched_skills: string[];
  missing_skills: string[];
}

type ScoresRecord = Record<string, ScoreResult | null>;

async function computeJobHash(job: JobPayload): Promise<string> {
  const raw = job.title + job.company + (job.description ?? "") + job.technologies.join(",");
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function scoreOneJob(
  job: JobPayload,
  cvProfile: Record<string, unknown>,
  backendUrl: string,
  accessToken: string,
): Promise<ScoreResult | null> {
  const body = JSON.stringify({
    job: {
      external_id: job.id,
      source: job.source,
      title: job.title,
      company: job.company,
      description: job.description,
      technologies: job.technologies,
    },
    profile: {
      skills: cvProfile.skills ?? [],
      experience: cvProfile.experience_highlights ?? [],
    },
  });

  const attempt = async (): Promise<Response> =>
    fetch(`${backendUrl.replace(/\/$/, "")}/v1/jobs/score`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });

  let res: Response;
  try {
    res = await attempt();
  } catch {
    try {
      res = await attempt();
    } catch {
      return null;
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[score-batch] backend ${res.status} for job ${job.id}:`, text.slice(0, 200));
    return null;
  }

  try {
    const data = (await res.json()) as ScoreResult;
    if (
      typeof data.score !== "number" ||
      typeof data.explanation !== "string" ||
      !Array.isArray(data.matched_skills) ||
      !Array.isArray(data.missing_skills)
    ) {
      console.error(`[score-batch] bad shape for job ${job.id}:`, data);
      return null;
    }
    return data;
  } catch (e) {
    console.error(`[score-batch] json parse error for job ${job.id}:`, e);
    return null;
  }
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), { status: 500 });
  }

  // Accept either cookie-based session or Authorization: Bearer <token>
  const authHeader = context.request.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];
  let accessToken: string;

  if (bearerToken) {
    const { data } = await supabase.auth.getUser(bearerToken);
    if (!data.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    // Set session so RLS auth.uid() works for subsequent DB queries
    await supabase.auth.setSession({ access_token: bearerToken, refresh_token: "" });
    user = data.user;
    accessToken = bearerToken;
  } else {
    const [{ data: userData }, { data: sessionData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ]);
    if (!userData.user || !sessionData.session?.access_token) {
      return context.redirect("/auth/signin");
    }
    user = userData.user;
    accessToken = sessionData.session.access_token;
  }

  let body: { jobs?: unknown };
  try {
    body = (await context.request.json()) as { jobs?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  if (!Array.isArray(body.jobs)) {
    return new Response(JSON.stringify({ error: "jobs must be an array" }), { status: 400 });
  }

  if (body.jobs.length > 100) {
    return new Response(JSON.stringify({ error: "Too many jobs in one request (max 100)" }), { status: 400 });
  }

  const jobs = (body.jobs as unknown[]).filter(
    (j): j is JobPayload =>
      j !== null &&
      typeof j === "object" &&
      typeof (j as JobPayload).id === "string" &&
      typeof (j as JobPayload).title === "string" &&
      Array.isArray((j as JobPayload).technologies),
  );

  // 1. Read cv_profiles for current user
  const { data: cvData } = await supabase
    .from("cv_profiles")
    .select("skills, experience_highlights")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!cvData) {
    return new Response(JSON.stringify({ scores: {}, noCV: true }), { status: 200 });
  }

  const cvProfile = cvData as Record<string, unknown>;
  const externalIds = jobs.map((j) => j.id);

  // 2. Query cache for all incoming ids
  const { data: cached } = await supabase
    .from("job_scores")
    .select("external_id, score, explanation, matched_skills, missing_skills")
    .eq("user_id", user.id)
    .in("external_id", externalIds);

  const cachedMap = new Map<string, ScoreResult>();
  for (const row of (cached ?? []) as CachedRow[]) {
    cachedMap.set(row.external_id, {
      score: row.score,
      explanation: row.explanation,
      matched_skills: row.matched_skills,
      missing_skills: row.missing_skills,
    });
  }

  // 3. Score up to 5 cache misses per call (rate-limit guard); client re-fires for the rest
  const SCORE_CAP = 5;
  const misses = jobs.filter((j) => !cachedMap.has(j.id)).slice(0, SCORE_CAP);
  const backendUrl = BACKEND_API_URL ?? "";

  const missResults: { job: JobPayload; result: ScoreResult | null; hash: string }[] = [];
  for (let i = 0; i < misses.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));
    const job = misses[i];
    const [result, hash] = await Promise.all([
      scoreOneJob(job, cvProfile, backendUrl, accessToken),
      computeJobHash(job),
    ]);
    missResults.push({ job, result, hash });
  }

  if (misses.length > 0 && missResults.every((r) => r.result === null)) {
    return new Response(JSON.stringify({ error: "Scoring unavailable — all calls failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 4. Upsert successful new scores
  const toUpsert = missResults
    .filter((r): r is { job: JobPayload; result: ScoreResult; hash: string } => r.result !== null)
    .map((r) => ({
      user_id: user.id,
      external_id: r.job.id,
      source: r.job.source,
      job_hash: r.hash,
      score: r.result.score,
      explanation: r.result.explanation,
      matched_skills: r.result.matched_skills,
      missing_skills: r.result.missing_skills,
    }));

  if (toUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from("job_scores")
      .upsert(toUpsert, { onConflict: "user_id,external_id" });
    if (upsertError) console.error("[score-batch] upsert failed:", upsertError);
  }

  // 5. Merge — only include jobs that were cached or actively scored this call.
  //    Jobs beyond SCORE_CAP are omitted so the client re-fires for them.
  const scores: ScoresRecord = {};
  for (const job of jobs) {
    const cached = cachedMap.get(job.id);
    if (cached) {
      scores[job.id] = cached;
      continue;
    }
    const miss = missResults.find((r) => r.job.id === job.id);
    if (miss) scores[job.id] = miss.result;
  }

  return new Response(JSON.stringify({ scores }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
