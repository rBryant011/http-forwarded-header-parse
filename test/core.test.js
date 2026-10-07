import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseForwarded } from '../src/index.js';

/*
 * Tests for parseForwarded.
 *
 * Each test exercises a specific behaviour the implementation claims to
 * support. Cases that are deliberately not handled (e.g. IPv6 bracketed
 * address normalization) are not asserted here.
 */

test('empty header yields empty hop list', () => {
  assert.deepEqual(parseForwarded(''), []);
});

test('whitespace-only header yields empty hop list', () => {
  assert.deepEqual(parseForwarded('   \t '), []);
});

test('single hop with all four standard parameters', () => {
  const hops = parseForwarded('for=192.0.2.1;by=198.51.100.1;host=example.test;proto=https');
  assert.equal(hops.length, 1);
  assert.deepEqual(hops[0], {
    by: '198.51.100.1',
    forParam: '192.0.2.1',
    host: 'example.test',
    proto: 'https',
    extensions: {},
  });
});

test('parameters are case-insensitive', () => {
  const hops = parseForwarded('FOR=192.0.2.1;HoSt=example.test;PrOtO=http;By=198.51.100.1');
  assert.equal(hops.length, 1);
  assert.equal(hops[0].forParam, '192.0.2.1');
  assert.equal(hops[0].host, 'example.test');
  assert.equal(hops[0].proto, 'http');
  assert.equal(hops[0].by, '198.51.100.1');
});

test('multiple hops preserve header order', () => {
  const hops = parseForwarded('for=192.0.2.1;proto=https, for=198.51.100.2;proto=http');
  assert.equal(hops.length, 2);
  assert.equal(hops[0].forParam, '192.0.2.1');
  assert.equal(hops[0].proto, 'https');
  assert.equal(hops[1].forParam, '198.51.100.2');
  assert.equal(hops[1].proto, 'http');
});

test('quoted-string value is unquoted', () => {
  const hops = parseForwarded('for="192.0.2.1:8080";host="example.test"');
  assert.equal(hops[0].forParam, '192.0.2.1:8080');
  assert.equal(hops[0].host, 'example.test');
});

test('quoted-string with escaped backslash resolves to literal', () => {
  // A quoted pair \" inside a quoted string resolves to a single ".
  const hops = parseForwarded('host="a\\"b"');
  assert.equal(hops[0].host, 'a"b');
});

test('quoted-string containing semicolons does not split', () => {
  const hops = parseForwarded('host="a;b;c";for=192.0.2.1');
  assert.equal(hops[0].host, 'a;b;c');
  assert.equal(hops[0].forParam, '192.0.2.1');
});

test('unknown parameters go into extensions', () => {
  const hops = parseForwarded('for=192.0.2.1;traceparent=00-abc');
  assert.equal(hops[0].forParam, '192.0.2.1');
  assert.equal(hops[0].extensions.traceparent, '00-abc');
});

test('duplicate unknown key keeps last value', () => {
  const hops = parseForwarded('x=1;x=2;for=192.0.2.1');
  assert.equal(hops[0].extensions.x, '2');
});

test('obfuscated identifier token passes through', () => {
  const hops = parseForwarded('for=_obf;by=_hidden');
  assert.equal(hops[0].forParam, '_obf');
  assert.equal(hops[0].by, '_hidden');
});

test('empty parameter value becomes empty string', () => {
  const hops = parseForwarded('for=;host=example.test');
  assert.equal(hops[0].forParam, '');
  assert.equal(hops[0].host, 'example.test');
});

test('stray commas between hops are ignored', () => {
  const hops = parseForwarded('for=192.0.2.1,,for=198.51.100.2');
  assert.equal(hops.length, 2);
  assert.equal(hops[0].forParam, '192.0.2.1');
  assert.equal(hops[1].forParam, '198.51.100.2');
});

test('bare token without equals is skipped', () => {
  const hops = parseForwarded('garbage;for=192.0.2.1');
  assert.equal(hops.length, 1);
  assert.equal(hops[0].forParam, '192.0.2.1');
});

test('partial hop with only host works', () => {
  const hops = parseForwarded('host=example.test');
  assert.deepEqual(hops, [{
    by: undefined,
    forParam: undefined,
    host: 'example.test',
    proto: undefined,
    extensions: {},
  }]);
});

test('non-string input throws TypeError', () => {
  assert.throws(() => parseForwarded(123), TypeError);
  assert.throws(() => parseForwarded(null), TypeError);
});
