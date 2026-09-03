import { useSyncExternalStore } from 'react'
import type { EditorFont } from '../editor/editor-font'
import type { EditorMode } from '../editor/editor-mode'
import { DEFAULT_COMMIT_MESSAGE_TEMPLATE } from '../github/commit-message'

const STORAGE_KEY = 'imx-post-studio:preferences:v1'

export type AutosaveDelay = 400 | 800 | 1500
export type CoverMaxWidth = 800 | 1200 | 1600

export interface StudioSettings {
  autosaveDelay: AutosaveDelay
  defaultToc: boolean
  defaultFeatured: boolean
  defaultEditorMode: EditorMode
  editorFont: EditorFont
  focusMode: boolean
  typewriterMode: boolean
  coverMaxWidth: CoverMaxWidth
  coverQuality: number
  commitMessageTemplate: string
}

export const DEFAULT_STUDIO_SETTINGS: Readonly<StudioSettings> = Object.freeze({
  autosaveDelay: 800,
  defaultToc: true,
  defaultFeatured: false,
  defaultEditorMode: 'rich',
  editorFont: 'serif',
  focusMode: false,
  typewriterMode: false,
  coverMaxWidth: 1600,
  coverQuality: 82,
  commitMessageTemplate: DEFAULT_COMMIT_MESSAGE_TEMPLATE,
})

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalize(value: unknown): StudioSettings {
  const source = record(value) ? value : {}
  return {
    autosaveDelay: source.autosaveDelay === 400 || source.autosaveDelay === 800 || source.autosaveDelay === 1500
      ? source.autosaveDelay : DEFAULT_STUDIO_SETTINGS.autosaveDelay,
    defaultToc: typeof source.defaultToc === 'boolean' ? source.defaultToc : DEFAULT_STUDIO_SETTINGS.defaultToc,
    defaultFeatured: typeof source.defaultFeatured === 'boolean' ? source.defaultFeatured : DEFAULT_STUDIO_SETTINGS.defaultFeatured,
    defaultEditorMode: source.defaultEditorMode === 'source' || source.defaultEditorMode === 'rich'
      ? source.defaultEditorMode : DEFAULT_STUDIO_SETTINGS.defaultEditorMode,
    editorFont: source.editorFont === 'serif' || source.editorFont === 'wenkai'
      ? source.editorFont : DEFAULT_STUDIO_SETTINGS.editorFont,
    focusMode: typeof source.focusMode === 'boolean' ? source.focusMode : DEFAULT_STUDIO_SETTINGS.focusMode,
    typewriterMode: typeof source.typewriterMode === 'boolean' ? source.typewriterMode : DEFAULT_STUDIO_SETTINGS.typewriterMode,
    coverMaxWidth: source.coverMaxWidth === 800 || source.coverMaxWidth === 1200 || source.coverMaxWidth === 1600
      ? source.coverMaxWidth : DEFAULT_STUDIO_SETTINGS.coverMaxWidth,
    coverQuality: typeof source.coverQuality === 'number' && Number.isInteger(source.coverQuality)
      && source.coverQuality >= 60 && source.coverQuality <= 95
      ? source.coverQuality : DEFAULT_STUDIO_SETTINGS.coverQuality,
    commitMessageTemplate: typeof source.commitMessageTemplate === 'string' && source.commitMessageTemplate.trim()
      && source.commitMessageTemplate.length <= 120
      ? source.commitMessageTemplate : DEFAULT_STUDIO_SETTINGS.commitMessageTemplate,
  }
}

function load(): StudioSettings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_STUDIO_SETTINGS }
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? normalize(JSON.parse(stored)) : { ...DEFAULT_STUDIO_SETTINGS }
  } catch {
    return { ...DEFAULT_STUDIO_SETTINGS }
  }
}

let snapshot = load()
const subscribers = new Set<() => void>()

function publish(next: StudioSettings): boolean {
  snapshot = next
  let persisted = true
  try {
    if (typeof localStorage === 'undefined') persisted = false
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    persisted = false
  }
  subscribers.forEach((subscriber) => subscriber())
  return persisted
}

export function readStudioSettings(): StudioSettings {
  return snapshot
}

export function updateStudioSettings(patch: Partial<StudioSettings>): boolean {
  return publish(normalize({ ...snapshot, ...patch }))
}

export function resetStudioSettings(): boolean {
  return publish({ ...DEFAULT_STUDIO_SETTINGS })
}

export function useStudioSettings(): StudioSettings {
  return useSyncExternalStore(
    (subscriber) => {
      subscribers.add(subscriber)
      return () => subscribers.delete(subscriber)
    },
    readStudioSettings,
    readStudioSettings,
  )
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    try {
      snapshot = event.newValue ? normalize(JSON.parse(event.newValue)) : { ...DEFAULT_STUDIO_SETTINGS }
    } catch {
      snapshot = { ...DEFAULT_STUDIO_SETTINGS }
    }
    subscribers.forEach((subscriber) => subscriber())
  })
}
