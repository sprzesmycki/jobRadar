import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const STATUSES = new Set(["interested", "applied", "rejected"]);

function readText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/dashboard?error=Supabase%20is%20not%20configured");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const status = readText(form, "status");
  const externalId = readText(form, "external_id");
  const title = readText(form, "title");
  const company = readText(form, "company");
  const source = readText(form, "source");
  const url = readText(form, "url");

  if (!externalId || !title || !company || !source || !url) {
    return context.redirect("/dashboard?error=Missing%20job%20data");
  }

  const { error } = await supabase.from("saved_jobs").upsert(
    {
      user_id: user.id,
      external_id: externalId,
      source,
      title,
      company,
      url,
      status: STATUSES.has(status) ? status : "interested",
      snapshot: {
        title,
        company,
        source,
        url,
      },
    },
    { onConflict: "user_id,external_id" },
  );

  if (error) {
    return context.redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/dashboard?saved=job");
};
