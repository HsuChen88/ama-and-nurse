import { afterEach, describe, expect, it, vi } from 'vitest'
import { activateDevice, fetchSpeechAudio, getSession, translateAudio } from './client'

describe('translateAudio', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('aborts an upload after 45 seconds and reports a network error', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Request timed out', 'AbortError'))
        })
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const request = translateAudio(new Blob(['audio']), 'recording.webm', 'ama')
    const rejection = expect(request).rejects.toMatchObject({ code: 'NETWORK_ERROR' })

    await vi.advanceTimersByTimeAsync(44_999)
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    await rejection
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it('clears the timeout after a successful response', async () => {
    vi.useFakeTimers()
    const response = Response.json({ id: 'result-1' })
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)

    await expect(translateAudio(new Blob(['audio']), 'recording.webm', 'ama')).resolves.toMatchObject({
      id: 'result-1',
    })
    expect(vi.getTimerCount()).toBe(0)
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBeUndefined()
  })

  it('loads the device session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ activated: false }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSession()).resolves.toEqual({ activated: false })
    expect(fetchMock).toHaveBeenCalledWith('/api/session', undefined)
  })

  it('activates with the entered invite code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ activated: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(activateDevice('ABCD-EFGH')).resolves.toEqual({ activated: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'ABCD-EFGH' }),
    })
  })

  it('preserves NOT_ACTIVATED as an API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { code: 'NOT_ACTIVATED', message: 'Device is not activated' } },
          { status: 401 },
        ),
      ),
    )

    await expect(
      translateAudio(new Blob(['audio']), 'recording.webm', 'ama'),
    ).rejects.toMatchObject({ code: 'NOT_ACTIVATED' })
  })
})

describe('fetchSpeechAudio', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches speech once with same-origin credentials and creates a Blob URL', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:speech-1')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL }))
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'audio/wav' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSpeechAudio('/api/speech/token')).resolves.toBe('blob:speech-1')
    expect(fetchMock).toHaveBeenCalledWith('/api/speech/token', {
      credentials: 'same-origin',
    })
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(createObjectURL.mock.calls[0][0]).toMatchObject({ type: 'audio/wav', size: 3 })
  })

  it.each([
    [401, 'NOT_ACTIVATED'],
    [404, 'NOT_FOUND'],
    [502, 'UPSTREAM_ERROR'],
  ])('preserves JSON API errors from status %i', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(
      { error: { code, message: 'speech failed' } },
      { status },
    )))

    await expect(fetchSpeechAudio('/api/speech/token')).rejects.toMatchObject({ code })
  })
})
