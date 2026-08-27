import type { GithubArticle, GithubSaveResult, GithubSession } from './contracts'
import type { PreparedGithubSave } from './article-adapter'

export class GithubApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function request<T>(action: string, query: Record<string, string> = {}, body?: unknown, csrf?: string): Promise<T> {
  const response = await fetch(`/api/github/${action}?${new URLSearchParams(query)}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Ipost-Csrf': csrf || '' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('GitHub 后端尚未部署；本地写作不受影响')
  const result = await response.json()
  if (!response.ok) throw new GithubApiError(response.status, result.error || 'GitHub 请求失败')
  return result as T
}

export const githubApi = {
  session: () => request<GithubSession>('session'),
  list: () => request<{ commit: string; articles: { path: string; slug: string }[] }>('list'),
  article: (path: string, ref?: string) => request<GithubArticle>('article', { path, ...(ref ? { ref } : {}) }),
  logout: (csrf: string) => request<{ warning?: string }>('logout', {}, {}, csrf),
  async image(article: GithubArticle, name: string): Promise<Blob> {
    const response = await fetch(`/api/github/media?${new URLSearchParams({ path: article.path, ref: article.ref, commit: article.commit, name })}`, { credentials: 'same-origin' })
    if (!response.ok) throw new GithubApiError(response.status, (await response.json()).error || '读取图片失败')
    return response.blob()
  },
  async save(prepared: PreparedGithubSave, csrf: string, onProgress: (message: string) => void): Promise<GithubSaveResult> {
    for (const asset of prepared.uploads) {
      const image = prepared.input.images.find((item) => item.name === asset.name)!
      // Re-upload on retry so a timed-out or expired ticket never blocks recovery.
      onProgress(`正在上传图片：${asset.name}`)
      const bytes = new Uint8Array(await asset.blob.arrayBuffer())
      let binary = ''
      for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
      const uploaded = await request<{ sha: string; ticket: string }>('upload', {}, { path: prepared.input.path, name: asset.name, base64: btoa(binary) }, csrf)
      if (uploaded.sha !== image.sha) throw new Error('图片上传校验失败，已停止提交')
      image.ticket = uploaded.ticket
    }
    onProgress('正在推送到主分支…')
    return request<GithubSaveResult>('save', {}, prepared.input, csrf)
  },
}
