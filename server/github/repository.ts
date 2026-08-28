import { createHash } from 'node:crypto'
import { assertSafeImageName } from '../../src/bundles/media-validation.js'
import { validateDecodedImage } from './image-validation.js'
import { assertPublishableArticle } from '../../src/metadata/article.js'
import { parseArticle } from '../../src/metadata/frontmatter.js'
import { validateMediaReferences } from '../../src/media/references.js'
import { GITHUB_IMAGE_COUNT, GITHUB_IMAGE_LIMIT, GITHUB_SOURCE_LIMIT, type GithubArticle, type GithubDeleteInput, type GithubSaveInput, type GithubSaveResult } from '../../src/github/contracts.js'
import { encodePath, repositoryApi, type GithubClient } from './client.js'
import { assertArticlePath, assertRef, assertSha, GithubError, seal, unseal, type GithubConfig } from './security.js'

interface TreeEntry { path: string; mode: string; type: string; sha: string; size?: number }
interface TreeChange { path: string; mode: string; type: string; content?: string; sha?: string | null }
interface Commit { sha: string; tree: { sha: string }; message: string }
interface UploadTicket { path: string; name: string; sha: string; userId: number }

const writeResult = (config: GithubConfig, commit: string): GithubSaveResult => ({ ref: config.branch, commit, url: `https://github.com/${config.repository}/commit/${commit}` })

async function commitArticleTree(config: GithubConfig, client: GithubClient, commit: Commit, tree: TreeChange[], message: string): Promise<GithubSaveResult> {
  const nextTree = await client<{ sha: string }>(`${repositoryApi(config)}/git/trees`, 'POST', { base_tree: commit.tree.sha, tree })
  if (nextTree.sha === commit.tree.sha) throw new GithubError(400, '文章和图片没有变化，无需创建提交')
  const nextCommit = await client<{ sha: string }>(`${repositoryApi(config)}/git/commits`, 'POST', {
    message, tree: nextTree.sha, parents: [commit.sha],
  })
  try {
    await client(`${repositoryApi(config)}/git/refs/heads/${encodePath(config.branch)}`, 'PATCH', { sha: nextCommit.sha, force: false })
  } catch (cause) {
    if (cause instanceof GithubError && (cause.status === 409 || cause.status === 422)) {
      throw new GithubError(409, '主分支已更新或受分支规则保护，未强制覆盖；草稿仍保留，请检查 GitHub 后重试')
    }
    throw cause
  }
  return writeResult(config, nextCommit.sha)
}

export async function head(config: GithubConfig, client: GithubClient, ref: string): Promise<string> {
  assertRef(config, ref)
  const result = await client<{ object: { sha: string } }>(`${repositoryApi(config)}/git/ref/heads/${encodePath(ref)}`)
  return result.object.sha
}

async function snapshot(config: GithubConfig, client: GithubClient, sha: string) {
  assertSha(sha)
  const commit = await client<Commit>(`${repositoryApi(config)}/git/commits/${sha}`)
  const tree = await client<{ tree: TreeEntry[]; truncated: boolean }>(`${repositoryApi(config)}/git/trees/${commit.tree.sha}?recursive=1`)
  if (tree.truncated) throw new GithubError(413, '仓库目录过大，无法完整校验，已停止读取和写入')
  return { commit, entries: tree.tree }
}

function bundleImages(path: string, entries: TreeEntry[]) {
  const prefix = `${path.slice(0, -'index.md'.length)}images/`
  return entries.filter((entry) => {
    if (!entry.path.startsWith(prefix) || entry.type === 'tree') return false
    const name = entry.path.slice(prefix.length)
    try { assertSafeImageName(name) } catch { return false }
    if (entry.mode !== '100644' || entry.type !== 'blob') throw new GithubError(400, '文章包包含非常规图片文件，已停止操作')
    return true
  }).map((entry) => ({ name: entry.path.slice(prefix.length), sha: entry.sha, size: entry.size ?? 0 }))
}

async function readBlob(config: GithubConfig, client: GithubClient, sha: string, limit: number) {
  const blob = await client<{ encoding: string; content: string; size: number }>(`${repositoryApi(config)}/git/blobs/${sha}`)
  if (blob.encoding !== 'base64' || blob.size > limit) throw new GithubError(413, '文件超过 GitHub 编辑模式的大小限制，请使用本地导入')
  const bytes = Buffer.from(blob.content, 'base64')
  if (bytes.length > limit) throw new GithubError(413, '文件超过 GitHub 编辑模式的大小限制')
  return bytes
}

export async function listArticles(config: GithubConfig, client: GithubClient) {
  const sha = await head(config, client, config.branch)
  const { entries } = await snapshot(config, client, sha)
  const articles = entries.filter((entry) => {
    if (entry.type !== 'blob' || entry.mode !== '100644') return false
    try { assertArticlePath(config, entry.path); return true } catch { return false }
  }).map(({ path }) => ({ path, slug: path.split('/').at(-2)! }))
  return { commit: sha, articles }
}

