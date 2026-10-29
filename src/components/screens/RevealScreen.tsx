/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RoundResultItem } from '../../types/game';
import { ArrowRight } from 'lucide-react';
import { Avatar } from '../Avatar';

interface RevealScreenProps {
  currentRound: number;
  totalRounds: number;
  roundResults: RoundResultItem[];
  revealedIndex: number;
  isHost: boolean;
  onRevealNext: () => void;
  onRevealAll: () => void;
  onGoToScoreboard: () => void;
}

export const RevealScreen: React.FC<RevealScreenProps> = ({
  currentRound,
  totalRounds = 10,
  roundResults,
  revealedIndex,
  isHost,
  onRevealNext,
  onRevealAll,
  onGoToScoreboard,
}) => {
  const isRoundTen = currentRound === 10;
  const isAllRevealed = revealedIndex >= roundResults.length - 1;

  return (
    <section className="game-screen" aria-labelledby="reveal-title">
      <header className="flex flex-col gap-3">
        <h1 id="reveal-title" className="font-display text-4xl leading-none">Machan, Who Said That?</h1>
        <p className="round-note">The Big Reveal · Round {currentRound} of {totalRounds}</p>
        {isRoundTen && (
          <p className="font-bold text-danger">
            DOUBLE POINTS: Each vote earns 2 points this round!
          </p>
        )}
      </header>

      <div className="flex flex-col gap-3" aria-live="polite" aria-relevant="additions text">
        {roundResults.map((item, idx) => {
          const isRevealed = idx <= revealedIndex;

          if (!isRevealed) {
            return (
              <div key={item.playerId} className="reveal-hidden flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 flex-1 break-words font-semibold">“{item.answerText}”</p>
                <span className="text-sm text-muted">Hidden Author</span>
              </div>
            );
          }

          return (
            <article
              key={item.playerId}
              className={`reveal-card ${idx === revealedIndex ? 'reveal-current' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <p className={`min-w-0 break-words font-bold leading-tight ${idx === revealedIndex ? 'text-[34px] sm:text-5xl' : 'text-xl'}`}>
                  “{item.answerText}”
                </p>
                <span className="shrink-0 text-danger font-bold tabular-nums">
                  +{item.pointsEarned} {item.pointsEarned === 1 ? 'pt' : 'pts'}
                </span>
              </div>
              <div className="reveal-attribution flex flex-col gap-4 mt-5">
                <div className="flex items-center gap-3">
                  <Avatar id={item.avatar} className="h-14 w-14 shrink-0" />
                  <div className="min-w-0">
                    <span className="block text-sm text-muted">Said by</span>
                    <h2 className="text-xl font-bold break-words">{item.authorNickname}</h2>
                  </div>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                  <span className="text-muted">Voted by:</span>
                  {item.votesReceived.length > 0 ? (
                    item.votesReceived.map(voter => (
                      <span key={voter.id} className="font-semibold break-words">{voter.nickname}</span>
                    ))
                  ) : (
                    <span className="text-muted">No votes this time!</span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {isHost ? (
        <div className="flex flex-col sm:flex-row gap-3">
          {!isAllRevealed ? (
            <>
              <button onClick={onRevealNext} className="btn btn-accent flex-1">
                Reveal Next Machan ({revealedIndex + 2}/{roundResults.length})
              </button>
              <button onClick={onRevealAll} className="btn btn-secondary">Reveal All</button>
            </>
          ) : (
            <button onClick={onGoToScoreboard} className="btn btn-primary w-full">
              View Leaderboard <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <p className="status-message" role="status">Host is advancing the reveal cards...</p>
      )}
    </section>
  );
};
