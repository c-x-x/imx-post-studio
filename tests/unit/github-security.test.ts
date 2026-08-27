import { describe, expect, it, vi } from 'vitest'
import { handleGithubRequest } from '../../server/github/handler'
import { assertArticlePath, assertRef, cookie, readConfig, seal, unseal } from '../../server/github/security'

const env = {
  GITHUB_ENABLED: 'true', GITHUB_SITE_ORIGIN: 'https://studio.example.com', GITHUB_REPOSITORY: 'owner/blog',
  GITHUB_ALLOWED_USER_ID: '123', GITHUB_CLIENT_ID: 'Iv1.test', GITHUB_CLIENT_SECRET: 'test-secret-not-real', GITHUB_SESSION_SECRET: 'a1'.repeat(32),
}
const config = readConfig(env)!
const sessionCookie = () => cookie(config, 'session', seal(config, 'session', { token: 'ghu_test_only', userId: 123, login: 'owner', csrf: 'test-csrf' }), 3600).split(';')[0]

describe('GitHub backend security boundaries', () => {
  it('is disabled without explicit configuration and makes no external requests', async () => {
    const fetcher = vi.fn()
    const response = await handleGithubRequest(new Request('https://studio.example.com/api/github/session'), {}, fetcher)
    expect(await response.json()).toEqual({ configured: false })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects incomplete / unsafe configuration', () => {
    expect(() => readConfig({ GITHUB_ENABLED: 'true' })).toThrow()
    expect(() => readConfig({ ...env, GITHUB_SITE_ORIGIN: 'http://public.example.com' })).toThrow()
    expect(() => readConfig({ ...env, GITHUB_CONTENT_ROOT: '.github/workflows' })).toThrow()
  })
  it('seals sessions with expiry, authentication and purpose separation', () => {
    const token = seal(config, 'session', { secret: 'never-visible' })
    expect(token).not.toContain('never-visible')
    expect(unseal(config, 'session', token)).toEqual({ secret: 'never-visible' })
    expect(unseal(config, 'state', token)).toBeUndefined()
    expect(unseal(config, 'session', token.slice(0, -4) + 'AAAA')).toBeUndefined()
    expect(unseal(config, 'session', seal(config, 'session', {}, -1))).toBeUndefined()
  })
  it.each(['.github/workflows/run.yml', 'content/posts/../secret/index.md', 'content/posts/a/images/a.png', 'content/posts/a%2fb/index.md', 'content/posts/a\\b/index.md', 'content/posts/a/index.md/extra'])('rejects out-of-scope path %s', (path) => {
    expect(() => assertArticlePath(config, path)).toThrow()
  })
  it('permits only the base branch and this owner’s editor branches', () => {
    expect(() => assertArticlePath(config, 'content/posts/hello-world/index.md')).not.toThrow()
    expect(() => assertRef(config, 'main')).not.toThrow()
    expect(() => assertRef(config, 'other')).toThrow()
    expect(() => assertRef(config, `ipost/456-${crypto.randomUUID()}`)).toThrow()
  })
  it('does not disclose tokens or secrets in session responses', async () => {
    const response = await handleGithubRequest(new Request(`${config.origin}/api/github/session`, { headers: { cookie: sessionCookie() } }), env)
    const text = await response.text()
    expect(text).toContain('test-csrf')
    expect(text).not.toContain('ghu_test_only')
    expect(text).not.toContain(env.GITHUB_CLIENT_SECRET)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
  it('rejects anonymous access and forged cross-origin mutations before GitHub is called', async () => {
    const fetcher = vi.fn()
    const anonymous = await handleGithubRequest(new Request(`${config.origin}/api/github/list`), env, fetcher)
    expect(anonymous.status).toBe(401)
    for (const action of ['save', 'delete']) {
      const url = `${config.origin}/api/github/${action}`
      expect((await handleGithubRequest(new Request(url), env, fetcher)).status).toBe(405)
      for (const [headers, status] of [
        [{}, 401],
        [{ cookie: sessionCookie(), origin: 'https://evil.example', 'x-ipost-csrf': 'test-csrf' }, 403],
        [{ cookie: sessionCookie(), origin: config.origin }, 403],
      ] as const) {
        const denied = await handleGithubRequest(new Request(url, { method: 'POST', headers, body: '{}' }), env, fetcher)
        expect(denied.status).toBe(status)
      }
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('uses OAuth state + PKCE and rejects a forged callback without token exchange', async () => {
    const login = await handleGithubRequest(new Request(`${config.origin}/api/github/login`), env)
    const location = new URL(login.headers.get('location')!)
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('redirect_uri')).toBe(`${config.origin}/api/github/callback`)
    expect(login.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax; Max-Age=600; Secure/)
    const fetcher = vi.fn()
    const callback = await handleGithubRequest(new Request(`${config.origin}/api/github/callback?code=forged&state=wrong`), env, fetcher)
    expect(callback.headers.get('location')).toBe(`${config.origin}/?github=error`)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('checks immutable GitHub user ID, not a client-provided username', async () => {
    const state = cookie(config, 'state', seal(config, 'state', { state: 'valid-state', verifier: 'valid-verifier' }), 600).split(';')[0]
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/access_token')) return Response.json({ access_token: 'ghu_test', expires_in: 28800, scope: '' })
      if (String(url).endsWith('/user')) return Response.json({ id: 999, login: 'owner' })
      return new Response(null, { status: 204 })
    })
    const callback = await handleGithubRequest(new Request(`${config.origin}/api/github/callback?code=valid&state=valid-state`, { headers: { cookie: state } }), env, fetcher)
    expect(callback.headers.get('location')).toContain('github=error')
    expect(callback.headers.getSetCookie().some((value) => value.includes('Max-Age=3600'))).toBe(false)
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/applications/'))).toBe(true)
  })
  it('completes allowed OAuth login with an encrypted one-hour session', async () => {
    const state = cookie(config, 'state', seal(config, 'state', { state: 'valid-state', verifier: 'valid-verifier' }), 600).split(';')[0]
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/access_token')) return Response.json({ access_token: 'ghu_test', expires_in: 28800, scope: '' })
      if (String(url).endsWith('/user')) return Response.json({ id: 123, login: 'owner' })
      return Response.json({ permissions: { push: true } })
    })
    const callback = await handleGithubRequest(new Request(`${config.origin}/api/github/callback?code=valid&state=valid-state`, { headers: { cookie: state } }), env, fetcher)
    expect(callback.headers.get('location')).toContain('github=connected')
    const session = callback.headers.getSetCookie().find((value) => value.startsWith('__Host-ipost-github-session='))!
    expect(session).toContain('Max-Age=3600; Secure')
    expect(session).not.toContain('ghu_test')
    const response = await handleGithubRequest(new Request(`${config.origin}/api/github/session`, { headers: { cookie: session.split(';')[0] } }), env, fetcher)
    expect(await response.json()).toMatchObject({ user: { id: 123, login: 'owner' }, repository: { name: 'owner/blog' } })
  })
})
