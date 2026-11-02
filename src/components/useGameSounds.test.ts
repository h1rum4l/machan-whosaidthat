import test from 'node:test';
import assert from 'node:assert/strict';
import type { MockGameState } from '../services/mockGameEngine';
import { gameSoundEvents } from './useGameSounds';

function state(phase: NonNullable<MockGameState['room']>['state'] = 'question', overrides: Partial<MockGameState> = {}): MockGameState {
  return {
    room: { id: 'room-1', code: '123456', hostId: 'host', state: phase, currentRound: 1, totalRounds: 10,
      category: 'mixed', currentPrompt: { id: 'p1', promptEnglish: 'A question for the room?', category: 'mixed' }, createdAt: 0 },
    players: [], currentPlayerId: 'me', answers: [], votes: [], roundResults: [], revealedIndex: -1,
    isHost: false, timeLeft: 29, totalTime: 30, hasAnswered: false, hasVoted: false, ...overrides,
  };
}

test('only confirmed answer and vote changes play their cues, never duplicate polls', () => {
  const before = state();
  assert.deepEqual(gameSoundEvents(before, state()), []);
  const answered = state('question', { hasAnswered: true });
  assert.deepEqual(gameSoundEvents(before, answered), ['submit']);
  assert.deepEqual(gameSoundEvents(answered, structuredClone(answered)), []);
  const voting = state('voting', { hasAnswered: true, timeLeft: 13 });
  const voted = state('voting', { hasAnswered: true, hasVoted: true, timeLeft: 13 });
  assert.deepEqual(gameSoundEvents(voting, voted), ['vote']);
  assert.deepEqual(gameSoundEvents(voted, structuredClone(voted)), []);
});

test('initial snapshots, new rooms, changed members and round history stay silent', () => {
  const historical = state('winner', { hasAnswered: true, hasVoted: true });
  assert.deepEqual(gameSoundEvents(null, historical), []);
  assert.deepEqual(gameSoundEvents({ ...state(), room: null }, historical), []);
  const otherRoom = state(); otherRoom.room!.id = 'another-room';
  assert.deepEqual(gameSoundEvents(otherRoom, historical), []);
  assert.deepEqual(gameSoundEvents({ ...state(), currentPlayerId: 'another-member' }, historical), []);
  const nextRound = state('question', { hasAnswered: true, timeLeft: 29 });
  nextRound.room!.currentRound = 2;
  assert.deepEqual(gameSoundEvents(state(), nextRound), []);
});

test('countdown cues occur only for changed positive countdown values in timed phases', () => {
  assert.deepEqual(gameSoundEvents(state(), state('question', { timeLeft: 28 })), ['tick']);
  assert.deepEqual(gameSoundEvents(state(), state('question', { timeLeft: 27 })), []);
  assert.deepEqual(gameSoundEvents(state(), state('question', { timeLeft: 5 })), ['urgentTick']);
  assert.deepEqual(gameSoundEvents(state('question', { timeLeft: 5 }), state('question', { timeLeft: 5 })), []);
  assert.deepEqual(gameSoundEvents(state(), state('question', { timeLeft: 0 })), []);
  assert.deepEqual(gameSoundEvents(state('lobby'), state('lobby', { timeLeft: 4 })), []);
  assert.deepEqual(gameSoundEvents(state('voting', { timeLeft: 6 }), state('voting', { timeLeft: 5 })), ['urgentTick']);
});

test('reveals and victory play once per confirmed phase or newly revealed card', () => {
  const revealed = state('reveal', { revealedIndex: 0, timeLeft: 0 });
  assert.deepEqual(gameSoundEvents(state('voting'), revealed), ['reveal']);
  assert.deepEqual(gameSoundEvents(revealed, structuredClone(revealed)), []);
  assert.deepEqual(gameSoundEvents(revealed, state('reveal', { revealedIndex: 1, timeLeft: 0 })), ['reveal']);
  assert.deepEqual(gameSoundEvents(state('scoreboard'), state('winner')), ['fanfare']);
  assert.deepEqual(gameSoundEvents(state('winner'), state('winner')), []);
});
