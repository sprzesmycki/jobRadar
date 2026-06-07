import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    {
      name: "mock-astro-env",
      resolveId(id: string) {
        if (id === "astro:env/server") return "\0astro:env/server";
      },
      load(id: string) {
        if (id === "\0astro:env/server")
          return `
            export const SUPABASE_URL = "";
            export const SUPABASE_KEY = "";
            export const BACKEND_API_URL = "http://localhost:8000";
            export const ADZUNA_APP_ID = "";
            export const ADZUNA_APP_KEY = "";
            export const ADZUNA_COUNTRY = "us";
          `;
      },
    },
  ],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    globals: true,
  },
});
