export const TAIGI_TRANSLATE_VERSION = 'taigi-translate-model2'
export const TAIGI_TTS_VERSION = 'taigi-tts-v3'

export interface TranslationCacheEntry {
  key: string
  normalized_zh: string
  taigi_han: string
  created_at: string
  provider_version: string
}

export interface UsageRecord {
  createdAt: string
  zhText: string
  normalizedKey: string
  taigiHan: string | null
  translationHit: boolean
  ttsHit: boolean
  source: 'taigi' | 'fallback' | 'chime'
}

const PUNCTUATION_EQUIVALENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/。/gu, '.'],
  [/、/gu, ','],
]

export function normalizeChinese(text: string): string {
  let normalized = text.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  for (const [pattern, replacement] of PUNCTUATION_EQUIVALENTS) {
    normalized = normalized.replace(pattern, replacement)
  }
  return normalized
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function translationCacheKey(normalizedChinese: string): Promise<string> {
  return sha256Hex(normalizedChinese)
}

export async function audioCacheKey(
  taigiHan: string,
  model: string,
  voice: string,
  speed: number,
): Promise<string> {
  return sha256Hex(
    JSON.stringify({ taigiHan, model, voice, speed, version: TAIGI_TTS_VERSION }),
  )
}

export async function readTranslation(
  database: D1Database,
  key: string,
): Promise<TranslationCacheEntry | null> {
  return database
    .prepare(
      `SELECT key, normalized_zh, taigi_han, created_at, provider_version
       FROM translation_cache WHERE key = ?1`,
    )
    .bind(key)
    .first<TranslationCacheEntry>()
}

export async function writeTranslation(
  database: D1Database,
  entry: TranslationCacheEntry,
): Promise<void> {
  await database
    .prepare(
      `INSERT OR REPLACE INTO translation_cache
       (key, normalized_zh, taigi_han, created_at, provider_version)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    )
    .bind(
      entry.key,
      entry.normalized_zh,
      entry.taigi_han,
      entry.created_at,
      entry.provider_version,
    )
    .run()
}

export async function writeUsage(database: D1Database, record: UsageRecord): Promise<void> {
  await database
    .prepare(
      `INSERT INTO usage_log
       (created_at, zh_text, normalized_key, taigi_han, translation_hit, tts_hit, source)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(
      record.createdAt,
      record.zhText,
      record.normalizedKey,
      record.taigiHan,
      record.translationHit ? 1 : 0,
      record.ttsHit ? 1 : 0,
      record.source,
    )
    .run()
}
