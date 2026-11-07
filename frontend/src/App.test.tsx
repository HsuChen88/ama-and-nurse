import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { formatInviteInput } from './App'
import { RecordingError } from './recording/recorder'

const apiMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  activateDevice: vi.fn(),
  translateAudio: vi.fn(),
}))

const recorderMocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
}))

const vibrationMocks = vi.hoisted(() => ({
  vibrateStart: vi.fn(),
  vibrateStop: vi.fn(),
}))

const playerMocks = vi.hoisted(() => ({
  unlock: vi.fn(),
  play: vi.fn(),
}))

const chimeMocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  play: vi.fn(),
  close: vi.fn(),
}))

vi.mock('./api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api/client')>()
  return {
    ...original,
    getSession: apiMocks.getSession,
    activateDevice: apiMocks.activateDevice,
    translateAudio: apiMocks.translateAudio,
  }
})

vi.mock('./audio/vibration', () => ({
  vibrateRecordingStart: vibrationMocks.vibrateStart,
  vibrateRecordingStop: vibrationMocks.vibrateStop,
}))

vi.mock('./audio/player', () => ({
  unlockAudioElement: playerMocks.unlock,
  playOnAudioElement: playerMocks.play,
}))

vi.mock('./audio/completion-chime', () => ({
  CompletionChime: class {
    prepare = chimeMocks.prepare
    play = chimeMocks.play
    close = chimeMocks.close
  },
}))

vi.mock('./recording/recorder', () => {
  class RecordingError extends Error {
    constructor(public readonly code: string) {
      super(code)
    }
  }

  class AudioRecorder {
    start = recorderMocks.start
    stop = recorderMocks.stop
    cancel = recorderMocks.cancel
  }

  return { AudioRecorder, RecordingError }
})

