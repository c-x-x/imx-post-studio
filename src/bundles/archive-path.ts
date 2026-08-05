import {
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_FILE_BYTES,
  MAX_ARCHIVE_TOTAL_BYTES,
  MAX_SOURCE_BYTES,
} from '../shared/limits'

export interface ArchiveEntryMetadata {
  filename: string
  uncompressedSize: number
  directory: boolean
}

export interface ArchivePath {
  root: string
  relative: string
}

function archiveError(message: string): Error {
  return new Error(`ZIP 导入失败：${message}`)
}

export function validateArchivePath(filename: string): ArchivePath {
  if (!filename || filename.includes('\0')) {
    throw archiveError('条目路径不能为空或包含 NUL 字符')
  }
  if (filename.includes('\\') || filename.startsWith('/') || /^[a-zA-Z]:/.test(filename)) {
    throw archiveError(`不安全的条目路径：${filename}`)
  }
  // Hugo bundle paths are ASCII-safe names. Reject percent encodings rather than
  // accepting two spellings that extractors might normalize differently.
  if (filename.includes('%')) {
    throw archiveError(`条目路径不能包含百分号编码：${filename}`)
  }

  const segments = filename.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw archiveError(`不安全的条目路径：${filename}`)
  }

  return { root: segments[0], relative: segments.slice(1).join('/') }
}

export function validateArchiveEntries(entries: ArchiveEntryMetadata[]): void {
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw archiveError(`条目数不能超过 ${MAX_ARCHIVE_ENTRIES}`)
  }

  let total = 0
  const paths = new Set<string>()
  for (const entry of entries) {
    const isDirectory = entry.directory || entry.filename.endsWith('/')
    const canonicalPath = isDirectory && entry.filename.endsWith('/')
      ? entry.filename.slice(0, -1)
      : entry.filename
    validateArchivePath(canonicalPath)
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) {
      throw archiveError(`条目大小无效：${entry.filename}`)
    }
    if (isDirectory && entry.uncompressedSize !== 0) {
      throw archiveError(`目录条目不能包含内容：${entry.filename}`)
    }
    if (entry.uncompressedSize > MAX_ARCHIVE_FILE_BYTES) {
      throw archiveError(`单个文件不能超过 ${MAX_SOURCE_BYTES / (1024 * 1024)} MiB：${entry.filename}`)
    }
    total += entry.uncompressedSize
    if (!Number.isSafeInteger(total) || total > MAX_ARCHIVE_TOTAL_BYTES) {
      throw archiveError(`ZIP 解压总大小不能超过 ${MAX_ARCHIVE_TOTAL_BYTES / (1024 * 1024)} MiB`)
    }
    if (paths.has(canonicalPath)) {
      throw archiveError(`ZIP 包含重复条目：${entry.filename}`)
    }
    paths.add(canonicalPath)
  }
}
