import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface Header {
  key: string
  value: string
}

interface VercelConfig {
  framework?: string
  outputDirectory?: string
  rewrites?: Array<{ source: string; destination: string }>
  headers?: Array<{ source: string; headers: Header[] }>
}

async function readVercelConfig(): Promise<VercelConfig> {
  return JSON.parse(await readFile(resolve(process.cwd(), 'vercel.json'), 'utf8')) as VercelConfig
}

function globalHeaders(config: VercelConfig): Header[] {
  const rule = config.headers?.find(({ source }) => source === '/(.*)')
  expect(rule).toBeDefined()
  return rule?.headers ?? []
}

function valueOf(headers: Header[], key: string): string | undefined {
  return headers.find((header) => header.key === key)?.value
}

describe('Vercel static delivery configuration', () => {
  it('serves the Vite build as an SPA', async () => {
    const config = await readVercelConfig()

    expect(config.framework).toBe('vite')
    expect(config.outputDirectory).toBe('dist')
    expect(config.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' })
  })

  it('applies the required global browser security policy', async () => {
    const headers = globalHeaders(await readVercelConfig())
    const csp = valueOf(headers, 'Content-Security-Policy')

    expect(csp).toBe("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'")
    expect(csp).toContain("img-src 'self' blob: data:")
    expect(csp).toContain("frame-src 'self' blob:")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(valueOf(headers, 'X-Content-Type-Options')).toBe('nosniff')
    expect(valueOf(headers, 'Referrer-Policy')).toBe('no-referrer')
    expect(valueOf(headers, 'Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  })
})
