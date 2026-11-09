import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import {
  activateDevice,
  ApiError,
  fetchSpeechAudio,
  getSession,
  resolveAudioUrl,
  translateAudio,
} from './api/client'
import { CompletionChime } from './audio/completion-chime'
import { playOnAudioElement, unlockAudioElement } from './audio/player'
import { vibrateRecordingStart, vibrateRecordingStop } from './audio/vibration'
import { ErrorDialog } from './components/ErrorDialog'
import { IndonesiaFlag, TaiwanFlag } from './components/flags'
import { friendlyError } from './errors'
import { AudioRecorder, RecordingError } from './recording/recorder'
import { appReducer, initialState } from './state/machine'
import type { Conversation, Speaker } from './types'

const MAX_RECORDING_SECONDS = 30
const AUTO_STOP_MARGIN_MS = 500

const SPEAKER_LABELS: Record<Speaker, {
  title: string
  hint: string
  stop: string
  uploading: string
}> = {
  ama: {
    title: '說台語',
    hint: '按一下開始',
    stop: '結束再按一下',
    uploading: '✓ 已結束，翻譯中…',
  },
  caregiver: {
    title: 'Bicara Bahasa Indonesia',
    hint: 'Ketuk untuk mulai',
    stop: 'Selesai? Ketuk lagi',
    uploading: '✓ Selesai, sedang menerjemahkan…',
  },
}

