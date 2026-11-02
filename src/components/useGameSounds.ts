import { useEffect, useRef } from 'react';
import type { MockGameState } from '../services/mockGameEngine';
import { soundService } from '../utils/sound';

export type GameSound = 'submit' | 'vote' | 'reveal' | 'fanfare' | 'tick' | 'urgentTick';

export function gameSoundEvents(previous: MockGameState | null, next: MockGameState): GameSound[] {
  if (!previous?.room || !next.room || previous.room.id !== next.room.id || previous.currentPlayerId !== next.currentPlayerId) return [];
  const sounds: GameSound[] = [];
  const sameRound = previous.room.currentRound === next.room.currentRound;
  if (sameRound && !previous.hasAnswered && next.hasAnswered) sounds.push('submit');
  if (sameRound && !previous.hasVoted && next.hasVoted) sounds.push('vote');
  if (next.room.state === 'reveal' && (previous.room.state !== 'reveal' || next.revealedIndex > previous.revealedIndex)) sounds.push('reveal');
  if (next.room.state === 'winner' && previous.room.state !== 'winner') sounds.push('fanfare');
  const timerChanged = !sameRound || previous.room.state !== next.room.state || previous.timeLeft !== next.timeLeft;
  if (timerChanged && (next.room.state === 'question' || next.room.state === 'voting') && next.timeLeft > 0) {
    if (next.timeLeft <= 5) sounds.push('urgentTick');
    else if (next.timeLeft % 2 === 0) sounds.push('tick');
  }
  return sounds;
}

export function useGameSounds(state: MockGameState, enabled = true): void {
  const previous = useRef<MockGameState | null>(null);
  useEffect(() => {
    const unlock = () => soundService.unlock();
    document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    document.addEventListener('click', unlock, { capture: true, passive: true });
    document.addEventListener('keydown', unlock, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
  }, []);
  useEffect(() => {
    const sounds = enabled ? gameSoundEvents(previous.current, state) : [];
    previous.current = state;
    for (const sound of sounds) {
      if (sound === 'urgentTick' || sound === 'tick') soundService.playTick(sound === 'urgentTick');
      else if (sound === 'submit') soundService.playSubmit();
      else if (sound === 'vote') soundService.playVote();
      else if (sound === 'reveal') soundService.playReveal();
      else soundService.playFanfare();
    }
  }, [state, enabled]);
}
