import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const projectRoot = resolve(process.cwd())
const fixtures: string[] = []

async function fixture(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), 'imx-studio-standalone-'))
  fixtures.push(root)
  await Promise.all([
    mkdir(resolve(root, '.github/workflows'), { recursive: true }),
    mkdir(resolve(root, 'src'), { recursive: true }),
    mkdir(resolve(root, 'scripts'), { recursive: true }),
    mkdir(resolve(root, 'public'), { recursive: true }),
  ])
  await writeFile(resolve(root, 'package.json'), '{"name":"imx-post-studio"}\n')
  await writeFile(resolve(root, 'README.md'), '# IMX Post Studio\n')
  await writeFile(resolve(root, 'src/branding.ts'), "export const product = 'IMX Post Studio'\n")
  return root
}

function verify(root: string) {
  return spawnSync(process.execPath, [resolve(projectRoot, 'scripts/verify-standalone.mjs'), root], {
    encoding: 'utf8',
  })
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('standalone Studio verifier', () => {
  it('accepts Studio branding while rejecting repository, sync, manifest, and legacy asset coupling', async () => {
    const cleanRoot = await fixture()
    expect(verify(cleanRoot).status).toBe(0)

    const forbidden = [
      ['README.md', 'hugo-theme-imx'],
      ['package.json', 'sync:imx'],
      ['.github/workflows/ci.yml', 'npm run check:theme'],
      ['src/runtime.ts', 'theme-manifest.json'],
      ['scripts/build.mjs', 'src/theme/imx'],
      ['src/fonts.css', "url('/imx/fonts/inter-variable.woff2')"],
    ] as const

    for (const [relativePath, contents] of forbidden) {
      const root = await fixture()
      const path = resolve(root, relativePath)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, contents)
      const result = verify(root)
      expect(result.status, `${relativePath} should fail`).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain(relativePath)
    }
  })
})
