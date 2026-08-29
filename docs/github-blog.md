# 可选的 GitHub 博客后台

这是一个独立于编辑器和主题的仓库适配层。默认关闭；不连接 GitHub 也能继续写作、
保存本地草稿和导入导出 ZIP。它不读取或同步任何主题代码，不需要改动博客模板。

当前流程：**作品 → 读取并编辑 → 待提交作品 → 确认推送到 main → 作品**。
新文章从“写作”开始，自动进入本地草稿。自动保存仍只写 IndexedDB；只有确认推送或删除作品才更新主分支。

## 1. 创建只供自己使用的 GitHub App

在 GitHub **Settings → Developer settings → GitHub Apps → New GitHub App** 创建 App：

- 名称：自定一个未占用的名称，例如 `my-ipost-editor`。
- Homepage URL：你的 Studio 地址，例如 `https://ipost.cxx.pub`。
- Callback URL：`https://ipost.cxx.pub/api/github/callback`。
- 启用用户授权时访问令牌过期（默认开启）；无需 Device Flow、Setup URL 或安装后自动授权。
- 关闭 Webhook 的 Active；此功能不依赖 Webhook。
- Repository permissions：**Contents: Read and write**；Pull requests 不再需要，可设为 No access；
  Metadata 保持默认只读。其他权限留空，不授权 Workflows、Administration 或账户写入权限。
- 安装范围选 **Only on this account**，保存后进入 Install App，选 **Only select repositories**，
  仅安装到博客源码仓库，例如 `c-x-x/c-x-x.github.io`，不要选编辑器或其他仓库。

复制 App 的 **Client ID**，生成一个 **Client secret**。本实现使用 GitHub App 的用户访问
令牌：不需要生成私钥，不使用 Installation ID，也不接受手工粘贴的个人访问令牌。

从 `https://api.github.com/users/c-x-x` 的公开响应读取 `id`，或在已登录的终端运行
`gh api user --jq .id`。记录数字 ID，不能填用户名；用户名可更改，数字 ID 用来限制本人登录。

GitHub 官方说明：[创建 GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)、
[用户访问令牌与 OAuth 流程](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)。

## 2. 配置服务端环境变量

在 Vercel 项目 **Settings → Environment Variables** 添加下面的变量，仅选 Production。
生产凭据不要提供给不可信分支的 Preview 部署，不要写进源码、README、截图或任何 `VITE_` 变量。

| 变量 | 示例或说明 |
| --- | --- |
| `GITHUB_ENABLED` | `true`；关闭时改为 `false` 并重新部署 |
| `GITHUB_SITE_ORIGIN` | `https://ipost.cxx.pub`，不带路径、查询或尾部斜杠 |
| `GITHUB_REPOSITORY` | `c-x-x/c-x-x.github.io`，只允许服务端配置的一个仓库 |
| `GITHUB_BASE_BRANCH` | `main`，必须是博客实际发布分支 |
| `GITHUB_CONTENT_ROOT` | `content/posts` |
| `GITHUB_ALLOWED_USER_ID` | 上一步查到的本人数字 ID |
| `GITHUB_CLIENT_ID` | GitHub App 的 Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub App 的 Client secret |
| `GITHUB_SESSION_SECRET` | `openssl rand -hex 32` 生成的 64 位十六进制随机密钥 |

配置后重新部署。根目录 `api/github.ts` 是 Vercel Node Function；`vercel.json` 将
`/api/github/<action>` 转发给该函数，其他页面仍使用 Vite SPA。不要把 API 重写到 `index.html`。
纯静态主机仍可运行编辑器，但没有 GitHub 后台。无需数据库、额外账号密码或常驻服务器。

### 本地试用

复制 `.env.example` 为 `.env.local` 并填写变量（该文件已被 Git 忽略），运行 `npm run dev`。
本地配置使用 `http://localhost:5173`；App Callback URL 也必须匹配
`http://localhost:5173/api/github/callback`。建议另建仅安装到测试仓库的开发 App，
不要为了测试来回修改生产 App。`vite preview` 只预览静态产物，不提供本地 API；开发 API
由 `npm run dev` 的桥接层提供。启用或修改环境变量后需重启开发服务。

没有配置时，点击 **作品** 会显示“后端尚未启用”，不会向 GitHub 发送请求。

## 3. 使用

1. 点击导航 **作品 → 使用 GitHub 登录**，只有配置的本人账号能使用。
2. 搜索作品目录名，点击 **读取并编辑**。文字与图片保存到“草稿 → 待提交作品”。
   重复读取同一作品会打开已有的待提交副本，不覆盖本地修改。
3. 编辑后提示 **已保存到待提交作品**；新写文章则显示 **已保存到本地草稿**。
   两类草稿都在本浏览器中，不是云端备份。
4. 写作页点击 **推送**，检查 Markdown 和图片变更，再点击 **确认推送到 main**。
   此界面只处理当前文章，不展示仓库列表，不再创建 PR。
5. 成功后实际删除该本地草稿及图片、清空编辑区，作品页读取主分支的新版本。
   推送自动将文章设为 `draft = false`；文章设置不再提供“草稿”开关。
   “精选文章”开关会写入 `featured = true/false`，用于博客首页优先展示。
   推送前必须填写标题、合法 Slug、规范发布日期、非空摘要和正文；分类、标签和封面可选。
   前后端都校验发布格式，缺失时停止推送，仍可保存本地草稿。
   已经以 `draft = true` 上传的文章，从作品页读取、补全必填项后再次推送即可发布。
