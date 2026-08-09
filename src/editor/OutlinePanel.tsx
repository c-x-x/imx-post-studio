import { useMemo } from 'react'
import { extractEditorOutline } from './outline'

interface OutlinePanelProps {
  markdown: string
  onSelect: (position: number) => void
}

export function OutlinePanel({ markdown, onSelect }: OutlinePanelProps) {
  const items = useMemo(() => extractEditorOutline(markdown), [markdown])

  return <section id="inspector-outline" className="outline-panel" role="tabpanel" aria-labelledby="inspector-tab-outline">
    <h2 className="visually-hidden">文章大纲</h2>
    {items.length === 0
      ? <p className="outline-empty">正文中暂无标题</p>
      : <ol className="outline-list" aria-label="文章大纲">
          {items.map((item) => <li key={`${item.from}:${item.depth}`}>
            <button
              type="button"
              style={{ paddingInlineStart: `${.75 + (item.depth - 1) * .72}rem` }}
              onClick={() => onSelect(item.from)}
            >
              <span className="outline-depth" aria-hidden="true">H{item.depth}</span>
              <span>{item.text}</span>
            </button>
          </li>)}
        </ol>}
  </section>
}
