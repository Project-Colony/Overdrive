import {describe, expect, it} from 'vitest'
import {hashPassword, isPasswordHash, verifyPasswordHash} from './passwordHash'

describe('passwordHash', () => {
  it('verifies the right password and rejects others', () => {
    const stored = hashPassword('correct horse')
    expect(isPasswordHash(stored)).toBe(true)
    expect(stored).not.toContain('correct horse')
    expect(verifyPasswordHash('correct horse', stored)).toBe(true)
    expect(verifyPasswordHash('correct hors', stored)).toBe(false)
  })

  it('salts each hash', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'))
  })

  it('rejects plain text and malformed values', () => {
    expect(isPasswordHash('hunter2')).toBe(false)
    expect(verifyPasswordHash('hunter2', 'hunter2')).toBe(false)
    expect(verifyPasswordHash('x', 'scrypt$')).toBe(false)
    expect(verifyPasswordHash('x', 'scrypt$00$')).toBe(false)
  })
})
