import type { JobPreferences } from "@/lib/preferences";

export interface DemoJob {
  id: string;
  source: "JustJoinIT" | "Remotive" | "Adzuna";
  title: string;
  company: string;
  location: string;
  workMode: "remote" | "hybrid" | "onsite";
  salaryMin: number;
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
  if (preferences.salary_currency !== job.salaryCurrency) return true;
  return job.salaryMin >= preferences.min_salary_amount;
}

function workModeMatches(preferences: JobPreferences | null, job: DemoJob): boolean {
  const modes = preferences?.work_modes ?? [];
  return modes.length === 0 || modes.includes(job.workMode);
}

export function matchJobs(preferences: JobPreferences | null): MatchedJob[] {
  const preferredTech = preferences?.technologies.map(normalize) ?? [];

  return demoJobs
    .filter((job) => roleMatches(preferences, job))
    .filter((job) => salaryMatches(preferences, job))
    .filter((job) => workModeMatches(preferences, job))
    .map((job) => {
      const matchedSkills = job.technologies.filter((tech) => preferredTech.includes(normalize(tech)));
      const missingSkills = job.technologies.filter((tech) => !preferredTech.includes(normalize(tech)));
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
