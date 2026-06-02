import { fetchAdzunaJobs } from "@/lib/job-sources/adzuna";
import { fetchJustJoinItJobs } from "@/lib/job-sources/justjoinit";
import { fetchRemotiveJobs } from "@/lib/job-sources/remotive";
import { sourceWarning } from "@/lib/job-sources/types";
import type { JobListing, SourceFetchResult, SourceWarning } from "@/lib/job-sources/types";

export interface AggregatedJobsResult {
  jobs: JobListing[];
  sourceResults: SourceFetchResult[];
  warnings: SourceWarning[];
  successfulSources: number;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeKey(job: JobListing): string {
  return `${normalize(job.company)}::${normalize(job.title)}`;
}

function scoreDedupeCandidate(job: JobListing): number {
  return (job.salaryMin === null ? 0 : 4) + Math.min(job.technologies.length, 4) + (job.url ? 1 : 0);
}

export function dedupeJobs(jobs: JobListing[]): JobListing[] {
  const deduped = new Map<string, JobListing>();

  for (const job of jobs) {
    const key = dedupeKey(job);
    const existing = deduped.get(key);

    if (!existing || scoreDedupeCandidate(job) > scoreDedupeCandidate(existing)) {
      deduped.set(key, job);
    }
  }

  return [...deduped.values()];
}

async function safelyFetchSource(
  source: SourceFetchResult["source"],
  fetchJobs: () => Promise<SourceFetchResult>,
): Promise<SourceFetchResult> {
  try {
    return await fetchJobs();
  } catch (error) {
    const message =
      error instanceof Error ? `${source} failed unexpectedly. (${error.message})` : `${source} failed unexpectedly.`;

    return {
      source,
      jobs: [],
      warnings: [sourceWarning(source, message)],
      status: "failed",
    };
  }
}

export async function loadAggregatedJobs(): Promise<AggregatedJobsResult> {
  const sourceResults = await Promise.all([
    safelyFetchSource("Remotive", fetchRemotiveJobs),
    safelyFetchSource("Adzuna", fetchAdzunaJobs),
    safelyFetchSource("JustJoinIT", fetchJustJoinItJobs),
  ]);
  const jobs = dedupeJobs(sourceResults.flatMap((result) => result.jobs));
  const warnings = sourceResults.flatMap((result) => result.warnings);
  const successfulSources = sourceResults.filter((result) => result.jobs.length > 0).length;

  return {
    jobs,
    sourceResults,
    warnings,
    successfulSources,
  };
}
