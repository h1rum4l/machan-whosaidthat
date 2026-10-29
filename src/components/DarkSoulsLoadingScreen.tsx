/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { WaterLogo } from '../shaders/elements/WaterLogo';

interface DarkSoulsLoadingScreenProps {
  isActive: boolean;
  title?: string;
  durationMs?: number;
  onFinished?: () => void;
}

export const DarkSoulsLoadingScreen: React.FC<DarkSoulsLoadingScreenProps> = ({
  isActive,
  title = 'Fun ekata ready da?',
  durationMs = 1800,
  onFinished,
}) => {
  const [percent, setPercent] = useState(0);

  const [isRendered, setIsRendered] = useState(isActive);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setIsFadingOut(true);
      const timer = setTimeout(() => {
        setIsRendered(false);
        setIsFadingOut(false);
      }, 900);
      return () => clearTimeout(timer);
    }

    setIsRendered(true);
    setIsFadingOut(false);
    setPercent(0);


    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, Math.floor((elapsed / durationMs) * 100));
      setPercent(progress);


      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setIsFadingOut(true);
          setTimeout(() => {
            setIsRendered(false);
            setIsFadingOut(false);
            if (onFinished) onFinished();
          }, 800);
        }, 150);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [isActive, durationMs, onFinished]);

  if (!isRendered) return null;

  return (
    <div role="progressbar" aria-label="Loading game room" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
      className={`print-loader select-none ${isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
      <div className="flex flex-col items-center w-[min(440px,90vw)]">
        <WaterLogo />
        <div className="water-loader-copy">
          <h1>{title}</h1>
          <div className="water-loader-progress" aria-hidden="true">
            <div className="h-full bg-brand origin-left transition-transform duration-100" style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
          <span className="font-bold tabular-nums text-sm">{percent}%</span>
        </div>
      </div>
    </div>
  );
};