6. 作品列表点击 **删除**，核对警告框中的仓库、分支和文章目录，再点击 **确认删除作品**。
   删除会以一个 Git 提交移除整篇文章目录，包括 Markdown、封面、正文图片及目录内附件；
   不影响其他文章，本地草稿和待提交修改也不会被删除。博客重新部署后该文章下线。
   默认聚焦“取消”；删除期间禁止重复确认。远端更新时停止删除，请取消并刷新作品后重新确认。
   如需恢复远端文章，请从 GitHub 提交历史恢复；删除不代表清除历史记录或已公开的内容。

远端版本变化时停止推送，不强推、不自动解决冲突、不绕过分支保护。请先导出当前修改备份，
再删除对应待提交副本，从作品页重新读取并整合修改。删除草稿不会删除 GitHub 作品。
超时可以重试原确认操作；当主分支仍指向该次提交时，后端按请求标识恢复结果，不重复提交。
GitHub 已成功但本地清理失败时，点击“完成草稿清理”只重试本地删除。

推送回执和草稿删除使用同一个 IndexedDB 事务，并阻止延迟保存或其他窗口重新写入该草稿；
回执只保留草稿 ID 和提交 SHA，不含正文和图片。清理浏览器数据仍会丢失未推送草稿，请定期备份。
未关联文章可作为新文章推送，但不能覆盖同名文章。关联文章不能直接改 Slug，暂不提供目录迁移。
远端已删除作品的待提交副本仍可编辑和导出，但不能直接覆盖不存在的原文章。
导入替换关联草稿时取消关联，避免意外覆盖另一篇远端文章。
旧 PR 草稿请先导出备份，再从作品页读取主分支。旧缓存客户端没有直接推送确认标识，
服务端会拒绝并要求刷新，不会将旧 PR 操作静默变为直接推送。

## 支持范围与限制

- 文章布局：`content/posts/<slug>/index.md`，图片在同目录的 `images/`。
  Slug 为小写英文/数字及单连字符；仅支持当前编辑器的 TOML `+++` Front Matter。
- 正文保持 Markdown；不支持的写作语法可用源码模式处理，不承诺复现博客的 shortcode 执行效果。
- 仅改正文时原 Front Matter 保留；修改已知元数据时保留未知 TOML 字段，但注释、引号及
  排版可能重写，务必检查确认界面的 Markdown。换行统一为 LF；最终以提交确认显示的内容为准。
- 封面遵循现有 `/posts/<slug>/images/cover.webp` 约定；自定义内容目录时需确保博客 URL
  映射仍兼容这一约定。不自动迁移其他封面格式或路径。
- GitHub 模式最多 50 张图片，每张不超过 **2 MiB**，Markdown 不超过 **512 KiB**。
  图片逐张校验、上传，最后原子提交文章与图片。普通本地导入仍支持原来的 25 MiB 单图上限。
- 支持 JPEG/PNG/WebP/GIF，拒绝 SVG、路径穿越、符号链接和任意 Blob SHA 注入。
  不支持子目录图片、Git LFS 指针或不兼容的文章包；失败时不覆盖当前文章。
- 未使用的图片可从编辑器删除，删除仅发生在主分支对应文章包中；其他文件保持不变。
- 图片上传成功而最终提交失败时，可能留下暂未被分支引用的 Git Blob；不影响已发布文章。
- 初版不提供云端草稿列表、跨设备实时同步、多人协作和合并冲突编辑器；公开仓库中的
  提交和 `draft = true` 文章同样公开，不能用它存放秘密草稿。

## 安全边界

- GitHub token 只在服务端解密使用。浏览器保存的是 AES-256-GCM 加密、带过期时间的
  HttpOnly Cookie；前端 JavaScript 不接触明文 token，不把 token 放入 LocalStorage。
- HTTPS 使用 Secure、SameSite=Lax 和 `__Host-` Cookie。OAuth 校验 state 与 PKCE；
  写入接口同时校验登录、本人数字 ID、精确 Origin 和 CSRF token，接口响应不缓存。
- 会话最长一小时，不保存刷新令牌。退出时清除会话并尝试撤销 GitHub token；
  远端撤销未确认时会提示到 GitHub Applications 手动撤销。
- 后端将写入限制在一个仓库的文章目录，仅以非强制快进方式更新配置的主分支。**GitHub App 的 Contents
  权限本身是仓库级，不是文件夹级**：服务端或凭据被攻破时，不能仅靠路径校验限制攻击者。
  因此只授权博客仓库，给 GitHub/Vercel 账号启用 MFA，按实际发布需求配置分支规则并定期检查授权（强制 PR 规则会拒绝直接推送）。
- 现有 CSP、预览净化和输入校验继续生效，但不能保证零风险。本文不是完整安全审计；
  本功能不内置分布式请求限流，可在 Vercel 配置 API 限流/WAF，并关注配额和异常请求。
- 出现疑似泄露：在 GitHub 撤销 App 授权/安装、轮换 Client secret 和 session secret，
  设置 `GITHUB_ENABLED=false` 后重新部署，并检查仓库提交与账号活动。

实现位置：`server/github/`（认证和仓库操作）、`api/github.ts`（托管入口）、
`src/github/`（界面和文章适配）。编辑器、预览和本地草稿的数据模型不依赖 GitHub。
