import type { SupabaseClient } from '@supabase/supabase-js';
import type { AvatarId, Player } from '../types/game';
import type { GameStateListener, MockGameState } from './mockGameEngine';
import { validateAnswer } from '../utils/helpers';

const avatars = new Set(['tuktuk', 'lion', 'coconut', 'kottu', 'teacup', 'cricket', 'peacock', 'mask']);
const phases = new Set(['lobby', 'question', 'voting', 'reveal', 'scoreboard', 'winner']);
const roundActions = new Set(['answer', 'vote', 'reveal_next', 'reveal_all', 'scoreboard', 'next', 'rematch']);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, minimum = 0): value is number => Number.isInteger(value) && (value as number) >= minimum;
const text = (value: unknown): value is string => typeof value === 'string';

function emptyState(): MockGameState {
  return { room: null, players: [], currentPlayerId: '', answers: [], votes: [], roundResults: [], revealedIndex: -1,
    isHost: false, timeLeft: 0, totalTime: 0, hasAnswered: false, hasVoted: false };
}

function player(value: unknown): value is Player {
  return object(value) && uuid(value.id) && text(value.nickname) && value.nickname.trim().length > 0 && value.nickname.length <= 24 &&
    avatars.has(value.avatar) && integer(value.score) && typeof value.isHost === 'boolean' && typeof value.isReady === 'boolean' &&
    typeof value.connected === 'boolean' && value.isBot !== true;
}

function snapshot(value: unknown, expectedRoom?: string): MockGameState {
  const invalid = () => { throw new Error('The multiplayer server returned an invalid room snapshot. No demo room was opened.'); };
  if (!object(value) || !object(value.room)) return invalid();
  const room = value.room;
  if (!uuid(room.id) || (expectedRoom && room.id !== expectedRoom) || !text(room.code) || !/^\d{6}$/.test(room.code) ||
      !uuid(room.hostId) || !phases.has(room.state) || !integer(room.currentRound, 1) || room.currentRound > 10 || room.totalRounds !== 10 ||
      !text(room.category) || !Number.isFinite(room.createdAt) || !object(room.currentPrompt) || !text(room.currentPrompt.id) ||
      !text(room.currentPrompt.promptEnglish) || !text(room.currentPrompt.category)) return invalid();
  if (!Array.isArray(value.players) || !value.players.length || !value.players.every(player) ||
      new Set(value.players.map(p => p.id)).size !== value.players.length || !uuid(value.currentPlayerId)) return invalid();
  const me = value.players.find(p => p.id === value.currentPlayerId);
  const hosts = value.players.filter(p => p.isHost);
  if (!me || hosts.length !== 1 || hosts[0].id !== room.hostId || value.isHost !== me.isHost ||
      typeof value.hasAnswered !== 'boolean' || typeof value.hasVoted !== 'boolean' ||
      !integer(value.timeLeft) || !integer(value.totalTime) || !integer(value.revealedIndex, -1)) return invalid();
  if (!Array.isArray(value.answers) || !value.answers.every(answer => object(answer) && uuid(answer.playerId) &&
      integer(answer.round, 1) && answer.round === room.currentRound && text(answer.authorNickname) && text(answer.text) && Number.isFinite(answer.submittedAt))) return invalid();
  if (!Array.isArray(value.votes) || !value.votes.every(vote => object(vote) && uuid(vote.voterId) && uuid(vote.targetPlayerId) &&
      integer(vote.round, 1) && vote.round === room.currentRound)) return invalid();
  if (!Array.isArray(value.roundResults) || !value.roundResults.every(result => object(result) && uuid(result.playerId) &&
      value.players.some((p: Player) => p.id === result.playerId) && text(result.authorNickname) && avatars.has(result.avatar) && text(result.answerText) &&
      integer(result.pointsEarned) && Array.isArray(result.votesReceived) && result.votesReceived.every(player))) return invalid();
  return structuredClone(value) as MockGameState;
}

