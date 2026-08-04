import { useState } from 'react'
import type { ArticleMeta } from './article'
import { suggestSlug, validateSlug } from './slug'

interface MetadataPanelProps {
  meta: ArticleMeta
  onChange: (field: keyof ArticleMeta, value: ArticleMeta[keyof ArticleMeta]) => void
}

interface ChipsInputProps {
  id: 'categories' | 'tags'
  label: string
  values: string[]
  onChange: (values: string[]) => void
}

function ChipsInput({ id, label, values, onChange }: ChipsInputProps) {
  const [pending, setPending] = useState('')
  const add = () => {
    const value = pending.trim()
    if (value && !values.includes(value)) onChange([...values, value])
    setPending('')
  }

  return <div className="metadata-field chip-field">
    <label htmlFor={id}>{label}</label>
    <div className="chips" aria-label={`${label}列表`}>
      {values.map((value) => <span className="chip" key={value}>{value}<button type="button" aria-label={`移除${label} ${value}`} onClick={() => onChange(values.filter((item) => item !== value))}>×</button></span>)}
    </div>
    <input id={id} value={pending} onChange={(event) => setPending(event.target.value)} onKeyDown={(event) => {
      if (event.key === 'Enter') { event.preventDefault(); add() }
    }} onBlur={add} placeholder={`输入${label}后按 Enter`} />
  </div>
}

export function MetadataPanel({ meta, onChange }: MetadataPanelProps) {
  const slugValidation = validateSlug(meta.slug)
  const titleError = meta.title.trim() ? undefined : '标题不能为空'

  return <section className="metadata-panel" aria-label="文章设置">
    <h2>文章设置</h2>
    <div className="metadata-field">
      <label htmlFor="title">标题</label>
      <input id="title" value={meta.title} aria-invalid={Boolean(titleError)} aria-describedby={titleError ? 'title-error' : undefined} onChange={(event) => onChange('title', event.target.value)} />
      {titleError ? <p id="title-error" className="field-error">{titleError}</p> : null}
    </div>
    <div className="metadata-field">
      <label htmlFor="slug">Slug</label>
      <div className="slug-control"><input id="slug" value={meta.slug} aria-invalid={!slugValidation.ok} aria-describedby={!slugValidation.ok ? 'slug-error' : undefined} onChange={(event) => onChange('slug', event.target.value)} /><button type="button" onClick={() => onChange('slug', suggestSlug(meta.title))}>生成拼音 Slug</button></div>
      {!slugValidation.ok ? <p id="slug-error" className="field-error">{slugValidation.message}</p> : null}
    </div>
    <div className="metadata-field">
      <label htmlFor="date">发布日期</label>
      <input id="date" type="text" inputMode="numeric" value={meta.date} onChange={(event) => onChange('date', event.target.value)} />
    </div>
    <ChipsInput id="categories" label="分类" values={meta.categories} onChange={(values) => onChange('categories', values)} />
    <ChipsInput id="tags" label="标签" values={meta.tags} onChange={(values) => onChange('tags', values)} />
    <div className="metadata-field">
      <label htmlFor="description">摘要</label>
      <textarea id="description" rows={3} value={meta.description} onChange={(event) => onChange('description', event.target.value)} />
    </div>
    <label className="check-field"><input type="checkbox" checked={meta.draft} onChange={(event) => onChange('draft', event.target.checked)} />草稿</label>
    <label className="check-field"><input type="checkbox" checked={meta.toc} onChange={(event) => onChange('toc', event.target.checked)} />显示目录</label>
  </section>
}
