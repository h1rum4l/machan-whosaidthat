import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { OnlineGameEngine } from './onlineGameEngine';
import type { MockGameState } from './mockGameEngine';

const roomId = '11111111-1111-4111-8111-111111111111';
const hostId = '22222222-2222-4222-8222-222222222222';
const guestId = '33333333-3333-4333-8333-333333333333';
const answerId = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';

function state(me = hostId): MockGameState {
  return {
    room: { id: roomId, code: '012345', hostId, state: 'lobby', currentRound: 1, totalRounds: 10, category: 'mixed',
      currentPrompt: { id: `${roomId}:1`, promptEnglish: 'Waiting for the host to start.', category: 'mixed' }, createdAt: 1_700_000_000_000 },
    players: [
      { id: hostId, nickname: 'Kasun', avatar: 'tuktuk', score: 0, isHost: true, isReady: true, connected: true },
      { id: guestId, nickname: 'Shenali', avatar: 'peacock', score: 0, isHost: false, isReady: true, connected: true },
    ],
    currentPlayerId: me, answers: [], votes: [], roundResults: [], revealedIndex: -1, isHost: me === hostId,
    timeLeft: 0, totalTime: 0, hasAnswered: false, hasVoted: false,
  };
}

type Call = { path: string; body: Record<string, unknown>; authorization: string | null };
function fixture(options: { me?: string; noSession?: boolean; sessionError?: boolean; anonymousError?: boolean } = {}) {
  const calls: Call[] = [], authCalls: string[] = [];
  let signedIn = !options.noSession;
  let current: unknown = state(options.me);
  let respond: ((call: Call) => Response | Promise<Response>) | undefined;
  const session = () => signedIn ? { access_token: 'client-test-jwt', user: { id: userId } } : null;
  const client = createClient('https://multiplayer.test', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init);
      const call = { path: new URL(request.url).pathname, body: JSON.parse(await request.text()), authorization: request.headers.get('authorization') };
      calls.push(call);
      assert.equal(request.method, 'POST');
      assert.match(call.path, /^\/rest\/v1\/rpc\/machan_(host_room|join_room|game)$/);
      return respond ? respond(call) : Response.json(current);
    } },
  });
  client.auth.getSession = async () => {
    authCalls.push('getSession');
    return { data: { session: session() }, error: options.sessionError ? { message: 'Session read failed' } : null } as Awaited<ReturnType<SupabaseClient['auth']['getSession']>>;
  };
  client.auth.signInAnonymously = async () => {
    authCalls.push('signInAnonymously');
    signedIn = !options.anonymousError;
    return { data: { session: session(), user: signedIn ? { id: userId } : null }, error: options.anonymousError ? { message: 'Anonymous sign-in disabled' } : null } as Awaited<ReturnType<SupabaseClient['auth']['signInAnonymously']>>;
  };
  const engine = new OnlineGameEngine(() => client);
  return { engine, calls, authCalls, setState: (value: unknown) => { current = value; }, setResponder: (value: typeof respond) => { respond = value; } };
}

test('host and guest enter the same server UUID/code with real members and no invented host or bots', async () => {
  const host = fixture(), guest = fixture({ me: guestId });
  await host.engine.createRoom('  Kasun  ', 'tuktuk');
  await guest.engine.joinRoom(' 012345 ', 'Shenali', 'peacock');
  assert.equal(host.engine.getState().room!.id, guest.engine.getState().room!.id);
  assert.equal(guest.engine.getState().room!.hostId, hostId);
  assert.equal(guest.engine.getState().currentPlayerId, guestId);
  assert.ok(!guest.engine.getState().players.some(p => p.isBot));
  assert.deepEqual(host.calls[0].body, { p_nickname: 'Kasun', p_avatar: 'tuktuk' });
  assert.deepEqual(guest.calls[0].body, { p_code: '012345', p_nickname: 'Shenali', p_avatar: 'peacock' });
  assert.ok(host.calls[0].authorization?.startsWith('Bearer '));
  assert.ok(!host.authCalls.includes('signInAnonymously'));
});

