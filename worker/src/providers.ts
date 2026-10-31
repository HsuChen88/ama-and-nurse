import { ApiError, upstreamError } from './errors'
import { getGoogleAccessToken } from './google-auth'
import { TranslationGlossary } from './glossary'
import type { ApiLanguage, Env, GoogleLanguage } from './types'

const glossary = new TranslationGlossary()
const FORWARDED_INFERENCE_ERRORS = new Set([
  'AUDIO_TOO_SHORT',
  'AUDIO_TOO_LONG',
  'INVALID_AUDIO',
])

export async function transcribe(
  audio: File,
  language: ApiLanguage,
  env: Env,
): Promise<string> {
  const form = new FormData()
  form.append('audio', audio, audio.name || 'recording')
  form.append('language', language)
  const headers = new Headers({ Authorization: `Bearer ${env.INFERENCE_API_TOKEN}` })
  if (env.INFERENCE_CF_ACCESS_CLIENT_ID) {
    headers.set('CF-Access-Client-Id', env.INFERENCE_CF_ACCESS_CLIENT_ID)
  }
  if (env.INFERENCE_CF_ACCESS_CLIENT_SECRET) {
    headers.set('CF-Access-Client-Secret', env.INFERENCE_CF_ACCESS_CLIENT_SECRET)
  }

  const started = performance.now()
  let response: Response
  try {
    response = await fetch(`${env.INFERENCE_BASE_URL.replace(/\/$/, '')}/v1/asr`, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(numberSetting(env.INFERENCE_TIMEOUT_MS, 30_000)),
    })
  } catch {
    console.warn('Inference ASR request failed', { elapsed_ms: elapsedMs(started) })
    throw upstreamError()
  }
  console.log('Inference ASR request completed', {
    status_code: response.status,
    elapsed_ms: elapsedMs(started),
  })
  if (!response.ok) {
    const code = await responseErrorCode(response)
    if (code && FORWARDED_INFERENCE_ERRORS.has(code)) {
      throw new ApiError(code, inferenceErrorMessage(code), 422)
    }
    if (code === 'PAYLOAD_TOO_LARGE') {
      throw new ApiError('INVALID_AUDIO', 'Audio file must not exceed 10 MB', 422)
    }
    throw upstreamError()
  }

  try {
    const body = (await response.json()) as { text?: unknown }
    if (typeof body.text !== 'string') throw new Error()
    return body.text
  } catch {
    throw upstreamError()
  }
}

export async function translateText(
  text: string,
  source: GoogleLanguage,
  target: GoogleLanguage,
  env: Env,
): Promise<string> {
  const timeoutMs = numberSetting(env.GOOGLE_TIMEOUT_MS, 15_000)
  const { token, projectId } = await getGoogleAccessToken(env.GOOGLE_TRANSLATE_SA_JSON, timeoutMs)
  const protectedText = glossary.prepare(text, source, target)
  const url = `https://translation.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/locations/global:translateText`
  const response = await googleFetch(
    'Google Translation',
    url,
    token,
    {
      contents: [protectedText],
      sourceLanguageCode: source,
      targetLanguageCode: target,
      mimeType: 'text/html',
    },
    timeoutMs,
  )
  try {
    const body = (await response.json()) as {
      translations?: Array<{ translatedText?: unknown }>
    }
    const translated = body.translations?.[0]?.translatedText
    if (typeof translated !== 'string') throw new Error()
    return glossary.restore(translated, target)
  } catch {
    throw upstreamError()
  }
}

export async function synthesizeIndonesian(
  text: string,
  env: Env,
): Promise<{ bytes: Uint8Array; mime: 'audio/mpeg' }> {
  const timeoutMs = numberSetting(env.GOOGLE_TIMEOUT_MS, 15_000)
  const { token } = await getGoogleAccessToken(env.GOOGLE_TTS_SA_JSON, timeoutMs)
  const makeBody = (includeRate: boolean) => ({
    input: { text },
    voice: { languageCode: 'id-ID', name: env.TTS_ID_VOICE },
    audioConfig: {
      audioEncoding: 'MP3',
      ...(includeRate
        ? { speakingRate: numberSetting(env.TTS_ID_SPEAKING_RATE, 0.9) }
        : {}),
    },
  })

  let response = await googleFetchAllowError(
    'Google TTS',
    'https://texttospeech.googleapis.com/v1/text:synthesize',
    token,
    makeBody(true),
    timeoutMs,
  )
  if (response.status === 400 && (await isInvalidArgument(response.clone()))) {
    response = await googleFetchAllowError(
      'Google TTS retry',
      'https://texttospeech.googleapis.com/v1/text:synthesize',
      token,
      makeBody(false),
      timeoutMs,
    )
  }
  if (!response.ok) throw upstreamError()

  try {
    const body = (await response.json()) as { audioContent?: unknown }
    if (typeof body.audioContent !== 'string') throw new Error()
    return { bytes: decodeBase64(body.audioContent), mime: 'audio/mpeg' }
  } catch {
    throw upstreamError()
  }
}

export function synthesizePendingTaiwanese(): { bytes: Uint8Array; mime: 'audio/wav' } {
  const sampleRate = 16_000
  const frameCount = Math.floor(sampleRate * 0.35)
  const bytes = new Uint8Array(44 + frameCount * 2)
  const view = new DataView(bytes.buffer)
  writeAscii(bytes, 0, 'RIFF')
  view.setUint32(4, 36 + frameCount * 2, true)
  writeAscii(bytes, 8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(bytes, 36, 'data')
  view.setUint32(40, frameCount * 2, true)
  for (let index = 0; index < frameCount; index += 1) {
    const sample = Math.trunc(
      0.2 * 32_767 * Math.sin((2 * Math.PI * 392 * index) / sampleRate),
    )
    view.setInt16(44 + index * 2, sample, true)
  }
  return { bytes, mime: 'audio/wav' }
}

async function googleFetch(
  name: string,
  url: string,
  token: string,
  body: unknown,
  timeoutMs: number,
): Promise<Response> {
  const response = await googleFetchAllowError(name, url, token, body, timeoutMs)
  if (!response.ok) throw upstreamError()
  return response
}

async function googleFetchAllowError(
  name: string,
  url: string,
  token: string,
  body: unknown,
  timeoutMs: number,
): Promise<Response> {
  const started = performance.now()
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    console.log(`${name} request completed`, {
      status_code: response.status,
      elapsed_ms: elapsedMs(started),
    })
    return response
  } catch {
    console.warn(`${name} request failed`, { elapsed_ms: elapsedMs(started) })
    throw upstreamError()
  }
}

async function responseErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } }
    return typeof body.error?.code === 'string' ? body.error.code : undefined
  } catch {
    return undefined
  }
}

async function isInvalidArgument(response: Response): Promise<boolean> {
  try {
    const body = (await response.json()) as { error?: { status?: unknown } }
    return body.error?.status === 'INVALID_ARGUMENT'
  } catch {
    return false
  }
}

function inferenceErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    AUDIO_TOO_SHORT: 'Audio must be at least 0.5 seconds long',
    AUDIO_TOO_LONG: 'Audio must not exceed 30 seconds',
    INVALID_AUDIO: 'Audio could not be decoded',
  }
  return messages[code] ?? 'Invalid audio'
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function encodeBase64(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index)
  }
}

function elapsedMs(started: number): number {
  return Math.round(performance.now() - started)
}

function numberSetting(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
