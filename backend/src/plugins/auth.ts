import type { FastifyInstance, FastifyRequest } from 'fastify';
import { unauthenticated } from '../errors.js';
import type { AccessClaims } from '../lib/tokens.js';

/** Adds `app.authenticate` (an onRequest hook) and `request.auth`. */
export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('auth', null);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthenticated();
    request.auth = await app.accessTokens.verify(header.slice('Bearer '.length).trim());
  });
}

/** Claims of the authenticated caller. Only valid in routes protected by `app.authenticate`. */
export function authOf(request: FastifyRequest): AccessClaims {
  if (!request.auth) throw unauthenticated();
  return request.auth;
}
