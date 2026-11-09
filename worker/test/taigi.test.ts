import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TAIGI_TRANSLATE_VERSION,
  audioCacheKey,
  normalizeChinese,
  translationCacheKey,
  writeUsage,
} from '../src/cache'
import {
  resetTaigiPauseForTests,
  synthesizeTaiwanese,
  taigiPauseUntilForTests,
} from '../src/taigi'
import {
  MemoryAudioBucket,
  MemoryDatabase,
  jsonResponse,
  makeTestEnv,
} from './helpers'

beforeEach(() => resetTaigiPauseForTests())
afterEach(() => vi.restoreAllMocks())

describe('Taigi cache normalization', () => {
  it('normalizes NFKC, whitespace, and punctuation without removing punctuation', () => {
    expect(normalizeChinese('  ＡＢＣ\t  你好？！。　、保留，；  ')).toBe(
      'ABC 你好?!. ,保留,;',
    )
  })

  it('keeps semantically meaningful question marks and periods in cache keys', async () => {
    expect(normalizeChinese('你要吃飯了嗎？')).toBe('你要吃飯了嗎?')
    expect(normalizeChinese('你要吃飯了嗎。')).toBe('你要吃飯了嗎.')
    expect(await translationCacheKey(normalizeChinese('你要吃飯了嗎？'))).not.toBe(
      await translationCacheKey(normalizeChinese('你要吃飯了嗎')),
    )
  })
})

