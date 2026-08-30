export const DEFAULT_COMMIT_MESSAGE_TEMPLATE = 'Edit article: {title}'

export function renderCommitMessage(template: string, article: { title: string; slug: string }): string {
  const rendered = template
    .replaceAll('{title}', article.title.trim())
    .replaceAll('{slug}', article.slug.trim())
  return Array.from(rendered, (character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127 ? ' ' : character
  }).join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}
