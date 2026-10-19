import { describe, it, expect } from 'vitest'
import {
  getReadableDuration,
  getReadableFileSize,
  getTextColor,
  getTagChipTextColor,
  getTagChipTextStyle,
  getHoverPreviewDimensions,
  getTagHoverPreviewDimensions,
  highlightChars,
  highlightGlobalSearchText,
  sanitizeInlineHtml,
  textMatchesGlobalSearchQuery,
  formatFilterDateDisplay,
} from '@/services/formatUtils'

describe('formatUtils', () => {
  it('formats duration as hh:mm:ss', () => {
    expect(getReadableDuration(65)).toBe('01:05')
    expect(getReadableDuration(3661)).toBe('01:01:01')
  })

  it('formats file sizes', () => {
    expect(getReadableFileSize(500)).toBe('500 B')
    expect(getReadableFileSize(2048)).toMatch(/KB/)
  })

  it('detects dark text on dark backgrounds', () => {
    expect(getTextColor('#000000')).toBe('white')
    expect(getTextColor('#ffffff')).toBe('black')
    // Short hex must expand — otherwise #fff was treated as dark and got white text.
    expect(getTextColor('#fff')).toBe('black')
    expect(getTextColor('#fff', true)).toBe('#424242')
  })

  it('forces tag chip text color only for filled variants', () => {
    expect(getTagChipTextColor('#e91e63', 'flat')).toBe('white')
    expect(getTagChipTextColor('#e91e63', 'elevated')).toBe('white')
    expect(getTagChipTextColor('#e91e63', 'tonal')).toBeUndefined()
    expect(getTagChipTextColor('#e91e63', 'outlined')).toBeUndefined()
    expect(getTagChipTextStyle('#fff', 'outlined')).toEqual({color: '#424242'})
    expect(getTagChipTextStyle('#e91e63', 'tonal')).toBeUndefined()
  })

  it('calculates hover preview dimensions', () => {
    expect(getHoverPreviewDimensions(1920, 1080)).toEqual({
      previewWidth: 180,
      previewHeight: 101,
    })
  })

  it('uses tag meta aspect ratio for non-avatar hover thumbs', () => {
    expect(getTagHoverPreviewDimensions('main', 2)).toEqual({
      previewWidth: 180,
      previewHeight: 90,
    })
    expect(getTagHoverPreviewDimensions('avatar', 2)).toEqual({
      previewWidth: 180,
      previewHeight: 180,
    })
  })

  it('highlights contiguous global search queries', () => {
    expect(highlightGlobalSearchText('Piss Shower', 'piss s')).toContain(
      '<mark class="global-search__hl">Piss S</mark>hower',
    )
  })

  it('highlights global search token prefixes when query is split', () => {
    const html = highlightGlobalSearchText('sybil piss in mouth', 'piss s')
    expect(html).toContain('<mark class="global-search__hl">s</mark>ybil')
    expect(html).toContain('<mark class="global-search__hl">piss</mark>')
    expect(textMatchesGlobalSearchQuery('sybil piss in mouth', 'piss s')).toBe(true)
    expect(textMatchesGlobalSearchQuery('Piss Shower', 'piss s')).toBe(true)
  })

  it('escapes library text in global search highlights', () => {
    expect(highlightGlobalSearchText('<img src=x onerror=1>', 'img')).not.toContain('<img')
    expect(highlightGlobalSearchText('<img src=x onerror=1>', 'img')).toBe(
      '&lt;<mark class="global-search__hl">img</mark> src=x onerror=1&gt;',
    )
    expect(highlightGlobalSearchText('a<b>c "x"', 'zz')).toBe('a&lt;b&gt;c &quot;x&quot;')
    expect(highlightGlobalSearchText('<svg onload=1>', '')).toBe('&lt;svg onload=1&gt;')
  })

  it('highlights typed chars and escapes tag names', () => {
    expect(highlightChars('favorite video', 'favo', true)).toBe('<b>favo</b>rite video')
    expect(highlightChars('favorite video', 'fade')).toBe('<b>f</b><b>a</b>vorite vi<b>d</b><b>e</b>o')
    expect(highlightChars('<img src=x onerror=1>', 'img', true)).toBe('&lt;<b>img</b> src=x onerror=1&gt;')
    expect(highlightChars('</b><script>', 'sc')).toBe('&lt;/b&gt;&lt;<b>s</b><b>c</b>ript&gt;')
    expect(highlightChars('<i>', '')).toBe('&lt;i&gt;')
  })

  it('keeps only b, code and br in confirm copy', () => {
    expect(sanitizeInlineHtml('Remove?<br><br><code>/a/<img src=x onerror=1></code>'))
      .toBe('Remove?<br><br><code>/a/&lt;img src=x onerror=1&gt;</code>')
    expect(sanitizeInlineHtml('<b>A</b> &lt;x&gt; <b onclick=1>')).toBe('<b>A</b> &lt;x&gt; &lt;b onclick=1&gt;')
  })

  it('formats filter dates for display without changing storage shape', () => {
    expect(formatFilterDateDisplay('2024-03-15', 'en')).toMatch(/March/)
    expect(formatFilterDateDisplay('2024-03-15', 'ru')).toMatch(/марта|март/i)
    expect(formatFilterDateDisplay('2024-03-15', 'cn')).toMatch(/2024/)
    expect(formatFilterDateDisplay(null)).toBe('')
    expect(formatFilterDateDisplay('not-a-date')).toBe('not-a-date')
  })
})
