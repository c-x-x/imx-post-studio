import { defineConfig, devices } from '@playwright/test'

const sharedUse = {
  baseURL: 'http://127.0.0.1:4173',
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  reducedMotion: 'reduce' as const,
  viewport: { width: 1440, height: 900 },
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    ...sharedUse,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  expect: { timeout: 10_000 },
  // Chromium text metrics differ between macOS CoreText and Linux FreeType.
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...sharedUse } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], ...sharedUse } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], ...sharedUse } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
