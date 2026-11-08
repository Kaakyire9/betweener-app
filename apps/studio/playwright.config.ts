import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.STUDIO_E2E_PORT ?? '4173');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'mocked-media', use: { ...devices['Desktop Chrome'] }, testIgnore: /staging-canary/ },
    { name: 'staging-canary', use: { ...devices['Desktop Chrome'] }, testMatch: /staging-canary/ },
  ],
  webServer: {
    command: `node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    port: e2ePort,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_APP_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: 'https://xsgzxadwuxuziubglvps.supabase.co',
      VITE_SUPABASE_ANON_KEY: process.env.STUDIO_STAGING_ANON_KEY ?? 'e2e-public-key',
      VITE_PUBLIC_APP_ORIGIN: 'https://staging.getbetweener.com',
      VITE_STUDIO_ORIGIN: 'https://studio.staging.getbetweener.com',
      VITE_ADAPTIVE_STAGE_M2_ENABLED: 'true',
      VITE_ADAPTIVE_STAGE_M2_STUDIO_PREVIEW_ENABLED: 'true',
      VITE_ADAPTIVE_STAGE_M2_STAGE_INTELLIGENCE_ENABLED: 'true',
      VITE_SCREEN_FIT_V1_ENABLED: 'true',
      VITE_SCREEN_FIT_LAB_ENABLED: 'true',
    },
  },
});
