import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

// Exercise the delivered single file with mocked auth context and HTTP, never live Gemini.
const source = await readFile(new URL('./dashboard.ts', import.meta.url), 'utf8');
const testSource = source.replace("import { withSupabase } from 'npm:@supabase/server@1';", 'const withSupabase = (_options, handler) => handler;');
const compiled = stripTypeScriptTypes(testSource);
const { default: edge } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const roomId = '11111111-1111-4111-8111-111111111111';

function setup(t, { host = 'host', count = 0, status = 200, payload = null } = {}) {
  const originalFetch = globalThis.fetch;
  const originalDeno = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
  const originalError = console.error;
  const calls = [], logs = [];
  const key = 'server-test-key';
  Object.defineProperty(globalThis, 'Deno', { configurable: true, value: { env: { get: name => ({
    GEMINI_API_KEY: key, GEMINI_MODEL: ' models/gemini-3.5-flash-lite ',
  })[name] } } });
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json(payload || { candidates: [{ content: { parts: [{ text: JSON.stringify({ questions: Array.from({ length: 10 }, (_, i) => ({ question: `Question number ${i + 1} for your machans?`, category: 'mixed' })) }) }] } }] }, { status });
  };
  console.error = (...args) => logs.push(args);
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    if (originalDeno) Object.defineProperty(globalThis, 'Deno', originalDeno);
    else delete globalThis.Deno;
  });
  const ctx = {
    userClaims: { id: host },
    supabase: { from: table => ({ select: () => ({ eq: () => table === 'rooms'
      ? { single: async () => ({ data: { id: roomId, host_user_id: 'host', status: 'lobby', topic: 'mixed' }, error: null }) }
      : Promise.resolve({ count, error: null }) }) }) },
  };
  return { calls, logs, key, run: () => edge.fetch(new Request('https://test.invalid', { method: 'POST', body: JSON.stringify({ roomId }) }), ctx) };
}

test('dashboard file is self-contained and returns ten room records without deprecated sampling settings', async t => {
  const [entry, helpers] = await Promise.all(['./index.ts', './gemini.ts'].map(path => readFile(new URL(path, import.meta.url), 'utf8')));
  assert.equal(source, '// Single-file Supabase Dashboard version. Paste this entire file into index.ts.\n' + entry.replace("import { geminiFailure, geminiModel } from './gemini.ts';", helpers));
  assert.ok(!source.includes("from './gemini.ts'"));
  const fixture = setup(t);
  const response = await fixture.run();
  assert.equal(response.status, 200);
  const { questions } = await response.json();
  assert.equal(questions.length, 10);
  assert.deepEqual(questions.map(q => q.round_no), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(questions.every(q => q.room_id === roomId));
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.deepEqual(JSON.parse(fixture.calls[0].init.body).generationConfig, { responseMimeType: 'application/json' });
});

test('400 reveals the actual upstream reason while redacting the key from host response and logs', async t => {
  const fixture = setup(t, { status: 400, payload: { error: { message: 'Invalid parameter for server-test-key' } } });
  const response = await fixture.run();
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.match(body.error, /Invalid parameter for \[redacted\]/);
  assert.ok(!JSON.stringify([body, fixture.logs]).includes(fixture.key));
});

test('non-host callers never reach Gemini', async t => {
  const fixture = setup(t, { host: 'guest' });
  assert.equal((await fixture.run()).status, 403);
  assert.equal(fixture.calls.length, 0);
});

test('saved rounds prevent another generation call', async t => {
  const fixture = setup(t, { count: 10 });
  assert.equal((await fixture.run()).status, 409);
  assert.equal(fixture.calls.length, 0);
});

test('429 remains a rate-limit response with fallback guidance', async t => {
  const fixture = setup(t, { status: 429, payload: { error: { message: 'Quota exceeded' } } });
  const response = await fixture.run();
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /fallback questions/);
});
