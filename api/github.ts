import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleGithubRequest } from '../server/github/handler.js'

// Node handler works with Vercel's Vite integration and the local Vite bridge.
export default async function handler(request: IncomingMessage & { body?: unknown }, response: ServerResponse) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  }
  const host = request.headers.host || 'localhost'
  const protocol = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http:' : 'https:'
  let body: string | undefined
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (request.body !== undefined) body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
    else {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.length
        if (size > 3 * 1024 * 1024) { response.writeHead(413, { 'Cache-Control': 'no-store' }); response.end(); return }
        chunks.push(buffer)
      }
      body = Buffer.concat(chunks).toString('utf8')
    }
  }
  const result = await handleGithubRequest(new Request(new URL(request.url || '/', `${protocol}//${host}`), { method: request.method, headers, body }))
  response.statusCode = result.status
  result.headers.forEach((value, name) => { if (name !== 'set-cookie') response.setHeader(name, value) })
  const cookies = result.headers.getSetCookie()
  if (cookies.length) response.setHeader('Set-Cookie', cookies)
  response.end(Buffer.from(await result.arrayBuffer()))
}