export async function readArticle(config: GithubConfig, client: GithubClient, path: string, ref: string): Promise<GithubArticle> {
  assertArticlePath(config, path)
  const sha = await head(config, client, ref)
  const { entries } = await snapshot(config, client, sha)
  const entry = entries.find((candidate) => candidate.path === path)
  if (!entry || entry.type !== 'blob' || entry.mode !== '100644') throw new GithubError(404, '文章不存在或不是普通 Markdown 文件')
  if ((entry.size ?? 0) > GITHUB_SOURCE_LIMIT) throw new GithubError(413, '文章超过 512 KiB，请使用本地导入')
  const images = bundleImages(path, entries)
  if (images.length > GITHUB_IMAGE_COUNT || images.some((image) => image.size > GITHUB_IMAGE_LIMIT)) {
    throw new GithubError(413, 'GitHub 编辑模式最多支持 50 张图片、每张 2 MiB；未修改仓库，请使用本地导入处理大文件')
  }
  return { path, ref, commit: sha, source: (await readBlob(config, client, entry.sha, GITHUB_SOURCE_LIMIT)).toString('utf8'), images }
}

export async function readImage(config: GithubConfig, client: GithubClient, path: string, ref: string, commit: string, name: string) {
  assertArticlePath(config, path)
  assertSha(commit)
  assertSafeImageName(name)
  // Do not expose a generic Git blob reader. Resolve the name inside the allowed bundle.
  if (await head(config, client, ref) !== commit) throw new GithubError(409, '读取期间远端已更新，请重新打开文章')
  const { entries } = await snapshot(config, client, commit)
  const image = bundleImages(path, entries).find((item) => item.name === name)
  if (!image) throw new GithubError(404, '图片不在当前文章包中')
  const bytes = await readBlob(config, client, image.sha, GITHUB_IMAGE_LIMIT)
  return { bytes, mime: await validateDecodedImage(name, bytes) }
}

export async function uploadImage(config: GithubConfig, client: GithubClient, input: Record<string, unknown>) {
  assertArticlePath(config, input.path)
  if (typeof input.name !== 'string' || typeof input.base64 !== 'string' || input.base64.length > Math.ceil(GITHUB_IMAGE_LIMIT / 3) * 4
    || input.base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(input.base64)) {
    throw new GithubError(400, '图片上传内容无效或超过 2 MiB')
  }
  const bytes = Buffer.from(input.base64, 'base64')
  if (bytes.length > GITHUB_IMAGE_LIMIT || bytes.toString('base64') !== input.base64) throw new GithubError(400, '图片编码无效或超过 2 MiB')
  await validateDecodedImage(input.name, bytes)
  const { sha } = await client<{ sha: string }>(`${repositoryApi(config)}/git/blobs`, 'POST', { encoding: 'base64', content: input.base64 })
  return { sha, ticket: seal(config, 'upload', { path: input.path, name: input.name, sha, userId: config.userId } satisfies UploadTicket) }
}

function validateSave(config: GithubConfig, input: GithubSaveInput) {
  // Old cached PR clients must never silently publish directly to the main branch.
  if (input.mode !== 'direct') throw new GithubError(400, '请刷新 Studio 后重新确认直接推送')
  if (input.ref !== config.branch) throw new GithubError(400, '只能推送到配置的主分支，请从作品页重新读取文章')
  assertArticlePath(config, input.path)
  assertRef(config, input.ref)
  assertSha(input.commit)
  if (typeof input.create !== 'boolean' || typeof input.requestId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.requestId)
    || typeof input.source !== 'string' || Buffer.byteLength(input.source) > GITHUB_SOURCE_LIMIT
    || !Array.isArray(input.images) || input.images.length > GITHUB_IMAGE_COUNT) throw new GithubError(400, '提交内容格式或大小无效')
  const names = new Set<string>()
  for (const image of input.images) {
    if (!image || typeof image.name !== 'string') throw new GithubError(400, '图片清单无效')
    assertSafeImageName(image.name)
    assertSha(image.sha)
    if (names.has(image.name)) throw new GithubError(400, '图片名称重复')
    names.add(image.name)
  }
  const article = parseArticle(input.source)
  const slug = input.path.split('/').at(-2)!
  if (article.meta.slug && article.meta.slug !== slug) throw new GithubError(400, '文章 Slug 或封面路径与仓库目录不一致')
  try {
    assertPublishableArticle({ ...article.meta, slug }, article.body)
  } catch (cause) {
    throw new GithubError(400, cause instanceof Error ? cause.message : '文章发布格式无效')
  }
  if (Boolean(article.coverPath) !== names.has('cover.webp')) throw new GithubError(400, '封面引用与图片清单不一致')
  const references = validateMediaReferences(article.body, input.images.map((image) => ({ name: image.name, kind: image.name === 'cover.webp' ? 'cover' : 'body' })))
  if (references.missing.length) throw new GithubError(400, `文章缺少图片：${references.missing.join('、')}`)
  return article.meta.title
}

