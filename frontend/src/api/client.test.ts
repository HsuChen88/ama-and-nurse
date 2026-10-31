import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleAccessRedirect, translateAudio } from './client'

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
    const response = {
      ok: true,
      type: 'basic',
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue({ id: 'result-1' }),
    } as unknown as Response
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)

    await expect(translateAudio(new Blob(['audio']), 'recording.webm', 'ama')).resolves.toMatchObject({
      id: 'result-1',
    })
    expect(vi.getTimerCount()).toBe(0)
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('manual')
  })

  it('reloads for an opaque Access login redirect', () => {
    const reload = vi.fn()
    const response = {
      type: 'opaqueredirect',
      status: 0,
      headers: new Headers(),
    } as Response

    expect(() => handleAccessRedirect(response, reload)).toThrowError(
      expect.objectContaining({ code: 'AUTH_REQUIRED' }),
    )
    expect(reload).toHaveBeenCalledOnce()
  })

  it.each([401, 403])('reloads for a non-JSON Access %s response', (status) => {
    const reload = vi.fn()
    const response = new Response('<html>Access login</html>', {
      status,
      headers: { 'Content-Type': 'text/html' },
    })

    expect(() => handleAccessRedirect(response, reload)).toThrowError(
      expect.objectContaining({ code: 'AUTH_REQUIRED' }),
    )
    expect(reload).toHaveBeenCalledOnce()
  })

  it('keeps a JSON API 403 in the normal error path', () => {
    const reload = vi.fn()
    const response = Response.json(
      { error: { code: 'FORBIDDEN', message: 'Forbidden' } },
      { status: 403 },
    )

    expect(() => handleAccessRedirect(response, reload)).not.toThrow()
    expect(reload).not.toHaveBeenCalled()
  })
})
