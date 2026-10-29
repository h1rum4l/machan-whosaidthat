import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createFallbackQuestions, generateQuestions, getSavedQuestions, saveQuestions, QuestionGenerationUnavailableError, type RoundQuestion } from './roomQuestions';

const roomId = 'saved-room-123';
const questions = () => createFallbackQuestions(roomId);

interface Options {
  saved?: unknown[];
  payload?: unknown;
  functionStatus?: number;
  offline?: boolean;
  malformedJson?: boolean;
  relayError?: boolean;
  authenticated?: boolean;
  roomExists?: boolean;
  hostUserId?: string;
  roomStatus?: string;
  readError?: boolean;
  insertError?: { code: string; message: string };
  concurrentSave?: boolean;
}

function fixture(options: Options = {}) {
  let saved: unknown[] = options.saved ?? [];
  const calls: { method: string; path: string; body: unknown; headers: Headers; search: URLSearchParams }[] = [];
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', ...headers },
  });
  const client = createClient('https://questions.test', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        const text = request.method === 'POST' ? await request.text() : '';
        const body: unknown = text ? JSON.parse(text) : null;
        calls.push({ method: request.method, path: url.pathname, body, headers: request.headers, search: url.searchParams });
        if (url.pathname === '/rest/v1/rooms') return json(options.roomExists === false ? null : { id: roomId, host_user_id: options.hostUserId ?? 'host-user', status: options.roomStatus ?? 'lobby' });
        if (url.pathname === '/rest/v1/rounds' && request.method === 'GET') {
          if (options.readError) return json({ code: '42501', message: 'Read denied' }, 403);
          return json(saved);
        }
        if (url.pathname === '/rest/v1/rounds' && request.method === 'POST') {
          if (options.insertError) {
            if (options.concurrentSave) saved = questions();
            return json(options.insertError, options.insertError.code === '23505' ? 409 : 403);
          }
          saved = body as RoundQuestion[];
          return new Response(null, { status: 201 });
        }
        if (url.pathname === '/functions/v1/generate-questions') {
          if (options.offline) throw new TypeError('Failed to fetch');
          if (options.malformedJson) return new Response('{invalid', { headers: { 'content-type': 'application/json' } });
          if (options.relayError) return json({}, 200, { 'x-relay-error': 'true' });
          return json('payload' in options ? options.payload : { questions: questions() }, options.functionStatus ?? 200);
        }
        throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
      },
    },
  });
  // The auth endpoint is outside this unit's scope; the real SDK transports the test JWT.
  client.auth.getUser = async () => ({ data: { user: options.authenticated === false ? null : { id: 'host-user' } }, error: null }) as Awaited<ReturnType<SupabaseClient['auth']['getUser']>>;
  client.auth.getSession = async () => ({ data: { session: { access_token: 'host-jwt' } }, error: null }) as Awaited<ReturnType<SupabaseClient['auth']['getSession']>>;
  return { client, calls };
}

test('fallback contains ten distinct bilingual Sri Lankan rounds with stable numbering', () => {
  const rows = questions();
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map(row => row.round_no), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(rows.map(row => row.question)).size, 10);
  assert.ok(rows.every(row => row.room_id === roomId && row.category && row.question.includes(' / ') && row.question.length >= 8 && row.question.length <= 130));
  assert.match(rows[0].question, /Sri Lankan Amma/);
});

test('invokes the deployed function with only roomId using the authenticated client', async () => {
  const { client, calls } = fixture();
  assert.equal((await generateQuestions(client, roomId)).length, 10);
  const call = calls.find(call => call.path === '/functions/v1/generate-questions');
  assert.equal(call?.method, 'POST');
  assert.deepEqual(call?.body, { roomId });
  assert.equal(call?.headers.get('authorization'), 'Bearer host-jwt');
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
});

test('accepts the explicit questions envelope and returns rounds in order', async () => {
  const { client } = fixture({ payload: { questions: questions().reverse() } });
  assert.deepEqual((await generateQuestions(client, roomId)).map(row => row.round_no), questions().map(row => row.round_no));
});

test('accepts the starter questions envelope without saving or using fallback', async () => {
  const aiRows = questions().map(row => ({ ...row, question: `Fresh AI question for round ${row.round_no}?` }));
  const { client, calls } = fixture({ payload: { questions: aiRows } });
  assert.deepEqual(await generateQuestions(client, roomId), aiRows);
  assert.equal(calls.filter(call => call.path === '/rest/v1/rounds' && call.method === 'POST').length, 0);
});

test('already saved rounds prevent generation and insertion', async () => {
  const { client, calls } = fixture({ saved: questions() });
  assert.deepEqual(await generateQuestions(client, roomId), questions());
  assert.deepEqual(await saveQuestions(client, roomId, questions()), questions());
  assert.equal(calls.filter(call => call.method === 'POST').length, 0);
});

