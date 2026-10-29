import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRoom } from './createRoom';

const roomId = '11111111-1111-4111-8111-111111111111';
const hostUserId = '22222222-2222-4222-8222-222222222222';

interface Options {
  hasSession?: boolean;
  sessionError?: boolean;
  anonymousError?: boolean;
  anonymousIdentityMissing?: boolean;
  rpcData?: unknown;
  rpcError?: boolean;
  roomData?: unknown;
  roomReadError?: boolean;
}

function fixture(options: Options = {}) {
  let signedIn = options.hasSession !== false;
  const authCalls: string[] = [];
  const timeline: string[] = [];
  const calls: { method: string; path: string; body: unknown; headers: Headers; search: URLSearchParams }[] = [];
  const user = { id: hostUserId, is_anonymous: !signedIn };
  const session = () => signedIn ? { access_token: 'host-test-jwt', user } : null;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
  const client = createClient('https://rooms.test', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        const text = request.method === 'POST' ? await request.text() : '';
        const body: unknown = text ? JSON.parse(text) : null;
        calls.push({ method: request.method, path: url.pathname, body, headers: request.headers, search: url.searchParams });
        timeline.push(`${request.method} ${url.pathname}`);
        if (url.pathname === '/rest/v1/rpc/create_room' && request.method === 'POST') {
          return options.rpcError
            ? json({ code: 'P0001', message: 'Room creation denied by server' }, 400)
            : json('rpcData' in options ? options.rpcData : [{ room_id: roomId, room_code: '012345' }]);
        }
        if (url.pathname === '/rest/v1/rooms' && request.method === 'GET') {
          return options.roomReadError
            ? json({ code: '42501', message: 'Room read denied' }, 403)
            : json('roomData' in options ? options.roomData : { id: roomId, host_user_id: hostUserId, status: 'lobby' });
        }
        throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
      },
    },
  });
  client.auth.getSession = async () => {
    authCalls.push('getSession');
    timeline.push('getSession');
    return { data: { session: session() }, error: options.sessionError ? { message: 'Session unavailable' } : null } as Awaited<ReturnType<SupabaseClient['auth']['getSession']>>;
  };
  client.auth.signInAnonymously = async () => {
    authCalls.push('signInAnonymously');
    timeline.push('signInAnonymously');
    if (options.anonymousError) return { data: { user: null, session: null }, error: { message: 'Anonymous sign-in disabled' } } as Awaited<ReturnType<SupabaseClient['auth']['signInAnonymously']>>;
    signedIn = !options.anonymousIdentityMissing;
    return { data: { user: signedIn ? { ...user, is_anonymous: true } : null, session: session() }, error: null } as Awaited<ReturnType<SupabaseClient['auth']['signInAnonymously']>>;
  };
  client.auth.getUser = async () => ({ data: { user: signedIn ? user : null }, error: null }) as Awaited<ReturnType<SupabaseClient['auth']['getUser']>>;
  return { client, calls, authCalls, timeline };
}

test('reuses the existing session and sends only the exact create_room RPC arguments', async () => {
  const { client, calls, authCalls } = fixture();
  assert.deepEqual(await createSupabaseRoom(client, '  Kasun  '), { id: roomId, code: '012345' });
  assert.ok(!authCalls.includes('signInAnonymously'));
  const writes = calls.filter(call => call.method === 'POST');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, '/rest/v1/rpc/create_room');
  assert.deepEqual(writes[0].body, { p_nickname: 'Kasun', p_topic: 'mixed' });
  assert.equal(writes[0].headers.get('authorization'), 'Bearer host-test-jwt');
  assert.ok(!calls.some(call => call.method === 'POST' && ['/rest/v1/rooms', '/rest/v1/players'].includes(call.path)));
});

test('signs in anonymously before creating the room only when no session exists', async () => {
  const { client, calls, authCalls, timeline } = fixture({ hasSession: false });
  assert.deepEqual(await createSupabaseRoom(client, 'Shenali'), { id: roomId, code: '012345' });
  assert.equal(authCalls.filter(call => call === 'signInAnonymously').length, 1);
  assert.ok(timeline.indexOf('signInAnonymously') < timeline.indexOf('POST /rest/v1/rpc/create_room'));
  assert.equal(calls.find(call => call.path.endsWith('/create_room'))?.headers.get('authorization'), 'Bearer host-test-jwt');
});

