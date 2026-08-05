import { describe, expect, it } from 'vitest'
import {
  validateArchiveEntries,
  validateArchivePath,
} from '../../src/bundles/archive-path'
import {
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_FILE_BYTES,
  MAX_ARCHIVE_TOTAL_BYTES,
} from '../../src/shared/limits'

describe('archive path validation', () => {
  it.each([
    '',
    '/post/index.md',
    'C:/post/index.md',
    'post\\index.md',
    'post//index.md',
    'post/./index.md',
    'post/../index.md',
    'post/\0index.md',
    'post/%2e%2e/index.md',
    'post/%2Findex.md',
  ])('rejects an archive path that can escape or is ambiguous: %s', (path) => {
    expect(() => validateArchivePath(path)).toThrow()
  })

  it('accepts a one-root article path without changing its name', () => {
    expect(validateArchivePath('imx-test/images/diagram.png')).toEqual({
      root: 'imx-test',
      relative: 'images/diagram.png',
    })
  })

  it('accepts empty directory entries after validating their canonical paths', () => {
    expect(() => validateArchiveEntries([
      { filename: 'post/', uncompressedSize: 0, directory: true },
      { filename: 'post/images/', uncompressedSize: 0, directory: true },
      { filename: 'post/index.md', uncompressedSize: 1, directory: false },
    ])).not.toThrow()
  })

  it.each([
    { filename: '../', uncompressedSize: 0, directory: true },
    { filename: 'post//', uncompressedSize: 0, directory: true },
    { filename: 'post/', uncompressedSize: 1, directory: true },
  ])('rejects unsafe or non-empty directory metadata: $filename', (entry) => {
    expect(() => validateArchiveEntries([entry])).toThrow()
  })

  it('rejects declared archive bounds before any entry body is read', () => {
    expect(() => validateArchiveEntries(
      Array.from({ length: MAX_ARCHIVE_ENTRIES + 1 }, (_, index) => ({
        filename: `post/images/${index}.png`,
        uncompressedSize: 1,
        directory: false,
      })),
    )).toThrow()

    expect(() => validateArchiveEntries([{
      filename: 'post/images/large.png',
      uncompressedSize: MAX_ARCHIVE_FILE_BYTES + 1,
      directory: false,
    }])).toThrow()

    expect(() => validateArchiveEntries([
      {
        filename: 'post/images/one.png',
        uncompressedSize: MAX_ARCHIVE_TOTAL_BYTES,
        directory: false,
      },
      {
        filename: 'post/images/two.png',
        uncompressedSize: 1,
        directory: false,
      },
    ])).toThrow()
  })
})
