import { chromium, defineConfig, devices } from '@playwright/test'

const chromeForTestingExecutable = process.env.CFT_EXECUTABLE_PATH ?? '__missing_chrome_for_testing_binary__'

export default defineConfig({
  testDir: './test',
  testMatch: /.*(?:\.browser\.spec|\.benchmark)\.ts/,
  timeout: 180_000,
  forbidOnly: true,
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        launchOptions: { executablePath: chromium.executablePath() }
      }
    },
    {
      name: 'stable-chrome',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        launchOptions: { executablePath: chromeForTestingExecutable }
      }
    }
  ]
})
