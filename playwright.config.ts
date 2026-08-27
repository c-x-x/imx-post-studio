import { defineConfig, devices } from '@playwright/test'

const sharedUse = {
  baseURL: 'http://127.0.0.1:4173',
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  reducedMotion: 'reduce' as const,
  viewport: { width: 1440, height: 900 },
}

const previewCommand = process.env.CI
  ? 'npm run preview -- --host 127.0.0.1'
  : 'npm run build && npm run preview -- --host 127.0.0.1'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    ...sharedUse,
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  expect: { timeout: 10_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...sharedUse } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], ...sharedUse } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], ...sharedUse } },
  ],
  webServer: {
    command: previewCommand,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
