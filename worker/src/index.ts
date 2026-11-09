import { ApiError, errorResponse, upstreamError } from './errors'
import { writeUsage } from './cache'
import {
  encodeBase64,
  synthesizeIndonesian,
  transcribe,
  translateText,
} from './providers'
import {
  authenticateDevice,
  inviteExists,
  issueDeviceToken,
  normalizeInviteCode,
  refreshedCookie,
  serializeDeviceCookie,
} from './session'
import { SPEAKERS, type Env, type Speaker } from './types'
import { synthesizeTaiwanese } from './taigi'

const MAX_AUDIO_BYTES = 10 * 1024 * 1024

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/health' && request.method === 'GET') return healthResponse()
    if (url.pathname === '/api/session' && request.method === 'GET') {
      return sessionResponse(request, env)
    }
    if (url.pathname === '/api/activate' && request.method === 'POST') {
      return activateResponse(request, env)
    }
    if (url.pathname.startsWith('/join/') && request.method === 'GET') {
      return joinResponse(url.pathname.slice('/join/'.length), env)
    }
    if (url.pathname === '/api/translate' && request.method === 'POST') {
      const session = await authenticateDevice(request, env)
      if (!session) {
        return errorResponse(new ApiError('NOT_ACTIVATED', 'Device is not activated', 401))
      }
      let response: Response
      try {
        response = await translateResponse(request, env, ctx)
      } catch (error) {
        if (error instanceof ApiError) response = errorResponse(error)
        else {
          console.warn('Translation request failed', { error_type: errorName(error) })
          response = errorResponse(upstreamError())
        }
      }
      const cookie = await refreshedCookie(session, env.DEVICE_SIGNING_KEY)
      if (cookie) response.headers.set('Set-Cookie', cookie)
      return response
    }
    if (url.pathname.startsWith('/api/')) {
      return errorResponse(new ApiError('NOT_FOUND', 'API endpoint was not found', 404))
    }
    return errorResponse(new ApiError('NOT_FOUND', 'Resource was not found', 404))
  },
}

async function sessionResponse(request: Request, env: Env): Promise<Response> {
  try {
    const session = await authenticateDevice(request, env)
    const response = Response.json({ activated: session !== null })
    if (session) {
      const cookie = await refreshedCookie(session, env.DEVICE_SIGNING_KEY)
      if (cookie) response.headers.set('Set-Cookie', cookie)
    }
    return response
  } catch {
    return Response.json({ activated: false })
  }
}

async function activateResponse(request: Request, env: Env): Promise<Response> {
  let code: string | null = null
  try {
    const body = (await request.json()) as { code?: unknown }
    code = normalizeInviteCode(body.code)
  } catch {
    // Invalid JSON is reported as INVALID_CODE, without logging the submitted value.
  }
  if (!code || !(await inviteExists(code, env.INVITES))) {
    return errorResponse(new ApiError('INVALID_CODE', 'Invite code is invalid or revoked', 422))
  }

  const token = await issueDeviceToken(code, env.DEVICE_SIGNING_KEY)
  return Response.json(
    { activated: true },
    { headers: { 'Set-Cookie': serializeDeviceCookie(token) } },
  )
}

async function joinResponse(pathCode: string, env: Env): Promise<Response> {
  const code = normalizeInviteCode(pathCode)
  if (!code || !(await inviteExists(code, env.INVITES))) {
    return new Response(null, { status: 302, headers: { Location: '/?invite=invalid' } })
  }
  const token = await issueDeviceToken(code, env.DEVICE_SIGNING_KEY)
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': serializeDeviceCookie(token),
    },
  })
}

async function translateResponse(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response> {
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
  const synthesized = config.targetLang === 'id'
    ? await synthesizeIndonesian(translatedText, env)
    : await synthesizeTaiwanese(translatedText, env)
  const ttsMs = elapsedMs(started)

  if (config.targetLang === 'nan-TW' && 'source' in synthesized) {
    const usage = writeUsage(env.CACHE_DB, {
      createdAt: new Date().toISOString(),
      zhText: translatedText,
      normalizedKey: synthesized.normalizedKey,
      taigiHan: synthesized.taigiHan,
      translationHit: synthesized.translationHit,
      ttsHit: synthesized.ttsHit,
      source: synthesized.source,
    }).catch(() => {
      console.warn('Usage log write failed')
    })
    if (ctx) ctx.waitUntil(usage)
    else void usage
  }

  const audioUrl =
    'audioKey' in synthesized && synthesized.audioKey
      ? `/api/audio/${synthesized.audioKey}`
      : `data:${synthesized.mime};base64,${encodeBase64(synthesized.bytes!)}`

  return Response.json({
    id: crypto.randomUUID(),
    speaker,
    source_lang: config.sourceLang,
    target_lang: config.targetLang,
    source_text: sourceText,
    translated_text: translatedText,
    audio_url: audioUrl,
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
      tts_nan: 'taigi',
      tts_nan_fallback: 'remote',
    },
  })
}

function elapsedMs(started: number): number {
  return Math.round(performance.now() - started)
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error
}
