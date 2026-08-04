import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = 'https://github.com/c-x-x/hugo-theme-imx'
const version = 'v1.4.9'
const commit = '6f08e8e'
const cssFiles = [
  'assets/css/tokens.css', 'assets/css/base.css', 'assets/css/layout.css', 'assets/css/cards.css',
  'assets/css/article.css', 'assets/css/responsive-content.css', 'assets/css/article-reading.css',
  'assets/css/article-reading-responsive.css', 'assets/css/code.css',
]
const fontFiles = [
  'assets/fonts/imx/inter-variable.woff2', 'assets/fonts/imx/noto-serif-sc-400-core.woff2',
  'assets/fonts/imx/noto-serif-sc-400-common.woff2', 'assets/fonts/imx/noto-serif-sc-400-extended.woff2',
  'assets/fonts/imx/noto-serif-sc-700-core.woff2', 'assets/fonts/imx/noto-serif-sc-700-common.woff2',
  'assets/fonts/imx/noto-serif-sc-700-extended.woff2',
]
const fontLicenseFiles = ['static/fonts/imx/OFL-Inter.txt', 'static/fonts/imx/OFL-Noto-Serif-SC.txt']
const sourceFiles = ['LICENSE', 'assets/css/fonts.css', ...cssFiles, ...fontFiles, ...fontLicenseFiles]
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function git(source, ...args) {
  return execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function sourceBlob(source, fullCommit, path) {
  try {
    return Buffer.from(execFileSync('git', ['-C', source, 'show', `${fullCommit}:${path}`], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 }))
  } catch {
    throw new Error(`Pinned IMX source is missing allowlisted file: ${path}`)
  }
}

function assertPinnedSource(source) {
  if (git(source, 'rev-parse', '--is-inside-work-tree') !== 'true') throw new Error('IMX source must be a Git work tree')
  if (git(source, 'remote', 'get-url', 'origin').replace(/\.git$/, '') !== repository) throw new Error(`IMX origin must be ${repository}`)
  const fullCommit = git(source, 'rev-parse', `${commit}^{commit}`)
  const tagCommit = git(source, 'rev-parse', `${version}^{commit}`)
  if (fullCommit !== tagCommit || !fullCommit.startsWith(commit)) throw new Error(`IMX ${version} must resolve exactly to ${commit}`)
  if (!git(source, 'tag', '--points-at', fullCommit).split('\n').includes(version)) throw new Error(`IMX ${version} must point directly at ${commit}`)
  for (const path of sourceFiles) {
    if (git(source, 'cat-file', '-t', `${fullCommit}:${path}`) !== 'blob') throw new Error(`Pinned IMX source is not a file: ${path}`)
  }
  return fullCommit
}

function renderPinnedFontFaces(sourceCss) {
  const replacements = {
    '{{ .inter.RelPermalink }}': '/imx/fonts/inter-variable.woff2',
    '{{ .noto400Extended.RelPermalink }}': '/imx/fonts/noto-serif-sc-400-extended.woff2',
    '{{ .noto400Common.RelPermalink }}': '/imx/fonts/noto-serif-sc-400-common.woff2',
    '{{ .noto400Core.RelPermalink }}': '/imx/fonts/noto-serif-sc-400-core.woff2',
    '{{ .noto700Extended.RelPermalink }}': '/imx/fonts/noto-serif-sc-700-extended.woff2',
    '{{ .noto700Common.RelPermalink }}': '/imx/fonts/noto-serif-sc-700-common.woff2',
    '{{ .noto700Core.RelPermalink }}': '/imx/fonts/noto-serif-sc-700-core.woff2',
  }
  const output = Object.entries(replacements).reduce((css, [from, to]) => css.replaceAll(from, to), sourceCss)
  if (/{{|}}/.test(output) || !output.includes('unicode-range:')) throw new Error('Pinned IMX font declaration transformation failed')
  return output
}

async function writeArtifact(relativePath, bytes) {
  const target = resolve(root, relativePath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, bytes)
  return { path: relativePath, sha256: sha256(bytes) }
}

function runPreviewVerification() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  execFileSync(npm, ['test', '--', 'tests/unit/theme-manifest.test.ts', 'tests/unit/markdown-preview.test.ts', 'tests/components/PreviewFrame.test.tsx'], { cwd: root, stdio: 'inherit' })
}

async function main() {
  const sourceArgument = process.argv[2]
  if (!sourceArgument) throw new Error('Usage: npm run sync:imx -- <path-to-hugo-theme-imx>')
  const source = resolve(sourceArgument)
  const fullCommit = assertPinnedSource(source)
  const sources = sourceFiles.map((path) => {
    const bytes = sourceBlob(source, fullCommit, path)
    return { path, sha256: sha256(bytes), bytes }
  })
  const sourceByPath = new Map(sources.map((item) => [item.path, item.bytes]))
  const css = Buffer.from(`${renderPinnedFontFaces(sourceByPath.get('assets/css/fonts.css').toString('utf8'))}\n${cssFiles.map((path) => sourceByPath.get(path).toString('utf8')).join('\n\n').replace(/\n+$/, '\n')}`)
  const files = [
    await writeArtifact('src/theme/imx/imx-preview.css', css),
    await writeArtifact('src/theme/imx/LICENSE.imx', sourceByPath.get('LICENSE')),
    await writeArtifact('src/theme/imx/OFL-Inter.txt', sourceByPath.get('static/fonts/imx/OFL-Inter.txt')),
    await writeArtifact('src/theme/imx/OFL-Noto-Serif-SC.txt', sourceByPath.get('static/fonts/imx/OFL-Noto-Serif-SC.txt')),
  ]
  for (const path of fontFiles) files.push(await writeArtifact(`public/imx/fonts/${path.split('/').at(-1)}`, sourceByPath.get(path)))
  const manifest = {
    schemaVersion: 1, repository, version, commit, sourceCommit: fullCommit,
    syncedAt: git(source, 'show', '-s', '--format=%cI', fullCommit),
    sourceFiles: sources.map(({ path, sha256: hash }) => ({ path, sha256: hash })), files,
  }
  await writeArtifact('src/theme/imx/theme-manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`))
  runPreviewVerification()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
