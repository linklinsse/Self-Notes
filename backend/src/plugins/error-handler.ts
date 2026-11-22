import type { FastifyError, FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { AppError } from '../errors.js';

function body(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

/** Every error leaves the API in the format documented in docs/api.md. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(body(err.code, err.message, err.details));
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      const issues = err.validation.map((v) => ({
        in: err.validationContext,
        path: v.instancePath,
        message: v.message,
      }));
      return reply.status(400).send(body('VALIDATION_ERROR', 'Invalid request.', { issues }));
    }
    if (isResponseSerializationError(err)) {
      request.log.error({ err }, 'response does not match its schema');
      return reply.status(500).send(body('INTERNAL_ERROR', 'Internal server error.'));
    }
    if (err.statusCode === 429) {
      return reply.status(429).send(body('RATE_LIMITED', 'Too many requests, try again later.'));
    }
    if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send(body('CONTENT_TOO_LARGE', 'Request body is too large.'));
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.status(err.statusCode).send(body('BAD_REQUEST', err.message));
    }
    request.log.error({ err }, 'unhandled error');
    return reply.status(500).send(body('INTERNAL_ERROR', 'Internal server error.'));
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send(body('NOT_FOUND', 'Route not found.'));
  });
}
