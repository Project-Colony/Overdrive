import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ApiRequest, ApiResponse } from '../types/http'

const {
  findAll,
  findByOption,
  upsertByOption,
  loadSecuritySettings,
  sanitizeSettingRows,
  sanitizeSettingRow,
  isRequestAuthenticated,
  isAuthRequired,
  invalidateSettingsCache,
  isLanAccessEnabled,
  isLanAccessEnvLocked,
  applyLanAccessChange,
} = vi.hoisted(() => ({
  findAll: vi.fn(),
  findByOption: vi.fn(),
  upsertByOption: vi.fn(),
  loadSecuritySettings: vi.fn(),
  sanitizeSettingRows: vi.fn(),
  sanitizeSettingRow: vi.fn(),
  isRequestAuthenticated: vi.fn(),
  isAuthRequired: vi.fn(),
  invalidateSettingsCache: vi.fn(),
  isLanAccessEnabled: vi.fn(),
  isLanAccessEnvLocked: vi.fn(),
  applyLanAccessChange: vi.fn(),
}))

vi.mock('../db/repositories/settings', () => ({
  createSettingsRepository: () => ({
    findAll,
    findByOption,
    upsertByOption,
  }),
}))

vi.mock('../../app/server/authRegistry', () => ({
  getAuthService: () => ({
    loadSecuritySettings,
    sanitizeSettingRows,
    sanitizeSettingRow,
    isRequestAuthenticated,
    isAuthRequired,
    invalidateSettingsCache,
  }),
}))

vi.mock('../../app/server/lanAccess', () => ({
  isLanAccessEnabled,
  isLanAccessEnvLocked,
  applyLanAccessChange,
}))

import createSettingController from './Setting.controller'
import { createAuthService } from '../../app/server/auth'

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    send(payload: unknown) {
      res.body = payload
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return res
    },
    sendStatus(code: number) {
      res.statusCode = code
      return res
    },
  }

  return res as ApiResponse & {statusCode: number; body: unknown}
}

describe('Setting.controller', () => {
  const controller = createSettingController({drizzle: {}} as never)

  beforeEach(() => {
    vi.clearAllMocks()
    loadSecuritySettings.mockResolvedValue({passwordProtection: false})
    isRequestAuthenticated.mockReturnValue(true)
    isAuthRequired.mockResolvedValue(false)
    isLanAccessEnabled.mockReturnValue(false)
    isLanAccessEnvLocked.mockReturnValue(false)
    applyLanAccessChange.mockResolvedValue(undefined)
  })

  it('returns sanitized settings rows', async () => {
    findAll.mockReturnValue([{option: 'theme', value: 'dark'}])
    sanitizeSettingRows.mockReturnValue([{option: 'theme', value: 'dark'}])

    const req = {} as ApiRequest
    const res = createResponse()

    await controller.findAll(req, res)

    expect(sanitizeSettingRows).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([{option: 'theme', value: 'dark'}])
  })

  it('hides credentials from callers that may not use the API', async () => {
    sanitizeSettingRows.mockImplementation(createAuthService({drizzle: {}} as never).sanitizeSettingRows)
    isAuthRequired.mockResolvedValue(true)
    isRequestAuthenticated.mockReturnValue(false)
    findAll.mockReturnValue([
      {option: 'phrase', value: 'hunter2'},
      {option: 'tmdbApiKey', value: 'tmdb-key'},
      {option: 'tpdbApiKey', value: 'tpdb-key'},
      {option: 'theme', value: 'dark'},
    ])

    const res = createResponse()
    await controller.findAll({} as ApiRequest, res)

    expect(res.body).toEqual([
      {option: 'phrase', value: ''},
      {option: 'tmdbApiKey', value: ''},
      {option: 'tpdbApiKey', value: ''},
      {option: 'theme', value: 'dark'},
    ])
  })

  it('returns a sanitized single setting', async () => {
    findByOption.mockReturnValue({option: 'theme', value: 'dark'})
    sanitizeSettingRow.mockReturnValue({option: 'theme', value: 'dark'})

    const req = {params: {option: 'theme'}} as unknown as ApiRequest
    const res = createResponse()

    await controller.findOne(req, res)

    expect(findByOption).toHaveBeenCalledWith('theme')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({option: 'theme', value: 'dark'})
  })

  it('updates a setting and invalidates auth cache for password options', async () => {
    const req = {
      params: {option: 'passwordProtection'},
      body: {value: '1'},
    } as unknown as ApiRequest
    const res = createResponse()

    await controller.update(req, res)

    expect(upsertByOption).toHaveBeenCalledWith('passwordProtection', '1')
    expect(invalidateSettingsCache).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([1])
  })

  it('refuses to remove the password while LAN access is on', async () => {
    isLanAccessEnabled.mockReturnValue(true)

    for (const [option, value] of [['passwordProtection', '0'], ['phrase', '']]) {
      const res = createResponse()
      await controller.update({params: {option}, body: {value}} as unknown as ApiRequest, res)
      expect(res.statusCode).toBe(409)
      expect(res.body).toEqual({message: 'Disable LAN access before removing the password'})
    }
    expect(upsertByOption).not.toHaveBeenCalled()

    const res = createResponse()
    await controller.update({params: {option: 'phrase'}, body: {value: 'new-secret'}} as unknown as ApiRequest, res)
    expect(upsertByOption).toHaveBeenCalledWith('phrase', expect.stringMatching(/^scrypt\$/))
  })

  it('blocks LAN access updates when controlled by environment', async () => {
    isLanAccessEnvLocked.mockReturnValue(true)

    const req = {
      params: {option: 'allowLanAccess'},
      body: {value: '1'},
    } as unknown as ApiRequest
    const res = createResponse()

    await controller.update(req, res)

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({
      message: 'LAN access is controlled by MEDIA_CHIPS_ALLOW_LAN environment variable',
    })
    expect(applyLanAccessChange).not.toHaveBeenCalled()
  })

  it('clears migrated global settings in the database without changing LAN access', async () => {
    const req = {
      params: {option: 'allowLanAccess'},
      body: {value: ''},
    } as unknown as ApiRequest
    const res = createResponse()

    await controller.update(req, res)

    expect(upsertByOption).toHaveBeenCalledWith('allowLanAccess', '')
    expect(applyLanAccessChange).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([1])
  })
})
