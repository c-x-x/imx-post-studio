import { useEffect, useRef, useState } from 'react'
import { hasDraftContent, type ArticleDraft } from '../metadata/article'
import { draftRepository } from './repository'

export type SaveStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved'; at: string }
  | { state: 'failed'; message: string }

const AUTOSAVE_DELAY_MS = 800
const IDLE_STATUS: SaveStatus = { state: 'idle' }

interface RevisionStatus {
  draft: ArticleDraft | null
  status: SaveStatus
}

export function useAutosave(draft: ArticleDraft | null, onSaved?: (draft: ArticleDraft) => void): SaveStatus {
  const [revisionStatus, setRevisionStatus] = useState<RevisionStatus>({ draft: null, status: IDLE_STATUS })
  const generation = useRef(0)
  const onSavedRef = useRef(onSaved)

  useEffect(() => {
    onSavedRef.current = onSaved
  }, [onSaved])

  useEffect(() => {
    generation.current += 1
    const activeGeneration = generation.current

    if (!draft || !hasDraftContent(draft)) {
      return () => {
        generation.current += 1
      }
    }

    const timer = window.setTimeout(() => {
      setRevisionStatus((current) => current.status.state === 'failed'
        ? current
        : { draft, status: { state: 'saving' } })
      void draftRepository.put(draft).then(
        () => {
          if (generation.current === activeGeneration) {
            setRevisionStatus({ draft, status: { state: 'saved', at: new Date().toISOString() } })
            onSavedRef.current?.(draft)
          }
        },
        (cause: unknown) => {
          const detail = cause instanceof Error ? cause.message : '浏览器本地存储不可用'
          if (generation.current === activeGeneration) {
            setRevisionStatus({
              draft,
              status: {
                state: 'failed',
                message: `本地草稿保存失败：${detail}。请立即使用紧急导出保存 ZIP 备份。`,
              },
            })
          }
        },
      )
    }, AUTOSAVE_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
      generation.current += 1
    }
  }, [draft])

  return !draft || !hasDraftContent(draft) || revisionStatus.status.state === 'failed' || revisionStatus.draft === draft
    ? revisionStatus.status
    : IDLE_STATUS
}
