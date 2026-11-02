import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = process.argv[2] || resolve(root, '.taste-skill/pg-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(resolve(runtime)).href);
const database = new PGlite();
try {
  for (const path of [
    'supabase/tests/shared_game_fixture.sql',
    'supabase/migrations/202611030001_shared_game.sql',
    'supabase/tests/shared_game.sql',
  ]) {
    await database.exec(await readFile(resolve(root, path), 'utf8'));
    console.log(`PASS ${path}`);
  }
  const { rows } = await database.query('select count(*)::integer as rooms from public.rooms');
  if (rows[0].rooms !== 0) throw new Error('The lifecycle test did not roll back its room records');
  console.log('PASS test transaction left no room records');
} catch (error) {
  console.error({ message: error.message, code: error.code, detail: error.detail, where: error.where, hint: error.hint });
  process.exitCode = 1;
} finally { await database.close(); }
