/*
 * Core parser for RFC 7239 Forwarded header values.
 *
 * A Forwarded header is a comma-separated list of forwarded-list values.
 * Each value is a semicolon-separated list of key=value pairs describing one
 * proxy hop. Keys are case-insensitive and each hop may appear at most once
 * per parameter.
 *
 * Grammar (RFC 7239, abbreviated):
 *   forwarded-list   = 1#forwarded-pair
 *   forwarded-pair   = [ forwarded-element ] *( ";" [ forwarded-element ] )
 *   forwarded-element = [ token "=" ] value
 *   value            = token / quoted-string
 *
 * Interpretation decisions (stated plainly so callers know what they get):
 *
 * 1. Hops are returned in header order. The leftmost hop is the one closest
 *    to the origin server per RFC 7239 section 4. This library does NOT
 *    reverse the list — callers who want client-first order must do that.
 *
 * 2. Unknown parameters are kept on each hop under an `extensions` map keyed
 *    by the lower-cased parameter name. Duplicate keys within a single hop
 *    are not allowed by the grammar; this parser keeps the LAST value for
 *    duplicates and that fact is tested.
 *
 * 3. Obfuscated identifiers (tokens beginning with "_" per section 6.3) are
 *    returned as-is. Distinguishing them structurally adds complexity for no
 *    consumer benefit in this library's scope.
 *
 * 4. An empty parameter value (e.g. `for=`) is represented as an empty
 *    string, not undefined. This keeps the type narrow and makes round-trip
 *    consumers simple.
 */

/**
 * @typedef {Object} ForwardedHop
 * @property {string|undefined} by        The interface where the request was received by the proxy adding this hop.
 * @property {string|undefined} forParam  The interface where the request came from, prior to this proxy.
 * @property {string|undefined} host      The Host header field value as received by the proxy.
 * @property {string|undefined} proto     The protocol scheme used to make the request.
 * @property {Record<string, string>} extensions  Unknown parameters, keyed by lower-cased name.
 */

/**
 * Parse a Forwarded header value into proxy hops.
 *
 * @param {string} header - Raw header value. May contain multiple hops separated by commas.
 * @returns {ForwardedHop[]} Hops in header order (leftmost = closest to origin server).
 */
export function parseForwarded(header) {
  if (typeof header !== 'string') {
    throw new TypeError('parseForwarded: header must be a string');
  }

  const trimmed = header.trim();
  if (trimmed === '') {
    return [];
  }

  const hops = [];
  // Split on commas. RFC 7239 does not allow commas inside quoted-strings
  // for the Forwarded parameters in practice, and a comma is only a delimiter
  // between forwarded-list members. We treat a comma as always a hop separator.
  const segments = splitTopLevel(trimmed, ',');

  for (const segment of segments) {
    const text = segment.trim();
    if (text === '') {
      // Stray comma producing an empty segment — skip it rather than emit an
      // empty hop, so "a=1,,b=2" yields two hops.
      continue;
    }
    hops.push(parseHop(text));
  }

  return hops;
}

/**
 * Parse a single hop (one forwarded-pair).
 *
 * @param {string} text
 * @returns {ForwardedHop}
 */
function parseHop(text) {
  /** @type {ForwardedHop} */
  const hop = {
    by: undefined,
    forParam: undefined,
    host: undefined,
    proto: undefined,
    extensions: {},
  };

  const pairs = splitTopLevel(text, ';');
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (trimmed === '') {
      continue;
    }

    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      // A bare token with no "=" is not a valid forwarded-element per the
      // grammar. We drop it rather than throw so a single malformed element
      // does not discard an otherwise readable hop chain.
      continue;
    }

    const rawKey = trimmed.slice(0, eq).trim().toLowerCase();
    const rawVal = trimmed.slice(eq + 1).trim();
    const value = unquote(rawVal);

    switch (rawKey) {
      case 'by':
        hop.by = value;
        break;
      case 'for':
        // Stored as forParam to avoid colliding with the JS reserved word.
        hop.forParam = value;
        break;
      case 'host':
        hop.host = value;
        break;
      case 'proto':
        hop.proto = value;
        break;
      default:
        // Duplicate unknown keys: last value wins. Documented and tested.
        hop.extensions[rawKey] = value;
    }
  }

  return hop;
}

/**
 * Split text on a delimiter, ignoring delimiters that appear inside a
 * quoted-string. Forwarded values may contain quoted strings that include
 * characters such as commas and semicolons (e.g. escaped via backslash),
 * so a naive split would corrupt them.
 *
 * @param {string} text
 * @param {string} delim
 * @returns {string[]}
 */
function splitTopLevel(text, delim) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      i++;
      continue;
    }

    if (ch === '\\' && inQuotes) {
      // Inside a quoted-string, backslash escapes the next character. Copy
      // both the backslash and the escaped char through verbatim here so the
      // quote tracking stays correct; unquoting happens later in unquote().
      current += ch;
      if (i + 1 < text.length) {
        current += text[i + 1];
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (ch === delim && !inQuotes) {
      parts.push(current);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  parts.push(current);
  return parts;
}

/**
 * Strip surrounding quotes from a value and resolve backslash escapes.
 * If the value is not quoted, it is returned as-is.
 *
 * Per RFC 7239 section 4, a quoted-string is delimited by double quotes and
 * may contain quoted-pairs (backslash followed by any char) whose meaning is
 * the literal char. We do not validate the content of tokens; that is left to
 * callers who care.
 *
 * @param {string} raw
 * @returns {string}
 */
function unquote(raw) {
  if (raw.length < 2 || raw[0] !== '"' || raw[raw.length - 1] !== '"') {
    return raw;
  }

  const inner = raw.slice(1, -1);
  let out = '';
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch === '\\' && i + 1 < inner.length) {
      out += inner[i + 1];
      i += 2;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}
