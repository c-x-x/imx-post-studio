import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../src/preview/markdown'

describe('renderMarkdown', () => {
  it('renders GFM, stable duplicate heading ids, nested TOC, highlighted language classes, and resolved local images', async () => {
    const rendered = await renderMarkdown(
      '# Guide\n\n## Child\n\n# Guide\n\n| left | right |\n| --- | --- |\n| a | b |\n\n```ts\nconst answer = 42\n```\n\n![Example](images/example.png)',
      (path) => (path === 'images/example.png' ? 'blob:example' : undefined),
    )

    expect(rendered.html).toContain('<table>')
    expect(rendered.html).toContain('<h1 id="guide">Guide</h1>')
    expect(rendered.html).toContain('<h1 id="guide-1">Guide</h1>')
    expect(rendered.html).toContain('language-ts')
    expect(rendered.html).toContain('src="blob:example"')
    expect(rendered.toc).toEqual([
      {
        id: 'guide',
        depth: 1,
        text: 'Guide',
        children: [{ id: 'child', depth: 2, text: 'Child', children: [] }],
      },
      { id: 'guide-1', depth: 1, text: 'Guide', children: [] },
    ])
  })

  it('removes executable markup and unsafe URL schemes without allowing unresolved image paths', async () => {
    const rendered = await renderMarkdown(
      '<script>alert(1)</script><a href="javascript:alert(2)" onclick="alert(3)">bad</a><img src="data:image/svg+xml,evil"><img src="images/missing.png">',
      () => undefined,
    )

    expect(rendered.html).not.toMatch(/script|onclick|javascript:|data:image/i)
    expect(rendered.html).not.toContain('images/missing.png')
    expect(rendered.html).toContain('bad')
  })
})
