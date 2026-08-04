import type { ArticleMeta } from '../metadata/article'
import type { RenderedMarkdown } from './markdown'
import type { TocItem } from './toc'

export interface PreviewDocumentInput {
  meta: ArticleMeta
  rendered: RenderedMarkdown
  css: string
  theme: 'light' | 'dark'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

function safeCss(value: string): string {
  return value.replace(/<\/style/gi, '<\\/style')
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[1]}年${match[2]}月${match[3]}日` : value
}

function tocList(items: TocItem[]): string {
  if (items.length === 0) return ''
  return `<ul>${items.map((item) => `<li><a href="#${escapeHtml(item.id)}">${escapeHtml(item.text)}</a>${tocList(item.children)}</li>`).join('')}</ul>`
}

const symbols = `<svg aria-hidden="true" class="preview-symbols" style="display:none"><symbol id="icon-calendar" viewBox="0 0 24 24"><path d="M6 2v4m12-4v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="2"/></symbol><symbol id="icon-folder" viewBox="0 0 24 24"><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" fill="none" stroke="currentColor" stroke-width="2"/></symbol><symbol id="icon-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2"/></symbol><symbol id="icon-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2"/></symbol></svg>`
const previewAccessibilityCss = ':root[data-theme="light"] .article-page { --article-ink-muted: #746c62; }'
const previewMobileTocCss = '@media (max-width: 768px) { .article-page .article-tools { position: static; width: 100%; min-width: 0; max-width: none; max-height: none; margin-top: 1.5rem; overflow: visible; pointer-events: auto; z-index: auto; } .article-page .sidebar { max-height: none; overflow: visible; } .article-page .toc { max-height: none; overflow: visible; padding: 1rem; border: 1px solid var(--article-soft-line); border-radius: 12px; background: var(--color-bg-card); } .article-page .toc > nav > ul > li:last-child, .article-page .article-tools.has-comments .toc > nav > ul > li:nth-last-child(-n + 2) { padding-right: 0; } }'

export function buildPreviewDocument({ meta, rendered, css, theme }: PreviewDocumentInput): string {
  const categories = meta.categories.map((category) => `<span>${escapeHtml(category)}</span>`).join('')
  const tags = meta.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')
  const toc = meta.toc && rendered.toc.length > 0
    ? `<div class="article-tools"><aside class="sidebar active" id="article-toc" aria-label="文章目录"><div class="toc"><h3 class="toc-title">目录</h3><nav aria-label="文章目录">${tocList(rendered.toc)}</nav></div></aside></div>`
    : ''

  return `<!doctype html><html lang="zh-CN" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${safeCss(css)}</style><style>${previewAccessibilityCss}</style><style>${previewMobileTocCss}</style></head><body class="is-article-page">${symbols}<article class="article-page${toc ? '' : ' article-page-no-toc'}"><header class="article-header"><h1 class="article-title">${escapeHtml(meta.title)}</h1><div class="article-meta"><span><svg width="18" height="18"><use href="#icon-calendar"></use></svg> 发布于 ${escapeHtml(formatDate(meta.date))}</span>${categories ? `<span><svg width="18" height="18"><use href="#icon-folder"></use></svg>${categories}</span>` : ''}<span><svg width="18" height="18"><use href="#icon-clock"></use></svg> 阅读时长 ${rendered.readingMinutes} 分钟</span><span>${rendered.wordCount} 字</span></div>${tags ? `<div class="post-card-tags article-tags">${tags}</div>` : ''}</header><div class="layout-with-sidebar"><div class="main-content"><div class="article-content">${rendered.html}</div></div>${toc}</div></article></body></html>`
}
