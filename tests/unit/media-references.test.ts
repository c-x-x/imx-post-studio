import { describe, expect, it } from 'vitest'
import { findImageReferences, validateMediaReferences } from '../../src/media/references'

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

  it('reports referenced missing files and uploaded unused files', () => {
    expect(validateMediaReferences('![图](images/missing.png)', [])).toEqual({
      missing: ['images/missing.png'],
      unused: [],
    })
  })
})