test('an absent session signs in anonymously before entry; failed auth never creates a room', async () => {
  const guest = fixture({ noSession: true, me: guestId });
  await guest.engine.joinRoom('012345', 'Shenali', 'peacock');
  assert.equal(guest.authCalls.filter(call => call === 'signInAnonymously').length, 1);
  for (const options of [{ sessionError: true }, { noSession: true, anonymousError: true }]) {
    const blocked = fixture(options);
    await assert.rejects(blocked.engine.createRoom('Kasun', 'tuktuk'), /session|sign in anonymously/i);
    assert.equal(blocked.calls.length, 0);
    assert.equal(blocked.engine.getState().room, null);
  }
});

test('invalid nickname, avatar and nonnumeric or short codes fail before network calls', async () => {
  const f = fixture();
  for (const code of ['LCM55Z', '12345', '1234567', '']) await assert.rejects(f.engine.joinRoom(code, 'Friend', 'lion'), /six-digit/);
  for (const nickname of [' ', 'x'.repeat(25)]) await assert.rejects(f.engine.createRoom(nickname, 'lion'), /nickname/);
  await assert.rejects(f.engine.createRoom('Kasun', 'invalid' as 'lion'), /avatar/);
  assert.equal(f.calls.length, 0);
});

test('missing configuration and missing migration produce actionable errors instead of opening a demo', async () => {
  const engine = new OnlineGameEngine(() => null);
  await assert.rejects(engine.createRoom('Kasun', 'lion'), /Supabase is not configured/);
  assert.equal(engine.getState().room, null);
  const f = fixture();
  f.setResponder(() => Response.json({ code: 'PGRST202', message: 'Could not find the function public.machan_join_room' }, { status: 404 }));
  await assert.rejects(f.engine.joinRoom('012345', 'Kasun', 'lion'), /Apply the shared multiplayer SQL migration/);
  assert.equal(f.engine.getState().room, null);
});

test('full rooms, wrong codes and invalid server snapshots fail without fake success', async () => {
  const invalid: unknown[] = [null, {}, { ...state(), players: [] }, { ...state(), currentPlayerId: answerId },
    { ...state(), players: state().players.map(p => ({ ...p, isBot: true })) },
    { ...state(), room: { ...state().room, hostId: answerId } },
    { ...state(), room: { ...state().room, code: '543210' } }];
  for (const data of invalid) {
    const f = fixture(); f.setState(data);
    await assert.rejects(f.engine.joinRoom('012345', 'Kasun', 'lion'), /snapshot|different room/);
    assert.equal(f.engine.getState().room, null);
  }
  const full = fixture();
  full.setResponder(() => Response.json({ code: 'P0001', message: 'This room is full.' }, { status: 400 }));
  await assert.rejects(full.engine.joinRoom('012345', 'Kasun', 'lion'), /room is full/);
});

