import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Probe in a child process: loading the binding here, then loading it again
// after `npm rebuild` replaced the file, crashes this process (SIGSEGV).
function canOpenSqlite() {
  const result = spawnSync(process.execPath, [
    '-e',
    "new (require('better-sqlite3'))(':memory:').close()",
  ], {cwd: root, stdio: 'ignore'})
  return result.status === 0
}

if (!canOpenSqlite()) {
  console.log('better-sqlite3 is unavailable for the current Node runtime; rebuilding native binding...')
  const result = spawnSync('npm', ['rebuild', 'better-sqlite3'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    console.error('Failed to rebuild better-sqlite3 for tests.')
    process.exit(result.status ?? 1)
  }

  if (!canOpenSqlite()) {
    console.error('better-sqlite3 is still unavailable after rebuild.')
    process.exit(1)
  }
}
