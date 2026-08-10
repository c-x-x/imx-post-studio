# Preview Code Blocks and Stable Back Control Design

## Goal

Render fenced Markdown code in the existing Studio preview as a complete window-style block and keep the preview back control stationary under pointer interaction.

## Code blocks

- Transform sanitized `pre > code` output into the existing `.highlight` visual contract.
- The wrapper contains three window dots, a centered human-readable language label, a copy button, and the highlighted code.
- Unknown or missing languages display `Code`; known aliases such as `js`, `ts`, and `sh` display readable names.
- The iframe remains script-free. `PreviewFrame` wires copy clicks from the same-origin sandboxed document and uses the parent page Clipboard API.
- Copy success changes the button label to `已复制`; failure changes it to `复制失败` without changing article content.

## Back control

- Hover feedback changes color and border only.
- Hover must not replace the transform owned by the shared Dock or move the button's hit box.

## Test policy

- Extend the existing Markdown preview unit test to cover the trusted code-block structure.
- Use one browser journey to cover the rendered header, copy result, and stationary back-control bounds.
- Remove implementation-detail tests that only inspect internal Dock markup, exact generated CSS strings, or synthetic inspector grid pressure.
- Keep security, accessibility, persistence, responsive layout, export/import, and genuine user-flow coverage.

