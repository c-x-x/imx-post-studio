# IMX Post Studio

IMX Post Studio 是一个浏览器内运行、本地优先的 Hugo 文章编辑器。它把文章、元数据
和图片整理为 Hugo leaf bundle ZIP，并以 Studio 自有的 IMX 风格提供桌面与移动
预览。生产产物是独立的静态 Vite 应用，不包含 API 路由或服务端数据库。

## 隐私与浏览器支持

草稿和图片默认仅保存在当前浏览器的 IndexedDB 中；处理、预览、导入和导出都
在本机浏览器完成。项目不内置账号、分析、云同步或跨设备恢复服务。清除浏览器
站点数据会删除本地草稿，因此请定期导出备份。若正文保留外部 HTTPS 图片链接，
浏览器仍可能向该图片来源发起请求；其在不同托管环境中的加载限制见下方预览边界。

文章发生修改后会等待约 800ms 自动保存。点击首页或 Studio 标志只切换页面，不会
丢弃当前编辑器内存中的文章；再次进入“文章”可继续编辑。如果当前修改还没有成功
写入草稿库，关闭或刷新网页时浏览器会显示原生离开提醒；保存成功后不再提醒。

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

1. 从首页点击“文章”进入编辑器，在“设置”填写标题、Slug、日期、分类、标签、
   摘要和草稿状态。
2. 在“写作”使用 Markdown 编辑器；正文图片可拖放、粘贴或通过媒体面板添加。
3. 编辑内容会自动保存，也可点击“保存到草稿库”立即保存；草稿库支持打开、复制、
   重命名、导出和删除。
4. 点击“预览文章”打开整屏 IMX 文章预览，并切换浅色/深色和桌面/移动画布。
5. “导出草稿”用于可携带备份；“导出文章”会检查媒体引用，并可选择保留
   `draft = true` 或改为 `draft = false`。

编辑页中的“新建文章”每次都会询问如何处理当前文章：“取消”继续编辑；“保存到
草稿库并继续”先保存再新建；“删除草稿并继续”会先从本浏览器删除当前草稿及图片，
成功后才创建空白文章。删除失败时当前文章和确认窗口都会保留。

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
- 预览不运行远程脚本、远程 iframe 或评论组件；这些边界与可由
  浏览器请求的外部图片 URL 是不同的安全问题。

## 导入、备份与恢复

- “导入 ZIP”读取标准 Hugo leaf bundle，也就是“导出草稿”或“导出文章”生成的
  `<slug>/index.md` 与 `<slug>/images/` 文章包。
- 自动保存失败时，页面会提供“紧急导出恢复备份”。该 ZIP 使用 Studio 专用的
  `recovery.json`，保留草稿标识、时间、完整元数据、正文以及每张图片的内部信息；
  只能通过“导入紧急恢复 ZIP”恢复。
- 已有独立的 `index.md` 和图片时，可展开“从 index.md 和图片导入”。

所有导入都会先完整验证，再让用户选择“替换当前文章”或“作为新草稿打开”；验证
失败不会覆盖编辑器中的内容。恢复文件与普通文章包都应保存在浏览器之外的可靠位置。

## 独立预览资源

文章排版、目录、响应式行为和字体均由 Studio 自身维护，构建与测试不读取其他仓库。
预览使用 `src/preview/` 下的 Studio 样式和 `public/studio/fonts/` 下的本地字体；视觉
升级作为本项目的普通代码变更进行，并由单元、浏览器和视觉回归测试保护。

## 测试

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check:standalone
npm run test:e2e
```

GitHub Actions 会在 `main` 推送和 pull request 上执行同一组检查，并在失败时保留
7 天 Playwright HTML 报告。

## Vercel 静态部署

`vercel.json` 将 Vite 产物设为 `dist`，把 SPA 路径重写到 `/index.html`，并为所有
路径发送 CSP、`nosniff`、无 Referrer 和受限的 Permissions Policy。CSP 的脚本源
仅允许自身脚本，并以 `'wasm-unsafe-eval'` 允许 WebKit 封面转换所需的 WebAssembly
回退；它不允许 `'unsafe-eval'` 或内联脚本。`'unsafe-inline'` 只用于预览文档所需的
内联样式。`worker-src 'self' blob:` 仅允许在本地生成 ZIP 所需的 Worker。策略允许
本地 `blob:`/`data:` 图片与无脚本 iframe 预览，同时禁止被外部页面嵌入和 object
内容。

连接 Vercel 的 Git 集成后，从仓库根目录构建即可使用这些设置。此配置不部署项目；
发布和生产 URL 验证属于单独的发布流程。

## 许可证与归属

本项目根目录的 [MIT License](LICENSE) 适用于 IMX Post Studio 自有代码。预览视觉
历史资产的 MIT 许可文本保留在 [docs/licenses](docs/licenses/IMX-PREVIEW-ORIGIN-MIT.txt)；
自托管 Inter 与 Noto Serif SC 字体继续适用 `public/studio/fonts/` 中保留的 SIL Open
Font License。
