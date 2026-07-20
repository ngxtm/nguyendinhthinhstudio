import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: /.*\.browser\.spec\.ts/,
  timeout: 30_000,
  forbidOnly: true,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], browserName: 'chromium', channel: 'chrome' } },
    { name: 'stable-chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
});
