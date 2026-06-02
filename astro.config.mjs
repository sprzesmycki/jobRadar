// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      BACKEND_API_URL: envField.string({ context: "server", access: "secret", optional: true }),
      ADZUNA_APP_ID: envField.string({ context: "server", access: "secret", optional: true }),
      ADZUNA_APP_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      ADZUNA_COUNTRY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
