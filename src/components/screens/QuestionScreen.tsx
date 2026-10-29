/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GamePrompt } from '../../types/game';
import { validateAnswer } from '../../utils/helpers';
import { Send, CheckCircle2 } from 'lucide-react';

interface QuestionScreenProps {
  currentRound: number;
  totalRounds: number;
  prompt: GamePrompt;
  timeLeft: number;
  totalTime: number;
  hasAnswered: boolean;
  onSubmitAnswer: (text: string) => void;
}

export const QuestionScreen: React.FC<QuestionScreenProps> = ({
  currentRound,
  totalRounds = 10,
  prompt,
  timeLeft,
  totalTime = 20,
  hasAnswered,
  onSubmitAnswer,
}) => {
  const [answer, setAnswer] = useState('');
  const validation = validateAnswer(answer);
  const isRoundTen = currentRound === 10;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validation.isValid && !hasAnswered) {
      onSubmitAnswer(answer);
    }
  };

  const progressPercent = Math.max(0, Math.min(100, (timeLeft / totalTime) * 100));
  const isTimeCritical = timeLeft <= 5;

  return (
    <div className="game-screen">
      <div className="timer-row">
        <div className="flex flex-col gap-2">
          <p className="round-note">Round {currentRound} of {totalRounds}</p>
          {isRoundTen && <p className="round-note">DOUBLE POINTS!</p>}
        </div>
        <div role="timer" aria-label={`${timeLeft} seconds remaining`} className={`countdown ${isTimeCritical ? 'is-critical' : ''}`}>
          {timeLeft}<span className="text-xl ml-1">s</span>
        </div>
      </div>
      <div className={`time-track ${isTimeCritical ? 'is-critical' : ''}`} aria-hidden="true">
        <div style={{ width: `${progressPercent}%` }} />
      </div>
      <section className="paper-panel flex flex-col gap-5" aria-labelledby="question-prompt">
        <p className="field-label">The Prompt</p>
        <h1 id="question-prompt" className="prompt-text">“{prompt.promptEnglish}”</h1>
        {prompt.promptSinglish && <p className="body-copy text-muted">Singlish vibe: “{prompt.promptSinglish}”</p>}
      </section>
      {hasAnswered ? (
        <div role="status" className="status-message flex flex-col gap-3">
          <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
          <h3 className="font-display text-4xl">Answer Locked In, Machan!</h3>
          <p className="body-copy">Waiting for remaining players to submit before anonymous voting starts...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label htmlFor="answer-input" className="field-label">Your Funny Answer</label>
          <textarea id="answer-input" rows={3} maxLength={130}
            placeholder="Keep it witty in English or Singlish! Max 6 words..."
            value={answer} onChange={(e) => setAnswer(e.target.value)}
            className="field resize-y" aria-describedby="answer-limits answer-error"
            aria-invalid={answer.length > 0 && !validation.isValid} autoFocus />
          <div id="answer-limits" className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold tabular-nums">
            <span className={validation.wordCount > 6 ? 'text-danger' : ''}>{validation.wordCount}/6 words</span>
            <span>{validation.charCount}/120 chars</span>
          </div>
          <div id="answer-error" aria-live="polite">
            {validation.error && answer.length > 0 && <p className="error-message">{validation.error}</p>}
          </div>
          <button type="submit" disabled={!validation.isValid} className="btn btn-primary w-full">
            <Send className="w-4 h-4" aria-hidden="true" />Lock In Answer
          </button>
        </form>
      )}
    </div>
  );
};
