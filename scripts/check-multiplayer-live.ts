// Opt-in integration check: creates three anonymous users and one test room, then closes it.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { OnlineGameEngine } from '../src/services/onlineGameEngine';
import { createFallbackQuestions, saveQuestions } from '../src/services/roomQuestions';

if (process.env.MACHAN_LIVE_TEST !== '1') throw new Error('Set MACHAN_LIVE_TEST=1 to run the opt-in live test.');
const project = JSON.parse(await readFile(new URL('../src/config/supabase.public.json', import.meta.url), 'utf8'));
const clients = Array.from({ length: 3 }, () => createClient(project.url, project.publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}));
const engines = clients.map(client => new OnlineGameEngine(() => client));
const [host, first, second] = engines;
const sync = () => Promise.all(engines.map(engine => engine.refresh()));
try {
  await host.createRoom('QA Host', 'tuktuk');
  const room = host.getState().room!;
  await first.joinRoom(room.code, 'QA First', 'lion');
  await second.joinRoom(room.code, 'QA Second', 'peacock');
  await sync();
  for (const engine of engines) {
    const state = engine.getState();
    assert.equal(state.room!.id, room.id);
    assert.equal(state.players.length, 3);
    assert.equal(state.players.filter(player => player.isHost).length, 1);
    assert.ok(state.players.every(player => !player.isBot));
    assert.equal(state.players.find(player => player.isHost)!.nickname, 'QA Host');
  }
  await first.joinRoom(room.code, 'QA First', 'lion');
  assert.equal(first.getState().players.length, 3, 'Rejoining must not duplicate players');
  await saveQuestions(clients[0], room.id, createFallbackQuestions(room.id));
  await host.startGame();
  console.log('Three authenticated players share one real host and room; fallback rounds saved through host RLS.');
  for (let round = 1; round <= 10; round++) {
    await sync();
    for (const engine of engines) {
      assert.equal(engine.getState().room!.state, 'question');
      assert.equal(engine.getState().room!.currentRound, round);
    }
    for (const [index, engine] of engines.entries()) await engine.submitAnswer(`Player ${index + 1} round ${round}`);
    await sync();
    for (const [index, engine] of engines.entries()) {
      const state = engine.getState();
      assert.equal(state.room!.state, 'voting');
      assert.ok(state.answers.every(answer => answer.authorNickname === ''), 'Authors must remain hidden during voting');
      const targetText = `Player ${index === 0 ? 2 : 1} round ${round}`;
      const target = state.answers.find(answer => answer.text === targetText)!;
      assert.ok(!state.players.some(player => player.id === target.playerId), 'Other ballot IDs must not identify roster members');
      await engine.castVote(target.playerId);
    }
    await sync();
    for (const engine of engines) assert.equal(engine.getState().room!.state, 'reveal');
    await host.revealAllCards();
    await host.transitionToScoreboard();
    await host.advanceFromScoreboard();
    console.log(`Round ${round}/10 synchronized: real answers, anonymous votes, reveal and scores.`);
  }
  await sync();
  for (const engine of engines) {
    const state = engine.getState();
    assert.equal(state.room!.state, 'winner');
    assert.equal(state.players.find(player => player.nickname === 'QA Host')!.score, 22);
    assert.equal(state.players.find(player => player.nickname === 'QA First')!.score, 11);
    assert.equal(state.players.find(player => player.nickname === 'QA Second')!.score, 0);
  }
  await host.rematch();
  await sync();
  for (const engine of engines) {
    assert.equal(engine.getState().room!.state, 'lobby');
    assert.ok(engine.getState().players.every(player => player.score === 0));
  }
  const saved = await clients[0].from('rounds').select('round_no').eq('room_id', room.id);
  assert.equal(saved.error, null);
  assert.equal(saved.data!.length, 10, 'Rematch must retain its saved questions');
  console.log('PASS: all ten rounds, final double points and rematch agree across three independent clients. No Gemini calls.');
} finally {
  if (host.getState().room) await host.leaveRoom().catch(error => console.error('Test-room closure failed:', error.message));
  for (const engine of engines) engine.reset();
  for (const client of clients) await client.auth.signOut({ scope: 'local' });
}
