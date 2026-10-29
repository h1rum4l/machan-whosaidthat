/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface MockDataBannerProps {
  onOpenSupabaseConfig: () => void;
  isConfigured: boolean;
  networkStatus?: 'online' | 'syncing' | 'mock';
}

export const MockDataBanner: React.FC<MockDataBannerProps> = ({
  onOpenSupabaseConfig,
  isConfigured,
  networkStatus = 'mock',
}) => {
  return (
    <aside aria-label="Game engine mode" className="dev-banner">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-bold">
            {isConfigured ? 'Supabase Connected' : 'Mock Simulator Mode'}
          </p>

          <p className="text-muted">
            <span className="hidden md:inline">
              {isConfigured
                ? 'Authoritative Postgres backend active.'
                : 'Fully interactive local party simulator with Sri Lankan Singlish prompts & buddy bots.'}
            </span>
            <span className="md:hidden">
              {isConfigured ? 'Realtime Postgres' : 'Mock Party Engine'}
            </span>
          </p>
        </div>

        <button
          onClick={onOpenSupabaseConfig}
          className="btn btn-secondary text-sm shrink-0"
        >
          {isConfigured ? (
            <span>
              Manage Supabase Keys
            </span>
          ) : (
            <span>
              Supply Supabase Schema & Keys
            </span>
          )}
        </button>
      </div>
    </aside>
  );
};
