/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Player } from '../../types/game';
import confetti from 'canvas-confetti';
import { RotateCcw, Home } from 'lucide-react';
import { Avatar } from '../Avatar';

interface WinnerScreenProps {
  players: Player[];
  currentPlayerId: string;
  isHost: boolean;
  onRematch: () => void;
  onLeaveRoom: () => void;
}

export const WinnerScreen: React.FC<WinnerScreenProps> = ({
  players,
  currentPlayerId,
  isHost,
  onRematch,
  onLeaveRoom,
}) => {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const runnerUp = sorted[1];
  const thirdPlace = sorted[2];

  useEffect(() => {
    const colors = ['#31C7D5', '#D32E48', '#FFFDF7'];
    try {
      confetti({
        particleCount: 90,
        spread: 80,
        origin: { y: 0.6 },
        colors,
        disableForReducedMotion: true,
      });
      const timer = setTimeout(() => {
        confetti({
          particleCount: 60,
          angle: 60,
          spread: 60,
          origin: { x: 0 },
          colors,
          disableForReducedMotion: true,
        });
        confetti({
          particleCount: 60,
          angle: 120,
          spread: 60,
          origin: { x: 1 },
          colors,
          disableForReducedMotion: true,
        });
      }, 500);
      return () => {
        clearTimeout(timer);
        confetti.reset();
      };
    } catch {
      // Celebration must never prevent the results from rendering.
    }
  }, []);

  return (
    <section className="game-screen" aria-labelledby="winner-title">
      <header className="flex flex-col gap-3">
        <h1 id="winner-title" className="screen-title">Ado Champion, Machan!</h1>
        <p className="round-note">Game Over · 10 Rounds Complete</p>
        <p className="body-copy">The votes have been tallied and the comedy crown has been claimed!</p>
      </header>

      {winner && (
        <div className="winner-hero">
          <Avatar id={winner.avatar} className="h-36 w-36 mx-auto" />
          <p className="font-semibold mt-3">Party Champion & Baila King</p>
          <h2 className="winner-name break-words">{winner.nickname}</h2>
          {winner.id === currentPlayerId && <p className="font-bold">(You!)</p>}
          <p className="mt-3 text-lg font-semibold">
            <span className="score-number text-5xl">{winner.score}</span> Total Points
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {runnerUp && (
          <div className="podium-row">
            <span className="text-sm shrink-0">2nd Place</span>
            <Avatar id={runnerUp.avatar} className="h-12 w-12 shrink-0" />
            <span className="min-w-0 flex-1 break-words font-bold">{runnerUp.nickname}</span>
            <span className="shrink-0 font-bold tabular-nums">{runnerUp.score} pts</span>
          </div>
        )}
        {thirdPlace && (
          <div className="podium-row">
            <span className="text-sm shrink-0">3rd Place</span>
            <Avatar id={thirdPlace.avatar} className="h-12 w-12 shrink-0" />
            <span className="min-w-0 flex-1 break-words font-bold">{thirdPlace.nickname}</span>
            <span className="shrink-0 font-bold tabular-nums">{thirdPlace.score} pts</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {isHost ? (
          <button onClick={onRematch} className="btn btn-accent w-full">
            <RotateCcw className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>Rematch (Reset Scores & Play Again)</span>
          </button>
        ) : (
          <p className="status-message" role="status">Waiting for room host to initiate rematch...</p>
        )}
        <button onClick={onLeaveRoom} className="btn btn-secondary w-full">
          <Home className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>Leave Room & Return Home</span>
        </button>
      </div>
    </section>
  );
};
