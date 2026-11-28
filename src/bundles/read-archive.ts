import { BlobReader, ZipReader, type Entry } from '@zip.js/zip.js'
import { MAX_ARCHIVE_ENTRIES, MAX_ARCHIVE_TOTAL_BYTES } from '../shared/limits'

export const readOptions = { checkSignature: true, checkAmbiguity: true, checkOverlappingEntry: true, strictness: 'strict' as const }
// Leave room for file headers, the directory and compression overhead.
const MAX_ZIP_BYTES = MAX_ARCHIVE_TOTAL_BYTES + 10 * 1024 * 1024

class ArchiveReader extends BlobReader {
  readingDirectory = true

  override async readUint8Array(offset: number, length: number) {
    // zip.js reads the central directory into one buffer before yielding entries.
    if (this.readingDirectory && length > 8 * 1024 * 1024) throw new Error('ZIP 目录数据超过 8 MiB')
    return super.readUint8Array(offset, length)
  }
}

export async function readArchive<T>(blob: Blob, readEntries: (entries: Entry[]) => Promise<T>): Promise<T> {
  if (blob.size > MAX_ZIP_BYTES) throw new Error('ZIP 文件不能超过 260 MiB')
  const source = new ArchiveReader(blob)
  const reader = new ZipReader(source, readOptions)
  try {
    const entries: Entry[] = []
    for await (const entry of reader.getEntriesGenerator()) {
      if (entries.length === MAX_ARCHIVE_ENTRIES) throw new Error(`ZIP 条目数不能超过 ${MAX_ARCHIVE_ENTRIES}`)
      entries.push(entry)
    }
    source.readingDirectory = false
    return await readEntries(entries)
  } finally {
    await reader.close().catch(() => undefined)
  }
}
