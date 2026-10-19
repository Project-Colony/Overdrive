/**
 * @vitest-environment node
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {ServerConfig} from '../types/server'

const {saveConfigFile, restartListener, security} = vi.hoisted(() => ({
  saveConfigFile: vi.fn(),
  restartListener: vi.fn().mockResolvedValue(undefined),
  security: {passwordProtection: false, phrase: ''},
}))

vi.mock('./configFile', () => ({
  saveConfigFile,
}))

vi.mock('./authRegistry', () => ({
  getAuthService: () => ({loadSecuritySettings: async () => security}),
}))

import {
  applyLanAccessChange,
  didLanAccessChange,
  initLanAccess,
  isLanAccessEnabled,
  registerServerNetworkDeps,
} from './lanAccess'

describe('didLanAccessChange', () => {
  it('is false when the LAN flag stays enabled', () => {
    expect(didLanAccessChange('1', '1')).toBe(false)
    expect(didLanAccessChange(true, '1')).toBe(false)
    expect(didLanAccessChange('1', true)).toBe(false)
  })

  it('is false when the LAN flag stays disabled', () => {
    expect(didLanAccessChange('0', '0')).toBe(false)
    expect(didLanAccessChange(false, '0')).toBe(false)
  })

  it('is true when the LAN flag toggles', () => {
    expect(didLanAccessChange('1', '0')).toBe(true)
    expect(didLanAccessChange('0', '1')).toBe(true)
    expect(didLanAccessChange(true, false)).toBe(true)
  })
})

describe('applyLanAccessChange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerServerNetworkDeps({
      config: {allowLanAccess: '0'} as never,
      configPath: '/tmp/config.json',
      getBestLocalIp: () => '127.0.0.1',
      getAllIps: () => [],
      restartListener,
    })
  })

  it('does not restart the HTTP listener when LAN is already disabled', async () => {
    // lanEnabled defaults to false (localhost only) before initLanAccess runs.
    await applyLanAccessChange(false)
    expect(restartListener).not.toHaveBeenCalled()
    expect(saveConfigFile).toHaveBeenCalled()
  })

  it('refuses to enable LAN without a password', async () => {
    Object.assign(security, {passwordProtection: false, phrase: ''})
    await expect(applyLanAccessChange(true)).rejects.toThrow('Set a password before enabling LAN access')
    Object.assign(security, {passwordProtection: true, phrase: ''})
    await expect(applyLanAccessChange(true)).rejects.toThrow('Set a password')
    expect(isLanAccessEnabled()).toBe(false)
    expect(restartListener).not.toHaveBeenCalled()
  })

  it('keeps LAN off at startup when no password is set', async () => {
    Object.assign(security, {passwordProtection: false, phrase: ''})
    const config: ServerConfig = {port: 0, databases: [], allowLanAccess: '1'}
    await expect(initLanAccess({} as never, {} as never, config)).resolves.toBe(false)
    expect(config.allowLanAccess).toBe('0')
  })

  it('enables LAN once a password is set', async () => {
    Object.assign(security, {passwordProtection: true, phrase: 'hunter2'})
    await applyLanAccessChange(true)
    expect(isLanAccessEnabled()).toBe(true)
    expect(restartListener).toHaveBeenCalledTimes(1)
  })
})
