import { vi } from "vitest";

interface MockSupabaseOpts {
  user?: { id: string; email: string };
  session?: { access_token: string };
  cvData?: Record<string, unknown>;
  cachedScores?: unknown[];
}

export function createMockSupabase(opts: MockSupabaseOpts = {}) {
  const user = opts.user ?? { id: "user-1", email: "test@example.com" };
  const session = opts.session ?? { access_token: "fake-token" };
  const cvData = opts.cvData ?? { skills: [], experience_highlights: [], role_hints: [] };
  const cachedScores = opts.cachedScores ?? [];

  const makeChain = (table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: cachedScores }),
    maybeSingle: vi.fn().mockResolvedValue({ data: table === "cv_profiles" ? cvData : null }),
    upsert: vi.fn().mockResolvedValue({ data: null }),
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
      setSession: vi.fn().mockResolvedValue({}),
    },
    from: vi.fn().mockImplementation((table: string) => makeChain(table)),
  };
}
