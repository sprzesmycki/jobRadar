import type { APIRoute } from "astro";

import { createClient } from "@/lib/supabase";

export const GET: APIRoute = async (context) => {
  if (!import.meta.env.DEV) {
    return new Response("Not found", { status: 404 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return new Response(JSON.stringify({ error: "Not authenticated — sign in first" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify(
      {
        access_token: session.access_token,
        user_id: session.user.id,
        email: session.user.email,
        expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        curl_example: `curl -H "Authorization: Bearer ${session.access_token}" http://127.0.0.1:18080/v1/jobs/score`,
      },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/json" } },
  );
};
