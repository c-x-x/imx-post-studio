export interface TocItem {
  id: string
  depth: number
  text: string
  children: TocItem[]
}

export interface TocHeading {
  id: string
  depth: number
  text: string
}

export function nestToc(headings: TocHeading[]): TocItem[] {
  const root: TocItem[] = []
  const stack: TocItem[] = []

  for (const heading of headings) {
    const item: TocItem = { ...heading, children: [] }
    while (stack.length > 0) {
      const previous = stack.at(-1)
      if (!previous || previous.depth < item.depth) break
      stack.pop()
    }
    if (stack.length === 0) root.push(item)
    else {
      const parent = stack.at(-1)
      if (parent) parent.children.push(item)
    }
    stack.push(item)
  }

  return root
}
