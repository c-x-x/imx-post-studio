# Right Tools and Preview Dock Merge Design

## Goal

Balance the writing workspace by moving media and bundle operations to the right rail, and make the preview Dock use the same scroll-driven attraction and merge behavior as the main IMX Dock without maintaining duplicate animation logic.

## Desktop workspace

The desktop layout remains:

`metadata rail | metadata toggle | editor | tools toggle | tools rail`

The left rail contains only article metadata: title, slug, publication date, categories, tags, description, draft state, and TOC state.

The right rail becomes the complete article tools rail, ordered as follows:

1. New article and save-to-draft actions.
2. Media controls, including body images, cover selection, and existing media assets.
3. Bundle controls, including ZIP import, emergency recovery import, draft export, article export, and index/image import.

The right rail remains expanded by default, keeps its existing independent persisted collapse state, hides its scrollbar while remaining scrollable, and gives its width back to the editor when collapsed. Existing actions, validation, focus recovery, import confirmation, and busy-state behavior do not change.

## Mobile workspace

Mobile continues to use the existing “设置 / 写作” tabs and has no collapsible side rails. In the “设置” tab, metadata appears first and the article tools follow it. In the “写作” tab, the tools are hidden so the editor remains immersive. New/save actions remain directly reachable in “设置”; no functions are removed or moved into an off-canvas menu.

## Shared Dock merge architecture

The preview Dock must behave like the main IMX Dock:

- At the top of the preview, Back, statistics, and settings are separate floating Dock parts.
- Scrolling progressively attracts the left and right parts toward the center.
- At the same enter/exit thresholds as the main Dock, the parts visually merge into one shared shell.
- Scrolling back to the top reverses the transition.
- Mobile retains the compact non-merging layout.
- Reduced-motion mode switches between states without continuous motion.

`useSharedDock` remains the only owner of scroll progress, geometry measurement, thresholds, CSS-variable writes, resize handling, and reduced-motion behavior. It will be generalized to discover semantic Dock roles rather than only main-navigation class names:

- container
- center/menu part
- left/brand part
- right/actions part
- representative right-side control
- shared shell

The existing main Dock supplies these roles without changing its visible structure. The preview Dock supplies the same roles on its own Back, statistics, and settings groups. Both consumers therefore run the same hook and state classes (`is-dock-attracting`, `is-dock-merged`) and use the same merge variables.

Shared structural merge styles and variables move to a reusable Dock stylesheet or reusable class block. Main-navigation-only styles remain in `imx-dock.css`; preview-only color, icon, responsive, and iframe layout styles remain in `preview-frame.css`. No second scroll handler or copied interpolation implementation is allowed.

## Accessibility and lifecycle

- Moving controls must not change their accessible names or tab order within each rail.
- The right toggle continues to expose `aria-controls`, `aria-expanded`, and correct focus retention.
- Dock parts remain clickable throughout attraction and merging.
- Preview Dock cleanup removes shared state classes and body state when the dialog closes.
- The preview iframe remains script-free and sandboxed.
- Theme synchronization between application, preview shell, and iframe remains unchanged.

## Verification

Implementation is accepted when:

1. Component tests prove media and bundle controls are descendants of the right tools rail on desktop and remain available in mobile settings.
2. Workspace tests prove collapsing the right rail hides the complete tools group, expands the editor, and restores the persisted state.
3. Unit tests prove the generalized shared Dock role lookup supports both main and preview structures without duplicating merge calculations.
4. Browser tests scroll the preview surface and observe attraction variables, `is-dock-merged`, and the reverse transition at the same thresholds as the main Dock.
5. Browser tests prove mobile preview does not merge or overflow.
6. Existing media, ZIP import/export, recovery, focus, theme synchronization, accessibility, build, theme-integrity, and visual suites remain green.
7. Visual review confirms the preview Dock merges into one shell in light and dark mode and the right rail is readable in both themes.

## Out of scope

- Changes to article data, front matter, Markdown rendering, ZIP formats, or recovery rules.
- Changes to the vendored IMX theme snapshot.
- New server-side storage or authentication.
- Redesigning the existing controls beyond their new placement and shared Dock motion.
