/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Player } from '../../types/game';
import { Copy, Check, ArrowRight } from 'lucide-react';
import { Avatar } from '../Avatar';
import { RoomQuestions } from '../RoomQuestions';
import type { RoundQuestion } from '../../services/roomQuestions';

interface LobbyScreenProps {
  roomCode: string;
  roomId?: string;
  onQuestionsSaved?: (records: RoundQuestion[]) => void;
  players: Player[];
  currentPlayerId: string;
  isHost: boolean;
  onStartGame: () => void;
  onAddMockPlayer: () => void;
  onRemovePlayer: (id: string) => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  roomCode,
  roomId,
  onQuestionsSaved,
  players,
  currentPlayerId,
  isHost,
  onStartGame,
  onAddMockPlayer,
  onRemovePlayer,
}) => {
  const [copied, setCopied] = useState(false);
  const [questionsReady, setQuestionsReady] = useState(!roomId || roomId.startsWith('room-'));

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasEnoughPlayers = players.length >= 3;
  const isFull = players.length >= 10;

  return (
    <div className="game-screen">
      <section className="paper-panel text-center flex flex-col items-center gap-4" aria-label="Room invitation">
        <h1 className="text-2xl font-bold">Share With Friends (3–10 Players)</h1>
        <p className="body-copy">Tell your machans to join using this 6-character code:</p>
        <div className="flex flex-wrap items-center justify-center gap-3 w-full">
          <span className="room-code select-all">
            {roomCode}
          </span>
          <button
            onClick={handleCopyCode}
            aria-label="Copy room code"
            className="btn btn-secondary min-w-[44px]"
            title="Copy room code"
          >
            {copied ? <Check className="w-5 h-5" aria-hidden="true" /> : <Copy className="w-5 h-5" aria-hidden="true" />}
          </button>
        </div>

        {copied && (
          <p className="text-sm font-semibold" role="status">
            Room code copied to clipboard!
          </p>
        )}
      </section>

      {isHost && roomId && <RoomQuestions key={roomId} roomId={roomId} onSaved={(records) => {
        onQuestionsSaved?.(records);
        setQuestionsReady(true);
      }} />}

      <section className="flex flex-col gap-4" aria-label="Connected players">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">
              Party Lobby ({players.length}/10)
            </h2>

          {import.meta.env.DEV && !isFull && (
            <button
              onClick={onAddMockPlayer}
              className="btn btn-secondary text-sm"
              title="Add a mock friend to test game dynamics"
            >
              <span>+ Add Mock Machan</span>
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {players.map((p) => {
            const isMe = p.id === currentPlayerId;

            return (
              <div
                key={p.id}
                className={`roster-row ${isMe ? 'is-me' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar id={p.avatar} className="w-14 h-14 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{p.nickname}</span>
                      {isMe && <span className="text-sm font-normal shrink-0">(You)</span>}
                    </span>
                    <span className="text-sm text-muted font-medium">
                      {p.isHost ? (
                        <span>Host</span>
                      ) : p.isBot ? (
                        <span>Bot Friend</span>
                      ) : (
                        <span>Ready</span>
                      )}
                    </span>
                  </div>
                </div>

                {import.meta.env.DEV && isHost && p.isBot && players.length > 3 && (
                  <button
                    onClick={() => onRemovePlayer(p.id)}
                    className="btn btn-secondary min-w-[44px] shrink-0"
                    title="Remove bot"
                    aria-label={`Remove bot ${p.nickname}`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!hasEnoughPlayers && (
          <div className="status-message" role="status">
            <span>Need at least 3 players to start! Invite your machans using the room code.</span>
          </div>
        )}

        <div className="pt-2">
          {isHost && !questionsReady && <p className="status-message">Save 10 questions before starting.</p>}
          {isHost ? (
            <button
              onClick={onStartGame}
              disabled={!hasEnoughPlayers || !questionsReady}
              className="btn btn-primary w-full"
            >
              <span>Start 10-Round Game</span>
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </button>
          ) : (
            <div className="status-message text-center" role="status">
              <span>Waiting for host to start the game...</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
