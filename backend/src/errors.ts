/** Error carrying an HTTP status and a stable error code (see docs/api.md, "Error format"). */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message);
export const forbidden = (message = 'You do not have permission to do this.') =>
  new AppError(403, 'FORBIDDEN', message);
export const badRequest = (message: string, code = 'BAD_REQUEST') => new AppError(400, code, message);
export const unauthenticated = (code = 'UNAUTHENTICATED', message = 'Authentication required.') =>
  new AppError(401, code, message);
export const usernameTaken = () => new AppError(409, 'USERNAME_TAKEN', 'This username is already taken.');
