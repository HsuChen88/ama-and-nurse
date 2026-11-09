import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { resetGoogleTokenCacheForTests } from '../src/google-auth'
import { inviteKey, issueDeviceToken } from '../src/session'
import { resetTaigiPauseForTests } from '../src/taigi'
import type { Env } from '../src/types'
import { audioRequest, jsonResponse, makeServiceAccount, makeTestEnv } from './helpers'

let env: Env
let deviceCookie: string
let translateServiceAccount = ''
let ttsServiceAccount = ''

beforeAll(async () => {
  const translateAccount = await makeServiceAccount('translate@example.invalid', 'translate-project')
  const ttsAccount = await makeServiceAccount('tts@example.invalid', 'tts-project')
  translateServiceAccount = translateAccount.json
  ttsServiceAccount = ttsAccount.json
})

beforeEach(async () => {
  resetGoogleTokenCacheForTests()
  resetTaigiPauseForTests()
  env = makeTestEnv({
    GOOGLE_TRANSLATE_SA_JSON: translateServiceAccount,
    GOOGLE_TTS_SA_JSON: ttsServiceAccount,
  })
  await env.INVITES.put(inviteKey('ABCDEFGH'), '{}')
  deviceCookie = `ama_device=${await issueDeviceToken('ABCDEFGH', env.DEVICE_SIGNING_KEY)}`
})
afterEach(() => vi.unstubAllGlobals())

describe('Worker API', () => {
  it('runs the complete ama translation flow through mocked providers', async () => {
    const urls: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      urls.push(url)
      if (url === 'https://inference.example/v1/asr') {
        const headers = new Headers(init?.headers)
        expect(headers.get('Authorization')).toBe('Bearer inference-token')
        expect(headers.get('CF-Access-Client-Id')).toBe('access-client-id')
        expect(headers.get('CF-Access-Client-Secret')).toBe('access-client-secret')
        const form = init?.body as FormData
        expect(form.get('language')).toBe('nan-TW')
        expect(await (form.get('audio') as File).text()).toBe('browser-audio')
        return jsonResponse({ text: '阿罵食飽未？' })
      }
      if (url === 'https://oauth2.googleapis.com/token') {
        return jsonResponse({ access_token: `token-${urls.length}`, expires_in: 3600 })
      }
      if (url.includes('translation.googleapis.com')) {
        expect(JSON.parse(init?.body as string)).toEqual({
          contents: ['<span translate="no">Nenek</span>食飽未？'],
          sourceLanguageCode: 'zh-TW',
          targetLanguageCode: 'id',
          mimeType: 'text/html',
        })
        return jsonResponse({
          translations: [{ translatedText: '<span translate="no">Nenek</span> sudah makan?' }],
        })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await worker.fetch(audioRequest('ama', undefined, deviceCookie), env)
    const body = (await response.json()) as {
      [key: string]: unknown
      id: string
      timings_ms: Record<string, unknown>
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      speaker: 'ama',
      source_lang: 'nan-TW',
      target_lang: 'id',
      source_text: '阿罵食飽未？',
      translated_text: 'Nenek sudah makan?',
    })
    expect(body.audio_url).toMatch(/^\/api\/speech\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(body).not.toHaveProperty('audio_mime')
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(Object.keys(body.timings_ms)).toEqual(['asr', 'translate', 'total'])
    expect(Object.values(body.timings_ms).every((value) => typeof value === 'number')).toBe(true)
    expect(urls).toHaveLength(3)
  })

  it('returns caregiver text without calling any TTS provider', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/v1/asr')) return jsonResponse({ text: 'Nenek sakit di mana?' })
      if (url.includes('/token')) return jsonResponse({ access_token: 'token', expires_in: 3600 })
      if (url.includes('translation.googleapis.com')) {
        return jsonResponse({
          translations: [{ translatedText: '<span translate="no">阿嬤</span>哪裡痛？' }],
        })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await worker.fetch(audioRequest('caregiver', undefined, deviceCookie), env)
    const body = (await response.json()) as Record<string, string>

    expect(body.target_lang).toBe('nan-TW')
    expect(body.translated_text).toBe('阿嬤哪裡痛？')
    expect(body.audio_url).toMatch(/^\/api\/speech\//)
    expect(body).not.toHaveProperty('audio_mime')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('texttospeech'))).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('learn-language'))).toBe(false)
  })

  it.each([
    ['AUDIO_TOO_SHORT', 'AUDIO_TOO_SHORT'],
    ['AUDIO_TOO_LONG', 'AUDIO_TOO_LONG'],
    ['INVALID_AUDIO', 'INVALID_AUDIO'],
    ['PAYLOAD_TOO_LARGE', 'INVALID_AUDIO'],
  ])('maps inference %s to API %s', async (inferenceCode, apiCode) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { code: inferenceCode, message: 'detail' } }, 422)),
    )
    const response = await worker.fetch(audioRequest('ama', undefined, deviceCookie), env)
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: { code: apiCode } })
  })

  it.each(['MODEL_ERROR', 'BUSY', 'UNAUTHORIZED'])('maps inference %s to UPSTREAM_ERROR', async (code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { code } }, code === 'BUSY' ? 503 : 500)),
    )
    const response = await worker.fetch(audioRequest('ama', undefined, deviceCookie), env)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: { code: 'UPSTREAM_ERROR' } })
  })

  it('maps an inference connection failure to UPSTREAM_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection failed')))
    const response = await worker.fetch(audioRequest('ama', undefined, deviceCookie), env)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: { code: 'UPSTREAM_ERROR' } })
  })

  it('returns ASR_EMPTY for blank recognition', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ text: '  ' })))
    const response = await worker.fetch(audioRequest('ama', undefined, deviceCookie), env)
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: { code: 'ASR_EMPTY' } })
  })

  it('rejects audio larger than 10 MB before calling inference', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const audio = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'audio/webm' })
    const response = await worker.fetch(audioRequest('ama', audio, deviceCookie), env)
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_AUDIO' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates speaker and audio fields', async () => {
    const invalidSpeaker = await worker.fetch(audioRequest('other', undefined, deviceCookie), env)
    expect(await invalidSpeaker.json()).toMatchObject({ error: { code: 'INVALID_SPEAKER' } })

    const form = new FormData()
    form.append('speaker', 'ama')
    const missingAudio = await worker.fetch(
      new Request('https://ama.example/api/translate', {
        method: 'POST',
        body: form,
        headers: { Cookie: deviceCookie },
      }),
      env,
    )
    expect(await missingAudio.json()).toMatchObject({ error: { code: 'INVALID_AUDIO' } })
  })

  it('reports provider health and JSON 404 for unknown API routes', async () => {
    const health = await worker.fetch(new Request('https://ama.example/api/health'), env)
    expect(await health.json()).toEqual({
      status: 'ok',
      providers: {
        asr_nan: 'remote',
        asr_id: 'remote',
        translate: 'google',
        tts_id: 'google',
        tts_nan: 'taigi',
        fallback: 'remote',
      },
    })

    const missing = await worker.fetch(new Request('https://ama.example/api/unknown'), env)
    expect(missing.status).toBe(404)
    expect(missing.headers.get('content-type')).toContain('application/json')
    expect(await missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
  })
})
