/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { runGameLogicTests, TestResult } from '../tests/gameLogic.test';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus';

interface TestRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TestRunnerModal: React.FC<TestRunnerModalProps> = ({ isOpen, onClose }) => {
  const [results, setResults] = useState<TestResult[]>(() => runGameLogicTests());
  const dialogRef = useDialogFocus(isOpen, onClose);

  if (!isOpen) return null;

  const handleRerun = () => {
    setResults(runGameLogicTests());
  };

  const allPassed = results.every(r => r.passed);

  return (
    <div className="modal-overlay">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="dev-modal flex flex-col gap-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-modal-title"
      >
        <div className="flex items-start justify-between gap-4">
            <h2 id="test-modal-title" className="text-2xl font-bold">
              Game Logic & Rules Verification Suite
            </h2>
          <button
            onClick={onClose}
            aria-label="Close test modal"
            className="icon-button"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm" role="status">
            Status: {allPassed ? (
              <span className="font-bold ml-1">All {results.length} Tests Passed</span>
            ) : (
              <span className="font-bold text-accent ml-1">Failures Detected</span>
            )}
          </span>
          <button
            onClick={handleRerun}
            className="btn btn-secondary text-sm"
          >
            Rerun Suite
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 py-3 text-sm ${r.passed ? '' : 'error-message'}`}
            >
              {r.passed ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-label="Passed" />
              ) : (
                <XCircle className="w-5 h-5 shrink-0 mt-0.5" aria-label="Failed" />
              )}
              <div className="flex flex-col">
                <span className="font-bold">{r.name}</span>
                <span className="text-muted mt-1 break-words">{r.message}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 text-right">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
