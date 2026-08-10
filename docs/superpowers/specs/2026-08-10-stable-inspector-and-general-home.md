# Stable Inspector Tabs and General Home Design

## Goal

Keep the inspector tabs at a stable intrinsic height from the first workspace render, and reposition the home page as a standalone, local-first Markdown writing studio instead of a Hugo- or IMX-specific companion.

## Inspector tabs

- The `文章设置 / 大纲` tab strip must use its intrinsic content height.
- The inspector grid must align its rows to the top rather than allowing free vertical space to stretch the tab row during initial layout.
- Refreshing, entering the article workspace, and switching between the two inspector views must not change the tab strip height.
- Desktop and responsive behavior outside this sizing correction remains unchanged.

## Home page

- Keep the product name and existing visual language.
- Replace the Chinese hero slogan with the public-domain literary quotation: “I am no bird; and no net ensnares me.” — Charlotte Brontë, *Jane Eyre*.
- Describe the product as a browser-based, local-first Markdown writing studio.
- Replace IMX- and Hugo-specific feature claims with local writing, live rendering, draft storage, media management, preview, and portable export.
- Rewrite the workflow as writing, managing media, then previewing/exporting.
- Retain the Markdown syntax reference.

## Verification

- Component coverage asserts the new home content and the absence of the old Hugo/IMX positioning.
- Browser coverage records the inspector tab height on first render and after switching views, and verifies the height remains unchanged.
- Existing lint, type checking, component tests, build, and focused browser tests remain green.