test('session lookup failure does not replace the identity or attempt room creation', async () => {
  const { client, calls, authCalls } = fixture({ sessionError: true });
  await assert.rejects(createSupabaseRoom(client, 'Kasun'), /session|sign.?in|auth/i);
  assert.ok(!authCalls.includes('signInAnonymously'));
  assert.equal(calls.length, 0);
});

test('anonymous authentication failure or missing identity prevents the RPC', async () => {
  for (const option of [{ anonymousError: true }, { anonymousIdentityMissing: true }]) {
    const { client, calls } = fixture({ hasSession: false, ...option });
    await assert.rejects(createSupabaseRoom(client, 'Kasun'), /anonymous|sign.?in|auth|session/i);
    assert.equal(calls.length, 0);
  }
});

test('rejects empty and overlong nicknames before making any auth or database call', async () => {
  for (const nickname of ['', '   ', 'a'.repeat(25)]) {
    const { client, calls, authCalls } = fixture();
    await assert.rejects(createSupabaseRoom(client, nickname), /nickname|1.?24|24/i);
    assert.equal(calls.length, 0);
    assert.equal(authCalls.length, 0);
  }
});

test('accepts the starter nickname boundary of 24 trimmed characters', async () => {
  const { client, calls } = fixture();
  await createSupabaseRoom(client, `  ${'a'.repeat(24)}  `);
  assert.deepEqual(calls.find(call => call.method === 'POST')?.body, { p_nickname: 'a'.repeat(24), p_topic: 'mixed' });
});

test('reports RPC errors without separately inserting a room or player', async () => {
  const { client, calls } = fixture({ rpcError: true });
  await assert.rejects(createSupabaseRoom(client, 'Kasun'), /Room creation denied by server/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/rest/v1/rpc/create_room');
});

test('rejects missing, ambiguous, malformed or code-as-ID RPC results', async () => {
  const valid = { room_id: roomId, room_code: '012345' };
  const invalid = [
    null, [], {}, valid, [valid, valid],
    [{ ...valid, room_id: '012345' }],
    [{ ...valid, room_id: 'room-ABC123' }],
    [{ ...valid, room_code: '7K2M9X' }],
    [{ ...valid, room_code: '12345' }],
    [{ ...valid, room_code: 123456 }],
  ];
  for (const rpcData of invalid) {
    const { client, calls } = fixture({ rpcData });
    await assert.rejects(createSupabaseRoom(client, 'Kasun'), /room|response|result|UUID|code/i);
    assert.equal(calls.length, 1);
  }
});

test('verifies room UUID, host identity and lobby status with an authenticated room read', async () => {
  const { client, calls } = fixture();
  await createSupabaseRoom(client, 'Kasun');
  const read = calls.find(call => call.method === 'GET');
  assert.equal(read?.path, '/rest/v1/rooms');
  assert.equal(read?.search.get('id'), `eq.${roomId}`);
  assert.equal(read?.search.get('select'), 'id,host_user_id,status');
  assert.equal(read?.headers.get('accept-profile'), 'public');
  assert.equal(read?.headers.get('authorization'), 'Bearer host-test-jwt');
});

test('does not adopt a created room when the follow-up read fails', async () => {
  const { client } = fixture({ roomReadError: true });
  await assert.rejects(createSupabaseRoom(client, 'Kasun'), /Room read denied|verify|room/i);
});

test('does not adopt inaccessible, wrong-host, non-lobby or mismatched room rows', async () => {
  const valid = { id: roomId, host_user_id: hostUserId, status: 'lobby' };
  for (const roomData of [null, { ...valid, host_user_id: 'another-user' }, { ...valid, status: 'answering' }, { ...valid, id: '33333333-3333-4333-8333-333333333333' }]) {
    const { client } = fixture({ roomData });
    await assert.rejects(createSupabaseRoom(client, 'Kasun'), /room|host|lobby|verif/i);
  }
});
