import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { formatInviteInput } from './App'

const apiMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  activateDevice: vi.fn(),
}))

const recorderMocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock('./api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api/client')>()
  return {
    ...original,
    getSession: apiMocks.getSession,
    activateDevice: apiMocks.activateDevice,
  }
})

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
    recorderMocks.start.mockReset().mockResolvedValue(undefined)
    recorderMocks.stop.mockReset()
    recorderMocks.cancel.mockReset()
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
