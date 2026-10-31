import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { formatInviteInput } from './App'

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

const cueMocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  playStart: vi.fn(),
  playStop: vi.fn(),
  close: vi.fn(),
  vibrateStart: vi.fn(),
  vibrateStop: vi.fn(),
}))

const playerMocks = vi.hoisted(() => ({
  unlock: vi.fn(),
  play: vi.fn(),
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

vi.mock('./audio/cues', () => {
  class RecordingCues {
    prepare = cueMocks.prepare
    playStart = cueMocks.playStart
    playStop = cueMocks.playStop
    close = cueMocks.close
  }

  return {
    RecordingCues,
    vibrateRecordingStart: cueMocks.vibrateStart,
    vibrateRecordingStop: cueMocks.vibrateStop,
  }
})

vi.mock('./audio/player', () => ({
  unlockAudioElement: playerMocks.unlock,
  playOnAudioElement: playerMocks.play,
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
    cueMocks.prepare.mockReset()
    cueMocks.playStart.mockReset().mockResolvedValue(undefined)
    cueMocks.playStop.mockReset().mockResolvedValue(undefined)
    cueMocks.close.mockReset()
    cueMocks.vibrateStart.mockReset()
    cueMocks.vibrateStop.mockReset()
    playerMocks.unlock.mockReset()
    playerMocks.play.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => cleanup())

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

  it('waits for the start beep to finish before starting MediaRecorder', async () => {
    let finishBeep: (() => void) | undefined
    cueMocks.playStart.mockReturnValue(new Promise<void>((resolve) => { finishBeep = resolve }))
    apiMocks.getSession.mockResolvedValue({ activated: true })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '說台語，按一下開始' }))

    expect(cueMocks.prepare).toHaveBeenCalledOnce()
    expect(cueMocks.vibrateStart).toHaveBeenCalledOnce()
    expect(cueMocks.playStart).toHaveBeenCalledOnce()
    expect(recorderMocks.start).not.toHaveBeenCalled()

    finishBeep?.()
    await waitFor(() => expect(recorderMocks.start).toHaveBeenCalledOnce())
  })

  it('stops MediaRecorder before playing the two stop beeps', async () => {
    apiMocks.getSession.mockResolvedValue({ activated: true })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '說台語，按一下開始' }))
    const recordingButton = await screen.findByRole('button', { name: '說台語，結束再按一下' })

    fireEvent.click(recordingButton)

    expect(recorderMocks.stop).toHaveBeenCalledOnce()
    expect(cueMocks.vibrateStop).toHaveBeenCalledOnce()
    expect(cueMocks.playStop).toHaveBeenCalledOnce()
    expect(recorderMocks.stop.mock.invocationCallOrder[0])
      .toBeLessThan(cueMocks.playStop.mock.invocationCallOrder[0])
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
