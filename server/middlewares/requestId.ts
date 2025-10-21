/**
 * Request ID Middleware
 *
 * Adds a unique request ID to each HTTP request for tracing and correlation.
 * The request ID can be used to track a request through logs, errors, and responses.
 */

import { v4 as uuidv4 } from 'uuid';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

/**
 * Middleware to add request ID to requests
 * Checks for existing X-Request-ID header from client/proxy, or generates a new one
 */
export default function requestIdMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Use existing request ID from header if present, otherwise generate new one
  req.id = (req.headers['x-request-id'] as string) || uuidv4();

  // Add request ID to response headers for client tracking
  res.setHeader('X-Request-ID', req.id);

  // Continue to next middleware
  next();
}
