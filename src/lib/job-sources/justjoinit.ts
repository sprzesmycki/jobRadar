import type { JobListing, SourceCache, SourceFetchResult } from "@/lib/job-sources/types";
import { sourceWarning } from "@/lib/job-sources/types";

interface JustJoinItOffer {
  guid?: string;
  slug?: string;
  title?: string;
  workplaceType?: string;
  city?: string;
  companyName?: string;
  employmentTypes?: {
    from?: number | null;
    currency?: string;
  }[];
  requiredSkills?: {
    name?: string;
  }[];
  niceToHaveSkills?: {
    name?: string;
  }[];
}

interface JustJoinItResponse {
  data?: JustJoinItOffer[];
}

const JUSTJOINIT_URL =
  "https://justjoin.it/api/candidate-api/offers?from=0&itemsCount=100&categories=mobile&cityRadius=30&currency=pln&orderBy=descending&sortBy=publishedAt&keywordType=any&isPromoted=true";
const JUSTJOINIT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let justJoinItCache: SourceCache | null = null;

function mapWorkMode(workplaceType: string | undefined): JobListing["workMode"] {
  const normalized = workplaceType?.trim().toLowerCase() ?? "";
  if (normalized.includes("remote")) return "remote";
  if (normalized.includes("hybrid")) return "hybrid";
  return "onsite";
}

function mapCurrency(currency: string | undefined): JobListing["salaryCurrency"] {
  const normalized = currency?.trim().toUpperCase();
  if (normalized === "EUR" || normalized === "USD" || normalized === "PLN") return normalized;
  return "PLN";
}

function selectSalary(offer: JustJoinItOffer): Pick<JobListing, "salaryMin" | "salaryCurrency"> {
  const salary = offer.employmentTypes?.find((employment) => typeof employment.from === "number");

  return {
    salaryMin: salary?.from ? Math.round(salary.from) : null,
    salaryCurrency: mapCurrency(salary?.currency),
  };
}

function mapJustJoinItOffer(offer: JustJoinItOffer): JobListing {
  const salary = selectSalary(offer);
  const slug = offer.slug ?? offer.guid ?? `${offer.companyName ?? "company"}-${offer.title ?? "job"}`;
  const technologies = [...(offer.requiredSkills ?? []), ...(offer.niceToHaveSkills ?? [])]
    .map((skill) => skill.name?.trim() ?? "")
    .filter(Boolean)
    .slice(0, 10);

  return {
    id: `justjoinit-${offer.guid ?? slug}`,
    source: "JustJoinIT",
    title: offer.title?.trim() ?? "Untitled JustJoinIT job",
    company: offer.companyName?.trim() ?? "Company not listed",
    location: offer.city?.trim() ?? "Location not listed",
    workMode: mapWorkMode(offer.workplaceType),
    salaryMin: salary.salaryMin,
    salaryCurrency: salary.salaryCurrency,
    technologies,
    url: `https://justjoin.it/job-offer/${slug}`,
    description: null,
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
    const response = await fetch(JUSTJOINIT_URL, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: "https://justjoin.it/job-offers/all-locations/mobile",
      },
    });
    if (!response.ok) {
      throw new Error(`JustJoinIT returned ${response.status}`);
    }

    const payload = (await response.json()) as JustJoinItResponse;
    const jobs = (payload.data ?? [])
      .map(mapJustJoinItOffer)
      .filter((job) => job.title && job.company && job.url)
      .slice(0, 100);

    if (jobs.length === 0) {
      throw new Error("candidate API returned no usable offers");
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
          "JustJoinIT uses an experimental adapter based on an undocumented candidate API endpoint.",
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
