import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import { activateDevice, ApiError, getSession, resolveAudioUrl, translateAudio } from './api/client'
import { playOnAudioElement, unlockAudioElement } from './audio/player'
import { vibrateRecordingStart, vibrateRecordingStop } from './audio/vibration'
import { IndonesiaFlag, TaiwanFlag } from './components/flags'
import { friendlyError } from './errors'
import { AudioRecorder, RecordingError } from './recording/recorder'
import { appReducer, initialState } from './state/machine'
import type { Conversation, Speaker } from './types'

// Well under the server's 30 s limit, so encoder padding on auto-stop never
// pushes a recording over it; shorter turns also translate and play back better.
const MAX_RECORDING_SECONDS = 20

const SPEAKER_LABELS: Record<Speaker, { title: string; hint: string; stop: string }> = {
  ama: {
    title: '說台語',
    hint: '按一下開始',
    stop: '結束再按一下',
  },
  caregiver: {
    title: 'Bicara Bahasa Indonesia',
    hint: 'Ketuk untuk mulai',
    stop: 'Selesai? Ketuk lagi',
  },
}

function App() {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const [isStarting, setIsStarting] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [invalidInvite, setInvalidInvite] = useState(
    () => new URLSearchParams(window.location.search).get('invite') === 'invalid',
  )
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
      const recording = recorderRef.current.stop()
      vibrateRecordingStop()
      const { blob, filename } = await recording
      const result = await translateAudio(blob, filename, speaker)
      const conversation: Conversation = { ...result, createdAt: Date.now() }
      dispatch({ type: 'UPLOAD_SUCCESS', conversation })
      await playAudio(conversation, true)
    } catch (error) {
      const code = error instanceof ApiError || error instanceof RecordingError
        ? error.code
        : 'UNKNOWN_ERROR'
      if (code === 'NOT_ACTIVATED') dispatch({ type: 'NOT_ACTIVATED' })
      else dispatch({ type: 'FAIL', code })
    } finally {
      stoppingRef.current = false
    }
  }, [playAudio, state.activeSpeaker])

  const startRecording = async (speaker: Speaker) => {
    if (!['idle', 'error'].includes(state.status) || isStarting) return
    if (state.status === 'error') dispatch({ type: 'DISMISS_ERROR' })
    setIsStarting(true)
    try {
      vibrateRecordingStart()
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

  useEffect(() => {
    let active = true
    void getSession()
      .then((session) => {
        if (active) dispatch({ type: 'SESSION_LOADED', activated: session.activated })
      })
      .catch((error: unknown) => {
        if (!active) return
        const code = error instanceof ApiError ? error.code : 'NETWORK_ERROR'
        dispatch({ type: 'ACTIVATION_FAILED', code })
      })
    return () => {
      active = false
    }
  }, [])

  const submitActivation = async (event: FormEvent) => {
    event.preventDefault()
    dispatch({ type: 'START_ACTIVATION' })
    try {
      await activateDevice(inviteCode)
      setInvalidInvite(false)
      dispatch({ type: 'ACTIVATION_SUCCESS' })
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'UNKNOWN_ERROR'
      dispatch({ type: 'ACTIVATION_FAILED', code })
    }
  }

  if (state.activationStatus !== 'activated') {
    return (
      <main className="app-shell activation-shell">
        <AppHeader />
        {state.activationStatus === 'checking' ? (
          <section className="activation-checking" role="status">
            <span className="loader" aria-hidden="true" />
            <strong>正在確認裝置</strong>
            <span>Memeriksa perangkat</span>
          </section>
        ) : (
          <section className="activation-card">
            <div className="activation-icon" aria-hidden="true">✓</div>
            <h2>請家人輸入邀請碼</h2>
            <p className="activation-subtitle">Minta keluarga memasukkan kode undangan</p>
            {invalidInvite && (
              <p className="activation-error" role="alert">
                邀請連結無效或已撤銷<br />
                Tautan undangan tidak valid atau sudah dicabut
              </p>
            )}
            {!invalidInvite && state.activationError === 'INVALID_CODE' && (
              <p className="activation-error" role="alert">
                邀請碼無效或已撤銷<br />
                Kode undangan tidak valid atau sudah dicabut
              </p>
            )}
            {state.activationError && state.activationError !== 'INVALID_CODE' && (
              <p className="activation-error" role="alert">
                無法連線，請稍後再試<br />Tidak dapat terhubung, silakan coba lagi
              </p>
            )}
            <form onSubmit={(event) => void submitActivation(event)}>
              <label htmlFor="invite-code">邀請碼 / Kode undangan</label>
              <input
                id="invite-code"
                value={inviteCode}
                onChange={(event) => setInviteCode(formatInviteInput(event.target.value))}
                placeholder="ABCD-EFGH"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                disabled={state.activationStatus === 'activating'}
              />
              <button type="submit" disabled={state.activationStatus === 'activating' || inviteCode.length < 8}>
                {state.activationStatus === 'activating' ? '啟用中… / Mengaktifkan…' : '啟用 / Aktifkan'}
              </button>
            </form>
          </section>
        )}
      </main>
    )
  }

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
      <AppHeader />

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
              aria-label={`${label.title}，${isActive ? label.stop : label.hint}`}
            >
              {speaker === 'ama' ? <TaiwanFlag /> : <IndonesiaFlag />}
              <strong><span>{label.title}</span></strong>
              {isActive ? (
                <>
                  <span className="recording-time">{formatTime(state.elapsedSeconds)}</span>
                  <span className="speaker-prompt">{label.stop}</span>
                </>
              ) : (
                <span className="speaker-prompt">
                  {isStarting ? '正在開啟麥克風… / Membuka mikrofon…' : label.hint}
                </span>
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
                    {conversation.speaker === 'ama' ? '阿嬤' : 'Perawat'}
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
      <footer className="privacy-note">
        語音僅用於即時翻譯，本服務不保存錄音<br />
        Suara hanya dipakai untuk terjemahan langsung dan tidak disimpan
      </footer>
    </main>
  )
}

function AppHeader() {
  return (
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true">
        <img src="/icon.svg" alt="" />
      </div>
      <div>
        <h1>阿嬤的翻譯機</h1>
      </div>
    </header>
  )
}

export function formatInviteInput(value: string): string {
  const compact = value.toUpperCase().replace(/[\s-]/g, '').slice(0, 8)
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact
}

function formatTime(seconds: number): string {
  return `0:${seconds.toString().padStart(2, '0')} / 0:${MAX_RECORDING_SECONDS}`
}

export default App
