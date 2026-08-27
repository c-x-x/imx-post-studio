import { defineConfig } from '@playwright/test'
import fullConfig from './playwright.config'

// Exercise shared workflows once; repeat only browser-sensitive interactions.
const browserCoverage: Record<string, RegExp> = {
  chromium: /@critical/,
  firefox: /@firefox-smoke/,
  webkit: /@webkit-smoke/,
}

export default defineConfig(fullConfig, {
  projects: fullConfig.projects?.map((project) => ({
    ...project,
    grep: browserCoverage[project.name ?? ''] ?? /@critical/,
  })),
})
