/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ScreenState =
  | 'welcome'
  | 'lobby'
  | 'question'
  | 'voting'
  | 'reveal'
  | 'scoreboard'
  | 'winner';

export type AvatarId =
  | 'tuktuk'
  | 'lion'
  | 'coconut'
  | 'kottu'
  | 'teacup'
  | 'cricket'
  | 'peacock'
  | 'mask';

export interface AvatarOption {
  id: AvatarId;
  name: string;
  emoji: string;
  bg: string;
}

export interface Player {
  id: string;
  nickname: string;
  avatar: AvatarId;
  score: number;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
  isBot?: boolean;
}

export interface Answer {
  round: number;
  playerId: string;
  authorNickname: string;
  text: string;
  submittedAt: number;
}

export interface Vote {
  round: number;
  voterId: string;
  targetPlayerId: string;
}

export interface GamePrompt {
  id: string;
  promptEnglish: string;
  promptSinglish?: string;
  category: string;
}

export interface GameRoom {
  id: string;
  code: string;
  hostId: string;
  state: ScreenState;
  currentRound: number;
  totalRounds: number;
  category: string;
  currentPrompt: GamePrompt;
  createdAt: number;
}

export interface RoundResultItem {
  playerId: string;
  authorNickname: string;
  avatar: AvatarId;
  answerText: string;
  votesReceived: Player[];
  pointsEarned: number;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConfigured: boolean;
}
