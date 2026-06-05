import type { APIRoute } from "astro";
import { BACKEND_API_URL } from "astro:env/server";
import { createClient, createAuthedClient } from "@/lib/supabase";

export const prerender = false;

interface JobPayload {
  id: string;
  source: string;
  title: string;
  company: string;
  description: string | null;
  technologies: string[];
}

async function computeJobHash(job: JobPayload): Promise<string> {
  const raw = job.title + job.company + (job.description ?? "") + job.technologies.join(",");
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  // Use a client that sends the user JWT so RLS auth.uid() resolves correctly for DB queries.
  // setSession({ refresh_token: "" }) does not reliably propagate the JWT to PostgREST.
  const dbSupabase = createAuthedClient(accessToken);
  if (!dbSupabase) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), { status: 500 });
  }

  let body: { job?: unknown };
  try {
    body = (await context.request.json()) as { job?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const j = body.job;
  if (
    j === null ||
    typeof j !== "object" ||
    typeof (j as JobPayload).id !== "string" ||
    typeof (j as JobPayload).title !== "string" ||
    !Array.isArray((j as JobPayload).technologies)
  ) {
    return new Response(JSON.stringify({ error: "Invalid job payload" }), { status: 400 });
  }

  const job = j as JobPayload;

  // 1. Fetch cv_profile
  const { data: cvData } = await dbSupabase
    .from("cv_profiles")
    .select("skills, role_hints, experience_highlights, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!cvData) {
    return new Response(JSON.stringify({ noCV: true }), { status: 200 });
  }

  const cvProfile = cvData as Record<string, unknown>;

  // 2. Check cache — cover_letters lacks generated Supabase types so data is untyped
  const { data: cachedRow } = await dbSupabase
    .from("cover_letters")
    .select("content")
    .eq("user_id", user.id)
    .eq("external_id", job.id)
    .maybeSingle();

  const rawContent = (cachedRow as Record<string, unknown> | null)?.content;
  const cachedContent = typeof rawContent === "string" ? rawContent : "";
  if (cachedContent) {
    return new Response(JSON.stringify({ content: cachedContent }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Cache miss — call backend
  const backendUrl = BACKEND_API_URL ?? "";
  const backendBody = JSON.stringify({
    job: {
      external_id: job.id,
      source: job.source,
      title: job.title,
      company: job.company,
      description: job.description,
      technologies: job.technologies,
    },
    profile: {
      summary: cvProfile.full_name,
      skills: cvProfile.skills ?? [],
      experience: cvProfile.experience_highlights ?? [],
      role_hints: cvProfile.role_hints,
    },
  });

  let res: Response;
  try {
    res = await fetch(`${backendUrl.replace(/\/$/, "")}/v1/cover-letter`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: backendBody,
    });
  } catch (e) {
    console.error("[cover-letter] backend fetch failed:", e);
    return new Response(JSON.stringify({ error: "Backend unreachable" }), { status: 502 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[cover-letter] backend ${res.status}:`, text.slice(0, 200));
    return new Response(JSON.stringify({ error: "Backend error" }), { status: 502 });
  }

  let content: string;
  try {
    const data = (await res.json()) as { content?: string };
    if (typeof data.content !== "string" || !data.content) {
      throw new Error("bad shape");
    }
    content = data.content;
  } catch (e) {
    console.error("[cover-letter] bad response shape:", e);
    return new Response(JSON.stringify({ error: "Unexpected backend response" }), { status: 502 });
  }

  // 4. Upsert into cache
  const jobHash = await computeJobHash(job);
  await dbSupabase.from("cover_letters").upsert(
    {
      user_id: user.id,
      external_id: job.id,
      source: job.source,
      job_hash: jobHash,
      content,
    },
    { onConflict: "user_id,external_id" },
  );

  return new Response(JSON.stringify({ content }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
