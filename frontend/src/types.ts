export type Speaker = 'ama' | 'caregiver'

export interface TranslationResult {
  id: string
  speaker: Speaker
  source_lang: 'nan-TW' | 'id'
  target_lang: 'nan-TW' | 'id'
  source_text: string
  translated_text: string
  audio_url: string
  timings_ms: {
    asr: number
    translate: number
    total: number
  }
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

export interface Conversation extends TranslationResult {
  createdAt: number
  audioBlobUrl?: string
}
