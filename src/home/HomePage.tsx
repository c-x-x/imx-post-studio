interface HomePageProps {
  disabled: boolean
  onArticle: () => void
  onDashboard: () => void
  onGithub?: () => void
}

export function HomePage({ disabled, onArticle, onDashboard, onGithub }: HomePageProps) {
  return <section className="home-page" aria-label="IMX Post Studio 介绍">
    <div className="home-hero">
      <p className="home-eyebrow">IMX POST STUDIO</p>
      <h2>I am no bird; and no net ensnares me.</h2>
      <p className="home-quote-source">Charlotte Brontë · Jane Eyre</p>
      <p>一个本地优先的 Markdown 写作工作台。默认在浏览器内保存文字和图片，也可主动连接 GitHub 管理博客文章。</p>
      <div className="home-actions">
        <button className="home-primary" type="button" disabled={disabled} onClick={onArticle}>开始写文章</button>
        <button type="button" disabled={disabled} onClick={onDashboard}>查看草稿</button>
        {onGithub ? <button type="button" disabled={disabled} onClick={onGithub}>查看作品</button> : null}
      </div>
      <ul className="home-principles" aria-label="项目特点">
        <li><strong>本地优先</strong><span>默认保存在浏览器，主动确认后才提交 GitHub</span></li>
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

    <section className="home-section" aria-labelledby="works-title">
      <div className="home-section-heading"><p>WORKS</p><h2 id="works-title">作品，与 GitHub 相连</h2></div>
      <ol className="home-workflow">
        <li><span>01</span><div><h3>浏览作品</h3><p>连接自己的 GitHub 博客仓库，在作品页查找主分支中的文章。</p></div></li>
        <li><span>02</span><div><h3>继续打磨</h3><p>点击“读取并编辑”，文字和图片保存到“待提交作品”；重复打开会继续本地修改，不覆盖你的进度。</p></div></li>
        <li><span>03</span><div><h3>确认推送</h3><p>在写作页确认后直接推送到主分支。成功后清空编辑区、删除该本地草稿，并在作品页查看；失败或冲突时保留草稿。</p></div></li>
      </ol>
      <p>不连接 GitHub 也能完整使用本地写作、预览和 ZIP 导入导出。建议定期导出备份；是否在博客公开发布仍取决于文章的 draft 标记及站点构建配置。</p>
    </section>
  </section>
}
