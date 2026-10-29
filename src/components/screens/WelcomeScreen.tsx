/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AvatarId } from '../../types/game';
import { AVATAR_OPTIONS } from '../../utils/helpers';
import { ArrowRight } from 'lucide-react';
import { Avatar } from '../Avatar';

interface WelcomeScreenProps {
  isSubmitting?: boolean;
  onHostRoom: (nickname: string, avatar: AvatarId) => void;
  onJoinRoom: (code: string, nickname: string, avatar: AvatarId) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  isSubmitting = false,
  onHostRoom,
  onJoinRoom,
}) => {
  const [tab, setTab] = useState<'join' | 'host'>('host');
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarId>('tuktuk');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    const cleanNick = nickname.trim();
    if (!cleanNick) {
      setError('Please choose a nickname, machan!');
      return;
    }

    if (tab === 'join') {
      const cleanCode = code.trim().toUpperCase();
      if (cleanCode.length !== 6) {
        setError('Room code must be exactly 6 characters!');
        return;
      }
      onJoinRoom(cleanCode, cleanNick, selectedAvatar);
    } else {
      onHostRoom(cleanNick, selectedAvatar);
    }
  };

  return (
    <div className="welcome-layout">
      <div className="welcome-intro">
        <img
          src="/assets/aistudio/Untitled_Design__15__76563b80.png"
          alt="Machan, Who Said That? Official Logo"
          className="w-24 h-24 border-[3px] border-ink object-cover sm:w-36 sm:h-36"
          referrerPolicy="no-referrer"
        />
        <h1 className="screen-title">
          Machan,<br />Who Said That?
        </h1>
        <p className="body-copy max-w-md">
          Join with 3–10 friends using a 6-character room code. Answer witty Singlish prompts, vote anonymously, and uncover who wrote what!
        </p>
        <p className="text-sm font-semibold">Official Sri Lankan Party Comedy Game</p>
      </div>

      <div className="paper-panel welcome-form">
        <div className="grid grid-cols-2 gap-2 mb-6" role="group" aria-label="Host or join a room">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => { setTab('host'); setError(null); }}
            aria-pressed={tab === 'host'}
            className={`btn ${tab === 'host' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Host a New Room
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => { setTab('join'); setError(null); }}
            aria-pressed={tab === 'join'}
            className={`btn ${tab === 'join' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Join Existing Room
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {tab === 'join' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="room-code-input" className="field-label">
                6-Character Room Code
              </label>
              <input
                id="room-code-input"
                type="text"
                maxLength={6}
                placeholder="e.g. 7K2M9X"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="field text-center text-2xl tracking-[0.15em] uppercase"
                autoComplete="off"
                aria-describedby={error ? 'entry-error' : undefined}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="nickname-input" className="field-label">
              Your Nickname
            </label>
            <input
              id="nickname-input"
              type="text"
              maxLength={20}
              placeholder="e.g. Kasun, Shenali, Ado Podi"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="field"
              aria-describedby={error ? 'entry-error' : undefined}
            />
          </div>

          <fieldset className="min-w-0">
            <legend className="field-label mb-2">
              Pick Your Sri Lankan Avatar
            </legend>
            <div className="grid grid-cols-4 gap-2">
              {AVATAR_OPTIONS.map((av) => {
                const isSelected = selectedAvatar === av.id;
                return (
                  <button
                    key={av.id}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setSelectedAvatar(av.id)}
                    aria-label={av.name}
                    aria-pressed={isSelected}
                    className={`avatar-choice ${isSelected ? 'is-selected' : ''}`}
                  >
                    <Avatar id={av.id} className="w-12 h-12" />
                    <span className="text-xs font-semibold max-w-full">
                      {av.name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {error && (
            <div id="entry-error" className="error-message" role="alert">
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary w-full"
          >
            <span>{isSubmitting ? 'Creating game room…' : tab === 'host' ? 'Create Game Room' : 'Enter Room'}</span>
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </form>

        <div className="mt-5">
          <p className="text-xs leading-relaxed text-muted">
            No Wi-Fi sharing or GPS disclosure required · English & Singlish only
          </p>
        </div>
      </div>
    </div>
  );
};
