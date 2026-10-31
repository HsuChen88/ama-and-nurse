export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

export function errorResponse(error: ApiError): Response {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status },
  )
}

export function upstreamError(): ApiError {
  return new ApiError('UPSTREAM_ERROR', 'Translation service is unavailable', 502)
}
