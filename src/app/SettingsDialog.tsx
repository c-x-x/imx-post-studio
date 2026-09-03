import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { AccessibleDialog, DialogClose } from './AccessibleDialog'
import {
  DEFAULT_STUDIO_SETTINGS,
  resetStudioSettings,
  updateStudioSettings,
  useStudioSettings,
  type AutosaveDelay,
  type CoverMaxWidth,
  type StudioSettings,
} from './studio-settings'

const SETTINGS_SECTIONS = [
  {
    id: 'general',
    label: '通用',
    description: '管理 Studio 的基础行为与新文章默认偏好。',
  },
  {
    id: 'editor',
    label: '编辑器',
    description: '调整写作模式、排版体验和键盘操作。',
  },
  {
    id: 'images',
    label: '图片',
    description: '统一图片导入、压缩与资源整理规则。',
  },
  {
    id: 'publishing',
    label: '发布',
    description: '设置推送前检查和 GitHub 发布习惯。',
  },
  {
    id: 'security',
    label: '安全与数据',
    description: '保护文章、授权信息与本地恢复数据。',
  },
] as const

type SettingsSectionId = typeof SETTINGS_SECTIONS[number]['id']

interface SettingsDialogProps {
  onClose: () => void
  returnFocus: () => HTMLElement | null
}

