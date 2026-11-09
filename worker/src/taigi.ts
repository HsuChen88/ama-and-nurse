import {
  TAIGI_TRANSLATE_VERSION,
  audioCacheKey,
  normalizeChinese,
  readTranslation,
  translationCacheKey,
  writeTranslation,
} from './cache'
import { synthesizeTaiwaneseFallback } from './providers'
import type { Env } from './types'

const TRANSLATE_URL =
  'https://learn-language.tokyo/taigiTransBilling/model2/translate_api_limit'
const TTS_URL =
  'https://learn-language.tokyo/taigiStripe/synth_convert_api_limit_gender_v3'
const PAUSE_DURATION_MS = 30 * 60 * 1000

let taigiPausedUntil = 0

export interface TaiwaneseAudioResult {
  source: 'taigi' | 'fallback' | 'chime'
  normalizedKey: string
  taigiHan: string | null
  translationHit: boolean
  ttsHit: boolean
  mime: 'audio/wav' | 'audio/mpeg'
  audioKey?: string
  bytes?: Uint8Array
}

export async function synthesizeTaiwanese(
  chineseText: string,
  env: Env,
): Promise<TaiwaneseAudioResult> {
  const normalizedChinese = normalizeChinese(chineseText)
  const normalizedKey = await translationCacheKey(normalizedChinese)
  if (Date.now() < taigiPausedUntil) {
    return fallback(chineseText, normalizedKey, null, false, env)
  }

  let taigiHan: string | null = null
  let translationHit = false
  try {
    const cachedTranslation = await readTranslation(env.CACHE_DB, normalizedKey)
    if (cachedTranslation) {
      taigiHan = cachedTranslation.taigi_han
      translationHit = true
    } else {
      taigiHan = await translateWithTaigi(normalizedChinese, env)
      await writeTranslation(env.CACHE_DB, {
        key: normalizedKey,
        normalized_zh: normalizedChinese,
        taigi_han: taigiHan,
        created_at: new Date().toISOString(),
        provider_version: TAIGI_TRANSLATE_VERSION,
      })
    }

    const model = env.TAIGI_TTS_MODEL || 'model7'
    const voice = env.TAIGI_TTS_VOICE || 'normal_f2'
    const speed = numberSetting(env.TAIGI_TTS_SPEED, 1)
    const key = await audioCacheKey(taigiHan, model, voice, speed)
    const cachedAudio = await env.AUDIO_BUCKET.head(key)
    if (cachedAudio) {
      return {
        source: 'taigi',
        normalizedKey,
        taigiHan,
        translationHit,
        ttsHit: true,
        mime: 'audio/wav',
        audioKey: key,
      }
    }

    const audio = await synthesizeWithTaigi(taigiHan, key, model, voice, speed, env)
    await env.AUDIO_BUCKET.put(key, audio, {
      httpMetadata: { contentType: 'audio/wav' },
      customMetadata: { provider: 'taigi-tts-v3' },
    })
    return {
      source: 'taigi',
      normalizedKey,
      taigiHan,
      translationHit,
      ttsHit: false,
      mime: 'audio/wav',
      audioKey: key,
    }
  } catch {
    return fallback(chineseText, normalizedKey, taigiHan, translationHit, env)
  }
}

async function fallback(
  chineseText: string,
  normalizedKey: string,
  taigiHan: string | null,
  translationHit: boolean,
  env: Env,
): Promise<TaiwaneseAudioResult> {
  const audio = await synthesizeTaiwaneseFallback(chineseText, env)
  return {
    ...audio,
    normalizedKey,
    taigiHan,
    translationHit,
    ttsHit: false,
  }
}

async function translateWithTaigi(text: string, env: Env): Promise<string> {
  const response = await taigiFetch(
    'Taigi translation',
    TRANSLATE_URL,
    env.TAIGI_TRANSLATE_API_KEY,
    {
      inputText: text,
      inputLan: 'zhtw',
      outputLan: 'tw',
    },
    numberSetting(env.TAIGI_TRANSLATE_TIMEOUT_MS, 5_000),
  )
  markPausedForQuota(response.status)
  if (!response.ok) throw new Error('Taigi translation failed')
  const body = (await response.json()) as { outputText?: unknown; error?: unknown }
  if (typeof body.outputText !== 'string' || body.outputText.trim().length === 0) {
    throw new Error('Taigi translation returned no text')
  }
  return body.outputText
}

async function synthesizeWithTaigi(
  text: string,
  audioKey: string,
  model: string,
  voice: string,
  speed: number,
  env: Env,
): Promise<Uint8Array> {
  const response = await taigiFetch(
    'Taigi TTS',
    TTS_URL,
    env.TAIGI_TTS_API_KEY,
    { text, model, voice_label: voice, speed, user: '' },
    numberSetting(env.TAIGI_TTS_TIMEOUT_MS, 8_000),
    { 'Idempotency-Key': `ama-${audioKey}` },
  )
  markPausedForQuota(response.status)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!response.ok || !contentType.startsWith('audio/wav')) {
    throw new Error('Taigi TTS failed')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length === 0) throw new Error('Taigi TTS returned empty audio')
  return bytes
}

async function taigiFetch(
  name: string,
  url: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const started = performance.now()
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    console.log(`${name} request completed`, {
      status_code: response.status,
      elapsed_ms: Math.round(performance.now() - started),
    })
    return response
  } catch (error) {
    console.warn(`${name} request failed`, {
      error_type: error instanceof Error ? error.name : typeof error,
      elapsed_ms: Math.round(performance.now() - started),
    })
    throw error
  }
}

function markPausedForQuota(status: number): void {
  if (status === 403 || status === 429) {
    taigiPausedUntil = Date.now() + PAUSE_DURATION_MS
  }
}

function numberSetting(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function resetTaigiPauseForTests(): void {
  taigiPausedUntil = 0
}

export function taigiPauseUntilForTests(): number {
  return taigiPausedUntil
}
