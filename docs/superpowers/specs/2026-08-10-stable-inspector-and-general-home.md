# Stable Inspector Tabs and General Home Design

## Goal

Keep the inspector tabs at a stable intrinsic height from the first workspace render, and reposition the home page as a standalone, local-first Markdown writing studio instead of a Hugo- or IMX-specific companion.

## Inspector tabs

- The `文章设置 / 大纲` tab strip must remain exactly 48 CSS pixels high, with each tab button exactly 38 CSS pixels high.
- The inspector grid must align its rows to the top rather than allowing free vertical space to stretch the tab row during initial layout.
- Refreshing, entering the article workspace, switching views, and temporary initial grid stretch pressure must not change the tab strip or button heights.
- Desktop and responsive behavior outside this sizing correction remains unchanged.

## Home page

- Keep the product name and existing visual language.
- Replace the Chinese hero slogan with the public-domain literary quotation: “I am no bird; and no net ensnares me.” — Charlotte Brontë, *Jane Eyre*.
- Describe the product as a browser-based, local-first Markdown writing studio.
- Replace IMX- and Hugo-specific feature claims with local writing, live rendering, draft storage, media management, preview, and portable export.
- Rewrite the workflow as writing, managing media, then previewing/exporting.
- Retain the Markdown syntax reference.

## Live editor heading alignment

- In instant-layout mode, inactive ATX headings must hide both the `#` marker sequence and its single Markdown separator space.
- Heading text and ordinary paragraph text must therefore share the same left content boundary at every heading level from H1 through H6.
- When the caret enters a heading block, the complete source prefix, including its marker and separator, must remain available for editing.
- Source mode, stored Markdown, selection behavior, undo history, IME behavior, and outline offsets must remain unchanged.

## Verification

- Component coverage asserts the new home content and the absence of the old Hugo/IMX positioning.
- Browser coverage records the inspector tab height on first render and after switching views, and verifies the height remains unchanged.
- Unit coverage verifies that inactive heading prefixes include the separator space in the hidden decoration while active headings reveal the complete source.
- Browser coverage compares the left content boundary of H1 through H6 against an ordinary paragraph.
- Existing lint, type checking, component tests, build, and focused browser tests remain green.
