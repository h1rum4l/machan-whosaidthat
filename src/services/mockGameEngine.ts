/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Answer, AvatarId, GamePrompt, GameRoom, Player, RoundResultItem, ScreenState, Vote } from '../types/game';
import { generateRoomCode, MOCK_BOT_ANSWERS, MOCK_BOT_PLAYERS, SRI_LANKAN_PROMPTS } from '../utils/helpers';
import { soundService } from '../utils/sound';

export interface GameStateListener {
  (state: MockGameState): void;
}

export interface MockGameState {
  room: GameRoom | null;
  players: Player[];
  currentPlayerId: string;
  answers: Answer[];
  votes: Vote[];
  roundResults: RoundResultItem[];
  revealedIndex: number;
  isHost: boolean;
  timeLeft: number;
  totalTime: number;
  hasAnswered: boolean;
  hasVoted: boolean;
}

class MockGameEngine {
  private state: MockGameState = {
    room: null,
    players: [],
    currentPlayerId: '',
    answers: [],
    votes: [],
    roundResults: [],
    revealedIndex: -1,
    isHost: false,
    timeLeft: 0,
    totalTime: 0,
    hasAnswered: false,
    hasVoted: false,
  };

  private timerInterval: number | null = null;
  private listeners: Set<GameStateListener> = new Set();
  private roomPrompts: GamePrompt[] | null = null;

  public subscribe(listener: GameStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(fn => fn({ ...this.state }));
  }

  public getState(): MockGameState {
    return { ...this.state };
  }

  // Create room as host
  public createRoom(nickname: string, avatar: AvatarId, savedRoom?: { id: string; code: string }): void {
    const hostId = 'player-host-' + Math.random().toString(36).substring(2, 7);
    const code = savedRoom?.code ?? generateRoomCode();
    this.roomPrompts = null;

    const hostPlayer: Player = {
      id: hostId,
      nickname: nickname || 'Party Machan',
      avatar: avatar || 'tuktuk',
      score: 0,
      isHost: true,
      isReady: true,
      connected: true,
    };

    // Include 3 mock buddy machans by default so the room immediately has 4 players
    const initialBots: Player[] = MOCK_BOT_PLAYERS.slice(0, 3).map(b => ({
      ...b,
      score: 0,
      isHost: false,
      isReady: true,
      connected: true,
    }));

    const room: GameRoom = {
      id: savedRoom?.id ?? 'room-' + code,
      code,
      hostId,
      state: 'lobby',
      currentRound: 1,
      totalRounds: 10,
      category: 'Singlish Friendship Banter',
      currentPrompt: SRI_LANKAN_PROMPTS[0],
      createdAt: Date.now(),
    };

    this.state = {
      room,
      players: [hostPlayer, ...initialBots],
      currentPlayerId: hostId,
      answers: [],
      votes: [],
      roundResults: [],
      revealedIndex: -1,
      isHost: true,
      timeLeft: 0,
      totalTime: 0,
      hasAnswered: false,
      hasVoted: false,
    };

    this.notify();
  }

  // Join room by code
  public joinRoom(code: string, nickname: string, avatar: AvatarId): boolean {
    this.roomPrompts = null;
    const formattedCode = code.trim().toUpperCase();
    const playerId = 'player-guest-' + Math.random().toString(36).substring(2, 7);

    const guestPlayer: Player = {
      id: playerId,
      nickname: nickname || 'Friend Machan',
      avatar: avatar || 'coconut',
      score: 0,
      isHost: false,
      isReady: true,
      connected: true,
    };

    const hostBot: Player = {
      id: 'host-kaveen',
      nickname: 'Kaveen (Host)',
      avatar: 'cricket',
      score: 0,
      isHost: true,
      isReady: true,
      connected: true,
      isBot: true,
    };

    const otherBots: Player[] = MOCK_BOT_PLAYERS.slice(0, 2).map(b => ({
      ...b,
      score: 0,
      isHost: false,
      isReady: true,
      connected: true,
    }));

    const room: GameRoom = {
      id: 'room-' + formattedCode,
      code: formattedCode,
      hostId: hostBot.id,
      state: 'lobby',
      currentRound: 1,
      totalRounds: 10,
      category: 'Singlish Friendship Banter',
      currentPrompt: SRI_LANKAN_PROMPTS[0],
      createdAt: Date.now(),
    };

    this.state = {
      room,
      players: [hostBot, guestPlayer, ...otherBots],
      currentPlayerId: playerId,
      answers: [],
      votes: [],
      roundResults: [],
      revealedIndex: -1,
      isHost: false,
      timeLeft: 0,
      totalTime: 0,
      hasAnswered: false,
      hasVoted: false,
    };

    this.notify();
    return true;
  }

