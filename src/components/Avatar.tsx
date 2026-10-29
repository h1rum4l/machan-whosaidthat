import { AvatarId } from '../types/game';
import { getAvatar } from '../utils/helpers';

// Shared ink and three flat fills keep the eight characters one family.
export function Avatar({ id, className = '' }: { id: AvatarId; className?: string }) {
  const art = {
    tuktuk: <><path fill="var(--color-brand)" d="M13 44V30l8-15h26l8 15v21H13Z" /><path fill="var(--color-paper)" d="m23 21-5 14h17V21Zm17 0v14h10l-6-14Z" /><path d="M35 36v15M17 41h6m21 0h5" /><circle cx="22" cy="51" r="7" fill="var(--color-paper)" /><circle cx="48" cy="51" r="7" fill="var(--color-paper)" /><path d="M21 13h26" /><circle cx="22" cy="51" r="1" /><circle cx="48" cy="51" r="1" /></>,
    lion: <><path fill="var(--color-brand)" d="m32 5 8 7 10-1 2 11 7 8-6 9-1 12-13 1-8 7-9-7-12-2 1-12-6-9 8-8 1-11 11 2Z" /><path fill="var(--color-paper)" d="M18 27q0-13 14-13t14 13v12q0 13-14 13T18 39Z" /><path d="m22 28 5-2m10 0 5 2m-10 8v6m-7-1q7 9 14 0" /><path fill="var(--color-accent)" d="m28 34 4 4 4-4Z" /><circle cx="25" cy="31" r="1" /><circle cx="39" cy="31" r="1" /></>,
    kottu: <><path fill="var(--color-brand)" d="M9 34h46l-5 19H14Z" /><path d="M9 38H4m51 0h5" /><path fill="var(--color-paper)" d="m12 33 4-10 8 3 7-9 9 8 8-2 5 10Z" /><path d="m17 29 5 2m6-6 4 6m7-1 6-3M19 7l7 14m20-13-6 14" /><path fill="var(--color-accent)" d="m24 35 6-2 5 3-4 3Z" /><path d="M25 44h.1m14 0h.1m-12 4q5 4 10 0" /></>,
    coconut: <><path fill="var(--color-accent)" d="M19 23q13-12 26 0l7 17q4 17-20 18T12 40Z" /><path fill="var(--color-paper)" d="m20 22 5-8h15l5 8-12 7Z" /><path d="m33 24 4-17 10-3M25 36h.1m15 0h.1m-13 7q6 6 11-1M18 35l-2 10" /></>,
    teacup: <><path fill="var(--color-paper)" d="M12 26h34v17q0 13-17 13T12 43Z" /><path d="M47 29h3q13 0 9 12-2 6-13 5M8 57h43" /><path fill="var(--color-brand)" d="M13 32h32v7H13Z" /><path d="M23 8q-5 4 0 8t0 7m11-16q-5 4 0 8t0 7M24 44h.1m12 0h.1m-11 5q5 4 9 0" /></>,
    cricket: <><path fill="var(--color-paper)" d="m35 8 6 3-9 20-6-3Z" /><path fill="var(--color-brand)" d="m26 25 12 6-13 25q-1 3-5 1l-10-5q-3-1-1-5Z" /><path d="m25 31 8 4m-11 1 8 4m-10 1 7 4" /><circle fill="var(--color-accent)" cx="48" cy="48" r="10" /><path d="m45 40 4 16" /></>,
    peacock: <><path fill="var(--color-brand)" d="M28 42Q1 46 7 26q-1-17 12-12Q29-2 37 12q17-6 20 9 11 21-17 25Z" /><path d="m17 22 12 17m4-21v19m14-14L36 39" /><circle cx="16" cy="20" r="3" fill="var(--color-paper)" /><circle cx="32" cy="14" r="3" fill="var(--color-paper)" /><circle cx="48" cy="21" r="3" fill="var(--color-paper)" /><path fill="var(--color-paper)" d="M23 44q0-10 10-10 2-14 10-10 7 4 0 11l-4 5q8 15-5 16-12 0-11-12Z" /><path fill="var(--color-accent)" d="m47 28 8 3-9 3" /><circle cx="41" cy="28" r="1" /><path d="M29 56v5m7-5v5" /></>,
    mask: <><path fill="var(--color-brand)" d="m13 21-6-9 15 3L32 5l10 10 15-3-6 12v20L32 59 13 44Z" /><path fill="var(--color-paper)" d="m16 27 13 1-4 10-9-4Zm32 0-13 1 4 10 9-4Z" /><path fill="var(--color-accent)" d="m21 45 11-5 11 5-11 7Z" /><path d="M24 45h16m-8-17-3 9h6M21 31h.1m22 0h.1M15 18l5 3m29-3-5 3" /></>,
  } satisfies Record<AvatarId, React.ReactNode>;

  return <svg viewBox="0 0 64 64" role="img" aria-label={getAvatar(id).name} className={`game-avatar ${className}`} fill="none" stroke="var(--color-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{art[id]}</svg>;
}