test('saving inserts all ten exact records atomically into public.rounds and confirms them', async () => {
  const { client, calls } = fixture();
  assert.deepEqual(await saveQuestions(client, roomId, questions()), questions());
  const writes = calls.filter(call => call.method === 'POST');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, '/rest/v1/rounds');
  assert.equal(writes[0].headers.get('content-profile'), 'public');
  assert.equal(writes[0].headers.get('authorization'), 'Bearer host-jwt');
  assert.deepEqual(writes[0].body, questions());
  const reads = calls.filter(call => call.path === '/rest/v1/rounds' && call.method === 'GET');
  assert.equal(reads.length, 2);
  assert.ok(reads.every(call => call.search.get('room_id') === `eq.${roomId}` && call.search.get('order') === 'round_no.asc'));
});

test('a save retry reads existing rounds instead of writing or generating again', async () => {
  const { client, calls } = fixture();
  await saveQuestions(client, roomId, questions());
  await saveQuestions(client, roomId, questions());
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  assert.ok(!calls.some(call => call.path.includes('/functions/')));
});

test('concurrent duplicate-key failure recovers the complete existing set without overwriting', async () => {
  const { client } = fixture({ insertError: { code: '23505', message: 'Duplicate round' }, concurrentSave: true });
  assert.deepEqual(await saveQuestions(client, roomId, questions()), questions());
});

test('unexplained duplicate failure does not claim a successful save', async () => {
  const { client } = fixture({ insertError: { code: '23505', message: 'Duplicate round' } });
  await assert.rejects(saveQuestions(client, roomId, questions()), /duplicate round prevented saving/i);
});

test('save permission errors retain actionable retry-saving guidance', async () => {
  const { client } = fixture({ insertError: { code: '42501', message: 'Host insert denied' } });
  await assert.rejects(saveQuestions(client, roomId, questions()), /Host insert denied.*Retry saving.*no new generation/i);
});

test('missing authentication or saved room prevents function and insert calls', async () => {
  for (const option of [{ authenticated: false }, { roomExists: false }]) {
    const { client, calls } = fixture(option);
    await assert.rejects(generateQuestions(client, roomId), /signed in|not been saved/i);
    await assert.rejects(saveQuestions(client, roomId, questions()), /signed in|not been saved/i);
    assert.ok(!calls.some(call => call.method === 'POST'));
  }
});

test('a different authenticated user or a non-lobby room cannot generate or save', async () => {
  for (const option of [{ hostUserId: 'another-host' }, { roomStatus: 'question' }, { roomStatus: 'finished' }]) {
    const { client, calls } = fixture(option);
    await assert.rejects(generateQuestions(client, roomId), /authenticated host|in the lobby/);
    await assert.rejects(saveQuestions(client, roomId, questions()), /authenticated host|in the lobby/);
    assert.ok(!calls.some(call => call.path === '/rest/v1/rounds' || call.method === 'POST'));
    assert.ok(calls.every(call => call.search.get('select') === 'id,host_user_id,status'));
  }
});

test('only the contracted questions envelope is accepted', async () => {
  for (const payload of [questions(), { rounds: questions() }, { data: { questions: questions() } }]) {
    const { client, calls } = fixture({ payload });
    await assert.rejects(generateQuestions(client, roomId), /expected a questions array/);
    assert.ok(!calls.some(call => call.path === '/rest/v1/rounds' && call.method === 'POST'));
  }
});

test('question lengths use trimmed text and accept exactly 8 or 130 characters', async () => {
  const rows = questions();
  rows[0].question = '  12345678  ';
  rows[1].question = ` ${'x'.repeat(130)} `;
  const { client } = fixture({ payload: { questions: rows } });
  const result = await generateQuestions(client, roomId);
  assert.equal(result[0].question, '12345678');
  assert.equal(result[1].question.length, 130);
  for (const invalid of ['1234567', 'x'.repeat(131), '    ']) {
    const bad = questions();
    bad[0].question = invalid;
    const attempt = fixture({ payload: { questions: bad } });
    await assert.rejects(generateQuestions(attempt.client, roomId), /8–130 characters/);
    await assert.rejects(saveQuestions(attempt.client, roomId, bad), /8–130 characters/);
    assert.ok(!attempt.calls.some(call => call.path === '/rest/v1/rounds' && call.method === 'POST'));
  }
});

