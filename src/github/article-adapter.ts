import { parse, stringify } from 'smol-toml'
import { createArticleDraft, assertCompleteArticleMeta, assertPublishableArticle, type ArticleDraft, type ArticleMeta, type MediaAsset } from '../metadata/article'
import { parseArticle, serializeArticle } from '../metadata/frontmatter'
import { assertExportableMedia } from '../bundles/media-validation'
import { validateBrowserImage } from '../media/validate-image'
import { validateMediaReferences } from '../media/references'
import { GITHUB_IMAGE_COUNT, GITHUB_IMAGE_LIMIT, GITHUB_SOURCE_LIMIT, type GithubArticle, type GithubSaveInput, type GithubRepository } from './contracts'
import { DEFAULT_COMMIT_MESSAGE_TEMPLATE, renderCommitMessage } from './commit-message'

export interface GithubOrigin extends GithubArticle {
  repository: string
  pullRequest?: string
}

export async function articleToDraft(article: GithubArticle, loadImage: (name: string) => Promise<Blob>): Promise<ArticleDraft> {
  const parsed = parseArticle(article.source)
  const slug = article.path.split('/').at(-2) || ''
  if (parsed.meta.slug && parsed.meta.slug !== slug) throw new Error('文章 Slug 与所在目录不一致，未打开')
  const media: MediaAsset[] = []
  for (const image of article.images) {
    const blob = await loadImage(image.name)
    const mime = await validateBrowserImage(image.name, new Uint8Array(await blob.arrayBuffer()))
    media.push({ id: crypto.randomUUID(), name: image.name, kind: image.name === 'cover.webp' ? 'cover' : 'body', mime, blob: new Blob([blob], { type: mime }) })
  }
  if (Boolean(parsed.coverPath) !== media.some((asset) => asset.kind === 'cover')) throw new Error('封面文件与 Front Matter 不一致，未打开')
  if (validateMediaReferences(parsed.body, media).missing.length) throw new Error('文章引用了未支持或缺失的本地图片，未打开，请使用原文件编辑')
  const draft = { ...createArticleDraft(), meta: { ...parsed.meta, slug }, body: parsed.body, media }
  assertCompleteArticleMeta(draft.meta)
  return draft
}

export function serializeForGithub(draft: ArticleDraft, origin?: GithubOrigin): string {
  const publishedMeta = { ...draft.meta, draft: false }
  assertPublishableArticle(publishedMeta, draft.body)
  // Pushing is publishing; local draft storage is independent of Hugo's flag.
  if (!origin) return serializeArticle(draft, false)
  if (draft.meta.slug !== origin.path.split('/').at(-2)) throw new Error('已关联文章不能直接改名；请恢复 Slug，或取消仓库关联后另建文章')
  const normalized = origin.source.replace(/\r\n?/g, '\n')
  const match = /^(\+\+\+\n)([\s\S]*?)(\n\+\+\+(?:\n|$))([\s\S]*)$/.exec(normalized)
  if (!match) throw new Error('原始 Front Matter 无效')
  const baseline = parseArticle(origin.source)
  const table = parse(match[2])
  let metaChanged = false
  const keys: (keyof ArticleMeta)[] = ['title', 'date', 'draft', 'categories', 'tags', 'description', 'featured', 'toc']
  for (const key of keys) {
    if (JSON.stringify(publishedMeta[key]) !== JSON.stringify(baseline.meta[key])) {
      table[key] = publishedMeta[key]
      metaChanged = true
    }
  }
  const hasCover = draft.media.some((asset) => asset.kind === 'cover')
  if (hasCover !== Boolean(baseline.coverPath)) {
    if (hasCover) table.image = `/posts/${draft.meta.slug}/images/cover.webp`
    else delete table.image
    metaChanged = true
  }
  // Body-only edits keep the header verbatim. Metadata edits retain all unknown keys.
  return metaChanged ? `+++\n${stringify(table).trimEnd()}\n+++\n${draft.body}` : `${match[1]}${match[2]}${match[3]}${draft.body}`
}

export async function gitBlobSha(blob: Blob): Promise<string> {
  const data = new Uint8Array(await blob.arrayBuffer())
  const prefix = new TextEncoder().encode(`blob ${data.length}\0`)
  const bytes = new Uint8Array(prefix.length + data.length)
  bytes.set(prefix)
  bytes.set(data, prefix.length)
  const digest = await crypto.subtle.digest('SHA-1', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export interface PreparedGithubSave {
  input: GithubSaveInput
  uploads: MediaAsset[]
  deleted: string[]
  origin?: GithubOrigin
}

export async function prepareGithubSave(
  draft: ArticleDraft,
  repository: GithubRepository,
  commit: string,
  origin?: GithubOrigin,
  commitMessageTemplate = DEFAULT_COMMIT_MESSAGE_TEMPLATE,
): Promise<PreparedGithubSave> {
  if (origin && origin.repository !== repository.name) throw new Error('此草稿关联了另一仓库，请取消关联后再提交')
  if (origin && origin.ref !== repository.branch) throw new Error('此草稿来自旧的 PR 分支，请导出备份后从作品页重新读取主分支文章')
  const source = serializeForGithub(draft, origin)
  if (new TextEncoder().encode(source).length > GITHUB_SOURCE_LIMIT) throw new Error('GitHub 模式的文章不能超过 512 KiB')
  if (draft.media.length > GITHUB_IMAGE_COUNT) throw new Error('GitHub 模式最多支持 50 张图片')
  const missing = validateMediaReferences(draft.body, draft.media).missing
  if (missing.length) throw new Error(`缺少图片：${missing.join('、')}`)
  const images: GithubSaveInput['images'] = []
  const uploads: MediaAsset[] = []
  for (const asset of draft.media) {
    if (asset.blob.size > GITHUB_IMAGE_LIMIT) throw new Error(`图片 ${asset.name} 超过 GitHub 模式的 2 MiB 限制；请压缩图片或使用 ZIP 导出`)
    if (images.some((image) => image.name === asset.name)) throw new Error('图片名称重复')
    await assertExportableMedia(asset)
    const sha = await gitBlobSha(asset.blob)
    images.push({ name: asset.name, sha })
    if (!origin?.images.some((image) => image.name === asset.name && image.sha === sha)) uploads.push(asset)
  }
  const deleted = origin?.images.filter((image) => !images.some((current) => current.name === image.name)).map((image) => image.name) ?? []
  if (origin && source === origin.source && !uploads.length && !deleted.length) throw new Error('文章和图片没有变化，无需提交')
  const message = renderCommitMessage(commitMessageTemplate, draft.meta)
  if (!message) throw new Error('GitHub Commit 信息不能为空，请在设置中修改模板')
  return { input: { mode: 'direct', create: !origin, path: origin?.path ?? `${repository.contentRoot}/${draft.meta.slug}/index.md`, ref: repository.branch,
    commit: origin?.commit ?? commit, source, message, images, requestId: crypto.randomUUID() }, uploads, deleted, origin }
}
