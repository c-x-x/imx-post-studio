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
  ['表格', '| 名称 | 状态 |\n| --- | --- |\n| 文章 | 完成 |'],
] as const

export function HomePage({ disabled, onArticle, onDashboard }: HomePageProps) {
  return <section className="home-page" aria-label="IMX Post Studio 介绍">
    <div className="home-hero">
      <p className="home-eyebrow">IMX POST STUDIO</p>
      <h2>I am no bird; and no net ensnares me.</h2>
      <p className="home-quote-source">Charlotte Brontë · Jane Eyre</p>
      <p>一个本地优先的 Markdown 写作工作台，让文字、图片、草稿与预览都留在你的浏览器中。</p>
      <div className="home-actions">
        <button className="home-primary" type="button" disabled={disabled} onClick={onArticle}>开始写文章</button>
        <button type="button" disabled={disabled} onClick={onDashboard}>查看草稿</button>
      </div>
      <ul className="home-principles" aria-label="项目特点">
        <li><strong>本地写作</strong><span>文章与图片只在当前浏览器中处理</span></li>
        <li><strong>即时呈现</strong><span>专注书写，同时看见 Markdown 排版效果</span></li>
        <li><strong>自由带走</strong><span>保存本地草稿，随时导出可移植的文章包</span></li>
      </ul>
    </div>

    <section className="home-section" aria-labelledby="workflow-title">
      <div className="home-section-heading"><p>WORKFLOW</p><h2 id="workflow-title">从灵感到完整文章</h2></div>
      <ol className="home-workflow">
        <li><span>01</span><div><h3>写下想法</h3><p>使用即时排版专注内容，需要时切换源代码查看原始 Markdown。</p></div></li>
        <li><span>02</span><div><h3>管理素材</h3><p>粘贴或添加图片，整理标题、分类、标签与文章大纲。</p></div></li>
        <li><span>03</span><div><h3>预览与导出</h3><p>检查完整阅读效果，将草稿和图片一起保存或导出。</p></div></li>
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