test('categories default to mixed, trim and truncate at 40 characters; extra fields are discarded', async () => {
  const rows: Record<string, unknown>[] = questions().map(row => ({ ...row, ignored: 'not a database column' }));
  delete rows[0].category;
  rows[1].category = '  ';
  rows[2].category = `  ${'c'.repeat(45)}  `;
  rows[3].category = '  food  ';
  const { client } = fixture({ payload: { questions: rows } });
  const result = await generateQuestions(client, roomId);
  assert.equal(result[0].category, 'mixed');
  assert.equal(result[1].category, 'mixed');
  assert.equal(result[2].category, 'c'.repeat(40));
  assert.equal(result[3].category, 'food');
  assert.ok(result.every(row => !('ignored' in row)));
  for (const invalid of [null, 42, {}]) {
    rows[0].category = invalid;
    const bad = fixture({ payload: { questions: rows } });
    await assert.rejects(generateQuestions(bad.client, roomId), /text category/);
  }
});

test('failed round reads fail closed without invoking or inserting', async () => {
  const { client, calls } = fixture({ readError: true });
  await assert.rejects(generateQuestions(client, roomId), /Could not check saved questions/);
  assert.ok(!calls.some(call => call.method === 'POST'));
});

test('incomplete existing sets are not overwritten or regenerated', async () => {
  const { client, calls } = fixture({ saved: questions().slice(0, 4) });
  await assert.rejects(getSavedQuestions(client, roomId), /incomplete or invalid saved question set/);
  await assert.rejects(generateQuestions(client, roomId), /incomplete or invalid saved question set/);
  await assert.rejects(saveQuestions(client, roomId, questions()), /incomplete or invalid saved question set/);
  assert.ok(!calls.some(call => call.method === 'POST'));
});

test('rejects short, duplicate, mismatched-room and malformed function records without saving', async () => {
  const duplicate = questions();
  duplicate[9] = { ...duplicate[0] };
  const wrongRoom = questions().map(row => ({ ...row, room_id: 'another-room' }));
  const wrongText = questions().map(row => ({ ...row, question: '' }));
  const duplicateText = questions().map(row => ({ ...row, question: 'same question' }));
  for (const payload of [questions().slice(0, 9), duplicate, wrongRoom, wrongText, duplicateText, { questions: questions().slice(0, 9) }, null]) {
    const { client, calls } = fixture({ payload: payload && Array.isArray(payload) ? { questions: payload } : payload });
    await assert.rejects(generateQuestions(client, roomId), /Nothing was saved/);
    assert.ok(!calls.some(call => call.path === '/rest/v1/rounds' && call.method === 'POST'));
  }
});

test('validates pending records before any insert', async () => {
  const { client, calls } = fixture();
  await assert.rejects(saveQuestions(client, roomId, questions().slice(1)), /exactly 10/);
  assert.ok(!calls.some(call => call.method === 'POST'));
});

test('rate limits, server unavailability and offline errors clearly offer fallback questions', async () => {
  for (const option of [{ functionStatus: 429 }, { functionStatus: 503 }, { offline: true }, { relayError: true }]) {
    const { client } = fixture(option);
    await assert.rejects(generateQuestions(client, roomId), QuestionGenerationUnavailableError);
  }
});

test('401 and 403 identify host authentication instead of pretending the save succeeded', async () => {
  for (const status of [401, 403]) {
    const { client } = fixture({ functionStatus: status, payload: { error: 'Host token required' } });
    await assert.rejects(generateQuestions(client, roomId), error => {
      assert.ok(error instanceof Error && !(error instanceof QuestionGenerationUnavailableError));
      assert.match(error.message, /not authorized.*host.*Host token required/);
      return true;
    });
  }
});

test('success-status error payloads and malformed JSON fail visibly', async () => {
  const business = fixture({ payload: { error: { message: 'Gemini quota exhausted' } } });
  await assert.rejects(generateQuestions(business.client, roomId), /Gemini quota exhausted.*fallback/);
  const malformed = fixture({ malformedJson: true });
  await assert.rejects(generateQuestions(malformed.client, roomId), /generation failed.*try again/i);
});

test('after API failure the host can save all ten local rounds without another AI call', async () => {
  for (const options of [{ functionStatus: 429 }, { functionStatus: 502, payload: { error: 'Gemini unavailable (429). Try again or fallback.' } }, { offline: true }]) {
    const { client, calls } = fixture(options);
    await assert.rejects(generateQuestions(client, roomId), QuestionGenerationUnavailableError);
    assert.ok(!calls.some(call => call.path === '/rest/v1/rounds' && call.method === 'POST'));
    const fallback = createFallbackQuestions(roomId);
    assert.ok(fallback.every(row => row.question.length >= 8 && row.question.length <= 130));
    assert.deepEqual(await saveQuestions(client, roomId, fallback), fallback);
    assert.equal(calls.filter(call => call.path.includes('/functions/')).length, 1);
    assert.equal(calls.filter(call => call.path === '/rest/v1/rounds' && call.method === 'POST').length, 1);
    await saveQuestions(client, roomId, fallback);
    assert.equal(calls.filter(call => call.path === '/rest/v1/rounds' && call.method === 'POST').length, 1);
  }
});
