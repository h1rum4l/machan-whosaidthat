import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GEMINI_MODEL, geminiFailure, geminiModel } from './gemini.ts';

test('uses the current default while respecting an explicitly configured model', () => {
  assert.equal(geminiModel(), DEFAULT_GEMINI_MODEL);
  assert.equal(geminiModel(' '), DEFAULT_GEMINI_MODEL);
  assert.equal(geminiModel(' gemini-2.5-flash '), 'gemini-2.5-flash');
});
test('normalizes resource names rather than encoding models/ into the model ID', () => {
  assert.equal(geminiModel(' models/gemini-3.5-flash-lite '), 'gemini-3.5-flash-lite');
  for (const value of ['https://example.com/model', 'models/', 'a/b', 'model with spaces']) {
    assert.throws(() => geminiModel(value));
  }
});
test('retains the upstream diagnosis while redacting the server key and bounding logs', async () => {
  const detail = await geminiFailure(Response.json({ error: { message: 'Model not found for secret-test-key. secret-test-key' } }), 'secret-test-key');
  assert.equal(detail, 'Model not found for [redacted]. [redacted]');
  assert.equal((await geminiFailure(Response.json({ error: { message: 'x'.repeat(900) } }), 'key')).length, 600);
});
test('non-JSON and missing upstream messages still produce safe diagnostics', async () => {
  assert.equal(await geminiFailure(new Response('<html>Error</html>'), 'key'), 'Gemini returned a non-JSON error');
  assert.equal(await geminiFailure(Response.json({}), 'key'), 'No Gemini error message returned');
});
