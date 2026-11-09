import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { runCacheStats } from './cache-stats-lib'

function runWrangler(args: string[]): string {
  return execFileSync('pnpm', ['wrangler', ...args], { encoding: 'utf8' })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCacheStats(runWrangler, console.log)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Cache statistics command failed')
    process.exitCode = 1
  }
}
