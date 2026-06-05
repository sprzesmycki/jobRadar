import { ADZUNA_APP_ID, ADZUNA_APP_KEY, ADZUNA_COUNTRY } from "astro:env/server";

import type { JobListing, SourceCache, SourceFetchResult } from "@/lib/job-sources/types";
import { sourceWarning } from "@/lib/job-sources/types";

interface AdzunaJob {
  id?: string;
  redirect_url?: string;
  title?: string;
  company?: {
    display_name?: string;
  };
  location?: {
    display_name?: string;
  };
  salary_min?: number;
  category?: {
    label?: string;
  };
  description?: string;
}

interface AdzunaResponse {
  results?: AdzunaJob[];
}

const ADZUNA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ADZUNA_BASE_URL = "https://api.adzuna.com/v1/api/jobs";

let adzunaCache: SourceCache | null = null;

function mapAdzunaJob(job: AdzunaJob): JobListing {
  const id = job.id ?? `${job.company?.display_name ?? "unknown"}-${job.title ?? "job"}`;
  const location = job.location?.display_name?.trim() ?? "Location not listed";
  const title = job.title?.trim() ?? "Untitled Adzuna job";
  const category = job.category?.label?.trim();
  const salaryMin =
    typeof job.salary_min === "number" && Number.isFinite(job.salary_min) ? Math.round(job.salary_min) : null;

  return {
    id: `adzuna-${id}`,
    source: "Adzuna",
    title,
    company: job.company?.display_name?.trim() ?? "Company not listed",
    location,
    workMode: /remote/i.test(`${title} ${location}`) ? "remote" : "onsite",
    salaryMin,
    salaryCurrency: "USD",
    technologies: category ? [category] : [],
    url: job.redirect_url ?? "https://www.adzuna.com/",
    description: job.description?.slice(0, 2000) ?? null,
  };
}

export async function fetchAdzunaJobs(): Promise<SourceFetchResult> {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    return {
      source: "Adzuna",
      jobs: [],
      warnings: [
        sourceWarning("Adzuna", "Adzuna is skipped because ADZUNA_APP_ID and ADZUNA_APP_KEY are not configured."),
      ],
      status: "skipped",
    };
  }

  const now = Date.now();
  if (adzunaCache && now - adzunaCache.fetchedAt < ADZUNA_CACHE_TTL_MS) {
    return {
      source: "Adzuna",
      jobs: adzunaCache.jobs,
      warnings: [],
      status: "live",
    };
  }

  const country = ADZUNA_COUNTRY ?? "us";
  const url = new URL(`${ADZUNA_BASE_URL}/${country}/search/1`);
  url.searchParams.set("app_id", ADZUNA_APP_ID);
  url.searchParams.set("app_key", ADZUNA_APP_KEY);
  url.searchParams.set("results_per_page", "30");
  url.searchParams.set("what", "software developer");
  url.searchParams.set("content-type", "application/json");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Adzuna returned ${response.status}`);
    }

    const payload = (await response.json()) as AdzunaResponse;
    const jobs = (payload.results ?? []).map(mapAdzunaJob).filter((job) => job.title && job.company && job.url);

    adzunaCache = {
      jobs,
      fetchedAt: now,
    };

    return {
      source: "Adzuna",
      jobs,
      warnings: [],
      status: "live",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? `Adzuna is temporarily unavailable. (${error.message})`
        : "Adzuna is temporarily unavailable.";

    if (adzunaCache) {
      return {
        source: "Adzuna",
        jobs: adzunaCache.jobs,
        warnings: [sourceWarning("Adzuna", `${message} Showing cached Adzuna jobs.`)],
        status: "stale",
      };
    }

    return {
      source: "Adzuna",
      jobs: [],
      warnings: [sourceWarning("Adzuna", message)],
      status: "failed",
    };
  }
}
