import { createHash } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(process.cwd())
const fullCommit = '6f08e8e5bba774a8e1fa0c2fa911c7435dddd9c7'
const sourcePaths = [
  'LICENSE', 'assets/css/fonts.css', 'assets/css/tokens.css', 'assets/css/base.css', 'assets/css/layout.css',
  'assets/css/cards.css', 'assets/css/article.css', 'assets/css/responsive-content.css', 'assets/css/article-reading.css',
  'assets/css/article-reading-responsive.css', 'assets/css/code.css', 'assets/fonts/imx/inter-variable.woff2',
  'assets/fonts/imx/noto-serif-sc-400-core.woff2', 'assets/fonts/imx/noto-serif-sc-400-common.woff2',
  'assets/fonts/imx/noto-serif-sc-400-extended.woff2', 'assets/fonts/imx/noto-serif-sc-700-core.woff2',
  'assets/fonts/imx/noto-serif-sc-700-common.woff2', 'assets/fonts/imx/noto-serif-sc-700-extended.woff2',
  'static/fonts/imx/OFL-Inter.txt', 'static/fonts/imx/OFL-Noto-Serif-SC.txt',
]
const outputPaths = [
  'src/theme/imx/imx-preview.css', 'src/theme/imx/LICENSE.imx', 'src/theme/imx/OFL-Inter.txt',
  'src/theme/imx/OFL-Noto-Serif-SC.txt', 'public/imx/fonts/inter-variable.woff2',
  'public/imx/fonts/noto-serif-sc-400-core.woff2', 'public/imx/fonts/noto-serif-sc-400-common.woff2',
  'public/imx/fonts/noto-serif-sc-400-extended.woff2', 'public/imx/fonts/noto-serif-sc-700-core.woff2',
  'public/imx/fonts/noto-serif-sc-700-common.woff2', 'public/imx/fonts/noto-serif-sc-700-extended.woff2',
]
const fixtures: string[] = []

interface ThemeManifest {
  schemaVersion: number
  repository: string
  version: string
  commit: string
  sourceCommit: string
  syncedAt: string
  sourceFiles: Array<{ path: string; sha256: string }>
  files: Array<{ path: string; sha256: string }>
}

async function fixture(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'imx-theme-manifest-'))
  fixtures.push(directory)
  await cp(resolve(root, 'src/theme'), resolve(directory, 'src/theme'), { recursive: true })
  await cp(resolve(root, 'public/imx'), resolve(directory, 'public/imx'), { recursive: true })
  return directory
}

function verify(directory: string): number | null {
  return spawnSync(process.execPath, [resolve(root, 'scripts/verify-theme-manifest.mjs')], {
    env: { ...process.env, IMX_THEME_ROOT: directory },
    encoding: 'utf8',
  }).status
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('the vendored IMX theme snapshot', () => {
  it('has the complete pinned source provenance and hashes for every exact output artifact', async () => {
    const manifestPath = resolve(root, 'src/theme/imx/theme-manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ThemeManifest

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      repository: 'https://github.com/c-x-x/hugo-theme-imx',
      version: 'v1.4.9',
      commit: '6f08e8e',
      sourceCommit: fullCommit,
      syncedAt: '2026-07-28T18:55:29+08:00',
    })
    expect(manifest.sourceFiles.map((file) => file.path)).toEqual(sourcePaths)
    expect(manifest.files.map((file) => file.path)).toEqual(outputPaths)
    expect(manifest.files[0].sha256).toBe('2aa8834f21449a2f0af58161c0c9d892d67393cad0ef8a06de07a61d52644646')
    expect(new Set(manifest.sourceFiles.map((file) => file.path)).size).toBe(sourcePaths.length)
    expect(new Set(manifest.files.map((file) => file.path)).size).toBe(outputPaths.length)

    for (const file of manifest.files) {
      const bytes = await readFile(resolve(root, file.path))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256)
    }
    expect(await readFile(resolve(root, 'src/theme/imx/OFL-Inter.txt'), 'utf8')).toContain('SIL Open Font License')
    expect(await readFile(resolve(root, 'src/theme/imx/OFL-Noto-Serif-SC.txt'), 'utf8')).toContain('SIL Open Font License')
    expect(await readFile(resolve(root, 'src/theme/imx/imx-preview.css'), 'utf8')).toMatch(/unicode-range:[\s\S]*noto-serif-sc-400-core/)
  })

  it('fails closed when source provenance, required outputs, or vendored file sets drift', async () => {
    const mutations: Array<(directory: string) => Promise<void>> = [
      async (directory) => {
        const path = resolve(directory, 'src/theme/imx/theme-manifest.json')
        const manifest = JSON.parse(await readFile(path, 'utf8')) as ThemeManifest
        manifest.sourceCommit = '0000000000000000000000000000000000000000'
        await writeFile(path, JSON.stringify(manifest))
      },
      async (directory) => {
        const path = resolve(directory, 'src/theme/imx/theme-manifest.json')
        const manifest = JSON.parse(await readFile(path, 'utf8')) as ThemeManifest
        manifest.sourceFiles[0].sha256 = '0'.repeat(64)
        await writeFile(path, JSON.stringify(manifest))
      },
      async (directory) => {
        const path = resolve(directory, 'src/theme/imx/theme-manifest.json')
        const manifest = JSON.parse(await readFile(path, 'utf8')) as ThemeManifest
        manifest.sourceFiles.pop()
        await writeFile(path, JSON.stringify(manifest))
      },
      async (directory) => {
        await rm(resolve(directory, 'src/theme/imx/LICENSE.imx'))
      },
      async (directory) => {
        await writeFile(resolve(directory, 'public/imx/fonts/unmanifested.woff2'), 'unexpected')
      },
    ]

    for (const mutate of mutations) {
      const directory = await fixture()
      await mutate(directory)
      expect(verify(directory)).not.toBe(0)
    }
  })
})
