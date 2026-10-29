/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Player } from '../../types/game';
import { ArrowRight } from 'lucide-react';
import { Avatar } from '../Avatar';

interface ScoreboardScreenProps {
  currentRound: number;
  totalRounds: number;
  players: Player[];
  currentPlayerId: string;
  isHost: boolean;
  onAdvance: () => void;
}

export const ScoreboardScreen: React.FC<ScoreboardScreenProps> = ({
  currentRound,
  totalRounds = 10,
  players,
  currentPlayerId,
  isHost,
  onAdvance,
}) => {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const isFinalRound = currentRound >= totalRounds;

  return (
    <section className="game-screen" aria-labelledby="scoreboard-title">
      <header className="flex flex-col gap-3">
        <h1 id="scoreboard-title" className="screen-title">Party Leaderboard</h1>
        <p className="round-note">
          {isFinalRound ? 'Final Standings' : `Scoreboard · Round ${currentRound} of ${totalRounds}`}
        </p>
        <p className="body-copy">
          {isFinalRound
            ? '10 rounds completed! Let us crown the party champion.'
            : `${totalRounds - currentRound} rounds remaining until the double-point finale!`}
        </p>
      </header>

      <ol className="flex flex-col gap-1" aria-label="Party standings">
        {sortedPlayers.map((player, index) => {
          const isMe = player.id === currentPlayerId;
          const isFirst = index === 0;

          return (
            <li key={player.id} className={`roster-row ${isFirst ? 'bg-paper border-2 border-ink py-5' : ''}`}>
              <span className="w-6 shrink-0 text-center font-bold tabular-nums" aria-label={`Rank ${index + 1}`}>
                {index + 1}
              </span>
              <Avatar id={player.avatar} className={`${isFirst ? 'h-16 w-16' : 'h-12 w-12'} shrink-0`} />
              <div className="min-w-0 flex-1">
                <p className={`break-words font-bold ${isFirst ? 'text-xl' : 'text-base'}`}>
                  {player.nickname} {isMe && <span className="text-sm font-normal">(You)</span>}
                </p>
                <p className="text-sm text-muted">{player.isHost ? 'Room Host' : 'Player'}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className={`score-number ${isFirst ? 'text-5xl' : 'text-3xl'}`}>{player.score}</span>
                <span className="block text-sm text-muted">pts</span>
              </div>
            </li>
          );
        })}
      </ol>

      {isHost ? (
        <button onClick={onAdvance} className="btn btn-primary w-full">
          <span>{isFinalRound ? 'Crown Champion & Results' : `Start Round ${currentRound + 1}`}</span>
          <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
        </button>
      ) : (
        <p className="status-message" role="status">Waiting for host to proceed to next round...</p>
      )}
    </section>
  );
};
