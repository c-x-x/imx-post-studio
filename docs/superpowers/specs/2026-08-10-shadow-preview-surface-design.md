# Shadow DOM Preview Surface Design

## Goal

Replace the script-free preview iframe with an open Shadow DOM surface so code-copy interaction works consistently in Chromium, Firefox, and WebKit without weakening Markdown sanitization.

## Architecture

- Keep the preview Dock, theme controls, desktop/mobile width control, and outer full-screen shell in `PreviewFrame`.
- Replace the iframe with one `.preview-frame` host whose open shadow root owns the generated article markup and preview CSS.
- Generate Shadow-DOM-safe markup with `.preview-html` and `.preview-body.is-article-page` wrappers. Adapt only document-root selectors (`:root`, `html`, and `body`) when inserting the existing standalone preview CSS; article selectors and visual values remain unchanged.
- Keep `renderMarkdown` as the only source of article HTML. Its existing sanitizer remains unchanged, and the shadow content contains no script or inline event attributes.

## Behavior

- Bind code-copy buttons directly inside the shadow root. Copy the exact `pre code` text with the current-window Clipboard API and a synchronous textarea fallback; retain the existing `已复制` and `复制失败` states.
- Make the shadow host the scroll container. Directory highlighting, directory auto-scroll, Dock merging, and restored scroll position read from this container instead of an iframe window.
- Apply light/dark state to the Shadow DOM wrapper without rebuilding or resetting scroll position.
- Preserve desktop width `min(1180px, 100%)`, mobile width `min(390px, 100%)`, hidden outer horizontal overflow, and existing IMX visual CSS.

## Security

- Do not enable iframe scripts because the iframe is removed.
- Do not execute user HTML. Markdown output remains sanitized before insertion.
- Keep hostile `script`, `onclick`, `onerror`, and unsafe URL coverage, updated to inspect the open shadow root.

## Test policy

- Convert existing preview component, security, responsive, Dock, visual, and code-block selectors from iframe traversal to the Shadow DOM host; do not duplicate those journeys.
- The code-block journey uses the real Clipboard API in Chromium and Firefox. WebKit may replace only the unavailable system clipboard boundary while exercising the real Studio handler.
- Run focused three-browser preview tests first, followed by lint, typecheck, unit tests, build, and the existing E2E suite required by CI.

## Non-goals

- No visual redesign, Markdown parser change, comment feature, theme coupling, or unrelated editor refactor.