test('actions send only room/action/input; phases and scores change only with the returned server snapshot', async () => {
  const f = fixture(); await f.engine.createRoom('Kasun', 'lion');
  const next = state(); next.room!.state = 'question'; next.timeLeft = next.totalTime = 20;
  f.setState(next);
  await f.engine.startGame();
  assert.equal(f.engine.getState().room!.state, 'question');
  assert.equal(f.calls.at(-1)!.body.p_expected_round, null);
  await f.engine.submitAnswer('  Kottu first machan  ');
  assert.equal(f.engine.getState().hasAnswered, false, 'The client does not invent server confirmation');
  const action = f.calls.at(-1)!;
  assert.deepEqual(action.body, { p_room_id: roomId, p_action: 'answer', p_text: 'Kottu first machan', p_target: null, p_expected_round: 1 });
  const voting = state(); voting.room!.state = 'voting'; voting.timeLeft = voting.totalTime = 15;
  f.setState(voting);
  const pending = f.engine.castVote(answerId);
  assert.equal(f.engine.getState().players[0].score, 0);
  await pending;
  assert.deepEqual(f.calls.at(-1)!.body, { p_room_id: roomId, p_action: 'vote', p_text: null, p_target: answerId, p_expected_round: 1 });
  await assert.rejects(f.engine.castVote(hostId), /another player/);
  await assert.rejects(f.engine.submitAnswer('one two three four five six seven eight nine ten eleven'), /maximum 10 words/);
  for (const [method, expected] of [
    ['revealNextCard', 'reveal_next'], ['revealAllCards', 'reveal_all'], ['transitionToScoreboard', 'scoreboard'],
    ['advanceFromScoreboard', 'next'], ['rematch', 'rematch'],
  ] as const) {
    if (method === 'rematch') {
      const winner = state(); winner.room!.state = 'winner'; winner.room!.currentRound = 10;
      f.setState(winner); await f.engine.refresh();
    }
    const response = state();
    response.room!.state = method === 'transitionToScoreboard' ? 'scoreboard'
      : method === 'advanceFromScoreboard' ? 'question' : method === 'rematch' ? 'lobby' : 'reveal';
    response.room!.currentRound = method === 'advanceFromScoreboard' ? 2 : 1;
    f.setState(response);
    await f.engine[method]();
    assert.equal(f.calls.at(-1)!.body.p_action, expected);
    assert.equal(f.calls.at(-1)!.body.p_expected_round, method === 'rematch' ? 10 : 1);
  }
});

test('voting accepts opaque answer IDs without revealing or inferring the other author', async () => {
  const f = fixture({ me: guestId });
  const voting = state(guestId); voting.room!.state = 'voting'; voting.timeLeft = voting.totalTime = 15;
  voting.answers = [{ round: 1, playerId: answerId, authorNickname: '', text: 'Kottu first machan', submittedAt: 0 }];
  f.setState(voting);
  await f.engine.joinRoom('012345', 'Shenali', 'lion');
  assert.equal(f.engine.getState().answers[0].authorNickname, '');
  await f.engine.castVote(answerId);
  assert.equal(f.calls.at(-1)!.body.p_target, answerId);
});

test('a host entry cannot adopt a guest identity and later reads cannot switch rooms', async () => {
  const wrongHost = fixture({ me: guestId });
  await assert.rejects(wrongHost.engine.createRoom('Kasun', 'lion'), /real host/);
  assert.equal(wrongHost.engine.getState().room, null);
  const f = fixture(); await f.engine.createRoom('Kasun', 'lion');
  const crossed = state(); crossed.room!.id = answerId;
  f.setState(crossed);
  await assert.rejects(f.engine.refresh(), /invalid room snapshot/);
  assert.equal(f.engine.getState().room!.id, roomId);
});

test('polling uses one interval, coalesces reads, and stops after the last subscriber leaves', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(); const unsubscribe = f.engine.subscribe(() => {});
  await f.engine.createRoom('Kasun', 'lion');
  const otherUnsubscribe = f.engine.subscribe(() => {});
  t.mock.timers.tick(1000); await setImmediate();
  assert.equal(f.calls.filter(call => call.body.p_action === 'read').length, 1);
  unsubscribe(); otherUnsubscribe();
  t.mock.timers.tick(3000); await setImmediate();
  assert.equal(f.calls.filter(call => call.body.p_action === 'read').length, 1);
});

