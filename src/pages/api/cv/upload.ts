import type { APIContext, APIRoute } from "astro";
import { BACKEND_API_URL } from "astro:env/server";
import { createClient } from "@/lib/supabase";

const BUCKET = "cvs";
const MAX_CV_SIZE_BYTES = 6 * 1024 * 1024;

interface ExtractedProfile {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  links: string[];
  skills: string[];
  role_hints: string[];
  experience_highlights: string[];
}

function redirectError(context: APIContext, message: string): Response {
  return context.redirect(`/dashboard?error=${encodeURIComponent(message)}`);
}

function safeFileName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.endsWith(".pdf") ? normalized : `${normalized || "cv"}.pdf`;
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeProfile(value: unknown): ExtractedProfile {
  const profile = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    full_name: readStringOrNull(profile.full_name),
    email: readStringOrNull(profile.email),
    phone: readStringOrNull(profile.phone),
    links: readStringArray(profile.links),
    skills: readStringArray(profile.skills),
    role_hints: readStringArray(profile.role_hints),
    experience_highlights: readStringArray(profile.experience_highlights),
  };
}

function readStoragePath(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const storagePath = (value as Record<string, unknown>).storage_path;
  return typeof storagePath === "string" ? storagePath : null;
}

function readBackendErrorCode(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const detail = (value as Record<string, unknown>).detail;
  if (detail && typeof detail === "object") {
    const code = (detail as Record<string, unknown>).code;
    return typeof code === "string" ? code : null;
  }

  return null;
}

function getExtractionErrorMessage(status: number, backendErrorCode: string | null): string {
  if (status === 422) {
    return "Could not extract text from this PDF. Try a text-based CV PDF.";
  }

  if (backendErrorCode === "storage_credentials_invalid") {
    return "CV extraction service cannot access private CV storage.";
  }

  if (backendErrorCode === "cv_file_not_found") {
    return "Uploaded CV was not found in private storage.";
  }

  return "CV extraction service is unavailable.";
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectError(context, "Supabase is not configured");
  }

  if (!BACKEND_API_URL) {
    return redirectError(context, "CV extraction service is not configured");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect("/auth/signin");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const cvFile = form.get("cv");

  if (!(cvFile instanceof File) || cvFile.size === 0) {
    return redirectError(context, "Choose a PDF CV first.");
  }

  if (!isPdf(cvFile)) {
    return redirectError(context, "CV must be a PDF file.");
  }

  if (cvFile.size > MAX_CV_SIZE_BYTES) {
    return redirectError(context, "CV must be 6 MB or smaller.");
  }

  const storagePath = `${user.id}/${Date.now()}-${safeFileName(cvFile.name)}`;
  const { data: currentProfileData, error: currentProfileError } = await supabase
    .from("cv_profiles")
    .select("storage_path")
    .eq("user_id", user.id)
    .maybeSingle();

  if (currentProfileError) {
    return redirectError(context, currentProfileError.message);
  }

  const currentStoragePath = readStoragePath(currentProfileData);

  let uploadErrorMessage: string | null = null;
  try {
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, cvFile, {
      contentType: "application/pdf",
      upsert: false,
    });
    uploadErrorMessage = error?.message ?? null;
  } catch (error) {
    uploadErrorMessage = error instanceof Error ? error.message : "CV upload failed.";
  }

  if (uploadErrorMessage) {
    return redirectError(context, uploadErrorMessage);
  }

  const backendApiUrl = BACKEND_API_URL;
  let extractionResponse: Response;
  try {
    extractionResponse = await fetch(`${backendApiUrl.replace(/\/$/, "")}/v1/cv/extract`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cv: {
          bucket: BUCKET,
          path: storagePath,
          content_type: "application/pdf",
        },
      }),
    });
  } catch {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return redirectError(context, "CV extraction service is unavailable.");
  }

  if (!extractionResponse.ok) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    const backendError: unknown = await extractionResponse.json().catch(() => null);
    const backendErrorCode = readBackendErrorCode(backendError);
    const message = getExtractionErrorMessage(extractionResponse.status, backendErrorCode);
    return redirectError(context, message);
  }

  let profile: ExtractedProfile;
  try {
    profile = normalizeProfile(await extractionResponse.json());
  } catch {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return redirectError(context, "CV extraction service returned an invalid response.");
  }
  const { error: profileError } = await supabase.from("cv_profiles").upsert(
    {
      user_id: user.id,
      storage_bucket: BUCKET,
      storage_path: storagePath,
      file_name: cvFile.name || "cv.pdf",
      file_size: cvFile.size,
      content_type: "application/pdf",
      full_name: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      links: profile.links,
      skills: profile.skills,
      role_hints: profile.role_hints,
      experience_highlights: profile.experience_highlights,
      extracted_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (profileError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return redirectError(context, profileError.message);
  }

  if (currentStoragePath && currentStoragePath !== storagePath) {
    await supabase.storage.from(BUCKET).remove([currentStoragePath]);
  }

  return context.redirect("/dashboard?saved=cv");
};
