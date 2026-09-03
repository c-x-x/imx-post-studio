import { defineConfig } from '@playwright/test'
import fullConfig from './playwright.config'

// Exercise shared workflows once; repeat only browser-sensitive interactions.
const browserCoverage: Record<string, RegExp> = {
  chromium: /@critical/,
  firefox: /@firefox-smoke/,
  webkit: /@webkit-smoke/,
}

export default defineConfig(fullConfig, {
  // The two WebKit smoke workflows are interaction-heavy and contend for the
  // same small GitHub-hosted runner. Serial CI execution prevents WebKit from
  // spending the entire per-test timeout waiting for otherwise-ready controls
  // to become stable; the full local suite keeps its normal worker settings.
  workers: 1,
  projects: fullConfig.projects?.map((project) => ({
    ...project,
    grep: browserCoverage[project.name ?? ''] ?? /@critical/,
  })),
})
