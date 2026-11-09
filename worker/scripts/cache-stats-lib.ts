const DATABASE_NAME = 'ama-translator-cache'

export const CACHE_STAT_QUERIES = [
  {
    label: 'Total requests',
    sql: 'SELECT COUNT(*) AS total_requests FROM usage_log',
  },
  {
    label: 'Translation cache hit rate',
    sql: `SELECT ROUND(100.0 * SUM(translation_hit) / NULLIF(COUNT(*), 0), 2)
          AS translation_hit_rate_percent FROM usage_log`,
  },
  {
    label: 'TTS cache hit rate',
    sql: `SELECT ROUND(100.0 * SUM(tts_hit) / NULLIF(COUNT(*), 0), 2)
          AS tts_hit_rate_percent FROM usage_log`,
  },
  {
    label: 'Source distribution',
    sql: `SELECT source, COUNT(*) AS request_count FROM usage_log
          GROUP BY source ORDER BY request_count DESC`,
  },
  {
    label: 'Top 20 Chinese and Taiwanese sentences',
    sql: `SELECT zh_text, taigi_han, COUNT(*) AS request_count FROM usage_log
          WHERE taigi_han IS NOT NULL
          GROUP BY zh_text, taigi_han ORDER BY request_count DESC LIMIT 20`,
  },
] as const

export type Runner = (args: string[]) => string
export type Writer = (line: string) => void

export function cacheStatsCommand(sql: string): string[] {
  return ['d1', 'execute', DATABASE_NAME, '--remote', '--command', sql, '--json']
}

export function runCacheStats(run: Runner, write: Writer): void {
  for (const query of CACHE_STAT_QUERIES) {
    write(`\n${query.label}`)
    write(run(cacheStatsCommand(query.sql)).trim())
  }
}
