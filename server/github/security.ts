import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

export class GithubError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export interface GithubConfig {
  origin: string
  repository: string
  branch: string
  contentRoot: string
  userId: number
  clientId: string
  clientSecret: string
  secret: Buffer
}

export interface LoginSession {
  token: string
  userId: number
  login: string
  csrf: string
}

export function readConfig(env = process.env): GithubConfig | undefined {
  if (env.GITHUB_ENABLED !== 'true') return undefined
  const required = ['GITHUB_SITE_ORIGIN', 'GITHUB_REPOSITORY', 'GITHUB_ALLOWED_USER_ID', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_SESSION_SECRET']
  if (required.some((key) => !env[key])) throw new GithubError(503, 'GitHub 后端配置不完整，请检查服务端环境变量')
  const origin = new URL(env.GITHUB_SITE_ORIGIN!)
  const local = ['localhost', '127.0.0.1'].includes(origin.hostname)
  if ((origin.protocol !== 'https:' && !(local && origin.protocol === 'http:' && env.VERCEL_ENV !== 'production'))
    || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new GithubError(503, 'GitHub 站点地址配置无效')
  }
  const repository = env.GITHUB_REPOSITORY!
  const contentRoot = env.GITHUB_CONTENT_ROOT || 'content/posts'
  const branch = env.GITHUB_BASE_BRANCH || 'main'
  const userId = Number(env.GITHUB_ALLOWED_USER_ID)
  const secret = Buffer.from(env.GITHUB_SESSION_SECRET!, 'hex')
  if (!/^[\w-]+\/[\w.-]+$/.test(repository) || !/^content(?:\/[a-zA-Z0-9_-]+)+$/.test(contentRoot)
    || !/^[\w.-]+(?:\/[\w.-]+)*$/.test(branch) || branch.includes('..') || branch.startsWith('ipost/')
    || !Number.isSafeInteger(userId) || userId <= 0 || !/^[a-fA-F0-9]{64}$/.test(env.GITHUB_SESSION_SECRET!) || secret.length !== 32) {
    throw new GithubError(503, 'GitHub 仓库、用户或会话密钥配置无效')
  }
  return { origin: origin.origin, repository, branch, contentRoot, userId, clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET!, secret }
}

export function seal(config: GithubConfig, purpose: string, value: unknown, lifetime = 3600): string {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', config.secret, nonce)
  cipher.setAAD(Buffer.from(`${purpose}:${config.origin}:${config.repository}`))
  const payload = JSON.stringify({ exp: Date.now() + lifetime * 1000, value })
  const data = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), data]).toString('base64url')
}

export function unseal<T>(config: GithubConfig, purpose: string, input: string | undefined): T | undefined {
  try {
    if (!input || input.length > 6000) return undefined
    const buffer = Buffer.from(input, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', config.secret, buffer.subarray(0, 12))
    decipher.setAAD(Buffer.from(`${purpose}:${config.origin}:${config.repository}`))
    decipher.setAuthTag(buffer.subarray(12, 28))
    const decoded = JSON.parse(Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8'))
    if (!Number.isFinite(decoded.exp) || decoded.exp <= Date.now()) return undefined
    return decoded.value as T
  } catch { return undefined }
}

export function cookieName(config: GithubConfig, kind: 'session' | 'state'): string {
  return `${config.origin.startsWith('https:') ? '__Host-' : ''}ipost-github-${kind}`
}

export function cookie(config: GithubConfig, kind: 'session' | 'state', value: string, maxAge: number): string {
  return `${cookieName(config, kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.origin.startsWith('https:') ? '; Secure' : ''}`
}

export function readCookie(request: Request, name: string): string | undefined {
  return request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
}

export function sessionFor(config: GithubConfig, request: Request): LoginSession | undefined {
  const session = unseal<LoginSession>(config, 'session', readCookie(request, cookieName(config, 'session')))
  return session?.userId === config.userId && typeof session.token === 'string' && typeof session.csrf === 'string' ? session : undefined
}

export function equalSecret(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function assertMutation(config: GithubConfig, request: Request, session: LoginSession): void {
  if (request.headers.get('origin') !== config.origin
    || !equalSecret(request.headers.get('x-ipost-csrf') || '', session.csrf)) {
    throw new GithubError(403, '请求来源或安全校验无效，请刷新并重新登录')
  }
}

export function assertArticlePath(config: GithubConfig, input: unknown): asserts input is string {
  if (typeof input !== 'string' || input.length > 250 || !input.startsWith(`${config.contentRoot}/`)
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*\/index\.md$/.test(input.slice(config.contentRoot.length + 1))) {
    throw new GithubError(400, '只允许操作配置目录内的 <slug>/index.md 文章包')
  }
}

export function assertRef(config: GithubConfig, value: unknown): asserts value is string {
  if (value !== config.branch && (typeof value !== 'string' || !new RegExp(`^ipost/${config.userId}-[a-f0-9-]{36}$`).test(value))) {
    throw new GithubError(400, '不允许访问此分支')
  }
}

export function assertSha(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) throw new GithubError(400, 'Git 版本标识无效')
}
