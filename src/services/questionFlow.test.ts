import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SRI_LANKAN_PROMPTS } from '../utils/helpers';

test('saved room UUID/code and questions drive all rounds and survive rematch without crossing rooms', async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'true' } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setInterval: () => 1 } });
  const { mockGameEngine: engine } = await import('./mockGameEngine');
  const savedRoom = { id: '11111111-1111-4111-8111-111111111111', code: '012345' };
  const prompts = Array.from({ length: 10 }, (_, index) => ({
    id: `saved-${index + 1}`, promptEnglish: `Generated Sri Lankan question ${index + 1}?`, category: 'mixed',
  }));
  try {
    engine.createRoom('Kasun', 'tuktuk', savedRoom);
    assert.equal(engine.getState().room?.id, savedRoom.id);
    assert.equal(engine.getState().room?.code, '012345');
    engine.setRoomQuestions('another-room', prompts);
    engine.setRoomQuestions(savedRoom.id, prompts.slice(1));
    assert.equal(engine.getState().room?.currentPrompt.id, SRI_LANKAN_PROMPTS[0].id);
    engine.setRoomQuestions(savedRoom.id, prompts);
    for (let round = 1; round <= 10; round++) {
      engine.startRound(round);
      assert.deepEqual(engine.getState().room?.currentPrompt, prompts[round - 1]);
    }
    engine.rematch();
    engine.startGame();
    assert.deepEqual(engine.getState().room?.currentPrompt, prompts[0]);
    engine.leaveRoom();
    engine.createRoom('Shenali', 'peacock');
    engine.startGame();
    assert.deepEqual(engine.getState().room?.currentPrompt, SRI_LANKAN_PROMPTS[0]);
    engine.leaveRoom();
    engine.joinRoom('123456', 'Guest', 'lion');
    engine.setRoomQuestions('room-123456', prompts);
    assert.deepEqual(engine.getState().room?.currentPrompt, SRI_LANKAN_PROMPTS[0]);
  } finally {
    engine.leaveRoom();
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
