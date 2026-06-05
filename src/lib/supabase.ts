import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}

// Use when you have a validated access token and need RLS to work for DB queries.
// setSession({ refresh_token: "" }) does not reliably propagate the JWT to PostgREST;
// setting it via global headers is the correct approach for Bearer-token server routes.
export function createAuthedClient(accessToken: string) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => [],
      setAll: (_cookies) => {
        /* no-op: read-only client */
      },
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