function App() {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const [inviteCode, setInviteCode] = useState('')
  const [pressedSpeaker, setPressedSpeaker] = useState<Speaker | null>(null)
  const [isReplayPressed, setIsReplayPressed] = useState(false)
  const [invalidInvite, setInvalidInvite] = useState(
    () => new URLSearchParams(window.location.search).get('invite') === 'invalid',
  )
  const recorderRef = useRef(new AudioRecorder())
  const completionChimeRef = useRef(new CompletionChime())
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isResultAudioRef = useRef(false)
  const startedAtRef = useRef(0)
  const startingRef = useRef(false)
  const stoppingRef = useRef(false)
  const blobUrlsRef = useRef(new Set<string>())
  const speakerButtonRefs = useRef<Record<Speaker, HTMLButtonElement | null>>({
    ama: null,
    caregiver: null,
  })
  const lastSpeakerButtonRef = useRef<HTMLButtonElement | null>(null)

  const latest = state.conversations[0] ?? null
  const busy = ['preparing', 'uploading', 'speech-preparing', 'playing'].includes(state.status)

  const playAudio = useCallback(async (conversation: Conversation, isAutomatic = false) => {
    const audio = audioRef.current
    if (!audio) {
      dispatch({ type: 'FAIL', code: 'AUDIO_PLAYBACK_ERROR' })
      return
    }

    isResultAudioRef.current = true
    try {
      await playOnAudioElement(
        audio,
        conversation.audioBlobUrl ?? resolveAudioUrl(conversation.audio_url),
      )
    } catch {
      if (isAutomatic) dispatch({ type: 'AUTOPLAY_BLOCKED' })
      else dispatch({ type: 'FAIL', code: 'AUDIO_PLAYBACK_ERROR' })
    }
  }, [])

  const prepareAndPlayAudio = useCallback(async (
    conversation: Conversation,
    isAutomatic = false,
  ) => {
    try {
      let playable = conversation
      if (!conversation.audioBlobUrl) {
        const audioBlobUrl = await fetchSpeechAudio(conversation.audio_url)
        blobUrlsRef.current.add(audioBlobUrl)
        playable = { ...conversation, audioBlobUrl }
        dispatch({ type: 'SPEECH_READY', id: conversation.id, audioBlobUrl })
      }
      await playAudio(playable, isAutomatic)
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'SPEECH_UNAVAILABLE'
      if (code === 'NOT_ACTIVATED') dispatch({ type: 'NOT_ACTIVATED' })
      else dispatch({ type: 'FAIL', code: 'SPEECH_UNAVAILABLE' })
    }
  }, [playAudio])

  const stopRecording = useCallback(async () => {
    if (stoppingRef.current) return
    stoppingRef.current = true
    dispatch({ type: 'START_UPLOAD' })
    const speaker = state.activeSpeaker

    try {
      if (!speaker) throw new RecordingError('MIC_UNAVAILABLE')
      const recording = recorderRef.current.stop()
      vibrateRecordingStop()
      void completionChimeRef.current.play()
      const { blob, filename } = await recording
      const result = await translateAudio(blob, filename, speaker)
      const conversation: Conversation = { ...result, createdAt: Date.now() }
      if (state.conversations.length >= 20) {
        const removed = state.conversations.at(-1)
        revokeConversationAudio(removed)
        if (removed?.audioBlobUrl) blobUrlsRef.current.delete(removed.audioBlobUrl)
      }
      dispatch({ type: 'UPLOAD_SUCCESS', conversation })
      await prepareAndPlayAudio(conversation, true)
    } catch (error) {
      const code = error instanceof ApiError || error instanceof RecordingError
        ? error.code
        : 'UNKNOWN_ERROR'
      if (code === 'NOT_ACTIVATED') dispatch({ type: 'NOT_ACTIVATED' })
      else dispatch({ type: 'FAIL', code })
    } finally {
      stoppingRef.current = false
    }
  }, [prepareAndPlayAudio, state.activeSpeaker, state.conversations])

  const startRecording = async (speaker: Speaker) => {
    if (state.status !== 'idle' || startingRef.current) return
    startingRef.current = true
    dispatch({ type: 'START_PREPARING', speaker })
    completionChimeRef.current.prepare()
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
      startingRef.current = false
    }
  }

  const handleSpeaker = (speaker: Speaker) => {
    lastSpeakerButtonRef.current = speakerButtonRefs.current[speaker]
    if (state.status === 'recording' && state.activeSpeaker === speaker) {
      completionChimeRef.current.prepare()
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

  const pressSpeaker = (speaker: Speaker) => {
    const canPress = state.status === 'idle'
      || (state.status === 'recording' && state.activeSpeaker === speaker)
    if (canPress) setPressedSpeaker(speaker)
  }

  const releaseSpeaker = (speaker: Speaker) => {
    setPressedSpeaker((current) => current === speaker ? null : current)
  }

  const dismissError = () => {
    const focusTarget = lastSpeakerButtonRef.current ?? speakerButtonRefs.current.ama
    dispatch({ type: 'DISMISS_ERROR' })
    window.setTimeout(() => focusTarget?.focus(), 0)
  }

  const replay = (conversation: Conversation) => {
    if (state.status !== 'idle') return
    dispatch({ type: 'START_PLAYBACK' })
    void prepareAndPlayAudio(conversation)
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
    // Stop slightly early: stopping and encoder padding add a little audio, and
    // the server rejects anything over MAX_RECORDING_SECONDS.
    const timeout = window.setTimeout(
      () => void stopRecording(),
      MAX_RECORDING_SECONDS * 1000 - AUTO_STOP_MARGIN_MS,
    )
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [state.status, stopRecording])

  useEffect(() => () => {
    recorderRef.current.cancel()
    completionChimeRef.current.close()
    audioRef.current?.pause()
    for (const url of blobUrlsRef.current) URL.revokeObjectURL(url)
    blobUrlsRef.current.clear()
  }, [])

  const clearHistory = () => {
    for (const conversation of state.conversations) {
      revokeConversationAudio(conversation)
      if (conversation.audioBlobUrl) blobUrlsRef.current.delete(conversation.audioBlobUrl)
    }
    dispatch({ type: 'CLEAR_HISTORY' })
  }

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

      <section className="speaker-actions" aria-label="選擇說話者">
        {(['ama', 'caregiver'] as const).map((speaker) => {
          const isPreparing = state.status === 'preparing' && state.activeSpeaker === speaker
          const isActive = state.status === 'recording' && state.activeSpeaker === speaker
          const isUploading = state.status === 'uploading' && state.activeSpeaker === speaker
          const isPressed = isPreparing || isUploading
            || (pressedSpeaker === speaker && (state.status === 'idle' || isActive))
          const isDisabled = busy || state.status === 'error'
            || (state.status === 'recording' && !isActive)
          const label = SPEAKER_LABELS[speaker]
          return (
            <button
              className={`speaker-button ${speaker} ${isPreparing ? 'preparing' : ''} ${isActive ? 'recording' : ''} ${isUploading ? 'uploading' : ''} ${isPressed ? 'pressed' : ''}`}
              type="button"
              key={speaker}
              ref={(element) => { speakerButtonRefs.current[speaker] = element }}
              disabled={isDisabled}
              onPointerDown={() => pressSpeaker(speaker)}
              onPointerUp={() => releaseSpeaker(speaker)}
              onPointerCancel={() => releaseSpeaker(speaker)}
              onPointerLeave={() => releaseSpeaker(speaker)}
              onClick={() => handleSpeaker(speaker)}
              aria-pressed={isActive}
              aria-busy={isPreparing || isUploading || undefined}
              aria-label={`${label.title}，${isPreparing ? '準備中… / Bersiap…' : isActive ? label.stop : isUploading ? label.uploading : label.hint}`}
            >
              {speaker === 'ama' ? <TaiwanFlag /> : <IndonesiaFlag />}
              <strong><span>{label.title}</span></strong>
              {isPreparing ? (
                <span className="preparing-feedback" role="status" aria-live="polite">
                  <span className="preparing-spinner" aria-hidden="true" />
                  <span>準備中… / Bersiap…</span>
                </span>
              ) : isUploading ? (
                <span className="speaker-prompt uploading-prompt" role="status" aria-live="polite">
                  {label.uploading}
                </span>
              ) : isActive ? (
                <>
                  <span className="recording-time">{formatTime(state.elapsedSeconds)}</span>
                  <span className="speaker-prompt">{label.stop}</span>
                </>
              ) : (
                <span className="speaker-prompt">{label.hint}</span>
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

      {state.status === 'speech-preparing' && (
        <p className="speech-preparing-status" role="status" aria-live="polite">
          語音準備中…
        </p>
      )}

      <button
        className={`replay-main ${state.autoplayBlocked ? 'needs-attention' : ''} ${isReplayPressed ? 'pressed' : ''}`}
        type="button"
        disabled={!latest || state.status !== 'idle'}
        onPointerDown={() => {
          if (latest && state.status === 'idle') setIsReplayPressed(true)
        }}
        onPointerUp={() => setIsReplayPressed(false)}
        onPointerCancel={() => setIsReplayPressed(false)}
        onPointerLeave={() => setIsReplayPressed(false)}
        onClick={() => {
          setIsReplayPressed(false)
          if (latest) replay(latest)
        }}
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
            onClick={clearHistory}
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
      {state.status === 'error' && (
        <ErrorDialog
          message={friendlyError(state.errorCode ?? 'UNKNOWN_ERROR')}
          onDismiss={dismissError}
        />
      )}
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
  return `0:${seconds.toString().padStart(2, '0')} / 0:30`
}

function revokeConversationAudio(conversation: Conversation | undefined): void {
  if (conversation?.audioBlobUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(conversation.audioBlobUrl)
  }
}

export default App
