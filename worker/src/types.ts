export interface Env {
  INFERENCE_BASE_URL: string
  INFERENCE_API_TOKEN: string
  INFERENCE_CF_ACCESS_CLIENT_ID?: string
  INFERENCE_CF_ACCESS_CLIENT_SECRET?: string
  GOOGLE_TRANSLATE_SA_JSON: string
  GOOGLE_TTS_SA_JSON: string
  TTS_ID_VOICE: string
  TTS_ID_SPEAKING_RATE: string
  INFERENCE_TIMEOUT_MS: string
  INFERENCE_TTS_TIMEOUT_MS: string
  GOOGLE_TIMEOUT_MS: string
  DEVICE_SIGNING_KEY: string
  TAIGI_TRANSLATE_API_KEY: string
  TAIGI_TTS_API_KEY: string
  TAIGI_TRANSLATE_TIMEOUT_MS: string
  TAIGI_TTS_TIMEOUT_MS: string
  TAIGI_TTS_MODEL: string
  TAIGI_TTS_VOICE: string
  TAIGI_TTS_SPEED: string
  INVITES: KVNamespace
  CACHE_DB: D1Database
  AUDIO_BUCKET: R2Bucket
}

export type Speaker = 'ama' | 'caregiver'
export type ApiLanguage = 'nan-TW' | 'id'
export type GoogleLanguage = 'zh-TW' | 'id'

export interface SpeakerConfig {
  sourceLang: ApiLanguage
  targetLang: ApiLanguage
  translateSource: GoogleLanguage
  translateTarget: GoogleLanguage
}

export const SPEAKERS: Record<Speaker, SpeakerConfig> = {
  ama: {
    sourceLang: 'nan-TW',
    targetLang: 'id',
    translateSource: 'zh-TW',
    translateTarget: 'id',
  },
  caregiver: {
    sourceLang: 'id',
    targetLang: 'nan-TW',
    translateSource: 'id',
    translateTarget: 'zh-TW',
  },
}