export function SettingsDialog({ onClose, returnFocus }: SettingsDialogProps) {
  const [activeId, setActiveId] = useState<SettingsSectionId>('general')
  const settings = useStudioSettings()
  const [commitTemplate, setCommitTemplate] = useState(() => settings.commitMessageTemplate)
  const [storageWarning, setStorageWarning] = useState('')
  const [resetArmed, setResetArmed] = useState(false)
  const tabsRef = useRef<HTMLDivElement>(null)
  const idPrefix = useId()
  const activeSection = SETTINGS_SECTIONS.find((section) => section.id === activeId) ?? SETTINGS_SECTIONS[0]

  const save = (patch: Partial<StudioSettings>) => {
    setStorageWarning(updateStudioSettings(patch) ? '' : '浏览器阻止了本地存储，本次设置仅在当前页面有效。')
  }

  const focusTab = (index: number) => {
    const section = SETTINGS_SECTIONS[(index + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length]
    setActiveId(section.id)
    tabsRef.current?.querySelector<HTMLButtonElement>(`[data-settings-tab="${section.id}"]`)?.focus()
  }

  const onTabsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = SETTINGS_SECTIONS.findIndex((section) => section.id === activeId)
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      focusTab(currentIndex + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusTab(currentIndex - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusTab(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusTab(SETTINGS_SECTIONS.length - 1)
    }
  }

  const panelContent = activeId === 'general' ? <div className="settings-dialog__fields">
    <label className="settings-field">
      <span id={`${idPrefix}-autosave-label`}>自动保存等待时间</span>
      <select aria-labelledby={`${idPrefix}-autosave-label`} value={settings.autosaveDelay} onChange={(event) => save({ autosaveDelay: Number(event.target.value) as AutosaveDelay })}>
        <option value="400">快速 · 0.4 秒</option>
        <option value="800">标准 · 0.8 秒</option>
        <option value="1500">从容 · 1.5 秒</option>
      </select>
      <small>停止输入后再保存，避免每次按键都写入本地数据库。</small>
    </label>
    <label className="settings-check"><input type="checkbox" checked={settings.defaultToc} onChange={(event) => save({ defaultToc: event.target.checked })} /><span><strong>新文章默认显示目录</strong><small>只影响之后创建的新文章。</small></span></label>
    <label className="settings-check"><input type="checkbox" checked={settings.defaultFeatured} onChange={(event) => save({ defaultFeatured: event.target.checked })} /><span><strong>新文章默认设为精选</strong><small>推送后会写入 featured = true。</small></span></label>
  </div> : activeId === 'editor' ? <div className="settings-dialog__fields">
    <fieldset className="settings-choice">
      <legend>编辑模式</legend>
      <label><input type="radio" name="default-editor-mode" value="rich" checked={settings.defaultEditorMode === 'rich'} onChange={() => save({ defaultEditorMode: 'rich' })} /><span><strong>即时排版</strong><small>边写边显示 Markdown 排版效果。</small></span></label>
      <label><input type="radio" name="default-editor-mode" value="source" checked={settings.defaultEditorMode === 'source'} onChange={() => save({ defaultEditorMode: 'source' })} /><span><strong>源代码</strong><small>直接编辑完整 Markdown 标记。</small></span></label>
    </fieldset>
    <fieldset className="settings-choice settings-font-choice">
      <legend>编辑器字体</legend>
      <label data-font="serif"><input type="radio" name="editor-font" value="serif" checked={settings.editorFont === 'serif'} onChange={() => save({ editorFont: 'serif' })} /><span><strong>默认字体</strong><small>使用 Studio 默认的中文阅读字体。</small></span></label>
      <label data-font="wenkai"><input type="radio" name="editor-font" value="wenkai" checked={settings.editorFont === 'wenkai'} onChange={() => save({ editorFont: 'wenkai' })} /><span><strong>文艺字体 · 霞鹜文楷</strong><small>自然的楷体笔意，兼顾个性和长文阅读。</small></span></label>
    </fieldset>
    <fieldset className="settings-choice">
      <legend>专注写作</legend>
      <label><input type="checkbox" checked={settings.focusMode} onChange={(event) => save({ focusMode: event.target.checked })} /><span><strong>专注模式</strong><small>弱化光标所在段落以外的内容。</small></span></label>
      <label><input type="checkbox" checked={settings.typewriterMode} onChange={(event) => save({ typewriterMode: event.target.checked })} /><span><strong>打字机模式</strong><small>输入时让光标尽量保持在编辑区中部。</small></span></label>
    </fieldset>
    <p className="settings-dialog__note">编辑模式与字体切换会立即应用，并保存在当前浏览器；不会改变文章内容。</p>
  </div> : activeId === 'images' ? <div className="settings-dialog__fields">
    <label className="settings-field">
      <span id={`${idPrefix}-cover-width-label`}>封面最大宽度</span>
      <select aria-labelledby={`${idPrefix}-cover-width-label`} value={settings.coverMaxWidth} onChange={(event) => save({ coverMaxWidth: Number(event.target.value) as CoverMaxWidth })}>
        <option value="800">800 × 450</option>
        <option value="1200">1200 × 675</option>
        <option value="1600">1600 × 900</option>
      </select>
      <small>较小尺寸上传更快；不会放大小于目标尺寸的原图。</small>
    </label>
    <label className="settings-field">
      <span id={`${idPrefix}-cover-quality-label`}>封面 WebP 质量 <output>{settings.coverQuality}</output></span>
      <input aria-labelledby={`${idPrefix}-cover-quality-label`} type="range" min="60" max="95" step="1" value={settings.coverQuality} onChange={(event) => save({ coverQuality: Number(event.target.value) })} />
      <small>推荐 75–85；只影响之后处理的新封面。</small>
    </label>
  </div> : activeId === 'publishing' ? <div className="settings-dialog__fields">
    <label className="settings-field">
      <span id={`${idPrefix}-commit-label`}>GitHub Commit 信息模板</span>
      <input aria-labelledby={`${idPrefix}-commit-label`} value={commitTemplate} maxLength={120} aria-describedby={`${idPrefix}-commit-help`} onChange={(event) => {
        const value = event.target.value
        setCommitTemplate(value)
        if (value.trim()) save({ commitMessageTemplate: value })
      }} onBlur={() => {
        if (!commitTemplate.trim()) setCommitTemplate(settings.commitMessageTemplate)
      }} />
      <small id={`${idPrefix}-commit-help`}>支持 {'{title}'} 和 {'{slug}'}，例如：post: 发布《{'{title}'}》</small>
    </label>
    <div className="settings-preview"><span>示例</span><code>{commitTemplate.trim().replaceAll('{title}', '我的文章').replaceAll('{slug}', 'my-article') || settings.commitMessageTemplate}</code></div>
    <p className="settings-dialog__note">标题、摘要、Slug、正文和图片完整性检查始终启用，不能在设置中关闭。</p>
  </div> : <div className="settings-dialog__fields">
    <div className="settings-safety"><strong>发布安全保护已启用</strong><p>作品删除需要再次确认；推送冲突不会强制覆盖；未保存内容切换页面前会先尝试保存。</p></div>
    <div className="settings-reset">
      <div><strong>恢复默认设置</strong><p>只重置本页偏好，不会删除草稿、作品、图片或 GitHub 登录。</p></div>
      {resetArmed ? <div className="settings-reset__confirm" role="alert"><span>再次确认后立即恢复默认值。</span><button className="settings-reset__confirm-action" type="button" onClick={() => {
        setStorageWarning(resetStudioSettings() ? '' : '浏览器阻止了本地存储，本次设置仅在当前页面有效。')
        setCommitTemplate(DEFAULT_STUDIO_SETTINGS.commitMessageTemplate)
        setResetArmed(false)
      }}>确认重置</button><button className="settings-reset__cancel" type="button" onClick={() => setResetArmed(false)}>取消</button></div>
        : <button className="settings-reset__trigger" type="button" onClick={() => setResetArmed(true)}>恢复默认设置</button>}
    </div>
  </div>

  return <AccessibleDialog title="设置" className="confirm-dialog settings-dialog" onClose={onClose} returnFocus={returnFocus}>
    <div ref={tabsRef} className="settings-dialog__tabs" role="tablist" aria-label="设置分类" onKeyDown={onTabsKeyDown}>
      {SETTINGS_SECTIONS.map((section) => <button
        key={section.id}
        id={`${idPrefix}-tab-${section.id}`}
        data-settings-tab={section.id}
        type="button"
        role="tab"
        aria-selected={activeId === section.id}
        aria-controls={`${idPrefix}-panel-${section.id}`}
        tabIndex={activeId === section.id ? 0 : -1}
        onClick={() => setActiveId(section.id)}
      >{section.label}</button>)}
    </div>
    <section
      id={`${idPrefix}-panel-${activeSection.id}`}
      className="settings-dialog__panel"
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${activeSection.id}`}
      tabIndex={0}
    >
      <span className="settings-dialog__status">设置仅保存在当前浏览器；清除网站数据后会恢复默认值</span>
      <h3>{activeSection.label}</h3>
      <p>{activeSection.description}</p>
      {storageWarning ? <p className="field-error" role="alert">{storageWarning}</p> : null}
      {panelContent}
    </section>
    <DialogClose>{(close) => <div className="dialog-actions"><button type="button" onClick={() => close()}>关闭</button></div>}</DialogClose>
  </AccessibleDialog>
}
