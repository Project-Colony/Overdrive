import {describe, expect, it} from 'vitest'
import {parseBooleanSetting} from './parseBooleanSetting'

describe('parseBooleanSetting', () => {
  it('re-exports the shared coerce helper', () => {
    expect(parseBooleanSetting(null, true)).toBe(true)
    expect(parseBooleanSetting('', false)).toBe(false)
    expect(parseBooleanSetting(true)).toBe(true)
    expect(parseBooleanSetting(0)).toBe(false)
    expect(parseBooleanSetting(1)).toBe(true)
    expect(parseBooleanSetting('true')).toBe(true)
    expect(parseBooleanSetting('1')).toBe(true)
    expect(parseBooleanSetting('false')).toBe(false)
    expect(parseBooleanSetting('yes')).toBe(true)
  })
})
