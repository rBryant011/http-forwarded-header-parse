/*
 * HTTP Forwarded Header Parse
 *
 * Parses RFC 7239 Forwarded header values into an ordered list of proxy hops.
 * Re-exports the public API from core.js.
 */

export { parseForwarded } from './core.js';
