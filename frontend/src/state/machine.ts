import type { Conversation, Speaker } from '../types'

export type Status = 'idle' | 'recording' | 'uploading' | 'playing' | 'error'

export interface AppState {
  status: Status
  activeSpeaker: Speaker | null
  elapsedSeconds: number
  conversations: Conversation[]
  errorCode: string | null
  autoplayBlocked: boolean
}

export const initialState: AppState = {
  status: 'idle',
  activeSpeaker: null,
  elapsedSeconds: 0,
  conversations: [],
  errorCode: null,
  autoplayBlocked: false,
}

export type AppAction =
  | { type: 'START_RECORDING'; speaker: Speaker }
  | { type: 'TICK'; seconds: number }
  | { type: 'START_UPLOAD' }
  | { type: 'UPLOAD_SUCCESS'; conversation: Conversation }
  | { type: 'START_PLAYBACK' }
  | { type: 'PLAYBACK_ENDED' }
  | { type: 'AUTOPLAY_BLOCKED' }
  | { type: 'FAIL'; code: string }
  | { type: 'DISMISS_ERROR' }
  | { type: 'CLEAR_HISTORY' }

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'START_RECORDING':
      if (state.status !== 'idle' && state.status !== 'error') return state
      return {
        ...state,
        status: 'recording',
        activeSpeaker: action.speaker,
        elapsedSeconds: 0,
        errorCode: null,
        autoplayBlocked: false,
      }
    case 'TICK':
      if (state.status !== 'recording') return state
      return { ...state, elapsedSeconds: Math.min(action.seconds, 30) }
    case 'START_UPLOAD':
      if (state.status !== 'recording') return state
      return { ...state, status: 'uploading', elapsedSeconds: 0 }
    case 'UPLOAD_SUCCESS':
      if (state.status !== 'uploading') return state
      return {
        ...state,
        status: 'playing',
        activeSpeaker: null,
        conversations: [action.conversation, ...state.conversations].slice(0, 20),
      }
    case 'START_PLAYBACK':
      if (state.status !== 'idle') return state
      return { ...state, status: 'playing', autoplayBlocked: false }
    case 'PLAYBACK_ENDED':
      if (state.status !== 'playing') return state
      return { ...state, status: 'idle', autoplayBlocked: false }
    case 'AUTOPLAY_BLOCKED':
      if (state.status !== 'playing') return state
      return { ...state, status: 'idle', autoplayBlocked: true }
    case 'FAIL':
      return {
        ...state,
        status: 'error',
        activeSpeaker: null,
        elapsedSeconds: 0,
        errorCode: action.code,
      }
    case 'DISMISS_ERROR':
      if (state.status !== 'error') return state
      return { ...state, status: 'idle', errorCode: null }
    case 'CLEAR_HISTORY':
      return { ...state, conversations: [], autoplayBlocked: false }
    default:
      return state
  }
}