test('a read completing after leave was requested cannot overwrite the leaving state or resurrect the room', async () => {
  const f = fixture(); await f.engine.createRoom('Kasun', 'lion');
  let resolveRead!: (response: Response) => void;
  const delayed = new Promise<Response>(resolve => { resolveRead = resolve; });
  f.setResponder(call => call.body.p_action === 'read' ? delayed : Response.json({ room: null }));
  const seen: number[] = []; const unsubscribe = f.engine.subscribe(next => { if (next.players[0]) seen.push(next.players[0].score); });
  const read = f.engine.refresh();
  await setImmediate();
  assert.equal(f.engine.refresh(), read, 'Concurrent refreshes share the same request');
  const leaving = f.engine.leaveRoom();
  const stale = state(); stale.players[0].score = 999;
  resolveRead(Response.json(stale));
  await Promise.all([read, leaving]);
  assert.ok(!seen.includes(999));
  assert.equal(f.engine.getState().room, null);
  assert.deepEqual(f.calls.slice(1).map(call => call.body.p_action), ['read', 'leave']);
  unsubscribe();
});

test('an answer queued behind a poll retains its original round and surfaces server rejection after the round changes', async () => {
  const f = fixture();
  const first = state(); first.room!.state = 'question'; first.timeLeft = first.totalTime = 20;
  f.setState(first); await f.engine.createRoom('Kasun', 'lion');
  let resolveRead!: (response: Response) => void;
  const delayed = new Promise<Response>(resolve => { resolveRead = resolve; });
  f.setResponder(call => {
    if (call.body.p_action === 'read') return delayed;
    assert.equal(call.body.p_action, 'answer');
    assert.equal(call.body.p_expected_round, 1, 'Use the round visible at click time, not the new snapshot');
    return Response.json({ code: '22023', message: 'This round has changed. Refresh the game before trying again.' }, { status: 400 });
  });
  const read = f.engine.refresh(); await setImmediate();
  const answer = f.engine.submitAnswer('Round one answer');
  const rejected = assert.rejects(answer, /round has changed/);
  const second = state(); second.room!.state = 'question'; second.room!.currentRound = 2;
  second.timeLeft = second.totalTime = 20;
  resolveRead(Response.json(second));
  await read; await rejected;
  assert.equal(f.engine.getState().room!.currentRound, 2);
  assert.equal(f.engine.getState().hasAnswered, false);
  assert.deepEqual(f.engine.getState().answers, []);
});

test('a valid-looking response with the wrong phase for a completed mutation is not adopted', async () => {
  const f = fixture(); await f.engine.createRoom('Kasun', 'lion');
  const impossible = state(); impossible.room!.state = 'winner';
  f.setState(impossible);
  await assert.rejects(f.engine.startGame(), /unexpected round or phase/);
  assert.equal(f.engine.getState().room!.state, 'lobby');
});

test('a failed leave preserves the room for retry; a closed host room resets and reports the reason', async () => {
  const f = fixture(); await f.engine.createRoom('Kasun', 'lion');
  const errors: string[] = []; f.engine.subscribeError(error => errors.push(error.message));
  f.setResponder(() => Response.json({ code: 'P0001', message: 'Connection unavailable' }, { status: 503 }));
  await assert.rejects(f.engine.leaveRoom(), /Connection unavailable/);
  assert.equal(f.engine.getState().room!.id, roomId);
  f.setResponder(() => Response.json({ code: 'P0001', message: 'The host has closed this room.' }, { status: 400 }));
  await assert.rejects(f.engine.refresh(), /host has closed/);
  assert.equal(f.engine.getState().room, null);
  assert.match(errors.at(-1)!, /host has closed/);
});

test('reset ignores a delayed entry response, and returned snapshots cannot be mutated by callers', async () => {
  const f = fixture(); let resolve!: (response: Response) => void;
  f.setResponder(() => new Promise<Response>(done => { resolve = done; }));
  const entering = f.engine.createRoom('Kasun', 'lion'); await setImmediate();
  f.engine.reset(); resolve(Response.json(state())); await entering;
  assert.equal(f.engine.getState().room, null);
  f.setResponder(undefined); await f.engine.createRoom('Kasun', 'lion');
  const copy = f.engine.getState(); copy.players[0].score = 999;
  assert.equal(f.engine.getState().players[0].score, 0);
});
