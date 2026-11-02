import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { SoundController } from './sound';

function browser(t: TestContext, options: { muted?: boolean; resumeFailure?: boolean; storageFailure?: boolean; webkitOnly?: boolean } = {}) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const calls = { contexts: 0, resumes: 0, oscillators: 0, starts: 0, saved: '' };
  class FakeAudioContext {
    state = 'suspended';
    currentTime = 0;
    destination = {};
    constructor() { calls.contexts++; }
    async resume() { calls.resumes++; if (options.resumeFailure) throw Error('Gesture required'); this.state = 'running'; }
    createOscillator() {
      calls.oscillators++;
      return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() { calls.starts++; }, stop() {} };
    }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: options.webkitOnly ? { webkitAudioContext: FakeAudioContext } : { AudioContext: FakeAudioContext } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem() { if (options.storageFailure) throw Error('Storage denied'); return String(options.muted ?? false); },
    setItem(_key: string, value: string) { if (options.storageFailure) throw Error('Storage denied'); calls.saved = value; },
  } });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  return calls;
}

test('unlock prepares audio without playing and accepted game cues reuse that context', t => {
  const calls = browser(t);
  const sound = new SoundController();
  assert.equal(calls.contexts, 0);
  sound.unlock();
  assert.deepEqual([calls.contexts, calls.resumes, calls.starts], [1, 1, 0]);
  sound.playSubmit(); sound.playVote(); sound.playTick(true); sound.playReveal(); sound.playFanfare();
  assert.equal(calls.contexts, 1);
  assert.equal(calls.starts, 13);
});

test('saved mute blocks audio, and unmuting unlocks during the toggle gesture', t => {
  const calls = browser(t, { muted: true });
  const sound = new SoundController();
  sound.unlock(); sound.playSubmit();
  assert.equal(calls.contexts, 0);
  assert.equal(sound.toggleMute(), false);
  assert.equal(calls.contexts, 1);
  assert.equal(calls.saved, 'false');
  sound.playVote();
  assert.equal(calls.starts, 1);
  sound.toggleMute(); sound.playFanfare();
  assert.equal(calls.starts, 1);
});

test('blocked resume, unsupported AudioContext and constructor errors never crash the game', async t => {
  browser(t, { resumeFailure: true });
  const sound = new SoundController();
  assert.doesNotThrow(() => { sound.unlock(); sound.playTick(); });
  await setImmediate(); // Rejected resume promises must already have rejection handlers.
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  assert.doesNotThrow(() => new SoundController().playSubmit());
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: class { constructor() { throw Error('Unavailable'); } } } });
  assert.doesNotThrow(() => new SoundController().unlock());
});

test('WebKit audio and denied storage retain working in-memory mute controls', t => {
  const calls = browser(t, { webkitOnly: true, storageFailure: true });
  const sound = new SoundController();
  assert.equal(sound.getMuted(), false);
  sound.unlock(); sound.playTick();
  assert.equal(calls.starts, 1);
  assert.equal(sound.toggleMute(), true);
  sound.playTick();
  assert.equal(calls.starts, 1);
});
