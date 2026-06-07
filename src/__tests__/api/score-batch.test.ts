import { afterEach, describe, expect, it, vi } from "vitest";

interface ScoreResult {
  score: number;
  explanation: string;
  matched_skills: string[];
  missing_skills: string[];
}

import { createMockContext } from "../helpers/mock-context";
import { createMockSupabase } from "../helpers/mock-supabase";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ createClient: mockCreateClient }));

const oneJob = {
  id: "job-1",
  source: "adzuna",
  title: "Frontend Engineer",
  company: "Acme",
  description: "Build stuff",
  technologies: ["TypeScript"],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("score-batch R2: response-shape validation", () => {
  it("passes through all four fields when FastAPI returns a valid score", async () => {
    const supabase = createMockSupabase();
    mockCreateClient.mockReturnValue(supabase);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ score: 85, explanation: "Good match", matched_skills: ["TS"], missing_skills: [] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
    );

    const { POST } = await import("@/pages/api/jobs/score-batch");
    const ctx = createMockContext({ authHeader: "Bearer fake-token", body: { jobs: [oneJob] } });
    const response = await POST(ctx as never);

    expect(response.status).toBe(200);
    const json = (await response.json()) as { scores: Record<string, ScoreResult> };
    expect(json.scores["job-1"].score).toBe(85);
    expect(json.scores["job-1"].explanation).toBe("Good match");
  });

  it("returns 502 when only job has explanation: null (shape validation + all-fail guard)", async () => {
    const supabase = createMockSupabase();
    mockCreateClient.mockReturnValue(supabase);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ score: 85, explanation: null, matched_skills: [], missing_skills: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const { POST } = await import("@/pages/api/jobs/score-batch");
    const ctx = createMockContext({ authHeader: "Bearer fake-token", body: { jobs: [oneJob] } });
    const response = await POST(ctx as never);

    expect(response.status).toBe(502);
  });

  it("returns 502 when only job has matched_skills: null (shape validation + all-fail guard)", async () => {
    const supabase = createMockSupabase();
    mockCreateClient.mockReturnValue(supabase);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ score: 85, explanation: "ok", matched_skills: null, missing_skills: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const { POST } = await import("@/pages/api/jobs/score-batch");
    const ctx = createMockContext({ authHeader: "Bearer fake-token", body: { jobs: [oneJob] } });
    const response = await POST(ctx as never);

    expect(response.status).toBe(502);
  });
});

describe("score-batch R1: 502 on all-fail", () => {
  it("returns 502 when all FastAPI calls return an error status", async () => {
    const supabase = createMockSupabase();
    mockCreateClient.mockReturnValue(supabase);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("error", { status: 502 })));

    const { POST } = await import("@/pages/api/jobs/score-batch");
    const ctx = createMockContext({ authHeader: "Bearer fake-token", body: { jobs: [oneJob] } });
    const response = await POST(ctx as never);

    expect(response.status).toBe(502);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBeTruthy();
  });

  it("returns 502 when FastAPI times out", async () => {
    const supabase = createMockSupabase();
    mockCreateClient.mockReturnValue(supabase);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("The operation was aborted", "AbortError")));

    const { POST } = await import("@/pages/api/jobs/score-batch");
    const ctx = createMockContext({ authHeader: "Bearer fake-token", body: { jobs: [oneJob] } });
    const response = await POST(ctx as never);

    expect(response.status).toBe(502);
  });

  it("returns 200 with partial scores when some jobs score and some fail", async () => {
    const supabase = createMockSupabase();
    mockCreateClient.mockReturnValue(supabase);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ score: 90, explanation: "Great", matched_skills: ["TS"], missing_skills: [] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(new Response("error", { status: 502 })),
    );

    const twoJobs = [
      oneJob,
      {
        id: "job-2",
        source: "adzuna",
        title: "Backend Engineer",
        company: "Beta",
        description: null,
        technologies: [],
      },
    ];

    const { POST } = await import("@/pages/api/jobs/score-batch");
    const ctx = createMockContext({ authHeader: "Bearer fake-token", body: { jobs: twoJobs } });
    const response = await POST(ctx as never);

    expect(response.status).toBe(200);
    const json = (await response.json()) as { scores: Record<string, ScoreResult | null> };
    expect(json.scores["job-1"]?.score).toBe(90);
    expect(json.scores["job-2"]).toBeNull();
  }, 10_000);
});
