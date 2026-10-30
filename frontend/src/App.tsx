import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ApiError, resolveAudioUrl, translateAudio } from './api/client'
import { playOnAudioElement, unlockAudioElement } from './audio/player'
import { friendlyError } from './errors'
import { AudioRecorder, RecordingError } from './recording/recorder'
import { appReducer, initialState } from './state/machine'
import type { Conversation, Speaker } from './types'

const MAX_RECORDING_SECONDS = 30

const SPEAKER_LABELS: Record<Speaker, { title: string; hint: string; stop: string }> = {
  ama: {
    title: '阿罵講台語',
    hint: '按一下開始講',
    stop: '再按一下結束',
  },
  caregiver: {
    title: 'Perawat bicara Bahasa Indonesia',
    hint: 'Ketuk untuk mulai bicara',
    stop: 'Ketuk lagi untuk selesai',
  },
}

function App() {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const [isStarting, setIsStarting] = useState(false)
  const recorderRef = useRef(new AudioRecorder())
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isResultAudioRef = useRef(false)
  const startedAtRef = useRef(0)
  const stoppingRef = useRef(false)

  const latest = state.conversations[0] ?? null
  const busy = isStarting || ['uploading', 'playing'].includes(state.status)

  const playAudio = useCallback(async (conversation: Conversation, isAutomatic = false) => {
    const audio = audioRef.current
    if (!audio) {
      dispatch({ type: 'FAIL', code: 'AUDIO_PLAYBACK_ERROR' })
      return
    }

    isResultAudioRef.current = true
    try {
      await playOnAudioElement(audio, resolveAudioUrl(conversation.audio_url))
    } catch {
      if (isAutomatic) dispatch({ type: 'AUTOPLAY_BLOCKED' })
      else dispatch({ type: 'FAIL', code: 'AUDIO_PLAYBACK_ERROR' })
    }
  }, [])

  const stopRecording = useCallback(async () => {
    if (stoppingRef.current) return
    stoppingRef.current = true
    dispatch({ type: 'START_UPLOAD' })
    const speaker = state.activeSpeaker

    try {
      if (!speaker) throw new RecordingError('MIC_UNAVAILABLE')
      const { blob, filename } = await recorderRef.current.stop()
      const result = await translateAudio(blob, filename, speaker)
      const conversation: Conversation = { ...result, createdAt: Date.now() }
      dispatch({ type: 'UPLOAD_SUCCESS', conversation })
      await playAudio(conversation, true)
    } catch (error) {
      const code = error instanceof ApiError || error instanceof RecordingError
        ? error.code
        : 'UNKNOWN_ERROR'
      dispatch({ type: 'FAIL', code })
    } finally {
      stoppingRef.current = false
    }
  }, [playAudio, state.activeSpeaker])

  const startRecording = async (speaker: Speaker) => {
    if (!['idle', 'error'].includes(state.status) || isStarting) return
    if (state.status === 'error') dispatch({ type: 'DISMISS_ERROR' })
    setIsStarting(true)
    try {
      await recorderRef.current.start()
      // This executes in a user event handler after microphone access, not during render.
      // eslint-disable-next-line react-hooks/purity
      startedAtRef.current = Date.now()
      dispatch({ type: 'START_RECORDING', speaker })
    } catch (error) {
      const code = error instanceof RecordingError ? error.code : 'MIC_UNAVAILABLE'
      dispatch({ type: 'FAIL', code })
    } finally {
      setIsStarting(false)
    }
  }

  const handleSpeaker = (speaker: Speaker) => {
    if (state.status === 'recording' && state.activeSpeaker === speaker) {
      const audio = audioRef.current
      if (audio) {
        isResultAudioRef.current = false
        unlockAudioElement(audio)
      }
      void stopRecording()
      return
    }
    void startRecording(speaker)
  }

  const replay = (conversation: Conversation) => {
    if (state.status !== 'idle') return
    dispatch({ type: 'START_PLAYBACK' })
    void playAudio(conversation)
  }

  useEffect(() => {
    if (state.status !== 'recording') return
    const interval = window.setInterval(() => {
      const seconds = Math.min(
        Math.floor((Date.now() - startedAtRef.current) / 1000),
        MAX_RECORDING_SECONDS,
      )
      dispatch({ type: 'TICK', seconds })
    }, 250)
    const timeout = window.setTimeout(() => void stopRecording(), MAX_RECORDING_SECONDS * 1000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [state.status, stopRecording])

  useEffect(() => () => {
    recorderRef.current.cancel()
    audioRef.current?.pause()
  }, [])

  return (
    <main className="app-shell">
      <audio
        ref={audioRef}
        preload="auto"
        hidden
        onEnded={() => dispatch({ type: 'PLAYBACK_ENDED' })}
        onError={() => {
          if (isResultAudioRef.current) dispatch({ type: 'FAIL', code: 'AUDIO_PLAYBACK_ERROR' })
        }}
      />
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">譯</div>
        <div>
          <h1>阿罵的翻譯機</h1>
          <p>台語 <span aria-hidden="true">↔</span> Bahasa Indonesia</p>
        </div>
      </header>

      {state.status === 'error' && (
        <section className="notice error-notice" role="alert">
          <span aria-hidden="true">!</span>
          <p>{friendlyError(state.errorCode ?? 'UNKNOWN_ERROR')}</p>
          <button type="button" onClick={() => dispatch({ type: 'DISMISS_ERROR' })}>
            知道了 / Mengerti
          </button>
        </section>
      )}

      {state.status === 'uploading' && (
        <section className="processing" role="status" aria-live="polite">
          <span className="loader" aria-hidden="true" />
          <strong>翻譯中，請稍等</strong>
          <span>Sedang menerjemahkan, mohon tunggu</span>
        </section>
      )}

      <section className="speaker-actions" aria-label="選擇說話者">
        {(['ama', 'caregiver'] as const).map((speaker) => {
          const isActive = state.status === 'recording' && state.activeSpeaker === speaker
          const isDisabled = busy || (state.status === 'recording' && !isActive)
          const label = SPEAKER_LABELS[speaker]
          return (
            <button
              className={`speaker-button ${speaker} ${isActive ? 'recording' : ''}`}
              type="button"
              key={speaker}
              disabled={isDisabled}
              onClick={() => handleSpeaker(speaker)}
              aria-pressed={isActive}
            >
              <span className="speaker-icon" aria-hidden="true">
                {isActive ? <span className="pulse-dot" /> : '●'}
              </span>
              <strong>{label.title}</strong>
              {isActive ? (
                <>
                  <span className="recording-time">{formatTime(state.elapsedSeconds)}</span>
                  <span>{label.stop}</span>
                </>
              ) : (
                <span>{isStarting ? '正在開啟麥克風… / Membuka mikrofon…' : label.hint}</span>
              )}
            </button>
          )
        })}
      </section>

      {latest && (
        <section className="result-card" aria-live="polite">
          <p className="result-label">辨識原文 / Ucapan asli</p>
          <p className="source-text" lang={latest.source_lang === 'id' ? 'id' : 'zh-Hant'}>
            {latest.source_text}
          </p>
          <div className="result-divider" />
          <p className="result-label">翻譯 / Terjemahan</p>
          <p className="translated-text" lang={latest.target_lang === 'id' ? 'id' : 'zh-Hant'}>
            {latest.translated_text}
          </p>
        </section>
      )}

      <button
        className={`replay-main ${state.autoplayBlocked ? 'needs-attention' : ''}`}
        type="button"
        disabled={!latest || state.status !== 'idle'}
        onClick={() => latest && replay(latest)}
      >
        <span aria-hidden="true">▶</span>
        <span>
          <strong>再聽一次</strong>
          <small>Dengar lagi</small>
        </span>
      </button>

      <section className="history-section">
        <div className="section-heading">
          <h2>最近對話 <small>Percakapan terbaru</small></h2>
          <button
            type="button"
            disabled={state.conversations.length === 0 || state.status !== 'idle'}
            onClick={() => dispatch({ type: 'CLEAR_HISTORY' })}
          >
            清除 / Hapus
          </button>
        </div>

        {state.conversations.length === 0 ? (
          <p className="empty-state">還沒有對話 / Belum ada percakapan</p>
        ) : (
          <ol className="history-list">
            {state.conversations.map((conversation) => (
              <li key={conversation.id}>
                <div>
                  <span className={`speaker-badge ${conversation.speaker}`}>
                    {conversation.speaker === 'ama' ? '阿罵' : 'Perawat'}
                  </span>
                  <p>{conversation.source_text}</p>
                  <strong>{conversation.translated_text}</strong>
                </div>
                <button
                  type="button"
                  aria-label={`重播：${conversation.translated_text}`}
                  disabled={state.status !== 'idle'}
                  onClick={() => replay(conversation)}
                >
                  ▶
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  )
}

function formatTime(seconds: number): string {
  return `0:${seconds.toString().padStart(2, '0')} / 0:30`
}

export default App
