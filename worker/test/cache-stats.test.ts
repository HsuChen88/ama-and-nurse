import { describe, expect, it, vi } from 'vitest'
import {
  CACHE_STAT_QUERIES,
  cacheStatsCommand,
  runCacheStats,
} from '../scripts/cache-stats-lib'

describe('cache statistics script', () => {
  it('assembles remote D1 commands for every required statistic', () => {
    for (const query of CACHE_STAT_QUERIES) {
      expect(cacheStatsCommand(query.sql)).toEqual([
        'd1',
        'execute',
        'ama-translator-cache',
        '--remote',
        '--command',
        query.sql,
        '--json',
      ])
    }
    expect(CACHE_STAT_QUERIES.map(({ sql }) => sql).join('\n')).toMatch(/COUNT\(\*\)/)
    expect(CACHE_STAT_QUERIES.map(({ sql }) => sql).join('\n')).toMatch(/translation_hit/)
    expect(CACHE_STAT_QUERIES.map(({ sql }) => sql).join('\n')).toMatch(/tts_hit/)
    expect(CACHE_STAT_QUERIES.map(({ sql }) => sql).join('\n')).toMatch(/GROUP BY source/)
    expect(CACHE_STAT_QUERIES.map(({ sql }) => sql).join('\n')).toMatch(/LIMIT 20/)
  })

  it('runs only remote read queries and prints each result', () => {
    const run = vi.fn().mockReturnValue('[{"results":[]}]\n')
    const write = vi.fn()

    runCacheStats(run, write)

    expect(run).toHaveBeenCalledTimes(CACHE_STAT_QUERIES.length)
    expect(run.mock.calls.every(([args]) => args.includes('--remote'))).toBe(true)
    expect(write).toHaveBeenCalledWith('[{"results":[]}]')
  })
})
