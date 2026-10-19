/**
 * @vitest-environment node
 */
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createServer, type Server} from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import registerRoutes from './TasksBackups.routes'

describe('TasksBackups routes', () => {
  let dbPath = ''
  let baseUrl = ''
  let server: Server

  beforeAll(async () => {
    dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'backups-routes-'))
    for (const dir of ['backups', 'media', 'meta', 'out/sub']) fs.mkdirSync(path.join(dbPath, dir), {recursive: true})
    fs.writeFileSync(path.join(dbPath, 'db.sqlite'), '')
    fs.writeFileSync(path.join(dbPath, 'x.zip'), 'outside the backups folder')

    const app = express()
    app.use(express.json())
    registerRoutes(app, {path: dbPath} as never)
    server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Failed to resolve test server port')
    baseUrl = 'http://127.0.0.1:' + address.port + '/api/TasksBackups'
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    fs.rmSync(dbPath, {recursive: true, force: true})
  })

  const post = (route: string, body: unknown) => fetch(baseUrl + route, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  })

  it('creates a backup on POST only', async () => {
    expect((await fetch(baseUrl + '/createBackup')).status).toBe(404)

    expect((await post('/createBackup', {})).status).toBe(200)
    expect(fs.readdirSync(path.join(dbPath, 'backups')).filter((name) => name.endsWith('.zip'))).toHaveLength(1)
  })

  it.each([
    ['/deleteBackup', () => ({name: '../x'})],
    ['/restoreBackup', () => ({name: '../x'})],
    ['/exportBackup', () => ({archive: '../x', path: path.join(dbPath, 'out', 'sub')})],
  ])('rejects a backup name with a separator on %s', async (route, body) => {
    expect((await post(route, body())).status).toBe(400)
    expect(fs.existsSync(path.join(dbPath, 'x.zip'))).toBe(true)
    expect(fs.existsSync(path.join(dbPath, 'out', 'x.zip'))).toBe(false)
  })
})
