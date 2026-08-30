import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_STUDIO_SETTINGS,
  readStudioSettings,
  resetStudioSettings,
  updateStudioSettings,
} from '../../src/app/studio-settings'
import { renderCommitMessage } from '../../src/github/commit-message'

describe('Studio settings', () => {
  beforeEach(() => resetStudioSettings())

  it('persists a normalized partial update without dropping other preferences', () => {
    expect(updateStudioSettings({ defaultFeatured: true, coverQuality: 90 })).toBe(true)
    expect(readStudioSettings()).toEqual({
      ...DEFAULT_STUDIO_SETTINGS,
      defaultFeatured: true,
      coverQuality: 90,
    })
    expect(JSON.parse(localStorage.getItem('imx-post-studio:preferences:v1')!)).toMatchObject({
      defaultFeatured: true,
      coverQuality: 90,
    })
  })

  it('rejects invalid values and resets preferences without touching content storage', () => {
    updateStudioSettings({ coverQuality: 101, commitMessageTemplate: '', editorFont: 'invalid' as 'serif' })
    expect(readStudioSettings().coverQuality).toBe(DEFAULT_STUDIO_SETTINGS.coverQuality)
    expect(readStudioSettings().commitMessageTemplate).toBe(DEFAULT_STUDIO_SETTINGS.commitMessageTemplate)
    expect(readStudioSettings().editorFont).toBe(DEFAULT_STUDIO_SETTINGS.editorFont)
    updateStudioSettings({ defaultToc: false })
    resetStudioSettings()
    expect(readStudioSettings()).toEqual(DEFAULT_STUDIO_SETTINGS)
  })

  it('renders safe one-line GitHub messages from supported variables', () => {
    expect(renderCommitMessage('post: {title} ({slug})', { title: '标题\n换行', slug: 'article' }))
      .toBe('post: 标题 换行 (article)')
  })
})
