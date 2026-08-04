import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../src/preview/markdown'

describe('renderMarkdown', () => {
  it('renders GFM, safe duplicate h2 ids, nested h2-h5 TOC, highlighting, and resolved local images', async () => {
    const rendered = await renderMarkdown(
      '# Excluded\n\n## Guide\n\n### Child\n\n## Guide\n\n###### Excluded\n\n| left | right |\n| --- | --- |\n| a | b |\n\n```ts\nconst answer = 42\n```\n\n![Example](images/example.png)',
      (path) => (path === 'images/example.png' ? 'blob:example' : undefined),
    )

    expect(rendered.html).toContain('<table>')
    expect(rendered.html).toContain('<h2 id="imx-heading-guide">Guide</h2>')
    expect(rendered.html).toContain('<h2 id="imx-heading-guide-1">Guide</h2>')
    expect(rendered.html).not.toContain('id="location"')
    expect(rendered.html).toContain('language-ts')
    expect(rendered.html).toContain('src="blob:example"')
    expect(rendered.toc).toEqual([
      {
        id: 'imx-heading-guide',
        depth: 2,
        text: 'Guide',
        children: [{ id: 'imx-heading-child', depth: 3, text: 'Child', children: [] }],
      },
      { id: 'imx-heading-guide-1', depth: 2, text: 'Guide', children: [] },
    ])
  })

  it('rewrites only normalized local images, preserves safe external images, and rejects hostile resolver URLs', async () => {
    const rendered = await renderMarkdown(
      '![inline](images/inline.png)\n\n![reference][local]\n\n[local]: images/reference.png\n\n![external](https://example.com/image.png)\n\n![missing](images/missing.png)\n\n![hostile](images/hostile.png)',
      (path) => ({
        'images/inline.png': 'blob:inline',
        'images/reference.png': 'blob:reference',
        'images/hostile.png': 'data:image/svg+xml,evil',
      })[path],
    )

    expect(rendered.html).toContain('src="blob:inline"')
    expect(rendered.html).toContain('src="blob:reference"')
    expect(rendered.html).toContain('src="https://example.com/image.png"')
    expect(rendered.html).not.toContain('images/missing.png')
    expect(rendered.html).not.toMatch(/data:image|images\/hostile\.png/)
  })

  it('never network-resolves malformed local-looking inline or reference image paths', async () => {
    const rendered = await renderMarkdown(
      '![upper](images/Foo.PNG) ![query](images/x.png?raw=1) ![fragment](images/x.png#part) ![slash](images//x.png) ![backslash](images\\x.png) ![encoded](images/%2e%2e/secret.png) ![traversal](images/../secret.png)\n\n![ref-upper][upper] ![ref-query][query] ![ref-traversal][traversal]\n\n[upper]: images/Foo.PNG\n[query]: images/x.png?raw=1\n[traversal]: images/../secret.png',
      () => 'blob:should-not-resolve',
    )

    expect(rendered.html).not.toMatch(/images(?:\/|%|\\)|Foo\.PNG|raw=1|secret\.png|blob:should-not-resolve/i)
    expect(rendered.html).not.toContain('src=')
  })

  it('removes executable markup', async () => {
    const rendered = await renderMarkdown(
      '<script>alert(1)</script><a href="javascript:alert(2)" onclick="alert(3)">safe prose</a>',
      () => undefined,
    )

    expect(rendered.html).not.toMatch(/script|onclick|javascript:|data:image/i)
    expect(rendered.html).toContain('safe prose')
  })

  it('computes estimates from rendered prose instead of destinations or code', async () => {
    const rendered = await renderMarkdown(
      'safe prose\n\n![alt](https://example.com/image.png)\n\n```ts\nconst destination = "https://example.com/code"\n```',
      () => undefined,
    )

    expect(rendered.wordCount).toBe(2)
    expect(rendered.readingMinutes).toBe(1)
  })
})
