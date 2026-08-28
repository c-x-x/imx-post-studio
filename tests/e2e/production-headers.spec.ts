import { readFile, stat } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, resolve, sep } from 'node:path'
import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js'
import { expect, test, type Download } from '@playwright/test'
import { pngFile } from '../helpers/test-images'

const EXPECTED_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
const DIST_ROOT = resolve(process.cwd(), 'dist')

interface Header {
  key: string
  value: string
}

interface VercelConfig {
  headers?: Array<{ source: string; headers: Header[] }>
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function readGlobalHeaders(): Promise<Header[]> {
  const config = JSON.parse(await readFile(resolve(process.cwd(), 'vercel.json'), 'utf8')) as VercelConfig
  const rule = config.headers?.find(({ source }) => source === '/(.*)')
  if (!rule) throw new Error('vercel.json is missing the global header rule')
  return rule.headers
}

async function resolveProductionFile(pathname: string): Promise<string> {
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'
  const requestedPath = resolve(DIST_ROOT, relativePath)
  if (requestedPath !== DIST_ROOT && !requestedPath.startsWith(`${DIST_ROOT}${sep}`)) {
    throw new Error('Requested path escapes dist')
  }

  try {
    return (await stat(requestedPath)).isFile() ? requestedPath : resolve(DIST_ROOT, 'index.html')
  } catch {
    return resolve(DIST_ROOT, 'index.html')
  }
}

async function startProductionHeaderServer(): Promise<{ server: Server; baseURL: string }> {
  const headers = await readGlobalHeaders()
  const server = createServer((request, response) => {
    void (async () => {
      for (const { key, value } of headers) response.setHeader(key, value)
      try {
        const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
        const filePath = await resolveProductionFile(pathname)
        const body = await readFile(filePath)
        response.statusCode = 200
        response.setHeader('Content-Type', CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream')
        response.setHeader('Content-Length', body.byteLength)
        response.end(body)
      } catch {
        response.statusCode = 404
        response.end('Not found')
      }
    })()
  })

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolveListen()
    })
  })
  const address = server.address() as AddressInfo
  return { server, baseURL: `http://127.0.0.1:${address.port}` }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose())
  })
}

async function readZipEntry(download: Download, filename: string): Promise<Uint8Array> {
  const downloadPath = await download.path()
  if (!downloadPath) throw new Error('Playwright did not provide the downloaded ZIP path')
  const archive = await readFile(downloadPath)
  const reader = new ZipReader(new BlobReader(new Blob([archive])))
  try {
    const entry = (await reader.getEntries()).find((candidate) => candidate.filename === filename)
    if (!entry || entry.directory) throw new Error(`ZIP entry ${filename} is missing`)
    const blob = await entry.getData(new BlobWriter())
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    await reader.close()
  }
}

function isWebp(bytes: Uint8Array): boolean {
  const decoder = new TextDecoder()
  return bytes.length >= 12
    && decoder.decode(bytes.slice(0, 4)) === 'RIFF'
    && decoder.decode(bytes.slice(8, 12)) === 'WEBP'
}

let productionServer: Server
let productionBaseURL: string

test.beforeAll(async () => {
  const started = await startProductionHeaderServer()
  productionServer = started.server
  productionBaseURL = started.baseURL
})

test.afterAll(async () => {
  await closeServer(productionServer)
})

test('effective production CSP permits WebAssembly compilation in Chromium and WebKit', async ({ browserName, page }) => {
  test.skip(browserName === 'firefox', 'The production CSP regression targets the supported Chromium and WebKit engines')

  const response = await page.goto(productionBaseURL)
  expect(await page.evaluate(async () => {
    try {
      await WebAssembly.compile(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]))
      return { ok: true, error: '' }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })).toEqual({ ok: true, error: '' })
  expect(response?.headers()['content-security-policy']).toBe(EXPECTED_CSP)
})

test('exports a valid WebP cover under production CSP and forces the WASM fallback in WebKit', { tag: ['@critical', '@webkit-smoke'] }, async ({ browserName, page }) => {
  test.skip(browserName === 'firefox', 'The production CSP regression targets the supported Chromium and WebKit engines')

  if (browserName === 'webkit') {
    await page.addInitScript(() => {
      const nativeToBlob = HTMLCanvasElement.prototype.toBlob
      const browserState = window as Window & { __nativeWebpAttempts?: number }
      HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type, quality) {
        if (type?.toLowerCase() === 'image/webp') {
          browserState.__nativeWebpAttempts = (browserState.__nativeWebpAttempts ?? 0) + 1
          queueMicrotask(() => callback(null))
          return
        }
        nativeToBlob.call(this, callback, type, quality)
      }
    })
  }

  const response = await page.goto(productionBaseURL)
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await page.getByLabel('标题').fill('生产 CSP WebP 回退')
  await page.getByLabel('Slug').fill('production-csp-webp-fallback')
  await page.getByLabel('发布日期').fill('2026-08-04T10:30:00+08:00')
  await page.getByLabel('选择封面').setInputFiles(pngFile('cover-source.png', 160, 90, [31, 112, 180, 255]))
  await expect(page.getByRole('dialog', { name: '裁剪封面' })).toBeVisible()
  await page.getByRole('button', { name: '使用此封面' }).click()
  await expect(page.getByRole('dialog', { name: '裁剪封面' })).toHaveCount(0)
  await expect(page.getByLabel('当前封面')).toContainText('封面')
  if (browserName === 'webkit') {
    expect(await page.evaluate(() => (window as Window & { __nativeWebpAttempts?: number }).__nativeWebpAttempts)).toBeGreaterThan(0)
  }

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '备份草稿' }).click()
  const coverBytes = await readZipEntry(await downloadPromise, 'production-csp-webp-fallback/images/cover.webp')
  expect(coverBytes.byteLength).toBeGreaterThan(12)
  expect(isWebp(coverBytes)).toBe(true)
  expect(response?.headers()['content-security-policy']).toBe(EXPECTED_CSP)
})
