export class AppError extends Error {
  constructor(status, message, { code, details, expose = true } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code ?? defaultCode(status);
    this.details = details;
    this.expose = expose;
  }
}

function defaultCode(status) {
  return (
    {
      400: 'BAD_REQUEST',
      401: 'UNAUTHENTICATED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_ERROR',
      423: 'LOCKED',
      429: 'RATE_LIMITED',
    }[status] ?? 'ERROR'
  );
}

export const badRequest = (msg, opts) => new AppError(400, msg, opts);
export const unauthorized = (msg = 'Authentication required', opts) => new AppError(401, msg, opts);
export const forbidden = (msg = 'You do not have permission to perform this action', opts) => new AppError(403, msg, opts);
export const notFound = (what = 'Resource') => new AppError(404, `${what} not found`);
export const conflict = (msg, opts) => new AppError(409, msg, opts);
export const unprocessable = (msg, details, opts) => new AppError(422, msg, { details, ...opts });
