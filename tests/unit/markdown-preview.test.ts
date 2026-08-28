import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../src/preview/markdown'

describe('renderMarkdown', () => {
  it.each(['constructor', '__proto__', 'toString', 'unknown-language'])('renders unregistered language %s safely', async (language) => {
    const result = await renderMarkdown(`\`\`\`${language}\nhello\n\`\`\``, () => undefined)
    expect(result.html).toContain('hello')
    expect(result.html).toContain('code-block-header')
  })

  it('keeps safe links and rewrites forward heading anchors', async () => {
    const result = await renderMarkdown('[跳转](#section) [站内](/posts/a/) [电话](tel:123)\n\n## Section', () => undefined)
    expect(result.html).toContain('href="#imx-heading-section"')
    expect(result.html).toContain('href="/posts/a/"')
    expect(result.html).toContain('href="tel:123"')
  })
  it('preserves semantic emphasis and strikethrough elements for preview styling', async () => {
    const rendered = await renderMarkdown('**粗体**、*斜体*、~~删除线~~', () => undefined)

    expect(rendered.html).toContain('<strong>粗体</strong>')
    expect(rendered.html).toContain('<em>斜体</em>')
    expect(rendered.html).toContain('<del>删除线</del>')
  })

  it('renders GFM, unique heading ids, nested h1-h6 TOC, highlighting, and resolved local images', async () => {
    const rendered = await renderMarkdown(
      '# Excluded\n\n## Guide\n\n### Child\n\n## Guide\n\n###### Excluded\n\n| left | right |\n| --- | --- |\n| a | b |\n\n```ts\nconst answer = 42\n```\n\n![Example](images/example.png)',
      (path) => (path === 'images/example.png' ? 'blob:example' : undefined),
    )

    expect(rendered.html).toContain('<table>')
    expect(rendered.html).toContain('<h2 id="imx-heading-guide">Guide</h2>')
    expect(rendered.html).toContain('<h2 id="imx-heading-guide-1">Guide</h2>')
    expect(rendered.html).not.toContain('id="location"')
    expect(rendered.html).toContain('language-ts')
    expect(rendered.html).toContain('class="highlight"')
    expect(rendered.html).toContain('data-code-lang="typescript"')
    expect(rendered.html).toContain('class="code-window-controls"')
    expect(rendered.html).toContain('class="code-language">TypeScript</span>')
    expect(rendered.html).toContain('class="copy-code-button"')
    expect(rendered.html).toContain('aria-label="复制代码"')
    expect(rendered.html).toContain('src="blob:example"')
    expect(rendered.toc).toEqual([{ id: 'imx-heading-excluded', depth: 1, text: 'Excluded', children: [
      {
        id: 'imx-heading-guide',
        depth: 2,
        text: 'Guide',
        children: [{ id: 'imx-heading-child', depth: 3, text: 'Child', children: [] }],
      },
      { id: 'imx-heading-guide-1', depth: 2, text: 'Guide', children: [{ id: 'imx-heading-excluded-1', depth: 6, text: 'Excluded', children: [] }] },
    ] }])
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

  it('keeps footnote links valid and excludes the generated footnote label from the TOC', async () => {
    const rendered = await renderMarkdown('## Article\n\nText[^1]\n\n[^1]: Note', () => undefined)

    expect(rendered.html).toContain('href="#user-content-fn-1"')
    expect(rendered.html).toContain('id="user-content-fn-1"')
    expect(rendered.html).toContain('href="#user-content-fnref-1"')
    expect(rendered.html).toContain('id="footnote-label"')
    expect(rendered.toc).toEqual([{ id: 'imx-heading-article', depth: 2, text: 'Article', children: [] }])
  })

  it('preserves GFM table column alignment in preview HTML', async () => {
    const rendered = await renderMarkdown('| A | B |\n| :---: | ---: |\n| x | y |', () => undefined)

    expect(rendered.html).toContain('<th align="center">A</th>')
    expect(rendered.html).toContain('<th align="right">B</th>')
    expect(rendered.html).toContain('<td align="center">x</td>')
    expect(rendered.html).toContain('<td align="right">y</td>')
  })
})
