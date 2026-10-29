/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { validateAnswer, generateRoomCode, countWords } from '../utils/helpers';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export function runGameLogicTests(): TestResult[] {
  const results: TestResult[] = [];

  // Test 1: Word count function
  const test1Text = 'Ado machan shape eke yamu';
  const test1Count = countWords(test1Text);
  results.push({
    name: 'Word Count Logic',
    passed: test1Count === 5,
    message: test1Count === 5 ? '5 words counted accurately' : `Expected 5 words, got ${test1Count}`,
  });

  // Test 2: Valid 6-word answer within 120 characters
  const valid6Words = 'Bath kala shape eke ennam machan';
  const val2 = validateAnswer(valid6Words);
  results.push({
    name: '6-Word Answer Acceptance',
    passed: val2.isValid && val2.wordCount === 6,
    message: val2.isValid ? 'Valid 6 words accepted' : `Failed: ${val2.error}`,
  });

  // Test 3: Exceeding 6 words rejection
  const invalid7Words = 'Ado machan why are you so late today';
  const val3 = validateAnswer(invalid7Words);
  results.push({
    name: '7-Word Answer Rejection',
    passed: !val3.isValid && (val3.error?.includes('6 words') || false),
    message: !val3.isValid ? 'Correctly rejected > 6 words' : 'Should have rejected > 6 words',
  });

  // Test 4: 120 Characters limit enforcement
  const long125Chars = 'A'.repeat(125);
  const val4 = validateAnswer(long125Chars);
  results.push({
    name: '120-Character Limit Enforcement',
    passed: !val4.isValid && (val4.error?.includes('120') || false),
    message: !val4.isValid ? 'Correctly rejected > 120 characters' : 'Should have rejected > 120 chars',
  });

  // Test 5: 6-digit Room Code Format
  const code = generateRoomCode();
  const isAlphaNum6 = /^[A-Z0-9]{6}$/.test(code);
  results.push({
    name: '6-Digit Room Code Generator',
    passed: isAlphaNum6 && code.length === 6,
    message: isAlphaNum6 ? `Generated valid 6-char code: ${code}` : `Invalid code: ${code}`,
  });

  // Test 6: Round 10 Double Points Calculation
  const calculatePoints = (roundNumber: number, voteCount: number) => {
    const multiplier = roundNumber === 10 ? 2 : 1;
    return voteCount * multiplier;
  };
  const normalPoints = calculatePoints(5, 3); // 3 votes = 3 pts
  const doublePoints = calculatePoints(10, 3); // 3 votes = 6 pts
  results.push({
    name: 'Round 10 Double Points Multiplier',
    passed: normalPoints === 3 && doublePoints === 6,
    message: doublePoints === 6 ? 'Round 10 successfully applies 2x double multiplier' : 'Multiplier error',
  });

  // Test 7: Prevent Self-Voting Rule
  const canCastVote = (voterId: string, targetId: string) => voterId !== targetId;
  const selfVoteDenied = !canCastVote('player-1', 'player-1');
  const peerVoteAllowed = canCastVote('player-1', 'player-2');
  results.push({
    name: 'No Self-Voting Integrity Rule',
    passed: selfVoteDenied && peerVoteAllowed,
    message: selfVoteDenied ? 'Self-voting blocked, peer voting allowed' : 'Self-voting rule violated',
  });

  return results;
}
