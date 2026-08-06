interface ArticleActionsProps {
  disabled: boolean
  onNew: () => void
  onSave: () => void
}

export function ArticleActions({ disabled, onNew, onSave }: ArticleActionsProps) {
  return <div id="panel-actions" className="workspace-actions article-actions" role="group" aria-label="文章操作">
    <button type="button" disabled={disabled} onClick={onNew}>新建文章</button>
    <button className="article-save" type="button" disabled={disabled} onClick={onSave}>保存到草稿库</button>
  </div>
}
