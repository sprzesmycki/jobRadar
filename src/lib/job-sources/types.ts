export type JobSourceName = "JustJoinIT" | "Remotive" | "Adzuna";

export interface JobListing {
  id: string;
  source: JobSourceName;
  title: string;
  company: string;
  location: string;
  workMode: "remote" | "hybrid" | "onsite";
  salaryMin: number | null;
  salaryCurrency: "EUR" | "USD" | "PLN";
  technologies: string[];
  url: string;
  description?: string | null;
}

export interface SourceWarning {
  source: JobSourceName;
  message: string;
}

export interface SourceFetchResult {
  source: JobSourceName;
  jobs: JobListing[];
  warnings: SourceWarning[];
  status: "live" | "stale" | "skipped" | "failed";
}

export interface JobSourceAdapter {
  source: JobSourceName;
  fetchJobs: () => Promise<SourceFetchResult>;
}

export interface SourceCache {
  jobs: JobListing[];
  fetchedAt: number;
}

export function sourceWarning(source: JobSourceName, message: string): SourceWarning {
  return { source, message };
}