  // Add more mock machans to test up to 10 players
  public addMockMachan(): void {
    if (this.state.players.length >= 10) return;
    const count = this.state.players.length;
    const sampleAvatars: AvatarId[] = ['kottu', 'mask', 'lion', 'peacock', 'teacup', 'tuktuk'];
    const newPlayer: Player = {
      id: 'bot-' + (count + 1),
      nickname: 'Machan ' + (count + 1),
      avatar: sampleAvatars[count % sampleAvatars.length],
      score: 0,
      isHost: false,
      isReady: true,
      connected: true,
      isBot: true,
    };
    this.state.players.push(newPlayer);
    this.notify();
  }

  // Remove extra player
  public removeMockMachan(id: string): void {
    if (this.state.players.length <= 3) return;
    this.state.players = this.state.players.filter(p => p.id !== id);
    this.notify();
  }

  public setRoomQuestions(roomId: string, prompts: GamePrompt[]): void {
    if (this.state.room?.id !== roomId || this.state.room.state !== 'lobby' ||
        this.state.room.hostId !== this.state.currentPlayerId || prompts.length !== 10) return;
    this.roomPrompts = prompts;
    this.state.room.currentPrompt = prompts[0];
    this.notify();
  }

  // Start game from lobby (requires at least 3 players)
  public startGame(): void {
    if (!this.state.room) return;
    if (this.state.players.length < 3) return;

    this.startRound(1);
  }

  // Start round X (1-10)
  public startRound(roundNumber: number): void {
    if (!this.state.room) return;
    this.stopTimer();

    const prompts = this.roomPrompts ?? SRI_LANKAN_PROMPTS;
    const promptIndex = (roundNumber - 1) % prompts.length;
    const currentPrompt = prompts[promptIndex];

    this.state.room.currentRound = roundNumber;
    this.state.room.currentPrompt = currentPrompt;
    this.state.room.state = 'question';

    this.state.answers = [];
    this.state.votes = [];
    this.state.roundResults = [];
    this.state.revealedIndex = -1;
    this.state.hasAnswered = false;
    this.state.hasVoted = false;
    this.state.totalTime = 20;
    this.state.timeLeft = 20;

    this.notify();
    this.startTimer(20, () => {
      this.transitionToVoting();
    });
  }

  // Submit human player answer
  public submitAnswer(text: string): void {
    if (this.state.hasAnswered) return;
    const player = this.state.players.find(p => p.id === this.state.currentPlayerId);
    if (!player) return;

    const answer: Answer = {
      round: this.state.room?.currentRound || 1,
      playerId: player.id,
      authorNickname: player.nickname,
      text: text.trim(),
      submittedAt: Date.now(),
    };

    this.state.answers.push(answer);
    this.state.hasAnswered = true;
    soundService.playSubmit();
    this.notify();

    // If all human players answered, or timer reaches zero, bots submit answers
    const botPlayers = this.state.players.filter(p => p.isBot);
    const promptId = this.state.room?.currentPrompt.id || 'p1';
    const sampleAnswers = MOCK_BOT_ANSWERS[promptId] || [
      'Shape eke yamu machan',
      'Bath kala ennam kiyala kiwwa',
      'No worries, fully sorted',
      'Ado machan, this is crazy',
    ];

    botPlayers.forEach((bot, idx) => {
      const alreadyAnswered = this.state.answers.some(a => a.playerId === bot.id);
      if (!alreadyAnswered) {
        this.state.answers.push({
          round: this.state.room?.currentRound || 1,
          playerId: bot.id,
          authorNickname: bot.nickname,
          text: sampleAnswers[idx % sampleAnswers.length],
          submittedAt: Date.now() + idx * 500,
        });
      }
    });

    // Check if everyone answered
    if (this.state.answers.length >= this.state.players.length) {
      this.transitionToVoting();
    }
  }

  // Transition from question to voting screen
  private transitionToVoting(): void {
    this.stopTimer();
    if (!this.state.room) return;

    // Fill missing answers for bots if any
    const promptId = this.state.room.currentPrompt.id || 'p1';
    const sampleAnswers = MOCK_BOT_ANSWERS[promptId] || ['Full aathal machan', 'Ado seriously?'];
    this.state.players.forEach((p, idx) => {
      if (!this.state.answers.some(a => a.playerId === p.id)) {
        this.state.answers.push({
          round: this.state.room?.currentRound || 1,
          playerId: p.id,
          authorNickname: p.nickname,
          text: p.id === this.state.currentPlayerId
            ? 'Too slow to answer!'
            : sampleAnswers[idx % sampleAnswers.length],
          submittedAt: Date.now(),
        });
      }
    });

    this.state.room.state = 'voting';
    this.state.totalTime = 15;
    this.state.timeLeft = 15;
    this.state.hasVoted = false;
    this.notify();

    this.startTimer(15, () => {
      this.transitionToReveal();
    });
  }