function serverError(error: unknown): Error {
  if (object(error) && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || ''))) {
    return new Error('Shared multiplayer is not installed in Supabase. Apply the shared multiplayer SQL migration, then try again.');
  }
  return error instanceof Error ? error : new Error(object(error) && text(error.message) ? error.message : 'Could not reach the multiplayer server. Please try again.');
}

function actionSnapshot(value: unknown, roomId: string, action: string, expectedRound: number | null): MockGameState {
  const next = snapshot(value, roomId);
  if (action === 'read') return next;
  const round = action === 'start' || action === 'rematch' ? 1
    : action === 'next' ? Math.min(expectedRound! + 1, 10) : expectedRound;
  const allowedPhases: Record<string, string[]> = {
    start: ['question'], answer: ['question', 'voting', 'reveal'], vote: ['voting', 'reveal'],
    reveal_next: ['reveal'], reveal_all: ['reveal'], scoreboard: ['scoreboard'],
    next: expectedRound === 10 ? ['winner'] : ['question'], rematch: ['lobby'],
  };
  if (next.room!.currentRound !== round || !allowedPhases[action]?.includes(next.room!.state)) {
    throw new Error('The multiplayer server returned an unexpected round or phase for this action. Refresh the game before trying again.');
  }
  return next;
}

/** Every game decision comes from the authenticated server; polling only transports snapshots. */
export class OnlineGameEngine {
  private state = emptyState();
  private listeners = new Set<GameStateListener>();
  private errorListeners = new Set<(error: Error) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private refreshPromise: Promise<void> | null = null;
  private epoch = 0;
  private entering = false;

  constructor(private readonly getClient: () => SupabaseClient | null) {}

  getState(): MockGameState { return structuredClone(this.state); }

  subscribe(listener: GameStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    this.syncPolling();
    return () => { this.listeners.delete(listener); this.syncPolling(); };
  }

