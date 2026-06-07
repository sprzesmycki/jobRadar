import { vi } from "vitest";

interface MockContextOpts {
  method?: string;
  body?: unknown;
  authHeader?: string;
}

export function createMockContext(opts: MockContextOpts = {}) {
  const method = opts.method ?? "POST";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.authHeader) headers.Authorization = opts.authHeader;

  const request = new Request("http://localhost/api/jobs/score-batch", {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  return {
    request,
    cookies: {
      set: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
    },
    redirect: (url: string) => new Response(null, { status: 302, headers: { Location: url } }),
  };
}
