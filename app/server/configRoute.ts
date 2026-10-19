import type { Express } from 'express'
import type { ApiRequest, ApiResponse } from '../../api/types/http'
import type { ServerConfig, ServerDatabaseEntry } from '../types/server'
import path from 'path'
import packageJson from '../../package.json'
import {
  GLOBAL_APP_CONFIG_KEYS,
  readGlobalConfigString,
  readMinimizeToTrayConfig,
} from '../../shared/appGlobalConfig'
import { isLanAccessEnabled, isLanAccessEnvLocked } from './lanAccess'
import { getAllIps, getBestLocalIp } from './network'
import { pickPublicHost } from './publicHost'
import { hasValidSecret, isRequestAllowed } from './auth'
import { getAuthService } from './authRegistry'

function buildGlobalSettingsPayload(config: ServerConfig) {
  const source = config as unknown as Record<string, unknown>
  const payload: Record<string, string> = {}

  for (const key of GLOBAL_APP_CONFIG_KEYS) {
    payload[key] = readGlobalConfigString(source, key)
  }

  return payload
}

/** SPA boot payload — register next to /api/ping, before static/heavy routes. */
export function registerConfigRoute(
  app: Express,
  config: ServerConfig,
  databasesPath: string,
) {
  app.get('/api/config', async (req: ApiRequest, res: ApiResponse) => {
    console.log('Config request from:', req.headers.origin || 'unknown origin')

    const activeDb = config.databases.find((dbEntry: ServerDatabaseEntry) => dbEntry.active)
    const frontendIp = pickPublicHost(
      {getBestLocalIp, getAllIps},
      {requestHostname: req.hostname},
    )

    const globalSettings = buildGlobalSettingsPayload(config)
    // Public boot payload: only callers that may use the API (or the Electron
    // shell, which caches this for its renderer) get the TPDB key.
    if (!hasValidSecret(req) && !await isRequestAllowed(getAuthService(), req)) {
      delete globalSettings.tpdbApiKey
    }

    res.json({
      ip: frontendIp,
      ips: config.ips,
      hostname: config.hostname,
      port: config.port,
      appVersion: (packageJson.version || '1.0.0').replace(/(-beta)+$/i, '-beta'),
      path: activeDb ? path.join(databasesPath, activeDb.id) : '',
      databases: config.databases || [],
      activeDatabase: activeDb,
      serverInfo: {
        webUrl: `http://${frontendIp}:${config.port}`,
        apiUrl: `http://${frontendIp}:${config.port}/api`,
        wsUrl: `ws://${frontendIp}:${config.port}`,
        detectedAt: new Date().toISOString(),
      },
      allowLanAccess: isLanAccessEnabled(),
      allowLanAccessEnvLocked: isLanAccessEnvLocked(),
      registration: typeof config.registration === 'string' ? config.registration : '',
      minimizeToTray: readMinimizeToTrayConfig(config as unknown as Record<string, unknown>),
      ...globalSettings,
      ...(typeof config.onboardingCompleted === 'string' ? { onboardingCompleted: config.onboardingCompleted } : {}),
      ...(typeof config.onboardingStep === 'string' ? { onboardingStep: config.onboardingStep } : {}),
      ...(typeof config.onboardingPaused === 'string' ? { onboardingPaused: config.onboardingPaused } : {}),
      ...(typeof config.lastSeenVersion === 'string' ? { lastSeenVersion: config.lastSeenVersion } : {}),
      ...(typeof config.skippedUpdateVersions === 'string' ? { skippedUpdateVersions: config.skippedUpdateVersions } : {}),
      ...(typeof config.seenFeatureHints === 'string' ? { seenFeatureHints: config.seenFeatureHints } : {}),
      ...(typeof config.freeLibraryCapSettled === 'string' ? { freeLibraryCapSettled: config.freeLibraryCapSettled } : {}),
      ...(typeof config.freeLibraryGrandfathered === 'string' ? { freeLibraryGrandfathered: config.freeLibraryGrandfathered } : {}),
    })
  })
}
