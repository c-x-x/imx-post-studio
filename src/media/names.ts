import { pinyin } from 'pinyin-pro'

const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])

function safeBaseName(value: string): string {
  return pinyin(value, { toneType: 'none', type: 'array', nonZh: 'consecutive' })
    .join(' ')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'image'
}

function splitExtension(value: string): { base: string; extension?: string } {
  const dotIndex = value.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === value.length - 1) {
    return { base: 'image' }
  }

  const extension = value.slice(dotIndex + 1).toLowerCase()
  return SUPPORTED_EXTENSIONS.has(extension)
    ? { base: value.slice(0, dotIndex), extension: extension === 'jpeg' ? 'jpg' : extension }
    : { base: 'image' }
}

export function safeMediaName(value: string): string {
  const { base, extension } = splitExtension(value)
  const safeBase = safeBaseName(base)
  return extension ? `${safeBase}.${extension}` : safeBase
}

export function uniqueMediaName(name: string, existing: Set<string>): string {
  const dotIndex = name.lastIndexOf('.')
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name
  const extension = dotIndex > 0 ? name.slice(dotIndex) : ''

  let candidate = name
  let suffix = 2
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}${extension}`
    suffix += 1
  }

  return candidate
}
