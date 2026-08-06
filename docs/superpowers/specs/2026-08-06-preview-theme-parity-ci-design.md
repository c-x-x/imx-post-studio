# 预览主题一致性与 CI 修复设计

## 目标

预览模式的外层、iframe 与文章正文使用同一套 IMX 明暗色彩，深色模式不再出现独立黑框；同时修复当前 GitHub Actions 的确定性失败。

## 设计

- `src/theme/imx/imx-preview.css` 继续作为只读的 IMX 主题快照与颜色来源。
- `src/preview/imx-preview-overrides.ts` 只保留预览专属的布局、目录开关和隐藏滚动条规则，不再覆盖 IMX 的正文、元信息、目录、卡片和代码块配色。
- 预览页背景严格匹配 IMX：浅色 `#fbfaf7`，深色 `#171716`。外层 `.preview-surface` 已使用 `--imx-paper`，因此 iframe 与外层会形成连续背景。
- 小字号 `.cover-help` 使用 `--imx-ink-secondary`，保持 IMX 色系并满足 WCAG AA 对比度。
- 视觉测试直接断言 IMX 原始深色值，并更新因目录、主题切换和本次背景统一而过期的 Linux/macOS 截图基线。

## 验证

- 红灯：新的 IMX 深色断言在现有自定义调色板上失败；现有 axe 测试复现 `.cover-help` 对比度失败。
- 绿灯：lint、typecheck、单元测试、主题清单校验、构建和全量 Playwright 均通过。
- 生产：Vercel 上验证深浅切换后的外层、iframe、文章背景一致，且此前的滚动位置、目录跟随、隐藏滚动条保持正常。
- CI：推送后检查最新 GitHub Actions run 为成功。

