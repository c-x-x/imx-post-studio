import { createHash, randomBytes } from 'node:crypto'
import { githubClient, repositoryApi, type Fetcher } from './client.js'
import { deleteArticle, listArticles, readArticle, readImage, saveArticle, uploadImage } from './repository.js'
import { assertMutation, cookie, cookieName, equalSecret, GithubError, readConfig, readCookie, seal, sessionFor, unseal, type GithubConfig, type LoginSession } from './security.js'
import type { GithubDeleteInput, GithubSaveInput } from '../../src/github/contracts.js'

const responseHeaders = { 'Cache-Control': 'no-store, private', 'Vary': 'Cookie, Origin', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: responseHeaders })
const redirect = (location: string) => new Response(null, { status: 303, headers: { ...responseHeaders, Location: location } })
const callbackUrl = (config: GithubConfig) => `${config.origin}/api/github/callback`

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new GithubError(415, '仅接受 JSON 请求')
  const max = 3 * 1024 * 1024
  if (Number(request.headers.get('content-length')) > max) throw new GithubError(413, '请求过大')
  const reader = request.body?.getReader()
  if (!reader) throw new GithubError(400, '请求内容为空')
  let size = 0
  const chunks: Uint8Array[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.length
    if (size > max) { await reader.cancel(); throw new GithubError(413, '请求过大') }
    chunks.push(value)
  }
  try {
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
    return data as Record<string, unknown>
  } catch { throw new GithubError(400, 'JSON 内容无效') }
}

async function revoke(config: GithubConfig, token: string, fetcher: Fetcher) {
  const response = await fetcher(`https://api.github.com/applications/${encodeURIComponent(config.clientId)}/token`, {
    method: 'DELETE',
    headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token }), redirect: 'error', signal: AbortSignal.timeout(10000),
  })
  if (!response.ok && response.status !== 404) throw new GithubError(502, '会话已关闭，但 GitHub 令牌撤销失败；可在 GitHub Settings → Applications 中手动撤销')
}

export async function handleGithubRequest(request: Request, env = process.env, fetcher: Fetcher = fetch): Promise<Response> {
  let config: GithubConfig | undefined
  let action = ''
  try {
    const url = new URL(request.url)
    action = url.searchParams.get('action') || url.pathname.split('/').at(-1) || ''
    config = readConfig(env)
    if (!config) return action === 'session' ? json({ configured: false }) : json({ error: 'GitHub 功能尚未启用' }, 503)
    if (url.origin !== config.origin) throw new GithubError(403, '此域名未启用 GitHub 后台')
    const method = request.method
    const expectedMethods: Record<string, string> = { session: 'GET', login: 'GET', callback: 'GET', logout: 'POST', list: 'GET', article: 'GET', media: 'GET', upload: 'POST', save: 'POST', delete: 'POST' }
    if (!expectedMethods[action]) throw new GithubError(404, '接口不存在')
    if (method !== expectedMethods[action]) throw new GithubError(405, '请求方法不允许')
    const session = sessionFor(config, request)

    if (action === 'session') {
      return json({ configured: true, repository: { name: config.repository, branch: config.branch, contentRoot: config.contentRoot },
        ...(session ? { user: { id: session.userId, login: session.login }, csrf: session.csrf } : {}),
      })
    }
    if (action === 'login') {
      const state = randomBytes(24).toString('base64url')
      const verifier = randomBytes(32).toString('base64url')
      const authorize = new URL('https://github.com/login/oauth/authorize')
      authorize.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: callbackUrl(config), state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', allow_signup: 'false' }).toString()
      const response = redirect(authorize.href)
      response.headers.append('Set-Cookie', cookie(config, 'state', seal(config, 'state', { state, verifier }, 600), 600))
      return response
    }
    if (action === 'callback') {
      const saved = unseal<{ state: string; verifier: string }>(config, 'state', readCookie(request, cookieName(config, 'state')))
      const code = url.searchParams.get('code')
      if (!saved || !code || code.length > 500 || !equalSecret(saved.state, url.searchParams.get('state') || '')) throw new GithubError(403, '登录校验失效，请重新登录')
      const exchanged = await fetcher('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code, code_verifier: saved.verifier, redirect_uri: callbackUrl(config) }),
        redirect: 'error', signal: AbortSignal.timeout(15000),
      })
      if (!exchanged.ok) throw new GithubError(502, 'GitHub 登录交换失败')
      const token = await exchanged.json() as { access_token?: string; expires_in?: number; scope?: string; error?: string }
      if (token.error || !token.access_token || token.scope) throw new GithubError(403, '请使用 GitHub App 登录，不支持传统 OAuth App 或个人令牌')
      const client = githubClient(token.access_token, fetcher)
      const user = await client<{ id: number; login: string }>('/user')
      if (user.id !== config.userId) {
        await revoke(config, token.access_token, fetcher).catch(() => undefined)
        throw new GithubError(403, '此后台仅允许指定账号使用')
      }
      const repository = await client<{ permissions?: { push?: boolean } }>(repositoryApi(config))
      if (!repository.permissions?.push) throw new GithubError(403, '当前 App 或账号没有指定仓库的写入权限')
      const lifetime = Math.min(3600, token.expires_in || 3600)
      const value: LoginSession = { token: token.access_token, userId: user.id, login: user.login, csrf: randomBytes(24).toString('base64url') }
      const response = redirect(`${config.origin}/?github=connected`)
      response.headers.append('Set-Cookie', cookie(config, 'state', '', 0))
      response.headers.append('Set-Cookie', cookie(config, 'session', seal(config, 'session', value, lifetime), lifetime))
      return response
    }
    if (!session) throw new GithubError(401, '请先使用 GitHub 登录')
    if (method === 'POST') assertMutation(config, request, session)
    if (action === 'logout') {
      let warning: string | undefined
      try { await revoke(config, session.token, fetcher) } catch { warning = '会话已关闭；远端令牌撤销未确认，可在 GitHub Applications 中手动撤销。' }
      const response = json({ ok: true, warning })
      response.headers.append('Set-Cookie', cookie(config, 'session', '', 0))
      return response
    }
    const client = githubClient(session.token, fetcher)
    const path = url.searchParams.get('path') || ''
    const ref = url.searchParams.get('ref') || config.branch
    if (action === 'list') return json(await listArticles(config, client))
    if (action === 'article') return json(await readArticle(config, client, path, ref))
    if (action === 'media') {
      const image = await readImage(config, client, path, ref, url.searchParams.get('commit') || '', url.searchParams.get('name') || '')
      return new Response(new Uint8Array(image.bytes), { headers: { ...responseHeaders, 'Content-Type': image.mime, 'Content-Disposition': 'attachment' } })
    }
    const input = await readBody(request)
    if (action === 'upload') return json(await uploadImage(config, client, input))
    if (action === 'delete') return json(await deleteArticle(config, client, input as unknown as GithubDeleteInput))
    return json(await saveArticle(config, client, input as unknown as GithubSaveInput))
  } catch (error) {
    if (action === 'callback' && config) {
      const response = redirect(`${config.origin}/?github=error`)
      response.headers.append('Set-Cookie', cookie(config, 'state', '', 0))
      response.headers.append('Set-Cookie', cookie(config, 'session', '', 0))
      return response
    }
    if (error instanceof GithubError) return json({ error: error.message }, error.status)
    // Never serialize upstream errors / request objects: they may contain tokens.
    return json({ error: '操作未完成。请检查文章格式、图片和连接后重试；本地草稿仍保留。' }, 400)
  }
}
