# IMX Post Studio

IMX Post Studio 是一个浏览器内运行的 Hugo 文章编辑器。它把文章、元数据
和图片整理为 Hugo leaf bundle ZIP，同时以固定版本的 IMX 主题提供桌面与移动
预览。生产产物是静态 Vite 应用，不包含 API 路由或服务端数据库。

## 隐私与浏览器支持

草稿和图片默认仅保存在当前浏览器的 IndexedDB 中；处理、预览、导入和导出都
在本机浏览器完成。项目不内置账号、分析、云同步或跨设备恢复服务。清除浏览器
站点数据会删除本地草稿，因此请定期导出备份。若正文保留外部 HTTPS 图片链接，
浏览器仍可能向该图片来源发起请求；其在不同托管环境中的加载限制见下方预览边界。

CI 覆盖 Chromium、Firefox 和 WebKit。建议使用这些浏览器的当前稳定版本；移动
预览以 390px 画布验证。浏览器需要支持 IndexedDB、Blob、WebP 和现代 JavaScript。

## 本地开发

CI 使用 Node.js 22；本地建议使用相同主版本。

```bash
npm ci
npx playwright install chromium firefox webkit
npm run dev
```

Linux 上如缺少浏览器系统依赖，可运行：

```bash
npx playwright install --with-deps chromium firefox webkit
```

## 写作与导出流程

1. 点击“新建文章”，在“设置”填写标题、Slug、日期、分类、标签、摘要和草稿状态。
2. 在“写作”使用 Markdown 编辑器；正文图片可拖放、粘贴或通过媒体面板添加。
3. 在“预览”切换浅色/深色和桌面/移动画布，确认 IMX 排版后再导出。
4. “导出草稿”用于可携带备份；“导出文章”会检查媒体引用，并可选择保留
   `draft = true` 或改为 `draft = false`。

下载的文章 ZIP 解压到 Hugo 站点的 `content/posts/`，得到：

```text
content/posts/<slug>/index.md
content/posts/<slug>/images/<image-name>
```

将这个 leaf bundle 目录提交或上传到站点的 `content/posts/` 即可。正文中的本地
图片引用保持为 `images/<image-name>`，封面字段使用 Hugo 的 `/posts/<slug>/images/…`
路径。

## 图片与预览边界

- 正文接受 JPEG、PNG、WebP 和 GIF；SVG 被拒绝。
- 封面接受 JPEG、PNG 和 WebP，会转换为不放大的 WebP，最大 1600×900、16:9。
- 单个源图片上限为 25 MiB。
- 导入器保留 Markdown 正文；只有在生成预览 HTML 时才会净化内容。预览放在无
  脚本权限的 sandbox iframe 中，桌面预览为 1180px，移动预览为 390px。
- 外部 HTTPS 图片 URL 可保留在预览 HTML 中，因此在 `npm run dev`、`vite
  preview` 或未设置等效策略的静态主机上可能被请求。Vercel 生产配置的
  `img-src 'self' blob: data:` 会阻止这类外部图片；`'self'`、`blob:` 和 `data:`
  仍可加载。
- 预览不运行主题 JavaScript、远程脚本、远程 iframe 或评论组件；这些边界与可由
  浏览器请求的外部图片 URL 是不同的安全问题。

## 恢复草稿

自动保存失败时，页面会提供“紧急导出恢复备份”。平时也可从草稿库导出草稿 ZIP。
要恢复，请在编辑器中使用“导入紧急恢复 ZIP”，或导入先前导出的文章 ZIP；导入在
替换当前文章前会完成验证。恢复文件与普通文章包都应保存在浏览器之外的可靠位置。

## 主题同步

预览资产固定为 `hugo-theme-imx` 的 `v1.4.9` / `6f08e8e` 快照。不要手工编辑
`src/theme/imx/` 或 `public/imx/fonts/`；如需更新，使用本地、已验证的主题工作树：

```bash
npm run sync:imx -- /absolute/path/to/hugo-theme-imx
npm run check:theme
```

主题清单检查会验证来源、许可和每个受管文件的哈希。

## 测试

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check:theme
npm run test:e2e
```

GitHub Actions 会在 `main` 推送和 pull request 上执行同一组检查，并在失败时保留
7 天 Playwright HTML 报告。

## Vercel 静态部署

`vercel.json` 将 Vite 产物设为 `dist`，把 SPA 路径重写到 `/index.html`，并为所有
路径发送 CSP、`nosniff`、无 Referrer 和受限的 Permissions Policy。CSP 仅允许自身
脚本；`'unsafe-inline'` 只用于预览文档所需的内联样式。它允许本地 `blob:`/`data:`
图片与无脚本 iframe 预览，同时禁止被外部页面嵌入和 object 内容。

连接 Vercel 的 Git 集成后，从仓库根目录构建即可使用这些设置。此配置不部署项目；
发布和生产 URL 验证属于单独的发布流程。

## 许可证与归属

本项目根目录的 [MIT License](LICENSE) 适用于 IMX Post Studio 自有代码。随项目分发
的 IMX 主题快照保持其单独的 [MIT 许可证](src/theme/imx/LICENSE.imx)；自托管 Inter
与 Noto Serif SC 字体继续适用各自保留在 `src/theme/imx/` 的 SIL Open Font License。
