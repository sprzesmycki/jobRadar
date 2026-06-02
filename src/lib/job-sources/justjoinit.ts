import type { JobListing, SourceCache, SourceFetchResult } from "@/lib/job-sources/types";
import { sourceWarning } from "@/lib/job-sources/types";

interface JustJoinEmbeddedJob {
  slug?: string;
  title?: string;
  companyName?: string;
  company?: {
    name?: string;
  };
  city?: string;
  workplaceType?: string;
  workingTime?: string;
  requiredSkills?: { name?: string; label?: string }[];
  skills?: { name?: string; label?: string }[];
}

const JUSTJOINIT_URL = "https://justjoin.it/";
const JUSTJOINIT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let justJoinItCache: SourceCache | null = null;

function decodeNextPayload(value: string): string {
  return value
    .replaceAll('\\"', '"')
    .replaceAll("\\\\", "\\")
    .replaceAll("\\u0026", "&")
    .replaceAll("\\u003c", "<")
    .replaceAll("\\u003e", ">");
}

function parseEmbeddedJobs(html: string): JustJoinEmbeddedJob[] {
  const decoded = decodeNextPayload(html);
  const matches = extractJsonObjects(decoded).filter(
    (candidate) =>
      candidate.includes('"slug":"') &&
      candidate.includes('"title":"') &&
      (candidate.includes('"companyName"') || candidate.includes('"workplaceType"') || candidate.includes('"salary')),
  );

  return matches
    .map((match) => {
      try {
        return JSON.parse(match) as JustJoinEmbeddedJob;
      } catch {
        return null;
      }
    })
    .filter((job): job is JustJoinEmbeddedJob => Boolean(job?.slug && job.title))
    .slice(0, 30);
}

function extractJsonObjects(value: string): string[] {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;

      if (depth === 0 && start >= 0) {
        objects.push(value.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function mapJustJoinItJob(job: JustJoinEmbeddedJob): JobListing {
  const technologies = [...(job.requiredSkills ?? []), ...(job.skills ?? [])]
    .map((skill) => skill.name ?? skill.label ?? "")
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 10);
  const workplace = `${job.workplaceType ?? ""} ${job.workingTime ?? ""}`.toLowerCase();

  return {
    id: `justjoinit-${job.slug}`,
    source: "JustJoinIT",
    title: job.title?.trim() ?? "Untitled JustJoinIT job",
    company: job.companyName?.trim() ?? job.company?.name?.trim() ?? "Company not listed",
    location: job.city?.trim() ?? "Location not listed",
    workMode: workplace.includes("remote") ? "remote" : workplace.includes("hybrid") ? "hybrid" : "onsite",
    salaryMin: null,
    salaryCurrency: "PLN",
    technologies,
    url: `https://justjoin.it/job-offer/${job.slug}`,
  };
}

export async function fetchJustJoinItJobs(): Promise<SourceFetchResult> {
  const now = Date.now();

  if (justJoinItCache && now - justJoinItCache.fetchedAt < JUSTJOINIT_CACHE_TTL_MS) {
    return {
      source: "JustJoinIT",
      jobs: justJoinItCache.jobs,
      warnings: [],
      status: "live",
    };
  }

  try {
    const response = await fetch(JUSTJOINIT_URL);
    if (!response.ok) {
      throw new Error(`JustJoinIT returned ${response.status}`);
    }

    const html = await response.text();
    const jobs = parseEmbeddedJobs(html)
      .map(mapJustJoinItJob)
      .filter((job) => job.title && job.company && job.url);

    if (jobs.length === 0) {
      throw new Error("embedded job payload was not recognized");
    }

    justJoinItCache = {
      jobs,
      fetchedAt: now,
    };

    return {
      source: "JustJoinIT",
      jobs,
      warnings: [
        sourceWarning(
          "JustJoinIT",
          "JustJoinIT uses an experimental adapter based on public page data and may stop working if the site changes.",
        ),
      ],
      status: "live",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? `JustJoinIT experimental adapter is unavailable. (${error.message})`
        : "JustJoinIT experimental adapter is unavailable.";

    if (justJoinItCache) {
      return {
        source: "JustJoinIT",
        jobs: justJoinItCache.jobs,
        warnings: [sourceWarning("JustJoinIT", `${message} Showing cached JustJoinIT jobs.`)],
        status: "stale",
      };
    }

    return {
      source: "JustJoinIT",
      jobs: [],
      warnings: [sourceWarning("JustJoinIT", message)],
      status: "failed",
    };
  }
}
