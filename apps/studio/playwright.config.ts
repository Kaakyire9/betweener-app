import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'mocked-media', use: { ...devices['Desktop Chrome'] }, testIgnore: /staging-canary/ },
    { name: 'staging-canary', use: { ...devices['Desktop Chrome'] }, testMatch: /staging-canary/ },
  ],
  webServer: {
    command: 'node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_APP_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: 'https://xsgzxadwuxuziubglvps.supabase.co',
      VITE_SUPABASE_ANON_KEY: process.env.STUDIO_STAGING_ANON_KEY ?? 'e2e-public-key',
      VITE_PUBLIC_APP_ORIGIN: 'https://staging.getbetweener.com',
      VITE_STUDIO_ORIGIN: 'https://studio.staging.getbetweener.com',
      VITE_ADAPTIVE_STAGE_M2_ENABLED: 'true',
      VITE_ADAPTIVE_STAGE_M2_STUDIO_PREVIEW_ENABLED: 'true',
    },
  },
});
