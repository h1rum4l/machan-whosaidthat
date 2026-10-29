/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Answer, GamePrompt } from '../../types/game';
import { CheckCircle, Lock } from 'lucide-react';

interface VotingScreenProps {
  currentRound: number;
  totalRounds: number;
  prompt: GamePrompt;
  answers: Answer[];
  currentPlayerId: string;
  timeLeft: number;
  totalTime: number;
  hasVoted: boolean;
  onCastVote: (targetPlayerId: string) => void;
}

export const VotingScreen: React.FC<VotingScreenProps> = ({
  currentRound,
  totalRounds = 10,
  prompt,
  answers,
  currentPlayerId,
  timeLeft,
  totalTime = 15,
  hasVoted,
  onCastVote,
}) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const isRoundTen = currentRound === 10;
  const progressPercent = Math.max(0, Math.min(100, (timeLeft / totalTime) * 100));
  const isTimeCritical = timeLeft <= 5;

  const handleVote = (targetPlayerId: string) => {
    if (hasVoted) return;
    if (targetPlayerId === currentPlayerId) return; // Prevent self-vote
    setSelectedTargetId(targetPlayerId);
    onCastVote(targetPlayerId);
  };

  return (
    <div className="game-screen">
      <div className="timer-row">
        <div className="flex flex-col gap-2">
          <p className="round-note">Round {currentRound} · Anonymous Voting</p>
          {isRoundTen && <p className="round-note">DOUBLE POINTS!</p>}
        </div>
        <div role="timer" aria-label={`${timeLeft} seconds remaining`} className={`countdown ${isTimeCritical ? 'is-critical' : ''}`}>
          {timeLeft}<span className="text-xl ml-1">s</span>
        </div>
      </div>
      <div className={`time-track ${isTimeCritical ? 'is-critical' : ''}`} aria-hidden="true">
        <div style={{ width: `${progressPercent}%` }} />
      </div>
      <div className="flex flex-col gap-4">
        <h1 className="screen-title">Which answer is the funniest?</h1>
        <p className="body-copy font-semibold">“{prompt.promptEnglish}”</p>
      </div>
      <div className="flex flex-col gap-3">
        {answers.map((ans, idx) => {
          const isMyAnswer = ans.playerId === currentPlayerId;
          const isSelected = selectedTargetId === ans.playerId;
          return (
            <button key={ans.playerId} type="button" disabled={hasVoted || isMyAnswer}
              onClick={() => handleVote(ans.playerId)} aria-pressed={isSelected}
              className={`answer-option ${isMyAnswer ? 'is-own' : ''} ${isSelected ? 'is-selected' : ''}`}>
              <span className="flex items-start gap-4 min-w-0">
                <span className="text-sm font-bold tabular-nums pt-1" aria-hidden="true">{idx + 1}.</span>
                <span className="text-xl font-bold leading-snug break-words">“{ans.text}”</span>
              </span>
              {isMyAnswer ? (
                <span className="text-sm font-semibold flex items-center gap-2"><Lock className="w-4 h-4 shrink-0" aria-hidden="true" />Your Answer (No Self-Vote)</span>
              ) : isSelected ? (
                <span className="text-sm font-bold flex items-center gap-2"><CheckCircle className="w-5 h-5 shrink-0" aria-hidden="true" />Voted!</span>
              ) : !hasVoted ? <span className="text-sm font-bold">Vote</span> : null}
            </button>
          );
        })}
      </div>
      {hasVoted && <div role="status" className="status-message">Vote recorded! Waiting for remaining votes to reveal who said what...</div>}
    </div>
  );
};
