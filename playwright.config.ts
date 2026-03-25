import { defineConfig, devices } from '@playwright/test';

/**
 * Wakeela E2E Test Configuration
 * Run: npx playwright test
 * UI mode: npx playwright test --ui
 */
export default defineConfig({
  testDir:    './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries:    process.env.CI ? 2 : 0,
  workers:    process.env.CI ? 1 : undefined,
  reporter:   [['html', { outputFolder: 'playwright-report' }], ['list']],

  use: {
    baseURL:          process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace:            'on-first-retry',
    screenshot:       'only-on-failure',
    video:            'on-first-retry',
    locale:           'en-US',
    timezoneId:       'Asia/Dubai',
  },

  projects: [
    // Setup project — authenticates once and saves session
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    // Main test suite — desktop Chromium
    {
      name:         'chromium',
      use:          { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    // Mobile viewport
    {
      name: 'mobile',
      use:  { ...devices['Pixel 7'] },
      dependencies: ['setup'],
    },
    // Arabic RTL layout
    {
      name: 'arabic-rtl',
      use:  { ...devices['Desktop Chrome'], locale: 'ar-AE', baseURL: (process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000') + '/ar' },
      dependencies: ['setup'],
    },
  ],

  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url:     'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
