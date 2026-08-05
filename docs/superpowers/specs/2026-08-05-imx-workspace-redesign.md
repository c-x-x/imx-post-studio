# IMX Workspace Redesign

## Goal

Replace the always-visible three-column preview with a focused IMX writing desk and an on-demand full-screen preview.

## Approved design

- Desktop: compact inspector plus a large Markdown canvas.
- Mobile: `设置` and `写作` tabs only.
- Preview: no Markdown render or iframe before `预览文章` is activated; opening mounts a full-screen accessible dialog and closing destroys it.
- Preview controls: return to editor, light/dark, desktop/mobile; mobile opens in mobile mode automatically.
- Visual language: bundled IMX fonts, warm paper surfaces, brown accent, liquid-glass controls, rounded cards, and restrained warm shadows.
- Preserve local autosave, drafts, media, import/export, recovery, iframe sandboxing, and the pinned IMX preview snapshot.
- `hugo-theme-imx` and `c-x-x.github.io` remain read-only.
