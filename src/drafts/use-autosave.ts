import { useEffect, useRef, useState } from 'react'
import type { ArticleDraft } from '../metadata/article'
import { draftRepository } from './repository'

export type SaveStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved'; at: string }
  | { state: 'failed'; message: string }

const AUTOSAVE_DELAY_MS = 800

export function useAutosave(draft: ArticleDraft | null): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>({ state: 'idle' })
  const generation = useRef(0)

  useEffect(() => {
    generation.current += 1
    const activeGeneration = generation.current

    if (!draft) {
      return () => {
        generation.current += 1
      }
    }

    const timer = window.setTimeout(() => {
      setStatus((current) => current.state === 'failed' ? current : { state: 'saving' })
      void draftRepository.put(draft).then(
        () => {
          if (generation.current === activeGeneration) {
            setStatus({ state: 'saved', at: new Date().toISOString() })
          }
        },
        () => {
          if (generation.current === activeGeneration) {
            setStatus({
              state: 'failed',
              message: '本地草稿保存失败，请立即使用紧急导出保存 ZIP 备份。',
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

  return status
}