  // Cast vote by human player
  public castVote(targetPlayerId: string): boolean {
    if (this.state.hasVoted) return false;
    if (targetPlayerId === this.state.currentPlayerId) {
      // Self-voting is prohibited
      return false;
    }

    const vote: Vote = {
      round: this.state.room?.currentRound || 1,
      voterId: this.state.currentPlayerId,
      targetPlayerId,
    };

    this.state.votes.push(vote);
    this.state.hasVoted = true;
    soundService.playVote();
    this.notify();

    // Bots cast their votes randomly across available answers (no self-vote)
    const bots = this.state.players.filter(p => p.isBot);
    bots.forEach(bot => {
      const alreadyVoted = this.state.votes.some(v => v.voterId === bot.id);
      if (!alreadyVoted) {
        // Find valid targets (not self)
        const validTargets = this.state.players.filter(p => p.id !== bot.id);
        if (validTargets.length > 0) {
          const chosenTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
          this.state.votes.push({
            round: this.state.room?.currentRound || 1,
            voterId: bot.id,
            targetPlayerId: chosenTarget.id,
          });
        }
      }
    });

    // Check if all votes in
    if (this.state.votes.length >= this.state.players.length) {
      this.transitionToReveal();
    }

    return true;
  }

  // Transition to dramatic reveal screen
  public transitionToReveal(): void {
    this.stopTimer();
    if (!this.state.room) return;

    // Ensure all bots voted if timer expired
    this.state.players.forEach(p => {
      if (!this.state.votes.some(v => v.voterId === p.id)) {
        const validTargets = this.state.players.filter(target => target.id !== p.id);
        if (validTargets.length > 0) {
          const chosen = validTargets[Math.floor(Math.random() * validTargets.length)];
          this.state.votes.push({
            round: this.state.room?.currentRound || 1,
            voterId: p.id,
            targetPlayerId: chosen.id,
          });
        }
      }
    });

    // Compute round results and points
    // Rule: 1 point per vote. Round 10: DOUBLE POINTS (2 points per vote!)
    const isRoundTen = this.state.room.currentRound === 10;
    const multiplier = isRoundTen ? 2 : 1;

    const roundResults: RoundResultItem[] = this.state.answers.map(ans => {
      const player = this.state.players.find(p => p.id === ans.playerId);
      const voters = this.state.votes
        .filter(v => v.targetPlayerId === ans.playerId)
        .map(v => this.state.players.find(p => p.id === v.voterId)!)
        .filter(Boolean);

      const points = voters.length * multiplier;

      return {
        playerId: ans.playerId,
        authorNickname: ans.authorNickname,
        avatar: player?.avatar || 'tuktuk',
        answerText: ans.text,
        votesReceived: voters,
        pointsEarned: points,
      };
    });

    // Apply points to player total scores
    roundResults.forEach(res => {
      const player = this.state.players.find(p => p.id === res.playerId);
      if (player) {
        player.score += res.pointsEarned;
      }
    });

    this.state.room.state = 'reveal';
    this.state.roundResults = roundResults;
    this.state.revealedIndex = 0; // Reveal first card
    soundService.playReveal();
    this.notify();
  }

  // Advance reveal index
  public revealNextCard(): void {
    if (this.state.revealedIndex < this.state.roundResults.length - 1) {
      this.state.revealedIndex++;
      soundService.playReveal();
      this.notify();
    } else {
      this.transitionToScoreboard();
    }
  }

  // Reveal all at once
  public revealAllCards(): void {
    this.state.revealedIndex = this.state.roundResults.length - 1;
    soundService.playReveal();
    this.notify();
  }

  // Transition to scoreboard screen
  public transitionToScoreboard(): void {
    if (!this.state.room) return;
    this.state.room.state = 'scoreboard';
    this.notify();
  }

  // Host advances to next round or final winner podium
  public advanceFromScoreboard(): void {
    if (!this.state.room) return;
    if (this.state.room.currentRound >= 10) {
      this.state.room.state = 'winner';
      soundService.playFanfare();
      this.notify();
    } else {
      this.startRound(this.state.room.currentRound + 1);
    }
  }

  // Rematch: resets scores and starts round 1 again
  public rematch(): void {
    if (!this.state.room) return;
    this.state.players.forEach(p => {
      p.score = 0;
    });
    this.state.room.state = 'lobby';
    this.state.room.currentRound = 1;
    this.notify();
  }

  // Leave room back to welcome
  public leaveRoom(): void {
    this.roomPrompts = null;
    this.stopTimer();
    this.state = {
      room: null,
      players: [],
      currentPlayerId: '',
      answers: [],
      votes: [],
      roundResults: [],
      revealedIndex: -1,
      isHost: false,
      timeLeft: 0,
      totalTime: 0,
      hasAnswered: false,
      hasVoted: false,
    };
    this.notify();
  }

  private startTimer(durationSeconds: number, onComplete: () => void): void {
    this.stopTimer();
    this.state.timeLeft = durationSeconds;
    this.state.totalTime = durationSeconds;

    this.timerInterval = window.setInterval(() => {
      if (this.state.timeLeft > 1) {
        this.state.timeLeft--;
        if (this.state.timeLeft <= 5) {
          soundService.playTick(true);
        } else if (this.state.timeLeft % 2 === 0) {
          soundService.playTick(false);
        }
        this.notify();
      } else {
        this.state.timeLeft = 0;
        this.stopTimer();
        this.notify();
        onComplete();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}

export const mockGameEngine = new MockGameEngine();
