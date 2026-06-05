import { parseSalary } from "@/lib/job-sources/salary";
import type { JobListing, SourceCache, SourceFetchResult } from "@/lib/job-sources/types";
import { sourceWarning } from "@/lib/job-sources/types";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category?: string;
  tags?: string[];
  candidate_required_location?: string;
  salary?: string;
  description?: string;
  job_description?: string;
}

interface RemotiveResponse {
  jobs?: RemotiveJob[];
}

const REMOTIVE_URL = "https://remotive.com/api/remote-jobs?category=software-development&limit=30";
const REMOTIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SOFTWARE_SIGNALS = [
  "software",
  "developer",
  "engineer",
  "frontend",
  "backend",
  "fullstack",
  "typescript",
  "javascript",
  "python",
  "react",
  "node",
  "api",
  "platform",
  "devops",
];

let remotiveCache: SourceCache | null = null;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function mapRemotiveJob(job: RemotiveJob): JobListing {
  const salary = parseSalary(job.salary);

  return {
    id: `remotive-${job.id}`,
    source: "Remotive",
    title: job.title,
    company: job.company_name.trim(),
    location: job.candidate_required_location?.trim() ?? "Remote",
    workMode: "remote",
    salaryMin: salary.salaryMin,
    salaryCurrency: salary.salaryCurrency,
    technologies: (job.tags ?? [])
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 10),
    url: job.url,
    description:
      (job.description ?? job.job_description ?? null)
        ?.replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2000) ?? null,
  };
}

function isSoftwareJob(job: RemotiveJob): boolean {
  if (normalize(job.category ?? "") === "software development") return true;

  const haystack = [job.title, ...(job.tags ?? [])].map(normalize).join(" ");
  return SOFTWARE_SIGNALS.some((signal) => haystack.includes(signal));
}

export async function fetchRemotiveJobs(): Promise<SourceFetchResult> {
  const now = Date.now();

  if (remotiveCache && now - remotiveCache.fetchedAt < REMOTIVE_CACHE_TTL_MS) {
    return {
      source: "Remotive",
      jobs: remotiveCache.jobs,
      warnings: [],
      status: "live",
    };
  }

  try {
    const response = await fetch(REMOTIVE_URL);
    if (!response.ok) {
      throw new Error(`Remotive returned ${response.status}`);
    }

    const payload = (await response.json()) as RemotiveResponse;
    const jobs = (payload.jobs ?? [])
      .filter(isSoftwareJob)
      .map(mapRemotiveJob)
      .filter((job) => job.title && job.company && job.url);

    remotiveCache = {
      jobs,
      fetchedAt: now,
    };

    return {
      source: "Remotive",
      jobs,
      warnings: [],
      status: "live",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? `Remotive is temporarily unavailable. (${error.message})`
        : "Remotive is temporarily unavailable.";

    if (remotiveCache) {
      return {
        source: "Remotive",
        jobs: remotiveCache.jobs,
        warnings: [sourceWarning("Remotive", `${message} Showing cached Remotive jobs.`)],
        status: "stale",
      };
    }

    return {
      source: "Remotive",
      jobs: [],
      warnings: [sourceWarning("Remotive", message)],
      status: "failed",
    };
  }
}
