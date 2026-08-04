import { describe, expect, it } from 'vitest'
import type { MediaAsset } from '../../src/metadata/article'
import { findImageReferences, validateMediaReferences } from '../../src/media/references'

function bodyImage(name: string): MediaAsset {
  return {
    id: name,
    name,
    kind: 'body',
    mime: 'image/png',
    blob: new Blob(['image'], { type: 'image/png' }),
  }
}

describe('Markdown image references', () => {
  it('finds local Hugo image paths from Markdown image nodes', () => {
    expect(findImageReferences('![图](images/a.png)')).toEqual(['images/a.png'])
  })

  it('leaves remote, data, and root-relative image destinations external', () => {
    expect(
      findImageReferences(
        '![remote](https://example.com/a.png) ![data](data:image/png;base64,AA==) ![root](/images/a.png)',
      ),
    ).toEqual([])
  })

  it('canonicalizes encoded local paths and ignores their query and fragment', () => {
    expect(findImageReferences('![encoded](images/%61.png?raw=1#hero) ![plain](images/a.png)')).toEqual([
      'images/a.png',
    ])
    expect(validateMediaReferences('![encoded](images/%61.png?raw=1#hero)', [bodyImage('a.png')])).toEqual({
      missing: [],
      unused: [],
    })
  })

  it('treats malformed, unsafe, protocol-relative, and non-images paths as external', () => {
    expect(
      findImageReferences(
        '![bad](images/%E0%A4%A.png) ![traversal](images/%2e%2e/a.png) ![protocol](//cdn.example/a.png) ![other](uploads/a.png)',
      ),
    ).toEqual([])
  })

  it('resolves full, collapsed, and shortcut image references through definitions', () => {
    const markdown = [
      '![full][hero]',
      '![collapsed][]',
      '![shortcut]',
      '',
      '[hero]: images/%61.png?raw=1',
      '[collapsed]: images/b.png',
      '[shortcut]: images/c.png#image',
    ].join('\n')

    expect(findImageReferences(markdown)).toEqual(['images/a.png', 'images/b.png', 'images/c.png'])
    expect(validateMediaReferences(markdown, [bodyImage('a.png'), bodyImage('c.png')])).toEqual({
      missing: ['images/b.png'],
      unused: [],
    })
  })

  it('reports referenced missing files and uploaded unused files', () => {
    expect(validateMediaReferences('![图](images/missing.png)', [])).toEqual({
      missing: ['images/missing.png'],
      unused: [],
    })
  })
})
