import { GithubError, type GithubConfig } from './security.js'

export type Fetcher = typeof fetch

export function githubClient(token: string, fetcher: Fetcher = fetch) {
  return async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetcher(`https://api.github.com${path}`, {
      method,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: 'GitHub 登录已过期，请重新登录',
        403: 'GitHub 权限不足或请求过于频繁，请检查 App 授权后重试',
        404: 'GitHub 资源不存在，或 App 未安装到指定仓库',
        409: '远端版本发生变化，请重新读取后合并修改',
        422: 'GitHub 拒绝了提交，可能存在版本冲突；请刷新远端状态后重试',
      }
      throw new GithubError(response.status, messages[response.status] || 'GitHub 暂时不可用，请稍后重试')
    }
    return response.status === 204 ? undefined as T : await response.json() as T
  }
}

export type GithubClient = ReturnType<typeof githubClient>
export const repositoryApi = (config: GithubConfig) => `/repos/${config.repository}`
export const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')
