import type { JobListing } from "@/lib/job-sources/types";

export const SALARY_TO_USD = {
  EUR: 1.08,
  PLN: 0.25,
  USD: 1,
} satisfies Record<JobListing["salaryCurrency"], number>;

export function parseSalary(salary: string | undefined): Pick<JobListing, "salaryMin" | "salaryCurrency"> {
  const normalized = salary?.replaceAll(",", "").trim() ?? "";
  const currency =
    normalized.includes("zł") || /\bPLN\b/i.test(normalized)
      ? "PLN"
      : normalized.includes("€") || /\bEUR\b/i.test(normalized)
        ? "EUR"
        : "USD";
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
