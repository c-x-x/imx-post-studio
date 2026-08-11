export function extractFontFaces(css: string): string {
  return css.match(/@font-face\s*\{[^}]*\}/g)?.join('\n') ?? ''
}
