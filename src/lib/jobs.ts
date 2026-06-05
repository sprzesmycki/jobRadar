import type { JobPreferences } from "@/lib/preferences";
import { loadAggregatedJobs } from "@/lib/job-sources/aggregate";
import { SALARY_TO_USD } from "@/lib/job-sources/salary";
import type { JobListing, SourceFetchResult, SourceWarning } from "@/lib/job-sources/types";

export type DemoJob = JobListing;

export interface MatchedJob extends DemoJob {
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  matchReason: string;
}

export interface MatchedJobsResult {
  jobs: MatchedJob[];
  source: "live" | "fallback";
  message: string | null;
  warnings: SourceWarning[];
  sourceResults: SourceFetchResult[];
  successfulSources: number;
}

export const demoJobs: DemoJob[] = [
  {
    id: "justjoinit-senior-fullstack-remote",
    source: "JustJoinIT",
    title: "Senior Fullstack Engineer",
    company: "Northstar Labs",
    location: "Remote, EU",
    workMode: "remote",
    salaryMin: 8200,
    salaryCurrency: "EUR",
    technologies: ["TypeScript", "React", "Python", "PostgreSQL", "Docker"],
    url: "https://justjoin.it/",
  },
  {
    id: "remotive-python-platform",
    source: "Remotive",
    title: "Python Platform Developer",
    company: "AsyncWorks",
    location: "Remote",
    workMode: "remote",
    salaryMin: 10500,
    salaryCurrency: "USD",
    technologies: ["Python", "FastAPI", "PostgreSQL", "AWS", "Docker"],
    url: "https://remotive.com/",
  },
  {
    id: "adzuna-frontend-architect",
    source: "Adzuna",
    title: "Frontend Architect",
    company: "ProductGrid",
    location: "Berlin hybrid",
    workMode: "hybrid",
    salaryMin: 7800,
    salaryCurrency: "EUR",
    technologies: ["TypeScript", "React", "Astro", "Tailwind", "Node.js"],
    url: "https://www.adzuna.com/",
  },
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function roleMatches(preferences: JobPreferences | null, job: DemoJob): boolean {
  const roles = preferences?.target_roles.map(normalize) ?? [];
  if (roles.length === 0) return true;
  const title = normalize(job.title);
  return roles.some((role) => title.includes(role) || role.includes(title));
}

function salaryMatches(preferences: JobPreferences | null, job: DemoJob): boolean {
  if (!preferences?.min_salary_amount) return true;
  if (job.salaryMin === null) return preferences.include_unknown_salary;

  const expectedSalaryUsd = preferences.min_salary_amount * SALARY_TO_USD[preferences.salary_currency];
  const jobSalaryUsd = job.salaryMin * SALARY_TO_USD[job.salaryCurrency];

  return jobSalaryUsd >= expectedSalaryUsd;
}

function workModeMatches(preferences: JobPreferences | null, job: DemoJob): boolean {
  const modes = preferences?.work_modes ?? [];
  return modes.length === 0 || modes.includes(job.workMode);
}

function technologyMatches(preferences: JobPreferences | null, job: DemoJob): boolean {
  const preferredTech = preferences?.technologies.map(normalize) ?? [];
  if (preferredTech.length === 0) return true;

  const jobTech = job.technologies.map(normalize);
  return preferredTech.some((technology) =>
    jobTech.some((jobTechnology) => jobTechnology.includes(technology) || technology.includes(jobTechnology)),
  );
}

export function matchJobs(preferences: JobPreferences | null, availableJobs: DemoJob[] = demoJobs): MatchedJob[] {
  const preferredTech = preferences?.technologies.map(normalize) ?? [];

  return availableJobs
    .filter((job) => roleMatches(preferences, job))
    .filter((job) => salaryMatches(preferences, job))
    .filter((job) => workModeMatches(preferences, job))
    .filter((job) => technologyMatches(preferences, job))
    .map((job) => {
      const matchedSkills = job.technologies.filter((tech) => {
        const normalizedTech = normalize(tech);
        return preferredTech.some(
          (technology) => normalizedTech.includes(technology) || technology.includes(normalizedTech),
        );
      });
      const missingSkills = job.technologies.filter((tech) => !matchedSkills.includes(tech));
      const techScore =
        preferredTech.length === 0 ? 35 : Math.round((matchedSkills.length / job.technologies.length) * 65);
      const roleScore = roleMatches(preferences, job) ? 20 : 0;
      const salaryScore = salaryMatches(preferences, job) ? 10 : 0;
      const workModeScore = workModeMatches(preferences, job) ? 5 : 0;
      const matchScore = Math.min(100, techScore + roleScore + salaryScore + workModeScore);

      return {
        ...job,
        matchScore,
        matchedSkills,
        missingSkills,
        matchReason:
          matchedSkills.length > 0
            ? `Matches ${matchedSkills.slice(0, 3).join(", ")} from your preferences.`
            : "Set technologies in preferences to make this score more specific.",
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

export async function getMatchedJobs(preferences: JobPreferences | null): Promise<MatchedJobsResult> {
  const result = await loadAggregatedJobs();
  const rawJobs = result.jobs.length > 0 ? result.jobs : demoJobs;
  const isFallback = result.jobs.length === 0;

  // For live jobs, apply preference filters but skip rule-based scoring —
  // AI scores are computed asynchronously via /api/jobs/score-batch.
  const jobs = isFallback
    ? matchJobs(preferences, rawJobs)
    : rawJobs
        .filter((job) => roleMatches(preferences, job))
        .filter((job) => salaryMatches(preferences, job))
        .filter((job) => workModeMatches(preferences, job))
        .filter((job) => technologyMatches(preferences, job))
        .map((job): MatchedJob => ({ ...job, matchScore: 0, matchedSkills: [], missingSkills: [], matchReason: "" }));

  return {
    jobs,
    source: isFallback ? "fallback" : "live",
    message: isFallback ? "Live job sources are temporarily unavailable. Showing demo jobs instead." : null,
    warnings: result.warnings,
    sourceResults: result.sourceResults,
    successfulSources: result.successfulSources,
  };
}
