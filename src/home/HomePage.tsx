interface HomePageProps {
  disabled: boolean
  onArticle: () => void
  onDashboard: () => void
}

const markdownExamples = [
  ['标题', '# 一级标题\n## 二级标题'],
  ['强调', '**粗体** 与 *斜体*'],
  ['列表', '- 无序列表\n1. 有序列表'],
  ['链接与图片', '[链接](https://example.com)\n![说明](images/photo.webp)'],
  ['引用', '> 一段引用文字'],
  ['代码块', '```js\nconst ready = true\n```'],
  ['表格', '| 名称 | 状态 |\n| --- | --- |\n| IMX | Ready |'],
] as const

export function HomePage({ disabled, onArticle, onDashboard }: HomePageProps) {
  return <section className="home-page" aria-label="IMX Post Studio 介绍">
    <div className="home-hero">
      <p className="home-eyebrow">IMX POST STUDIO</p>
      <h2>为 IMX 写作，也只在本地处理</h2>
      <p>在浏览器里完成文章、图片与主题预览，最后导出可直接放入 Hugo 内容目录的文章包。</p>
      <div className="home-actions">
        <button className="home-primary" type="button" disabled={disabled} onClick={onArticle}>开始写文章</button>
        <button type="button" disabled={disabled} onClick={onDashboard}>查看草稿</button>
      </div>
      <ul className="home-principles" aria-label="项目特点">
        <li><strong>本地优先</strong><span>文章和图片不会上传到服务器</span></li>
        <li><strong>IMX 预览</strong><span>使用随项目固定的主题资源渲染</span></li>
        <li><strong>Hugo 输出</strong><span>导出页面包后由你决定何时提交</span></li>
      </ul>
    </div>

    <section className="home-section" aria-labelledby="workflow-title">
      <div className="home-section-heading"><p>WORKFLOW</p><h2 id="workflow-title">从草稿到 Hugo 文章</h2></div>
      <ol className="home-workflow">
        <li><span>01</span><div><h3>编写内容</h3><p>填写标题、Slug、分类和标签，然后专注 Markdown 正文。</p></div></li>
        <li><span>02</span><div><h3>添加媒体并预览</h3><p>放入封面或正文图片，随时打开完整 IMX 文章预览。</p></div></li>
        <li><span>03</span><div><h3>保存或导出</h3><p>草稿保存在当前浏览器，也可以导出标准 Hugo 页面包。</p></div></li>
      </ol>
    </section>

    <section className="home-section markdown-guide" aria-labelledby="markdown-title">
      <div className="home-section-heading"><p>CHEATSHEET</p><h2 id="markdown-title">Markdown 语法速查</h2></div>
      <div className="markdown-grid">
        {markdownExamples.map(([title, source]) => <article key={title}><h3>{title}</h3><pre><code>{source}</code></pre></article>)}
      </div>
    </section>
  </section>
}
