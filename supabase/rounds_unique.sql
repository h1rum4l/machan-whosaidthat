-- Apply once to the existing table, after resolving any existing duplicate rounds.
-- This protects two host tabs racing to save. It does not grant access or bypass RLS.
create unique index if not exists rounds_room_round_unique
  on public.rounds (room_id, round_no);
