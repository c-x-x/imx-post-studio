import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const manifestPath = resolve(root, 'src/theme/imx/theme-manifest.json')
const expectedPaths = new Set([
  'src/theme/imx/imx-preview.css',
  'src/theme/imx/LICENSE.imx',
  'public/imx/fonts/inter-variable.woff2',
  'public/imx/fonts/noto-serif-sc-400-core.woff2',
  'public/imx/fonts/noto-serif-sc-400-common.woff2',
  'public/imx/fonts/noto-serif-sc-400-extended.woff2',
  'public/imx/fonts/noto-serif-sc-700-core.woff2',
  'public/imx/fonts/noto-serif-sc-700-common.woff2',
  'public/imx/fonts/noto-serif-sc-700-extended.woff2',
])

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function safeProjectPath(path) {
  const resolved = resolve(root, path)
  const fromRoot = relative(root, resolved)
  return !isAbsolute(fromRoot) && !fromRoot.startsWith('..') && resolved !== root
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.repository !== 'https://github.com/c-x-x/hugo-theme-imx' || manifest.version !== 'v1.4.9' || manifest.commit !== '6f08e8e') {
    throw new Error('Theme manifest provenance does not match the approved IMX baseline')
  }
  if (!Array.isArray(manifest.files) || manifest.files.length !== expectedPaths.size) {
    throw new Error('Theme manifest has an unexpected copied-file set')
  }
  const seen = new Set()
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error('Theme manifest contains an invalid file entry')
    }
    if (!expectedPaths.has(entry.path) || !safeProjectPath(entry.path) || seen.has(entry.path)) {
      throw new Error(`Theme manifest rejected file path: ${entry.path}`)
    }
    seen.add(entry.path)
    const bytes = await readFile(resolve(root, entry.path))
    if (sha256(bytes) !== entry.sha256) throw new Error(`Theme asset hash mismatch: ${entry.path}`)
  }
  if (seen.size !== expectedPaths.size) throw new Error('Theme manifest is missing required copied files')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
