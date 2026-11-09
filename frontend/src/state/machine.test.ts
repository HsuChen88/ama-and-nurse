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
  audio_url: '/api/speech/test-1',
  timings_ms: { asr: 1, translate: 1, total: 2 },
  createdAt: 1,
}

describe('appReducer', () => {
  it('follows preparing → recording → uploading → speech preparation → playing → idle', () => {
    const preparing = appReducer(initialState, { type: 'START_PREPARING', speaker: 'ama' })
    expect(preparing.status).toBe('preparing')

    const recording = appReducer(preparing, { type: 'START_RECORDING', speaker: 'ama' })
    expect(recording.status).toBe('recording')
    expect(recording.activeSpeaker).toBe('ama')

    const uploading = appReducer(recording, { type: 'START_UPLOAD' })
    expect(uploading.status).toBe('uploading')

    const speechPreparing = appReducer(uploading, {
      type: 'UPLOAD_SUCCESS',
      conversation: result,
    })
    expect(speechPreparing.status).toBe('speech-preparing')
    expect(speechPreparing.conversations).toEqual([result])

    const playing = appReducer(speechPreparing, {
      type: 'SPEECH_READY',
      id: result.id,
      audioBlobUrl: 'blob:result-1',
    })
    expect(playing.status).toBe('playing')
    expect(playing.conversations[0].audioBlobUrl).toBe('blob:result-1')

    const idle = appReducer(playing, { type: 'PLAYBACK_ENDED' })
    expect(idle.status).toBe('idle')
  })

  it('ignores a second speaker while recording', () => {
    const preparing = appReducer(initialState, { type: 'START_PREPARING', speaker: 'ama' })
    const recording = appReducer(preparing, { type: 'START_RECORDING', speaker: 'ama' })
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

  it('requires dismissing an error before recording again', () => {
    const failed = appReducer(initialState, { type: 'FAIL', code: 'NETWORK_ERROR' })
    const unchanged = appReducer(failed, { type: 'START_RECORDING', speaker: 'caregiver' })
    expect(unchanged).toBe(failed)

    const idle = appReducer(failed, { type: 'DISMISS_ERROR' })
    const preparing = appReducer(idle, { type: 'START_PREPARING', speaker: 'caregiver' })
    const recording = appReducer(preparing, {
      type: 'START_RECORDING',
      speaker: 'caregiver',
    })

    expect(recording.status).toBe('recording')
    expect(recording.activeSpeaker).toBe('caregiver')
    expect(recording.errorCode).toBeNull()
  })

  it('ignores recording until the prepared speaker reports MediaRecorder start', () => {
    const preparing = appReducer(initialState, {
      type: 'START_PREPARING',
      speaker: 'ama',
    })

    expect(appReducer(preparing, {
      type: 'START_RECORDING',
      speaker: 'caregiver',
    })).toBe(preparing)
    expect(appReducer(preparing, { type: 'TICK', seconds: 5 })).toBe(preparing)
  })

  it('follows checking → required → activating → activated', () => {
    const required = appReducer(initialState, { type: 'SESSION_LOADED', activated: false })
    expect(required.activationStatus).toBe('required')

    const activating = appReducer(required, { type: 'START_ACTIVATION' })
    expect(activating.activationStatus).toBe('activating')

    const activated = appReducer(activating, { type: 'ACTIVATION_SUCCESS' })
    expect(activated.activationStatus).toBe('activated')
    expect(activated.activationError).toBeNull()
  })

  it('returns to activation when an API reports NOT_ACTIVATED', () => {
    const active = {
      ...initialState,
      activationStatus: 'activated' as const,
      status: 'uploading' as const,
      activeSpeaker: 'ama' as const,
    }
    const required = appReducer(active, { type: 'NOT_ACTIVATED' })

    expect(required.activationStatus).toBe('required')
    expect(required.status).toBe('idle')
    expect(required.activeSpeaker).toBeNull()
  })
})
