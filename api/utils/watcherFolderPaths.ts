import path from 'path'
import { normalizeMediaPath } from './normalizeUserPath'
import { trimTrailingSeparators } from '../../shared/mediaPath'

export function buildFolderPathLikePatterns(folderPath: string): string[] {
  const normalized = trimTrailingSeparators(normalizeMediaPath(folderPath))
  if (!normalized) return []

  const patterns = new Set<string>()
  for (const sep of ['/', '\\']) {
    patterns.add(`${normalized}${sep}%`)
  }

  const resolved = trimTrailingSeparators(path.resolve(normalized))
  if (resolved !== normalized) {
    for (const sep of ['/', '\\']) {
      patterns.add(`${resolved}${sep}%`)
    }
  }

  return [...patterns]
}
