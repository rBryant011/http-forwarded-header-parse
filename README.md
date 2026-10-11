# HTTP Forwarded Header Parse

Parses RFC 7239 `Forwarded` header values into an ordered list of proxy hops, exposing `by`, `for`, `host`, and `proto` parameters plus any unknown parameters under `extensions`.

```js
import { parseForwarded } from './src/index.js';

const hops = parseForwarded('for=192.0.2.1;proto=https, for=198.51.100.2;proto=http');
// hops[0] => { by: undefined, forParam: '192.0.2.1', host: undefined, proto: 'https', extensions: {} }
// hops[1] => { by: undefined, forParam: '198.51.100.2', host: undefined, proto: 'http', extensions: {} }
```

## Why

Service-side code often needs to know the original client address and the proxy chain that forwarded a request. The `X-Forwarded-*` family is ad hoc and ambiguous when multiple proxies append values; RFC 7239's `Forwarded` header is the standards-track replacement. This library exists to parse it correctly — including quoted-string values that contain delimiters — without pulling in a web framework.

The trade-off: the parser is read-only and non-validating. It does not check that `for` values are well-formed IP addresses or obfuscated identifiers, and it does not reverse the hop order. The leftmost hop in the header is the leftmost hop in the result, which per RFC 7239 is the hop closest to the origin server. Reverse it yourself if you want client-first order.

## Awkward edge

The `for` parameter name collides with the JavaScript reserved word, so it is exposed as `forParam` on each hop object. Anything that destructures a hop and expects a field literally named `for` will get `undefined`; use `forParam`.

Duplicate unknown parameters within a single hop are not rejected — the last value wins. This matches the common case where a proxy rewrites a custom parameter, and is cheaper than reporting an error that most callers would ignore anyway.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

