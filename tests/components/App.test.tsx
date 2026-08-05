import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app/App'

describe('App', () => {
  it('identifies the local-only IMX writing workspace', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'IMX Post Studio' })).toBeInTheDocument()
    expect(screen.getByLabelText('文章和图片仅在此浏览器中处理')).toHaveTextContent('本地处理')
  })
})
