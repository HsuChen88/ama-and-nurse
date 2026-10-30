import { describe, expect, it } from 'vitest'
import type { Conversation } from '../types'
import { appReducer, initialState } from './machine'

const result: Conversation = {
  id: 'test-1',
  speaker: 'ama',
  source_lang: 'nan-TW',
  target_lang: 'id',
  source_text: '食飽未？',
  translated_text: 'Sudah makan?',
  audio_url: '/api/audio/test-1',
  audio_mime: 'audio/mpeg',
  timings_ms: { asr: 1, translate: 1, tts: 1, total: 3 },
  createdAt: 1,
}

describe('appReducer', () => {
  it('follows recording → uploading → playing → idle', () => {
    const recording = appReducer(initialState, { type: 'START_RECORDING', speaker: 'ama' })
    expect(recording.status).toBe('recording')
    expect(recording.activeSpeaker).toBe('ama')

    const uploading = appReducer(recording, { type: 'START_UPLOAD' })
    expect(uploading.status).toBe('uploading')

    const playing = appReducer(uploading, { type: 'UPLOAD_SUCCESS', conversation: result })
    expect(playing.status).toBe('playing')
    expect(playing.conversations).toEqual([result])

    const idle = appReducer(playing, { type: 'PLAYBACK_ENDED' })
    expect(idle.status).toBe('idle')
  })

  it('ignores a second speaker while recording', () => {
    const recording = appReducer(initialState, { type: 'START_RECORDING', speaker: 'ama' })
    const unchanged = appReducer(recording, {
      type: 'START_RECORDING',
      speaker: 'caregiver',
    })
    expect(unchanged).toBe(recording)
  })

  it('records autoplay blocking without treating it as an error', () => {
    const playing = { ...initialState, status: 'playing' as const }
    const blocked = appReducer(playing, { type: 'AUTOPLAY_BLOCKED' })
    expect(blocked.status).toBe('idle')
    expect(blocked.autoplayBlocked).toBe(true)
    expect(blocked.errorCode).toBeNull()
  })

  it('keeps only the newest 20 conversations', () => {
    let state = { ...initialState, status: 'uploading' as const }
    for (let index = 0; index < 21; index += 1) {
      state = appReducer(state, {
        type: 'UPLOAD_SUCCESS',
        conversation: { ...result, id: String(index), createdAt: index },
      }) as typeof state
      if (index < 20) state = { ...state, status: 'uploading' }
    }
    expect(state.conversations).toHaveLength(20)
    expect(state.conversations[0].id).toBe('20')
    expect(state.conversations.at(-1)?.id).toBe('1')
  })

  it('moves to error and can recover to idle', () => {
    const failed = appReducer(initialState, { type: 'FAIL', code: 'MIC_DENIED' })
    expect(failed.status).toBe('error')
    expect(failed.errorCode).toBe('MIC_DENIED')
    expect(appReducer(failed, { type: 'DISMISS_ERROR' }).status).toBe('idle')
  })

  it('starts recording directly from an error and clears it', () => {
    const failed = appReducer(initialState, { type: 'FAIL', code: 'NETWORK_ERROR' })
    const recording = appReducer(failed, { type: 'START_RECORDING', speaker: 'caregiver' })

    expect(recording.status).toBe('recording')
    expect(recording.activeSpeaker).toBe('caregiver')
    expect(recording.errorCode).toBeNull()
  })
})
