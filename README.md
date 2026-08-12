# IMX Post Studio

IMX Post Studio 是一个浏览器内运行、本地优先的 Markdown 写作工具。它提供结构化
写作、源码编辑、本地草稿、图片管理和整屏预览，并可把文章、元数据与图片整理为
Hugo leaf bundle ZIP。生产产物是独立的静态 Vite 应用，不包含 API 路由或服务端数据库。

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
2. 在“写作”使用默认的“即时排版”模式；它基于 TipTap/ProseMirror，直接编辑标题、
   强调、引用、列表、任务、表格、代码块和本地图片等结构化内容。点击右侧“源代码”
   可使用 CodeMirror 查看和编辑完整 Markdown；切换回来时会按最新 Markdown 重建
   结构化内容。
3. 编辑内容会自动保存，也可点击“保存到草稿库”立即保存；草稿库支持打开、复制、
   重命名、导出和删除。
4. 点击“预览文章”打开整屏 IMX 文章预览，并切换浅色/深色和桌面/移动画布。
5. “导出草稿”用于可携带备份；“导出文章”会检查媒体引用，并可选择保留
   `draft = true` 或改为 `draft = false`。

编辑页中的“新建文章”每次都会询问如何处理当前文章：“取消”继续编辑；“保存到
草稿库并继续”先保存再新建；“删除草稿并继续”会先从本浏览器删除当前草稿及图片，
成功后才创建空白文章。删除失败时当前文章和确认窗口都会保留。

编辑器按当前可用宽度进行视觉换行，窄窗口会把长行显示为多行，但不会向 Markdown
写入真实换行；扩大窗口后内容会自然回到同一视觉行。这里的即时排版只服务于写作，
整篇文章的最终 IMX 风格、目录和响应式效果仍以“预览文章”整屏页面为准。

工具栏中的“表格”可创建 2–8 列、1–20 条数据行的 GFM 表格。即时排版模式支持直接
编辑单元格；光标进入表格后，附近会显示添加或删除行列、切换单元格和删除表格操作。
表头不可删除，且始终至少保留一条数据行和两列。切换到源代码模式后内容仍是标准
GFM Markdown；窄窗口中的宽表格只在表格区域内横向滚动，不会撑宽整个页面。

代码块支持常用语言语法着色。光标进入代码块后，右下方会显示语言输入框；`Tab`
插入两个空格，`Shift+Tab` 删除当前行最多两个前导空格。表格和代码块的上下文操作
会跟随当前编辑位置显示，不需要返回文章顶部。

从剪贴板复制图片后，可直接在 Markdown 光标处粘贴。Studio 会先按与媒体面板相同的
MIME、文件签名、大小和安全文件名规则验证整个批次，再一次性加入媒体并写入
`![说明](images/<name>)`；同名图片自动追加数字后缀。任意一张验证失败时，正文和
媒体列表都不会发生变化。普通文本粘贴仍由 Markdown 编辑器原生处理，图片不会上传
到服务器或远程存储。

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
- 导入器保留 Markdown 正文；只有在生成预览 HTML 时才会净化内容。预览渲染在隔离
  样式的 Shadow DOM 中，不执行文章脚本；桌面预览为 1180px，移动预览为 390px。
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
7 天 Playwright HTML 报告。CI 的 `npm run build` 已包含 TypeScript 项目检查，因此
不再重复单独运行 `npm run typecheck`；Playwright 仍覆盖 Chromium、Firefox 和 WebKit。

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
自托管 Noto Serif SC 字体继续适用 `public/studio/fonts/` 中保留的 SIL Open Font
License；源码编辑器和代码块仅使用系统等宽字体栈。
