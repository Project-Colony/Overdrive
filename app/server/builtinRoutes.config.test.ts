import {afterEach, describe, expect, it, vi} from 'vitest'
import {createServer} from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {ApiDb} from '../../api/types/db'
import type {ServerConfig} from '../types/server'
import {createExpressApp} from './createApp'
import {registerBuiltinRoutes} from './builtinRoutes'

const lan = vi.hoisted(() => ({
  enabled: false,
  passwordSet: false,
  applyLanAccessChange: vi.fn(),
  switchToDatabase: vi.fn(),
}))

vi.mock('./lanAccess', () => ({
  isLanAccessEnabled: () => lan.enabled,
  isLanAccessEnvLocked: () => false,
  isPasswordSet: async () => lan.passwordSet,
  applyLanAccessChange: lan.applyLanAccessChange,
  didLanAccessChange: () => false,
}))

vi.mock('./databaseRegistry', () => ({
  getDatabaseManager: () => ({switchToDatabase: lan.switchToDatabase}),
}))

const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, {recursive: true, force: true})
  vi.clearAllMocks()
})

async function withServer(config: ServerConfig, run: (baseUrl: string, root: string) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-update-config-'))
  tmpDirs.push(root)
  const {app, router} = createExpressApp()
  app.use(router)
  registerBuiltinRoutes({
    app,
    router,
    config,
    configPath: path.join(root, 'config.json'),
    databasesPath: path.join(root, 'databases'),
    db: {} as ApiDb,
    routeLoadErrors: [],
    resolveFilePath: () => null,
    getStreamContentType: () => 'application/octet-stream',
    transcodeManager: null,
  })

  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to resolve test server port')

  try {
    await run(`http://127.0.0.1:${address.port}`, root)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

function post(baseUrl: string, endpoint: string, body: string) {
  return fetch(baseUrl + endpoint, {method: 'POST', headers: {'Content-Type': 'application/json'}, body})
}

describe('POST /api/update-config', () => {
  it('only applies keys the UI sends', async () => {
    const config: ServerConfig = {port: 12321, databases: [{id: 'db1', name: 'Main', active: true}]}
    await withServer(config, async (baseUrl, root) => {
      const response = await post(
        baseUrl,
        '/api/update-config',
        '{"zoom":"1.2","seenFeatureHints":"a","port":1,"path":"/etc","ips":["6.6.6.6"],"__proto__":{"polluted":true}}',
      )
      expect(response.status).toBe(200)
      expect(config).toMatchObject({zoom: '1.2', seenFeatureHints: 'a', port: 12321})
      expect(config.path).toBe(path.join(root, 'databases', 'db1'))
      expect(config.ips).toBeUndefined()
      expect((config as {polluted?: boolean}).polluted).toBeUndefined()
    })
  })

  it('ignores database ids that would leave the databases folder', async () => {
    const config: ServerConfig = {port: 12321, databases: [{id: 'db1', name: 'Main', active: true}]}
    await withServer(config, async (baseUrl, root) => {
      const response = await post(baseUrl, '/api/update-config', '{"databases":[{"id":"../../x","name":"X","active":true}]}')
      expect(response.status).toBe(200)
      expect(config.databases).toEqual([{id: 'db1', name: 'Main', active: true}])
      expect(config.path).toBe(path.join(root, 'databases', 'db1'))
      expect(fs.existsSync(path.join(root, '..', 'x'))).toBe(false)
    })
  })
})

describe('POST /api/switch-database', () => {
  it('turns LAN access off when the new database has no password', async () => {
    lan.enabled = true
    lan.passwordSet = false
    lan.switchToDatabase.mockResolvedValue({id: 'db2', name: 'Other'})
    await withServer({port: 12321, databases: []}, async (baseUrl) => {
      const response = await post(baseUrl, '/api/switch-database', '{"databaseId":"db2"}')
      expect(response.status).toBe(200)
      expect(lan.applyLanAccessChange).toHaveBeenCalledWith(false)
    })

    lan.passwordSet = true
    lan.applyLanAccessChange.mockClear()
    await withServer({port: 12321, databases: []}, async (baseUrl) => {
      await post(baseUrl, '/api/switch-database', '{"databaseId":"db2"}')
      expect(lan.applyLanAccessChange).not.toHaveBeenCalled()
    })
  })
})
