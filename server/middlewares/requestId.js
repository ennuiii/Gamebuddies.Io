/**
 * Request ID Middleware
 *
 * Adds a unique request ID to each HTTP request for tracing and correlation.
 * The request ID can be used to track a request through logs, errors, and responses.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Middleware to add request ID to requests
 * Checks for existing X-Request-ID header from client/proxy, or generates a new one
 */
function requestIdMiddleware(req, res, next) {
  // Use existing request ID from header if present, otherwise generate new one
  req.id = req.headers['x-request-id'] || uuidv4();

  // Add request ID to response headers for client tracking
  res.setHeader('X-Request-ID', req.id);

  // Continue to next middleware
  next();
}

module.exports = requestIdMiddleware;