export async function saveArticle(config: GithubConfig, client: GithubClient, input: GithubSaveInput): Promise<GithubSaveResult> {
  const title = validateSave(config, input)
  const target = config.branch
  const fingerprint = createHash('sha256').update(JSON.stringify({ path: input.path, source: input.source, images: input.images.map(({ name, sha }) => ({ name, sha })) })).digest('hex')
  const marker = `ipost-request:${input.requestId}:${fingerprint}`
  const targetHead = await head(config, client, target)
  // Recover a completed push after a lost response without creating a second commit.
  if (targetHead !== input.commit) {
    const targetCommit = await client<Commit>(`${repositoryApi(config)}/git/commits/${targetHead}`)
    if (targetCommit?.message.split('\n').at(-1) === marker) return writeResult(config, targetHead)
    throw new GithubError(409, '远端已有新提交，已停止推送；本地修改仍保留，请先备份并重新读取远端版本')
  }
  const { commit, entries } = await snapshot(config, client, input.commit)
  const original = entries.find((entry) => entry.path === input.path)
  if (input.create && original) throw new GithubError(409, '仓库中已有同名文章，请先读取后编辑，不能作为新文章覆盖')
  if (!input.create && !original) throw new GithubError(409, '原文章已不存在，请重新读取仓库')
  if (original && (original.type !== 'blob' || original.mode !== '100644')) throw new GithubError(400, '不能覆盖非常规文件')
  // Existing bundle ancestors must be trees, never symlinks or files.
  for (const entry of entries) {
    if (input.path.startsWith(`${entry.path}/`) && entry.type !== 'tree') throw new GithubError(400, '文章目录包含非目录节点')
    if (`${input.path.slice(0, -'index.md'.length)}images/`.startsWith(`${entry.path}/`) && entry.type !== 'tree') throw new GithubError(400, '图片目录包含非目录节点')
  }
  const oldImages = bundleImages(input.path, entries)
  const prefix = input.path.slice(0, -'index.md'.length)
  const tree: TreeChange[] = [
    { path: input.path, mode: '100644', type: 'blob', content: input.source },
  ]
  for (const image of input.images) {
    const old = oldImages.find((item) => item.name === image.name)
    if (old?.sha === image.sha) continue
    const proof = unseal<UploadTicket>(config, 'upload', image.ticket)
    if (!proof || proof.path !== input.path || proof.name !== image.name || proof.sha !== image.sha || proof.userId !== config.userId) {
      throw new GithubError(400, '图片上传凭据无效或过期，请重新提交')
    }
    tree.push({ path: `${prefix}images/${image.name}`, mode: '100644', type: 'blob', sha: image.sha })
  }
  for (const image of oldImages) {
    if (!input.images.some((item) => item.name === image.name)) tree.push({ path: `${prefix}images/${image.name}`, mode: '100644', type: 'blob', sha: null })
  }
  return commitArticleTree(config, client, commit, tree, `Edit article: ${title.slice(0, 120)}\n\n${marker}`)
}

export async function deleteArticle(config: GithubConfig, client: GithubClient, input: GithubDeleteInput): Promise<GithubSaveResult> {
  assertArticlePath(config, input.path)
  if (input.ref !== config.branch) throw new GithubError(400, '只能删除配置的主分支中的作品')
  assertSha(input.commit)
  if (typeof input.requestId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.requestId)) {
    throw new GithubError(400, '删除请求格式无效')
  }
  const fingerprint = createHash('sha256').update(JSON.stringify({ path: input.path, commit: input.commit })).digest('hex')
  const marker = `ipost-delete:${input.requestId}:${fingerprint}`
  const targetHead = await head(config, client, config.branch)
  if (targetHead !== input.commit) {
    const targetCommit = await client<Commit>(`${repositoryApi(config)}/git/commits/${targetHead}`)
    // A lost response may be retried, but never delete a newer/restored article.
    if (targetCommit?.message.split('\n').at(-1) === marker) return writeResult(config, targetHead)
    throw new GithubError(409, '远端已有新提交，已停止删除；请取消并刷新作品后重新确认')
  }
  const { commit, entries } = await snapshot(config, client, input.commit)
  const original = entries.find((entry) => entry.path === input.path)
  if (!original || original.type !== 'blob' || original.mode !== '100644') throw new GithubError(404, '文章已不存在或不是普通 Markdown 文件，请刷新作品')
  const bundle = input.path.slice(0, -'/index.md'.length)
  const directory = entries.find((entry) => entry.path === bundle)
  if (!directory || directory.type !== 'tree' || directory.mode !== '040000'
    || entries.some((entry) => bundle.startsWith(`${entry.path}/`) && (entry.type !== 'tree' || entry.mode !== '040000'))) {
    throw new GithubError(400, '文章目录包含非目录节点，已停止删除')
  }
  // Delete the bundle as one tree entry. base_tree preserves every other article.
  return commitArticleTree(config, client, commit, [{ path: bundle, mode: '040000', type: 'tree', sha: null }], `Delete article: ${bundle.split('/').at(-1)}\n\n${marker}`)
}