  subscribeError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => { this.errorListeners.delete(listener); };
  }

  private notify(): void { this.listeners.forEach(listener => listener(this.getState())); }
  private report(error: Error): void { this.errorListeners.forEach(listener => listener(error)); }
  private client(): SupabaseClient {
    const client = this.getClient();
    if (!client) throw new Error('Supabase is not configured. Set the shared public Supabase URL and publishable key for this deployment, then reload.');
    return client;
  }

  private syncPolling(): void {
    const needed = this.listeners.size > 0 && this.state.room !== null && !this.entering;
    if (!needed && this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (needed && this.timer === null) this.timer = setInterval(() => { void this.refresh().catch(() => {}); }, 1000);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async authenticate(client: SupabaseClient): Promise<void> {
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error(`Could not read your Supabase session: ${error.message}`);
    if (data.session) {
      if (!data.session.user?.id) throw new Error('Your Supabase session has no user identity. Sign in again.');
      return;
    }
    const { data: signedIn, error: signInError } = await client.auth.signInAnonymously();
    if (signInError || !signedIn.session || !signedIn.user?.id) {
      throw new Error(`Could not sign in anonymously: ${signInError?.message ?? 'No authenticated user was returned.'}`);
    }
  }

  private async enter(kind: 'host' | 'join', nickname: string, avatar: AvatarId, code?: string): Promise<void> {
    const cleanNickname = nickname.trim();
    if (!cleanNickname || cleanNickname.length > 24) throw new Error('Choose a nickname between 1 and 24 characters, machan.');
    if (!avatars.has(avatar)) throw new Error('Choose a valid Sri Lankan avatar.');
    const cleanCode = code?.trim();
    if (kind === 'join' && !/^\d{6}$/.test(cleanCode || '')) throw new Error('Enter the host\'s six-digit room code.');
    const epoch = ++this.epoch;
    this.entering = true;
    this.syncPolling();
    try {
      await this.enqueue(async () => {
        if (epoch !== this.epoch) return;
        const client = this.client();
        await this.authenticate(client);
        if (epoch !== this.epoch) return;
        const { data, error } = await client.rpc(kind === 'host' ? 'machan_host_room' : 'machan_join_room', {
          p_nickname: cleanNickname, p_avatar: avatar, ...(kind === 'join' ? { p_code: cleanCode } : {}),
        });
        if (epoch !== this.epoch) return;
        if (error) throw serverError(error);
        const next = snapshot(data);
        if (kind === 'host' && !next.isHost) throw new Error('The created room does not identify you as its real host.');
        if (kind === 'join' && next.room!.code !== cleanCode) throw new Error('The server returned a different room code. No room was opened.');
        this.state = next;
        this.notify();
      });
    } catch (cause) {
      if (epoch !== this.epoch) return;
      const error = serverError(cause); this.report(error); throw error;
    } finally {
      if (epoch === this.epoch) { this.entering = false; this.syncPolling(); }
    }
  }

  createRoom(nickname: string, avatar: AvatarId): Promise<void> { return this.enter('host', nickname, avatar); }
  joinRoom(code: string, nickname: string, avatar: AvatarId): Promise<void> { return this.enter('join', nickname, avatar, code); }

  private async action(action: string, answer: string | null = null, target: string | null = null): Promise<void> {
    const roomId = this.state.room?.id;
    if (!roomId) throw new Error('Join a shared room before playing.');
    // Capture the visible round before this request waits behind a poll or another action.
    const expectedRound = roundActions.has(action) ? this.state.room!.currentRound : null;
    const epoch = action === 'leave' ? ++this.epoch : this.epoch;
    try {
      await this.enqueue(async () => {
        if (epoch !== this.epoch) return;
        const { data, error } = await this.client().rpc('machan_game', {
          p_room_id: roomId, p_action: action, p_text: answer, p_target: target, p_expected_round: expectedRound,
        });
        if (epoch !== this.epoch) return;
        if (error) throw serverError(error);
        if (action === 'leave') { this.reset(); return; }
        this.state = actionSnapshot(data, roomId, action, expectedRound);
        this.notify();
      });
    } catch (cause) {
      if (epoch !== this.epoch) return;
      const error = serverError(cause);
      if (/host has closed|room.*(?:closed|not found)|not a member/i.test(error.message)) this.reset();
      this.report(error); throw error;
    } finally { this.syncPolling(); }
  }

  refresh(): Promise<void> {
    if (!this.state.room || this.entering) return Promise.resolve();
    if (this.refreshPromise) return this.refreshPromise;
    const request = this.action('read');
    this.refreshPromise = request;
    void request.finally(() => { if (this.refreshPromise === request) this.refreshPromise = null; }).catch(() => {});
    return request;
  }

  startGame(): Promise<void> { return this.action('start'); }
  submitAnswer(answer: string): Promise<void> {
    const result = validateAnswer(answer);
    if (!result.isValid) return Promise.reject(new Error(result.error));
    return this.action('answer', answer.trim());
  }
  async castVote(target: string): Promise<boolean> {
    if (!uuid(target) || target === this.state.currentPlayerId) throw new Error('Vote for another player\'s answer.');
    await this.action('vote', null, target);
    return true;
  }
  revealNextCard(): Promise<void> { return this.action('reveal_next'); }
  revealAllCards(): Promise<void> { return this.action('reveal_all'); }
  transitionToScoreboard(): Promise<void> { return this.action('scoreboard'); }
  advanceFromScoreboard(): Promise<void> { return this.action('next'); }
  rematch(): Promise<void> { return this.action('rematch'); }
  leaveRoom(): Promise<void> { return this.state.room ? this.action('leave') : Promise.resolve(); }

  reset(): void {
    this.epoch++;
    this.entering = false;
    this.state = emptyState();
    this.notify();
    this.syncPolling();
  }
}