describe('device activation UI', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    apiMocks.getSession.mockReset().mockResolvedValue({ activated: false })
    apiMocks.activateDevice.mockReset().mockResolvedValue({ activated: true })
    apiMocks.translateAudio.mockReset().mockResolvedValue({
      id: 'result-1',
      speaker: 'ama',
      source_lang: 'nan-TW',
      target_lang: 'id',
      source_text: '食飽未？',
      translated_text: 'Sudah makan?',
      audio_url: '/api/audio/result-1',
      audio_mime: 'audio/mpeg',
      timings_ms: { asr: 1, translate: 1, tts: 1, total: 3 },
    })
    recorderMocks.start.mockReset().mockResolvedValue(undefined)
    recorderMocks.stop.mockReset().mockResolvedValue({
      blob: new Blob(['audio']),
      filename: 'recording.webm',
    })
    recorderMocks.cancel.mockReset()
    vibrationMocks.vibrateStart.mockReset()
    vibrationMocks.vibrateStop.mockReset()
    playerMocks.unlock.mockReset()
    playerMocks.play.mockReset().mockResolvedValue(undefined)
    chimeMocks.prepare.mockReset()
    chimeMocks.play.mockReset().mockResolvedValue(undefined)
    chimeMocks.close.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('formats pasted and typed invite codes', () => {
    expect(formatInviteInput(' abcd efgh ')).toBe('ABCD-EFGH')
    expect(formatInviteInput('abcd-ef')).toBe('ABCD-EF')
  })

  it('renders the favicon as a decorative brand mark', async () => {
    render(<App />)
    expect(await screen.findByText('請家人輸入邀請碼')).toBeTruthy()

    const logo = document.querySelector<HTMLImageElement>('.brand-mark img')
    expect(logo?.getAttribute('src')).toBe('/icon.svg')
    expect(logo?.getAttribute('alt')).toBe('')
    expect(logo?.closest('.brand-mark')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('shows only the current large-button instruction with language aria labels', async () => {
    apiMocks.getSession.mockResolvedValue({ activated: true })
    render(<App />)

    const amaButton = await screen.findByRole('button', { name: '說台語，按一下開始' })
    const caregiverButton = screen.getByRole('button', {
      name: 'Bicara Bahasa Indonesia，Ketuk untuk mulai',
    })
    expect(screen.getByText('按一下開始')).toBeTruthy()
    expect(screen.queryByText('結束再按一下')).toBeNull()

    fireEvent.click(amaButton)

    expect(await screen.findByRole('button', { name: '說台語，結束再按一下' })).toBeTruthy()
    expect(screen.getByText('結束再按一下')).toBeTruthy()
    expect(screen.queryByText('按一下開始')).toBeNull()
    expect(caregiverButton).toHaveProperty('disabled', true)
  })

  it('starts MediaRecorder immediately while triggering start vibration', async () => {
    apiMocks.getSession.mockResolvedValue({ activated: true })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '說台語，按一下開始' }))

    expect(vibrationMocks.vibrateStart).toHaveBeenCalledOnce()
    await waitFor(() => expect(recorderMocks.start).toHaveBeenCalledOnce())
    expect(chimeMocks.prepare).toHaveBeenCalledOnce()
    expect(chimeMocks.play).not.toHaveBeenCalled()
  })

  it('shows preparing immediately and waits for MediaRecorder start before recording', async () => {
    apiMocks.getSession.mockResolvedValue({ activated: true })
    let reportStarted: (() => void) | undefined
    recorderMocks.start.mockImplementation(() => new Promise<void>((resolve) => {
      reportStarted = resolve
    }))
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '說台語，按一下開始' }))

    const preparingButton = screen.getByRole('button', {
      name: '說台語，準備中… / Bersiap…',
    })
    expect(preparingButton.classList.contains('preparing')).toBe(true)
    expect(preparingButton.classList.contains('recording')).toBe(false)
    expect(screen.queryByText('0:00 / 0:30')).toBeNull()
    expect(screen.queryByText('結束再按一下')).toBeNull()
    expect(screen.getByRole('button', {
      name: 'Bicara Bahasa Indonesia，Ketuk untuk mulai',
    })).toHaveProperty('disabled', true)

    fireEvent.click(preparingButton)
    expect(recorderMocks.start).toHaveBeenCalledOnce()

    await act(async () => reportStarted?.())
    expect(await screen.findByRole('button', { name: '說台語，結束再按一下' })).toBeTruthy()
    expect(screen.getByText('0:00 / 0:30')).toBeTruthy()
  })

  it('opens the error modal directly from preparing when microphone startup fails', async () => {
    apiMocks.getSession.mockResolvedValue({ activated: true })
    let rejectStart: ((error: RecordingError) => void) | undefined
    recorderMocks.start.mockImplementation(() => new Promise<void>((_resolve, reject) => {
      rejectStart = reject
    }))
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '說台語，按一下開始' }))
    expect(screen.getByRole('button', {
      name: '說台語，準備中… / Bersiap…',
    })).toBeTruthy()

    await act(async () => rejectStart?.(new RecordingError('MIC_DENIED')))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText('請允許麥克風權限後再試')).toBeTruthy()
  })

  it('automatically stops 29.5 seconds after MediaRecorder reports recording', async () => {
    vi.useFakeTimers()
    apiMocks.getSession.mockResolvedValue({ activated: true })
    render(<App />)
    await act(async () => Promise.resolve())

    fireEvent.click(screen.getByRole('button', { name: '說台語，按一下開始' }))
    await act(async () => Promise.resolve())
    expect(screen.getByRole('button', { name: '說台語，結束再按一下' })).toBeTruthy()

    await act(async () => vi.advanceTimersByTimeAsync(29_500))

    expect(recorderMocks.stop).toHaveBeenCalledOnce()
    expect(vibrationMocks.vibrateStop).toHaveBeenCalledOnce()
  })

  it('stops MediaRecorder before triggering stop vibration', async () => {
    apiMocks.getSession.mockResolvedValue({ activated: true })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '說台語，按一下開始' }))
    const recordingButton = await screen.findByRole('button', { name: '說台語，結束再按一下' })

    fireEvent.click(recordingButton)

    expect(recorderMocks.stop).toHaveBeenCalledOnce()
    expect(vibrationMocks.vibrateStop).toHaveBeenCalledOnce()
    expect(recorderMocks.stop.mock.invocationCallOrder[0])
      .toBeLessThan(vibrationMocks.vibrateStop.mock.invocationCallOrder[0])
  })

  it('keeps the pressed button depressed with ended copy while translating', async () => {
    apiMocks.getSession.mockResolvedValue({ activated: true })
    apiMocks.translateAudio.mockImplementation(() => new Promise(() => undefined))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '說台語，按一下開始' }))

    fireEvent.click(await screen.findByRole('button', { name: '說台語，結束再按一下' }))

    const uploadingButton = await screen.findByRole('button', {
      name: '說台語，✓ 已結束，翻譯中…',
    })
    expect(uploadingButton.classList.contains('uploading')).toBe(true)
    expect(uploadingButton).toHaveProperty('disabled', true)
    expect(screen.queryByText('翻譯中，請稍等')).toBeNull()
  })

  it('plays the completion chime only after recording and track shutdown finish', async () => {
    apiMocks.getSession.mockResolvedValue({ activated: true })
    const events: string[] = []
    let finishStop: ((value: { blob: Blob; filename: string }) => void) | undefined
    recorderMocks.stop.mockImplementation(() => {
      events.push('recorder-stop')
      events.push('track-stop')
      return new Promise((resolve) => {
        finishStop = resolve
      })
    })
    chimeMocks.play.mockImplementation(() => {
      events.push('chime-play')
      return Promise.resolve()
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '說台語，按一下開始' }))

    fireEvent.click(await screen.findByRole('button', { name: '說台語，結束再按一下' }))

    expect(events).toEqual(['recorder-stop', 'track-stop'])
    expect(playerMocks.unlock).toHaveBeenCalledOnce()
    finishStop?.({ blob: new Blob(['audio']), filename: 'recording.webm' })
    await waitFor(() => expect(chimeMocks.play).toHaveBeenCalledOnce())
    expect(events).toEqual(['recorder-stop', 'track-stop', 'chime-play'])
  })

  it('shows errors in a modal that ignores backdrop clicks and traps focus', async () => {
    apiMocks.getSession.mockResolvedValue({ activated: true })
    recorderMocks.start.mockRejectedValue(new RecordingError('MIC_DENIED'))
    render(<App />)
    const amaButton = await screen.findByRole('button', { name: '說台語，按一下開始' })

    fireEvent.click(amaButton)

    const dialog = await screen.findByRole('alertdialog')
    const dismissButton = screen.getByRole('button', { name: '知道了 / Mengerti' })
    await waitFor(() => expect(document.activeElement).toBe(dismissButton))
    expect(amaButton).toHaveProperty('disabled', true)

    const backdrop = dialog.parentElement
    if (!backdrop) throw new Error('Missing modal backdrop')
    fireEvent.click(backdrop)
    expect(screen.getByRole('alertdialog')).toBeTruthy()

    fireEvent.keyDown(dismissButton, { key: 'Tab' })
    expect(document.activeElement).toBe(dismissButton)
  })

  it('dismisses an error with Escape and restores idle focus to the recording button', async () => {
    apiMocks.getSession.mockResolvedValue({ activated: true })
    recorderMocks.start.mockRejectedValue(new RecordingError('MIC_DENIED'))
    render(<App />)
    const amaButton = await screen.findByRole('button', { name: '說台語，按一下開始' })
    fireEvent.click(amaButton)

    const dialog = await screen.findByRole('alertdialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(amaButton))
    expect(amaButton).toHaveProperty('disabled', false)
  })

  it('dismisses an error with the single acknowledgement button', async () => {
    apiMocks.getSession.mockResolvedValue({ activated: true })
    recorderMocks.start.mockRejectedValue(new RecordingError('MIC_DENIED'))
    render(<App />)
    const amaButton = await screen.findByRole('button', { name: '說台語，按一下開始' })
    fireEvent.click(amaButton)

    fireEvent.click(await screen.findByRole('button', { name: '知道了 / Mengerti' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(amaButton).toHaveProperty('disabled', false)
  })

  it('replaces the app with activation and enters the main screen after success', async () => {
    render(<App />)
    expect(await screen.findByText('請家人輸入邀請碼')).toBeTruthy()
    expect(screen.queryByText('說台語')).toBeNull()

    fireEvent.change(screen.getByLabelText('邀請碼 / Kode undangan'), {
      target: { value: 'abcd efgh' },
    })
    expect(screen.getByLabelText('邀請碼 / Kode undangan')).toHaveProperty('value', 'ABCD-EFGH')
    fireEvent.click(screen.getByRole('button', { name: '啟用 / Aktifkan' }))

    await waitFor(() => expect(apiMocks.activateDevice).toHaveBeenCalledWith('ABCD-EFGH'))
    expect(await screen.findByText('說台語')).toBeTruthy()
  })

  it('shows the bilingual invalid-link message from the URL', async () => {
    window.history.replaceState(null, '', '/?invite=invalid')
    render(<App />)

    expect(await screen.findByText(/邀請連結無效或已撤銷/)).toBeTruthy()
    expect(screen.getByText(/Tautan undangan tidak valid atau sudah dicabut/)).toBeTruthy()
  })
})
