import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

for (const scenario of [
  { name: 'publishable key', publishable: 'sb_publishable_test_only', legacy: '', expected: 'sb_publishable_test_only' },
  { name: 'legacy anon key', publishable: '', legacy: 'legacy-anon-test-only', expected: 'legacy-anon-test-only' },
  { name: 'publishable key takes precedence', publishable: 'new-public-test-key', legacy: 'old-public-test-key', expected: 'new-public-test-key' },
]) {
  test(`Vite environment configuration supports ${scenario.name}`, async () => {
    const names = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY'] as const;
    const previous = names.map(name => process.env[name]);
    const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    process.env.VITE_SUPABASE_URL = 'https://config-check.invalid';
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = scenario.publishable;
    process.env.VITE_SUPABASE_ANON_KEY = scenario.legacy;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
    const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null } });
    try {
      const module = await server.ssrLoadModule('/src/services/supabaseClient.ts');
      assert.deepEqual(module.getSavedSupabaseConfig(), {
        url: 'https://config-check.invalid', anonKey: scenario.expected,
      });
    } finally {
      await server.close();
      names.forEach((name, index) => {
        if (previous[index] === undefined) delete process.env[name];
        else process.env[name] = previous[index];
      });
      if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
}
