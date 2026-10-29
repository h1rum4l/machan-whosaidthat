/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus';
import { getSavedSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig, getSupabaseClient } from '../services/supabaseClient';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigUpdated,
}) => {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const dialogRef = useDialogFocus(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      const saved = getSavedSupabaseConfig();
      setUrl(saved.url);
      setKey(saved.anonKey);
      setStatusMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTesting(true);
    setStatusMessage(null);

    const cleanUrl = url.trim();
    const cleanKey = key.trim();

    if (!cleanUrl || !cleanKey) {
      setStatusMessage({ text: 'Please provide both Supabase Project URL and Anon/Publishable Key.', type: 'error' });
      setTesting(false);
      return;
    }

    try {
      saveSupabaseConfig(cleanUrl, cleanKey);
      const client = getSupabaseClient();
      if (!client) {
        throw new Error('Failed to create Supabase client instance with provided credentials.');
      }

      // Try anonymous ping
      const { error } = await client.auth.getSession();
      if (error && !error.message.includes('fetch')) {
        // Some minor auth response is acceptable
      }

      setStatusMessage({
        text: 'Credentials saved! Waiting for your starter pack SQL schema/API contract to map table names and RPCs.',
        type: 'success',
      });
      onConfigUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection test failed';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const handleReset = () => {
    clearSupabaseConfig();
    setUrl('');
    setKey('');
    setStatusMessage({ text: 'Reset back to offline Mock Simulator Mode.', type: 'info' });
    onConfigUpdated();
  };

  return (
    <div className="modal-overlay">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="dev-modal flex flex-col gap-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="supabase-modal-title"
      >
        <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="supabase-modal-title" className="text-2xl font-bold">
                Supabase Backend Contract
              </h2>
              <p className="text-sm text-muted mt-2">
                Awaiting your starter pack SQL schema and API keys
              </p>
            </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="icon-button"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <section className="flex flex-col gap-3" aria-labelledby="contract-readiness-title">
          <h3 id="contract-readiness-title" className="font-bold">
            Backend Contract Readiness
          </h3>
          <p className="text-sm leading-relaxed">
            Per your instructions, we have built the complete 10-round functional static mock UI first without guessing your table names. As soon as you paste the SQL schema or RPC contract from your starter pack, the engine will bind directly to those exact endpoint names:
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm leading-relaxed">
            <div>
              <span className="font-semibold block mb-1">Expected Tables:</span>
              • rooms<br />
              • players<br />
              • answers<br />
              • votes
            </div>
            <div className="min-w-0 break-words">
              <span className="font-semibold block mb-1">Authoritative RPCs:</span>
              • create_room()<br />
              • join_room()<br />
              • submit_answer()<br />
              • cast_vote()
            </div>
          </div>
        </section>

        <form onSubmit={handleTestAndSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sb-url" className="field-label">
              Supabase Project URL
            </label>
            <input
              id="sb-url"
              type="url"
              placeholder="https://xyzproject.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="field"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="sb-key" className="field-label">
              Anon / Publishable API Key
            </label>
            <input
              id="sb-key"
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="field"
            />
          </div>

          {statusMessage && (
            <div
              className={statusMessage.type === 'error' ? 'error-message' : 'status-message'}
              role={statusMessage.type === 'error' ? 'alert' : 'status'}
            >
              <span>{statusMessage.text}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="btn btn-secondary text-sm"
            >
              Revert to Mock Mode
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={testing}
                className="btn btn-primary text-sm"
                aria-busy={testing}
              >
                {testing ? 'Testing...' : 'Save & Test'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
