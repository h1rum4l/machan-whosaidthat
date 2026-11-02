# Shared-game SQL checks

Use an empty, disposable PostgreSQL 15+ database. These scripts do not belong in a deployed Edge Function or browser bundle.

Run, in order:

1. `shared_game_fixture.sql` — installs only a minimal local starter/Auth fixture. It refuses an existing starter or Supabase Auth schema.
2. `../migrations/202611030001_shared_game.sql` — the actual additive multiplayer migration.
3. `../migrations/202611030002_answer_time_30_seconds.sql` — extends answering to 30 seconds, retaining 15-second voting.
4. `../migrations/202611030003_answer_limit_10_words.sql` — permits up to 10 words while retaining the 120-character cap.
5. `shared_game.sql` — lifecycle/security assertions, wrapped in a transaction that rolls all test data back.

If PGlite is already available locally, `node supabase/tests/run-shared-game.mjs /absolute/path/to/pglite/dist/index.js` runs those files in an isolated in-memory database and checks the rollback. The optional argument defaults to the ignored local QA runtime at `.taste-skill/pg-runtime/node_modules/@electric-sql/pglite/dist/index.js`. No runtime package is included in the application dependencies.

The assertions cover real host/member identity, exact room-code lookup including leading zeroes, unauthenticated/outsider denial, actual `anon`/`authenticated` role execution, private table/helper privileges, RLS, duplicate joins, 3–10-player bounds, saved-question validation, anonymous voting targets, self/cross-room/duplicate vote rejection, rejection of delayed or unbound answer/vote actions, server deadlines without fabricated activity, all ten rounds, exactly-once scoring, double final points, rematch reuse, leaving and host closure.

The local fixture does not prove compatibility with custom triggers or policies in a separately deployed starter schema. The migration requires the documented `create_room(text,text)` result plus the existing `rooms`/`rounds` columns. Real browser sessions and hosted Supabase authentication need separate end-to-end verification.
