/** Shared by the editable source and document serializer to keep them lossless. */
export function serializeImageMarkdown(attrs: Record<string, unknown> = {}): string {
  const alt = String(attrs.alt ?? '').replace(/[\\[\]]/g, '\\$&')
  const source = String(attrs.src ?? '')
  const src = /[\s()<>]/.test(source)
    ? `<${source.replace(/[<>\r\n]/g, (character) => encodeURIComponent(character))}>`
    : source
  const title = String(attrs.title ?? '').replace(/[\\"]/g, '\\$&')
  return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
}