describe('Taigi service and cache', () => {
  it('uses a translation cache hit without calling the translation API', async () => {
    const database = new MemoryDatabase()
    const bucket = new MemoryAudioBucket()
    const normalized = normalizeChinese('阿嬤哪裡痛？')
    const key = await translationCacheKey(normalized)
    database.translations.set(key, {
      key,
      normalized_zh: normalized,
      taigi_han: '阿媽佗位疼?',
      created_at: new Date().toISOString(),
      provider_version: TAIGI_TRANSLATE_VERSION,
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'audio/wav' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await synthesizeTaiwanese(
      '阿嬤哪裡痛？',
      makeTestEnv({
        CACHE_DB: database as unknown as D1Database,
        AUDIO_BUCKET: bucket as unknown as R2Bucket,
      }),
    )

    expect(result).toMatchObject({ source: 'taigi', translationHit: true, ttsHit: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('taigiStripe')
  })

  it('uses an R2 TTS hit without calling either Taigi API', async () => {
    const database = new MemoryDatabase()
    const bucket = new MemoryAudioBucket()
    const normalized = normalizeChinese('你好。')
    const key = await translationCacheKey(normalized)
    database.translations.set(key, {
      key,
      normalized_zh: normalized,
      taigi_han: '你好.',
      created_at: new Date().toISOString(),
      provider_version: TAIGI_TRANSLATE_VERSION,
    })
    const expectedAudioKey = await audioCacheKey('你好.', 'model7', 'normal_f2', 1)
    await bucket.put(expectedAudioKey, new Uint8Array([9]), {
      httpMetadata: { contentType: 'audio/wav' },
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await synthesizeTaiwanese(
      '你好。',
      makeTestEnv({
        CACHE_DB: database as unknown as D1Database,
        AUDIO_BUCKET: bucket as unknown as R2Bucket,
      }),
    )

    expect(result).toMatchObject({
      source: 'taigi',
      translationHit: true,
      ttsHit: true,
      audioKey: expectedAudioKey,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('writes successful translation and WAV results to their two cache layers', async () => {
    const database = new MemoryDatabase()
    const bucket = new MemoryAudioBucket()
    const fetchMock = mockSuccessfulTaigi()
    vi.stubGlobal('fetch', fetchMock)

    const result = await synthesizeTaiwanese(
      '  阿嬤　好嗎？ ',
      makeTestEnv({
        CACHE_DB: database as unknown as D1Database,
        AUDIO_BUCKET: bucket as unknown as R2Bucket,
      }),
    )

    expect(result).toMatchObject({ source: 'taigi', translationHit: false, ttsHit: false })
    expect(database.translations.size).toBe(1)
    expect([...database.translations.values()][0]).toMatchObject({
      normalized_zh: '阿嬤 好嗎?',
      taigi_han: '阿媽敢好?',
      provider_version: TAIGI_TRANSLATE_VERSION,
    })
    expect(bucket.values.get(result.audioKey!)).toMatchObject({ contentType: 'audio/wav' })
  })

  it.each([
    ['translation error', 'translate-error'],
    ['translation timeout', 'translate-timeout'],
    ['TTS JSON error', 'tts-error'],
    ['TTS timeout', 'tts-timeout'],
  ])('uses inference fallback for %s and never caches fallback audio', async (_name, mode) => {
    const database = new MemoryDatabase()
    const bucket = new MemoryAudioBucket()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('taigiTransBilling')) {
        if (mode === 'translate-error') return jsonResponse({ error: 'failure' }, 500)
        if (mode === 'translate-timeout') throw new DOMException('timed out', 'TimeoutError')
        return jsonResponse({ outputText: '阿媽敢好?' })
      }
      if (url.includes('taigiStripe')) {
        if (mode === 'tts-timeout') throw new DOMException('timed out', 'TimeoutError')
        return jsonResponse({ error: 'silent audio' })
      }
      if (url.includes('/v1/tts')) {
        return new Response(new Uint8Array([7, 8]), {
          headers: { 'Content-Type': 'audio/mpeg' },
        })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await synthesizeTaiwanese(
      '阿嬤好嗎？',
      makeTestEnv({
        CACHE_DB: database as unknown as D1Database,
        AUDIO_BUCKET: bucket as unknown as R2Bucket,
      }),
    )

    expect(result).toMatchObject({ source: 'fallback', mime: 'audio/mpeg' })
    expect(bucket.values.size).toBe(0)
    expect(database.translations.size).toBe(mode.startsWith('translate-') ? 0 : 1)
  })

  it.each([403, 429])('pauses Taigi for 30 minutes after status %i', async (status) => {
    const database = new MemoryDatabase()
    const bucket = new MemoryAudioBucket()
    let taigiCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('learn-language.tokyo')) {
        taigiCalls += 1
        return jsonResponse({ error: 'quota' }, status)
      }
      return new Response(new Uint8Array([1]), {
        headers: { 'Content-Type': 'audio/mpeg' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const env = makeTestEnv({
      CACHE_DB: database as unknown as D1Database,
      AUDIO_BUCKET: bucket as unknown as R2Bucket,
    })

    await synthesizeTaiwanese('第一句。', env)
    await synthesizeTaiwanese('第二句。', env)

    expect(taigiCalls).toBe(1)
    expect(taigiPauseUntilForTests()).toBeGreaterThan(Date.now() + 29 * 60 * 1000)
  })

  it('never writes API keys or text to console logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', mockSuccessfulTaigi())
    const env = makeTestEnv({
      TAIGI_TRANSLATE_API_KEY: 'translate-super-secret',
      TAIGI_TTS_API_KEY: 'tts-super-secret',
    })

    await synthesizeTaiwanese('不可出現在 console 的全文。', env)

    const output = JSON.stringify([...log.mock.calls, ...warn.mock.calls])
    expect(output).not.toContain('translate-super-secret')
    expect(output).not.toContain('tts-super-secret')
    expect(output).not.toContain('不可出現在 console 的全文')
  })
})

it('writes only approved usage fields', async () => {
  const database = new MemoryDatabase()
  await writeUsage(database as unknown as D1Database, {
    createdAt: '2026-11-10T00:00:00.000Z',
    zhText: '阿嬤好嗎？',
    normalizedKey: 'hash',
    taigiHan: '阿媽敢好?',
    translationHit: true,
    ttsHit: false,
    source: 'taigi',
  })

  expect(database.usage).toEqual([
    ['2026-11-10T00:00:00.000Z', '阿嬤好嗎？', 'hash', '阿媽敢好?', 1, 0, 'taigi'],
  ])
  expect(JSON.stringify(database.usage)).not.toMatch(/cost|fee|latency|elapsed|timing/i)
})

function mockSuccessfulTaigi() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('taigiTransBilling')) {
      return jsonResponse({ outputText: '阿媽敢好?', tokens: 5, taiwaneseInvolved: true })
    }
    if (url.includes('taigiStripe')) {
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'audio/wav' },
      })
    }
    throw new Error(`Unexpected URL: ${url}`)
  })
}
