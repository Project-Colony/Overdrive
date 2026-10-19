import type { ApiDb } from '../../api/types/db'
import type { ServerConfig, NetworkIpInfo } from '../types/server'
import os from 'os'
import { createSettingsRepository } from '../../api/db/repositories/settings'
import { saveConfigFile } from './configFile'
import { pickPublicHost } from './publicHost'
import { parseBooleanSetting } from '../../shared/parseBooleanSetting'
import { getAuthService } from './authRegistry'

const LAN_ENABLED_VALUES = ['1', 'true', 'yes', 'on']

interface NetworkHelpers {
  getBestLocalIp: () => string
  getAllIps: () => NetworkIpInfo[]
}

interface ServerNetworkDeps {
  config: ServerConfig
  configPath: string
  getBestLocalIp: () => string
  getAllIps: () => NetworkIpInfo[]
  restartListener: () => Promise<void>
}

let lanEnabled = false
let envLocked = false
let serverDeps: ServerNetworkDeps | null = null

function readEnvLanAccess(): boolean | null {
  const envVal = process.env.MEDIA_CHIPS_ALLOW_LAN
  if (envVal === undefined || envVal === '') return null
  return LAN_ENABLED_VALUES.includes(String(envVal).toLowerCase())
}

function isLanAccessEnabled(): boolean {
  return lanEnabled
}

function isLanAccessEnvLocked(): boolean {
  return envLocked
}

const LAN_PASSWORD_REQUIRED = 'Set a password before enabling LAN access'

/** Same source as the login check: passwordProtection on and a non-empty phrase. */
async function isPasswordSet(): Promise<boolean> {
  const settings = await getAuthService().loadSecuritySettings()
  return settings.passwordProtection && settings.phrase !== ''
}

function getBindHost(): string {
  return lanEnabled ? '0.0.0.0' : '127.0.0.1'
}

function syncNetworkConfig(
  config: ServerConfig,
  enabled: boolean,
  helpers: NetworkHelpers,
) {
  const bestIp = pickPublicHost(helpers, {})
  const allIps = helpers.getAllIps()

  config.ip = enabled ? bestIp : 'localhost'
  config.ips = enabled ? allIps.map((entry) => entry.address) : []
  config.hostname = enabled ? os.hostname() : 'localhost'
}

async function initLanAccess(db: ApiDb, _helpers: NetworkHelpers, config?: ServerConfig) {
  const envValue = readEnvLanAccess()
  if (envValue !== null) {
    lanEnabled = envValue
    envLocked = true
    return lanEnabled
  }

  envLocked = false

  if (config && typeof config.allowLanAccess === 'string' && config.allowLanAccess !== '') {
    lanEnabled = parseBooleanSetting(config.allowLanAccess, false)
  } else {
    const settingsRepo = createSettingsRepository(db.drizzle)
    const {row: setting} = settingsRepo.findOrCreateByOption('allowLanAccess', '0')
    lanEnabled = parseBooleanSetting(setting.value, false)
  }

  if (lanEnabled && !await isPasswordSet()) {
    console.warn(`LAN access disabled: ${LAN_PASSWORD_REQUIRED}`)
    lanEnabled = false
  }

  if (config) {
    config.allowLanAccess = lanEnabled ? '1' : '0'
  }

  return lanEnabled
}

function registerServerNetworkDeps(deps: ServerNetworkDeps) {
  serverDeps = deps
}

async function applyLanAccessChange(enabled: boolean) {
  if (envLocked) {
    throw new Error('LAN access is controlled by MEDIA_CHIPS_ALLOW_LAN environment variable')
  }

  if (enabled && !await isPasswordSet()) {
    throw new Error(LAN_PASSWORD_REQUIRED)
  }

  // Idempotent: zoom / transcode / other global saves must never rebind the HTTP
  // listener when allowLanAccess did not actually change.
  if (lanEnabled === enabled) {
    if (serverDeps) {
      serverDeps.config.allowLanAccess = enabled ? '1' : '0'
      saveConfigFile(serverDeps.configPath, serverDeps.config)
    }
    return
  }

  lanEnabled = enabled

  if (!serverDeps) return

  serverDeps.config.allowLanAccess = enabled ? '1' : '0'
  syncNetworkConfig(serverDeps.config, enabled, serverDeps)
  saveConfigFile(serverDeps.configPath, serverDeps.config)
  await serverDeps.restartListener()
}

/** True when allowLanAccess toggles and the HTTP listener must rebind. */
function didLanAccessChange(previousValue: unknown, nextValue: unknown): boolean {
  return parseBooleanSetting(previousValue, true) !== parseBooleanSetting(nextValue, true)
}

export {
  initLanAccess,
  isLanAccessEnabled,
  isLanAccessEnvLocked,
  isPasswordSet,
  getBindHost,
  syncNetworkConfig,
  registerServerNetworkDeps,
  applyLanAccessChange,
  didLanAccessChange,
}
