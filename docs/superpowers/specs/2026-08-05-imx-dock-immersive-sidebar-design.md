# IMX Dock and Immersive Sidebar

## Goal

Make the Studio header behave and look like the IMX theme Dock while preserving Studio-specific labels and actions, and let desktop authors collapse the settings sidebar for focused writing.

## Source and boundaries

- Treat `hugo-theme-imx` as read-only.
- Port the Dock behavior from theme revision `6f08e8e5bba774a8e1fa0c2fa911c7435dddd9c7`, primarily `layouts/partials/header.html`, `assets/css/navigation.css`, `assets/css/responsive.css`, `assets/js/navigation.js`, and `assets/js/dock.js`.
- Keep imported code scoped to the Studio so it cannot collide with the article preview iframe.
- Preserve article editing, autosave, drafts, media, import/export, recovery, and preview behavior.
- Do not add a global Studio dark mode; the Dock's displayed controls remain Studio controls rather than the theme's site links and theme toggle.

## Dock structure and behavior

- Brand capsule: IMX logo and `IMX Post Studio`.
- Center navigation capsule: `新建文章` and `草稿库`, with the same active/hover indicator language as IMX.
- Right action capsule: `预览文章` while a workspace is open; on mobile it also contains the IMX-style menu toggle.
- Desktop starts as three separated liquid-glass capsules. Scrolling drives the same attraction, shell-growth, merge thresholds, resize recalculation, reduced-motion behavior, and edge snapping as the source theme.
- Mobile uses the theme's compact glass Dock and collapsible navigation menu. Keyboard focus, `aria-expanded`, Escape dismissal, and outside-click dismissal remain available.
- The Studio page reserves enough top space for the fixed Dock, and notifications remain readable below it.

## Immersive settings sidebar

- Add a desktop-only toggle on the boundary between the settings panel and editor.
- The control exposes `aria-expanded` and a clear accessible name that changes between collapse and restore states.
- Collapsing animates the settings column to zero and lets the editor occupy the full workspace width; expanding restores the existing inspector width and scroll position.
- The preference is remembered in `localStorage` for the same browser. Storage failure falls back to in-memory state without blocking editing.
- Hide the inspector scrollbar in Chromium, Firefox, and WebKit while preserving wheel, trackpad, touch, keyboard, and programmatic scrolling.
- At the existing mobile breakpoint, keep the `设置` / `写作` tabs and omit the desktop collapse control.
- With reduced motion enabled, layout changes occur without animated movement.

## Implementation shape

- Extract the header into an `ImxDock` React component.
- Adapt the theme interaction code into a ref-scoped React hook with complete listener, observer, timer, and animation-frame cleanup.
- Keep Dock-specific CSS in a dedicated stylesheet copied from the theme and narrowly adapted for Studio class names and controls.
- Keep sidebar state and its storage adapter separate from article draft state so collapsing never modifies or saves article content.

## Verification

- Component tests cover Dock actions, mobile menu accessibility, collapse/restore behavior, and storage failure.
- Browser tests cover separated and merged desktop Dock states, mobile menu behavior, sidebar width collapse, editor expansion, hidden scrollbar behavior, keyboard access, and reduced motion.
- Update desktop and mobile visual snapshots only after inspecting the rendered result against the IMX source behavior.
- Run unit tests, lint, type checking, production build, theme-manifest verification, and the full multi-browser Playwright suite.
