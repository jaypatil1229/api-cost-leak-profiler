import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';

import { API_KEY_HEADER } from '../constants/app.constants';

export const IS_PUBLIC_KEY = 'aclp:isPublic';

/**
 * Marks a route as reachable without a user access token.
 *
 * `JwtAuthGuard` is registered globally, so authentication is the default and
 * every exception has to be opted into explicitly and visibly.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Marks a route as authenticated by an SDK API key instead of a user JWT.
 *
 * It exempts the route from the global `JwtAuthGuard` (the two credential types
 * are mutually exclusive — see `ApiKeyContext`) and documents the `x-api-key`
 * security scheme in Swagger. The route must still apply `ApiKeyAuthGuard`
 * itself; this decorator grants nothing on its own.
 */
export const ApiKeyAuthenticated = () =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), ApiSecurity(API_KEY_HEADER));
