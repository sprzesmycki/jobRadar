import type { JobPreferences } from "@/lib/preferences";

export interface DemoJob {
  id: string;
  source: "JustJoinIT" | "Remotive" | "Adzuna";
  title: string;
  company: string;
  location: string;
  workMode: "remote" | "hybrid" | "onsite";
  salaryMin: number | null;
  salaryCurrency: "EUR" | "USD" | "PLN";
  technologies: string[];
  url: string;
}

export interface MatchedJob extends DemoJob {
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  matchReason: string;
}

export interface MatchedJobsResult {
  jobs: MatchedJob[];
  source: "live" | "stale" | "fallback";
  message: string | null;
}

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category?: string;
  tags?: string[];
  candidate_required_location?: string;
  salary?: string;
}

interface RemotiveResponse {
  jobs?: RemotiveJob[];
}

interface RemotiveCache {
  jobs: DemoJob[];
  fetchedAt: number;
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
// MVP approximation only. Replace with a live exchange-rate source before relying on exact salary comparisons.
const SALARY_TO_USD = {
  EUR: 1.08,
  PLN: 0.25,
  USD: 1,
} satisfies Record<DemoJob["salaryCurrency"], number>;

let remotiveCache: RemotiveCache | null = null;

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

function parseSalary(salary: string | undefined): Pick<DemoJob, "salaryMin" | "salaryCurrency"> {
  const normalized = salary?.replaceAll(",", "").trim() ?? "";
  const currency = normalized.includes("€") || /\bEUR\b/i.test(normalized) ? "EUR" : "USD";
  const compactAmountMatch = /(\d+(?:\.\d+)?)\s?k/i.exec(normalized);
  const fullAmountMatch = /(\d{4,6})/.exec(normalized);
  const match = compactAmountMatch ?? fullAmountMatch;

  if (!match) {
    return {
      salaryMin: null,
      salaryCurrency: currency,
    };
  }

  const rawAmount = Number.parseFloat(match[1]);
  const amount = match[0].toLowerCase().includes("k") ? rawAmount * 1000 : rawAmount;

  return {
    salaryMin: Number.isFinite(amount) ? Math.round(amount) : null,
    salaryCurrency: currency,
  };
}

export function mapRemotiveJob(job: RemotiveJob): DemoJob {
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
  };
}

function isSoftwareJob(job: RemotiveJob): boolean {
  if (normalize(job.category ?? "") === "software development") return true;

  const haystack = [job.title, ...(job.tags ?? [])].map(normalize).join(" ");
  return SOFTWARE_SIGNALS.some((signal) => haystack.includes(signal));
}

async function fetchRemotiveJobs(): Promise<DemoJob[]> {
  const now = Date.now();

  if (remotiveCache && now - remotiveCache.fetchedAt < REMOTIVE_CACHE_TTL_MS) {
    return remotiveCache.jobs;
  }

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

  return jobs;
}

async function loadLiveJobs(): Promise<Omit<MatchedJobsResult, "jobs"> & { rawJobs: DemoJob[] }> {
  try {
    const jobs = await fetchRemotiveJobs();

    return {
      rawJobs: jobs,
      source: "live",
      message: null,
    };
  } catch (error) {
    if (remotiveCache) {
      return {
        rawJobs: remotiveCache.jobs,
        source: "stale",
        message: "Remotive is temporarily unavailable. Showing the latest cached jobs.",
      };
    }

    return {
      rawJobs: demoJobs,
      source: "fallback",
      message:
        error instanceof Error
          ? `Remotive is temporarily unavailable. Showing demo jobs instead. (${error.message})`
          : "Remotive is temporarily unavailable. Showing demo jobs instead.",
    };
  }
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
  const result = await loadLiveJobs();

  return {
    jobs: matchJobs(preferences, result.rawJobs),
    source: result.source,
    message: result.message,
  };
}
