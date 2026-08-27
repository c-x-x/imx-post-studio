interface ArticleActionsProps {
  disabled: boolean
  onNew: () => void
}

export function ArticleActions({ disabled, onNew }: ArticleActionsProps) {
  return <div className="article-actions" role="group" aria-label="文章操作">
    <button type="button" disabled={disabled} onClick={onNew}>新建文章</button>
  </div>
}
