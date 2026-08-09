import { readFile, readdir, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.argv[2] ?? process.cwd())
const maintainedEntries = ['package.json', 'README.md', '.github/workflows', 'src', 'scripts', 'public']
const ignoredDirectories = new Set(['.git', '.worktrees', 'dist', 'node_modules', 'playwright-report', 'test-results'])
const ignoredFiles = new Set(['scripts/verify-standalone.mjs'])
const binaryExtensions = /\.(?:gif|jpe?g|png|webp|woff2?|zip)$/i
const forbidden = [
  ['theme repository dependency', /hugo-theme-imx/i],
  ['theme synchronization command', /sync:imx/i],
  ['theme verification command', /check:theme/i],
  ['theme manifest dependency', /theme-manifest/i],
  ['theme snapshot path', /src\/theme\/imx/i],
  ['legacy font path', /\/imx\/fonts\//i],
]

async function collect(path) {
  let info
  try {
    info = await stat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  if (info.isFile()) return [path]
  if (!info.isDirectory()) return []

  const entries = await readdir(path, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    files.push(...await collect(resolve(path, entry.name)))
  }
  return files
}

const files = (await Promise.all(maintainedEntries.map((entry) => collect(resolve(root, entry))))).flat()
const failures = []

for (const path of files) {
  const projectPath = relative(root, path).replaceAll('\\', '/')
  if (ignoredFiles.has(projectPath) || binaryExtensions.test(projectPath)) continue
  const contents = await readFile(path, 'utf8')
  for (const [label, pattern] of forbidden) {
    if (pattern.test(contents)) failures.push(`${projectPath}: ${label}`)
  }
}

if (failures.length > 0) {
  console.error(`Standalone verification failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`Standalone verification passed (${files.length} maintained files inspected).`)
}
