import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const CURRENCIES = new Set(["EUR", "USD", "PLN"]);
const WORK_MODES = new Set(["remote", "hybrid", "onsite"]);

function readText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readCsv(form: FormData, name: string): string[] {
  return readText(form, name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
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
  const salary = Number.parseInt(readText(form, "min_salary_amount"), 10);
  const currency = readText(form, "salary_currency").toUpperCase();
  const workModes = form
    .getAll("work_modes")
    .filter((value): value is string => typeof value === "string")
    .filter((value) => WORK_MODES.has(value));

  const { error } = await supabase.from("job_preferences").upsert(
    {
      user_id: user.id,
      target_roles: readCsv(form, "target_roles"),
      technologies: readCsv(form, "technologies"),
      min_salary_amount: Number.isFinite(salary) ? salary : null,
      salary_currency: CURRENCIES.has(currency) ? currency : "EUR",
      work_modes: workModes,
      locations: readText(form, "locations") || null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return context.redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/dashboard?saved=preferences");
};
