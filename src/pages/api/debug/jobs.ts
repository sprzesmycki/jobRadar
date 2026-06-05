import type { APIRoute } from "astro";

import { fetchAdzunaJobs } from "@/lib/job-sources/adzuna";
import { fetchJustJoinItJobs } from "@/lib/job-sources/justjoinit";
import { fetchRemotiveJobs } from "@/lib/job-sources/remotive";

export const GET: APIRoute = async () => {
  if (!import.meta.env.DEV) {
    return new Response("Not found", { status: 404 });
  }

  const [remotive, adzuna, jjit] = await Promise.all([fetchRemotiveJobs(), fetchAdzunaJobs(), fetchJustJoinItJobs()]);

  const summarise = (jobs: typeof remotive.jobs) =>
    jobs.slice(0, 3).map((j) => ({
      id: j.id,
      title: j.title,
      description: j.description ? j.description.slice(0, 150) + "…" : null,
    }));

  return new Response(
    JSON.stringify(
      {
        remotive: { status: remotive.status, sample: summarise(remotive.jobs) },
        adzuna: { status: adzuna.status, sample: summarise(adzuna.jobs) },
        jjit: { status: jjit.status, sample: summarise(jjit.jobs) },
      },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/json" } },
  );
};
