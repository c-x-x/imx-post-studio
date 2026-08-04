import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const outputPath = '/tmp/imx-post-studio-verification.zip'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const zones = ['UTC', 'Asia/Shanghai', 'America/New_York']

const results = []
for (const zone of zones) {
  const run = spawnSync(npm, ['run', 'verify:bundle', '--silent'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, TZ: zone },
  })
  if (run.status !== 0) {
    throw new Error(`verify:bundle failed in ${zone}: ${run.stderr || run.stdout}`)
  }
  const bytes = await readFile(outputPath)
  results.push({
    zone,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
}

const hashes = new Set(results.map(({ sha256 }) => sha256))
const sizes = new Set(results.map(({ bytes }) => bytes))
if (hashes.size !== 1 || sizes.size !== 1) {
  throw new Error(`verification bundle differs by timezone: ${JSON.stringify(results)}`)
}

console.log(JSON.stringify({ results }, null, 2))
