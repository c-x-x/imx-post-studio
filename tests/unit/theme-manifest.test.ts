import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd())

interface ThemeManifest {
  repository: string
  version: string
  commit: string
  files: Array<{ path: string; sha256: string }>
}

describe('the vendored IMX theme snapshot', () => {
  it('has pinned provenance and hashes for every copied artifact', async () => {
    const manifestPath = resolve(root, 'src/theme/imx/theme-manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ThemeManifest

    expect(manifest.repository).toBe('https://github.com/c-x-x/hugo-theme-imx')
    expect(manifest.version).toBe('v1.4.9')
    expect(manifest.commit).toBe('6f08e8e')
    expect(manifest.files.length).toBeGreaterThan(0)

    for (const file of manifest.files) {
      const bytes = await readFile(resolve(root, file.path))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256)
    }
  })
})
