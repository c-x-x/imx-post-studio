import { useMemo, useState } from 'react'
import type { ArticleMeta } from '../metadata/article'
import type { RenderedMarkdown } from './markdown'
import { buildPreviewDocument } from './build-preview-document'
import './preview-frame.css'

interface PreviewFrameProps {
  meta: ArticleMeta
  rendered: RenderedMarkdown
  css: string
}

export function PreviewFrame({ meta, rendered, css }: PreviewFrameProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
  const documentHtml = useMemo(
    () => buildPreviewDocument({ meta, rendered, css, theme }),
    [css, meta, rendered, theme],
  )

  return <section aria-label="IMX 文章预览"><div className="preview-controls" role="group" aria-label="预览设置"><button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>浅色预览</button><button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>深色预览</button><button type="button" aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}>桌面预览</button><button type="button" aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}>移动预览</button></div><p>约 {rendered.wordCount} 字，预计 {rendered.readingMinutes} 分钟阅读</p><div className={`preview-viewport preview-viewport-${viewport}`} style={{ width: viewport === 'mobile' ? '390px' : '100%' }}><iframe className="preview-frame" title="IMX 文章预览" sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={documentHtml} /></div></section>
}
