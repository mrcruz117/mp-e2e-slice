import { defineConfig } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${String(PORT)}` },
  webServer: {
    command: "rm -f data/e2e.db && npm run build && npm start",
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      // A fresh file per run, so a stale database can never make a spec pass.
      DATABASE_PATH: "data/e2e.db",
    },
  },
});
