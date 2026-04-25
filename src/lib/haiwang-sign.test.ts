import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haiwangMd5, sha256Hex, signHaiwangRequest } from './haiwang-sign.js';

// Real captured request data — do NOT modify these values:
// X-Timestamp:    1777119929
// X-API-Key:      229fa514ae34b45152fb5a9278f3a34a
// X-Custom-Sign:  b8efdf23eaa02ed5d63116c648770efe4b3297ef5e250c603e05593c4492463e

test('haiwangMd5 matches real captured request', () => {
  const ts = '1777119929';
  const input = 'gcG7LnEwlS_7xJCvniqfAw2FfcaV1R230CRK977VD40&&&' + ts + 'haiwang';
  assert.equal(haiwangMd5(input), '229fa514ae34b45152fb5a9278f3a34a');
});

test('SHA-256 sign matches real captured request', () => {
  const apiKey = '229fa514ae34b45152fb5a9278f3a34a';
  const ts = '1777119929';
  const sign = sha256Hex(apiKey + ts);
  assert.equal(sign, 'b8efdf23eaa02ed5d63116c648770efe4b3297ef5e250c603e05593c4492463e');
});

test('signHaiwangRequest produces 32-hex md5 + 64-hex sha256 + numeric timestamp', () => {
  const h = signHaiwangRequest();
  assert.match(h['X-Timestamp'], /^\d{10}$/);
  assert.match(h['X-API-Key'], /^[0-9a-f]{32}$/);
  assert.match(h['X-Custom-Sign'], /^[0-9a-f]{64}$/);
});
