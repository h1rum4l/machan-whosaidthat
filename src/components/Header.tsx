/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, Database } from 'lucide-react';
import { soundService } from '../utils/sound';

interface HeaderProps {
  roomCode?: string;
  round?: number;
  totalRounds?: number;
  playerCount?: number;
  onOpenSupabaseConfig: () => void;
  onLeaveRoom?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  roomCode,
  round,
  totalRounds = 10,
  playerCount,
  onOpenSupabaseConfig,
  onLeaveRoom,
}) => {
  const [isMuted, setIsMuted] = useState(soundService.getMuted());

  const handleToggleSound = () => {
    const next = soundService.toggleMute();
    setIsMuted(next);
  };

  return (
    <header className="site-header">
      <div className="header-inner">
          <button
            onClick={onLeaveRoom}
            className="flex items-center gap-3 text-left shrink-0 min-h-[44px]"
            title="Return to Welcome"
            aria-label="Return to Welcome"
          >
              <img
                src="/assets/brand/machan-logo.webp"
                width={44}
                height={44}
                fetchPriority="high"
                alt="Machan, Who Said That? Official Logo"
                className="w-11 h-11 object-cover border-2 border-ink"
                referrerPolicy="no-referrer"
              />
              <span className="hidden lg:block text-2xl font-display">
                Machan, Who Said That?
              </span>
          </button>

        <div className="min-w-0 flex-1 flex flex-col gap-0.5 text-xs font-medium sm:text-sm sm:items-center">
          {roomCode ? (
            <>
              <span className="font-bold tracking-wide">ROOM: {roomCode}</span>
              <span>Round {round} of {totalRounds}</span>
              {playerCount !== undefined && (
                <span className="hidden sm:inline">{playerCount} Players</span>
              )}
            </>
          ) : (
            <>
              <span className="hidden sm:inline">Sri Lankan In-Person Party Comedy</span>
              <span>3–10 Players</span>
              <span>Singlish & English</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleToggleSound}
            aria-label={isMuted ? 'Unmute sounds' : 'Mute sounds'}
            className="icon-button"
            title={isMuted ? 'Unmute audio' : 'Mute audio'}
          >
            {isMuted ? <VolumeX className="w-5 h-5" aria-hidden="true" /> : <Volume2 className="w-5 h-5" aria-hidden="true" />}
          </button>

          {import.meta.env.DEV && <button
            onClick={onOpenSupabaseConfig}
            className="icon-button lg:w-auto lg:px-3 lg:gap-2"
            title="Supabase connection status and contract"
            aria-label="Supabase connection status and contract"
          >
            <Database className="w-5 h-5" aria-hidden="true" />
            <span className="hidden lg:inline text-sm font-semibold">Supabase</span>
          </button>}
        </div>
      </div>
    </header>
  );
};
