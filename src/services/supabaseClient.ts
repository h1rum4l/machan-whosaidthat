/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read configuration from environment or browser storage
export function getSavedSupabaseConfig(): { url: string; anonKey: string } {
  const envUrl = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SUPABASE_PUBLISHABLE_KEY
    || (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY || '';

  const localUrl = localStorage.getItem('machan_supabase_url') || '';
  const localKey = localStorage.getItem('machan_supabase_key') || '';

  return {
    url: localUrl || envUrl,
    anonKey: localKey || envKey,
  };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  localStorage.setItem('machan_supabase_url', url.trim());
  localStorage.setItem('machan_supabase_key', anonKey.trim());
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem('machan_supabase_url');
  localStorage.removeItem('machan_supabase_key');
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSavedSupabaseConfig();
  return Boolean(
    url &&
    url.startsWith('https://') &&
    anonKey &&
    anonKey.length > 20
  );
}

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedAnonKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSavedSupabaseConfig();
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!cachedClient || cachedUrl !== url || cachedAnonKey !== anonKey) {
    try {
      cachedClient = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });
      cachedUrl = url;
      cachedAnonKey = anonKey;
    } catch (e) {
      console.warn('Failed to initialize Supabase client:', e);
      return null;
    }
  }
  return cachedClient;
}

/**
 * Anonymous Supabase Authentication helper for each browser.
 * Only invoked when user has supplied live Supabase keys.
 */
export async function getOrSignInAnonymousUser(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      return session.user.id;
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('Anonymous sign-in error:', error);
      return null;
    }
    return data.user?.id || null;
  } catch (err) {
    console.error('Failed anonymous auth:', err);
    return null;
  }
}
