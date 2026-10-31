import { ApiError, errorResponse, upstreamError } from './errors'
import {
  encodeBase64,
  synthesizeIndonesian,
  synthesizePendingTaiwanese,
  transcribe,
  translateText,
} from './providers'
import { SPEAKERS, type Env, type Speaker } from './types'

const MAX_AUDIO_BYTES = 10 * 1024 * 1024

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/health' && request.method === 'GET') return healthResponse()
    if (url.pathname === '/api/translate' && request.method === 'POST') {
      try {
        return await translateResponse(request, env)
      } catch (error) {
        if (error instanceof ApiError) return errorResponse(error)
        console.warn('Translation request failed', { error_type: errorName(error) })
        return errorResponse(upstreamError())
      }
    }
    if (url.pathname.startsWith('/api/')) {
      return errorResponse(new ApiError('NOT_FOUND', 'API endpoint was not found', 404))
    }
    return errorResponse(new ApiError('NOT_FOUND', 'Resource was not found', 404))
  },
}

async function translateResponse(request: Request, env: Env): Promise<Response> {
  const totalStarted = performance.now()
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    throw new ApiError('INVALID_AUDIO', 'Invalid multipart form data', 422)
  }

  const speakerValue = form.get('speaker')
  if (speakerValue !== 'ama' && speakerValue !== 'caregiver') {
    throw new ApiError('INVALID_SPEAKER', 'Speaker must be ama or caregiver', 422)
  }
  const speaker: Speaker = speakerValue
  const audio = form.get('audio')
  if (!(audio instanceof File) || audio.size === 0) {
    throw new ApiError('INVALID_AUDIO', 'Audio file is required', 422)
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new ApiError('INVALID_AUDIO', 'Audio file must not exceed 10 MB', 422)
  }

  const config = SPEAKERS[speaker]
  let started = performance.now()
  const sourceText = await transcribe(audio, config.sourceLang, env)
  const asrMs = elapsedMs(started)
  if (!sourceText.trim()) {
    throw new ApiError('ASR_EMPTY', 'No speech was recognized', 422)
  }

  started = performance.now()
  const translatedText = await translateText(
    sourceText,
    config.translateSource,
    config.translateTarget,
    env,
  )
  const translateMs = elapsedMs(started)

  started = performance.now()
  const synthesized =
    config.targetLang === 'id'
      ? await synthesizeIndonesian(translatedText, env)
      : synthesizePendingTaiwanese()
  const ttsMs = elapsedMs(started)

  return Response.json({
    id: crypto.randomUUID(),
    speaker,
    source_lang: config.sourceLang,
    target_lang: config.targetLang,
    source_text: sourceText,
    translated_text: translatedText,
    audio_url: `data:${synthesized.mime};base64,${encodeBase64(synthesized.bytes)}`,
    audio_mime: synthesized.mime,
    timings_ms: {
      asr: asrMs,
      translate: translateMs,
      tts: ttsMs,
      total: elapsedMs(totalStarted),
    },
  })
}

function healthResponse(): Response {
  return Response.json({
    status: 'ok',
    providers: {
      asr_nan: 'remote',
      asr_id: 'remote',
      translate: 'google',
      tts_id: 'google',
      tts_nan: 'pending',
    },
  })
}

function elapsedMs(started: number): number {
  return Math.round(performance.now() - started)
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error
}
