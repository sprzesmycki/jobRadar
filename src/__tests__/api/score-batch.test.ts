import { afterEach, describe, expect, it, vi } from "vitest";

interface ScoreResult {
  score: number;
  explanation: string;
  matched_skills: string[];
  missing_skills: string[];
}

interface ScoreBatchResponse {
  scores: Record<string, ScoreResult | null>;
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
    const json = (await response.json()) as ScoreBatchResponse;
    expect(json.scores["job-1"].score).toBe(85);
    expect(json.scores["job-1"].explanation).toBe("Good match");
  });

  it("returns null for a job when explanation is null in FastAPI response", async () => {
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

    expect(response.status).toBe(200);
    const json = (await response.json()) as ScoreBatchResponse;
    expect(json.scores["job-1"]).toBeNull();
  });

  it("returns null for a job when matched_skills is null in FastAPI response", async () => {
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

    expect(response.status).toBe(200);
    const json = (await response.json()) as ScoreBatchResponse;
    expect(json.scores["job-1"]).toBeNull();
  });
});
