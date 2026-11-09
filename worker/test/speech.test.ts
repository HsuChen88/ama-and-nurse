import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import {
  TAIGI_TRANSLATE_VERSION,
  audioCacheKey,
  normalizeChinese,
  translationCacheKey,
} from '../src/cache'
import { resetGoogleTokenCacheForTests } from '../src/google-auth'
import { inviteKey, issueDeviceToken } from '../src/session'
import { issueSpeechToken } from '../src/speech-token'
import { resetTaigiPauseForTests } from '../src/taigi'
import type { Env } from '../src/types'
import {
  MemoryAudioBucket,
  MemoryDatabase,
  jsonResponse,
  makeServiceAccount,
  makeTestEnv,
} from './helpers'

let ttsServiceAccount = ''
let env: Env
let deviceCookie: string

beforeAll(async () => {
  ttsServiceAccount = (await makeServiceAccount('tts@example.invalid', 'tts-project')).json
})

beforeEach(async () => {
  resetGoogleTokenCacheForTests()
  resetTaigiPauseForTests()
  env = makeTestEnv({ GOOGLE_TTS_SA_JSON: ttsServiceAccount })
  await env.INVITES.put(inviteKey('ABCDEFGH'), '{}')
  deviceCookie = `ama_device=${await issueDeviceToken('ABCDEFGH', env.DEVICE_SIGNING_KEY)}`
})

afterEach(() => vi.restoreAllMocks())

describe('GET /api/speech/:token', () => {
  it('requires an activated device before validating the token', async () => {
    const token = await issueSpeechToken('id', 'Halo', env.DEVICE_SIGNING_KEY)
    const response = await worker.fetch(speechRequest(token), env)

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_ACTIVATED' } })
  })

  it('returns NOT_FOUND for invalid, tampered, and expired tokens', async () => {
    const valid = await issueSpeechToken('id', 'Halo', env.DEVICE_SIGNING_KEY)
    const expired = await issueSpeechToken('id', 'Halo', env.DEVICE_SIGNING_KEY, 1)
    const requests = [
      'invalid-token',
      `${valid.slice(0, -1)}${valid.endsWith('A') ? 'B' : 'A'}`,
      expired,
    ]

    for (const token of requests) {
      const response = await worker.fetch(speechRequest(token, deviceCookie), env)
      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
    }
  })

  it('synthesizes Indonesian speech through Google TTS', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/token')) return jsonResponse({ access_token: 'google-token', expires_in: 3600 })
      if (url.includes('texttospeech.googleapis.com')) {
        expect(JSON.parse(init?.body as string)).toMatchObject({
          input: { text: 'Sudah makan?' },
          voice: { languageCode: 'id-ID' },
        })
        return jsonResponse({ audioContent: btoa('mp3-audio') })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const token = await issueSpeechToken('id', 'Sudah makan?', env.DEVICE_SIGNING_KEY)

    const response = await worker.fetch(speechRequest(token, deviceCookie), env)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=86400')
    expect(response.headers.get('X-Audio-Source')).toBeNull()
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe('mp3-audio')
  })

  it('serves a Taigi R2 cache hit without calling Taigi and logs usage asynchronously', async () => {
    const database = new MemoryDatabase()
    const bucket = new MemoryAudioBucket()
    env = makeTestEnv({
      CACHE_DB: database as unknown as D1Database,
      AUDIO_BUCKET: bucket as unknown as R2Bucket,
    })
    await env.INVITES.put(inviteKey('ABCDEFGH'), '{}')
    deviceCookie = `ama_device=${await issueDeviceToken('ABCDEFGH', env.DEVICE_SIGNING_KEY)}`
    const chinese = '阿嬤哪裡痛？'
    const normalized = normalizeChinese(chinese)
    const translationKey = await translationCacheKey(normalized)
    database.translations.set(translationKey, {
      key: translationKey,
      normalized_zh: normalized,
      taigi_han: '阿媽佗位疼?',
      created_at: new Date().toISOString(),
      provider_version: TAIGI_TRANSLATE_VERSION,
    })
    const cachedAudioKey = await audioCacheKey('阿媽佗位疼?', 'model7', 'normal_f2', 1)
    await bucket.put(cachedAudioKey, new Uint8Array([1, 2, 3]), {
      httpMetadata: { contentType: 'audio/wav' },
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const pending: Promise<unknown>[] = []
    const waitUntil = vi.fn((promise: Promise<unknown>) => pending.push(promise))
    const token = await issueSpeechToken('nan-TW', chinese, env.DEVICE_SIGNING_KEY)

    const response = await worker.fetch(
      speechRequest(token, deviceCookie),
      env,
      { waitUntil } as unknown as ExecutionContext,
    )
    await Promise.all(pending)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('audio/wav')
    expect(response.headers.get('X-Audio-Source')).toBe('taigi')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(waitUntil).toHaveBeenCalledOnce()
    expect(database.usage[0]).toEqual([
      expect.any(String),
      chinese,
      translationKey,
      '阿媽佗位疼?',
      1,
      1,
      'taigi',
    ])
  })

  it('returns titan fallback audio without writing it to R2', async () => {
    const bucket = new MemoryAudioBucket()
    env = makeTestEnv({ AUDIO_BUCKET: bucket as unknown as R2Bucket })
    await env.INVITES.put(inviteKey('ABCDEFGH'), '{}')
    deviceCookie = `ama_device=${await issueDeviceToken('ABCDEFGH', env.DEVICE_SIGNING_KEY)}`
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('taigiTransBilling')) return jsonResponse({ error: 'unavailable' }, 500)
      if (url.includes('/v1/tts')) {
        return new Response(new Uint8Array([7, 8]), {
          headers: { 'Content-Type': 'audio/mpeg' },
        })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const token = await issueSpeechToken('nan-TW', '阿嬤好嗎？', env.DEVICE_SIGNING_KEY)

    const response = await worker.fetch(speechRequest(token, deviceCookie), env)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(response.headers.get('X-Audio-Source')).toBe('fallback')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([7, 8]))
    expect(bucket.values.size).toBe(0)
  })
})

function speechRequest(token: string, cookie?: string): Request {
  return new Request(`https://app.ama-ama.com/api/speech/${token}`, {
    headers: cookie ? { Cookie: cookie } : undefined,
  })
}
