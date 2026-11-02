/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { mockGameEngine, MockGameState } from './services/mockGameEngine';
import { OnlineGameEngine } from './services/onlineGameEngine';
import { getSupabaseClient, isSupabaseConfigured } from './services/supabaseClient';
import { AvatarId } from './types/game';
import { Header } from './components/Header';
import { MockDataBanner } from './components/MockDataBanner';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { TestRunnerModal } from './components/TestRunnerModal';
import { DarkSoulsLoadingScreen } from './components/DarkSoulsLoadingScreen';
import { WelcomeScreen } from './components/screens/WelcomeScreen';
import { LobbyScreen } from './components/screens/LobbyScreen';
import { QuestionScreen } from './components/screens/QuestionScreen';
import { VotingScreen } from './components/screens/VotingScreen';
import { RevealScreen } from './components/screens/RevealScreen';
import { ScoreboardScreen } from './components/screens/ScoreboardScreen';
import { WinnerScreen } from './components/screens/WinnerScreen';

const isDemo = import.meta.env.DEV && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('demo') === '1';
const onlineGameEngine = new OnlineGameEngine(getSupabaseClient);
const gameEngine = isDemo ? mockGameEngine : onlineGameEngine;

export default function App() {
  const [gameState, setGameState] = useState<MockGameState>(() => gameEngine.getState());
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isSupabaseReady, setIsSupabaseReady] = useState(() => isSupabaseConfigured());

  // Loading Screen State: triggers on initial boot and room entry
  const [isLoading, setIsLoading] = useState(true);
  const [loadingTitle, setLoadingTitle] = useState('Fun ekata ready da?');
  const [roomEntryError, setRoomEntryError] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const roomEntryBusy = useRef(false);
  const actionBusy = useRef(false);
  const finishLoading = useCallback(() => setIsLoading(false), []);

  useEffect(() => {
    const unsubscribe = gameEngine.subscribe((updated) => {
      setGameState(updated);
    });
    const unsubscribeErrors = isDemo ? () => {} : onlineGameEngine.subscribeError(error => {
      setRoomEntryError(error.message);
    });
    return () => {
      unsubscribe();
      unsubscribeErrors();
    };
  }, []);

  const handleConfigUpdated = () => {
    setIsSupabaseReady(isSupabaseConfigured());
  };

  const enterRoom = async (nickname: string, avatar: AvatarId, code?: string) => {
    if (roomEntryBusy.current) return;
    roomEntryBusy.current = true;
    setIsCreatingRoom(true);
    setRoomEntryError('');
    setLoadingTitle('Fun ekata ready da?');
    setIsLoading(true);
    try {
      if (code) await gameEngine.joinRoom(code, nickname, avatar);
      else await gameEngine.createRoom(nickname, avatar);
    } catch (cause) {
      setRoomEntryError(cause instanceof Error ? cause.message : 'Could not enter the room. Please try again.');
    } finally {
      setIsLoading(false);
      roomEntryBusy.current = false;
      setIsCreatingRoom(false);
    }
  };

  const runAction = async (action: () => unknown) => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setIsSyncing(true);
    setRoomEntryError('');
    try { await action(); }
    catch (cause) { setRoomEntryError(cause instanceof Error ? cause.message : 'Could not sync the game. Please retry.'); }
    finally { actionBusy.current = false; setIsSyncing(false); }
  };

  const leaveRoom = () => runAction(() => gameEngine.leaveRoom());

  const { room, players, currentPlayerId, answers, roundResults, revealedIndex, timeLeft, totalTime, hasAnswered, hasVoted } = gameState;
  const isHost = room?.hostId === currentPlayerId;

  return (
    <div className="app-shell">
      {/* Printed Logo Loading Screen */}
      <DarkSoulsLoadingScreen
        isActive={isLoading}
        title={loadingTitle}
        durationMs={1500}
        onFinished={finishLoading}
      />

      {/* Top Bar Contract Navigation */}
      <Header
        roomCode={room?.code}
        round={room?.currentRound}
        totalRounds={room?.totalRounds || 10}
        playerCount={players.length}
        onOpenSupabaseConfig={() => setIsSupabaseModalOpen(true)}
        onLeaveRoom={leaveRoom}
      />

      {/* Simulator Mode Banner */}
      {import.meta.env.DEV && <MockDataBanner
        isConfigured={!isDemo && isSupabaseReady}
        networkStatus={isDemo ? 'mock' : 'online'}
        onOpenSupabaseConfig={() => setIsSupabaseModalOpen(true)}
      />}

      {/* Main Dynamic Viewport */}
      <main className="app-main" aria-busy={isSyncing || isCreatingRoom}>
        {roomEntryError && <p className="error-message max-w-xl mx-auto mb-6" role="alert">{roomEntryError}</p>}
        {isDemo && <p className="status-message max-w-xl mx-auto" role="status">Local demo: these bots and room codes are only on this device.</p>}
        {isSyncing && <p className="status-message max-w-xl mx-auto" role="status">Syncing game…</p>}
        {!room || room.state === 'welcome' ? (
          <WelcomeScreen
            isSubmitting={isCreatingRoom}
            onHostRoom={(nickname, avatar) => void enterRoom(nickname, avatar)}
            onJoinRoom={(code, nickname, avatar) => void enterRoom(nickname, avatar, code)}
            demoMode={isDemo}
          />
        ) : room.state === 'lobby' ? (
          <LobbyScreen
            roomId={room.id}
            onQuestionsSaved={(records) => isDemo ? mockGameEngine.setRoomQuestions(room.id, records.map((record) => ({
              id: `${room.id}:${record.round_no}`,
              category: record.category,
              promptEnglish: record.question,
            }))) : void runAction(() => onlineGameEngine.refresh())}
            roomCode={room.code}
            players={players}
            currentPlayerId={currentPlayerId}
            isHost={isHost}
            onStartGame={() => void runAction(() => gameEngine.startGame())}
            demoMode={isDemo}
            onAddMockPlayer={() => mockGameEngine.addMockMachan()}
            onRemovePlayer={(id) => mockGameEngine.removeMockMachan(id)}
          />
        ) : room.state === 'question' ? (
          <QuestionScreen
            currentRound={room.currentRound}
            totalRounds={room.totalRounds}
            prompt={room.currentPrompt}
            timeLeft={timeLeft}
            totalTime={totalTime}
            hasAnswered={hasAnswered}
            key={`question:${room.id}:${room.currentRound}`}
            onSubmitAnswer={(text) => void runAction(() => gameEngine.submitAnswer(text))}
          />
        ) : room.state === 'voting' ? (
          <VotingScreen
            isSubmitting={isSyncing}
            currentRound={room.currentRound}
            totalRounds={room.totalRounds}
            prompt={room.currentPrompt}
            answers={answers}
            currentPlayerId={currentPlayerId}
            timeLeft={timeLeft}
            totalTime={totalTime}
            hasVoted={hasVoted}
            key={`voting:${room.id}:${room.currentRound}`}
            onCastVote={(targetId) => void runAction(() => gameEngine.castVote(targetId))}
          />
        ) : room.state === 'reveal' ? (
          <RevealScreen
            currentRound={room.currentRound}
            totalRounds={room.totalRounds}
            roundResults={roundResults}
            revealedIndex={revealedIndex}
            isHost={isHost}
            onRevealNext={() => void runAction(() => gameEngine.revealNextCard())}
            onRevealAll={() => void runAction(() => gameEngine.revealAllCards())}
            onGoToScoreboard={() => void runAction(() => gameEngine.transitionToScoreboard())}
          />
        ) : room.state === 'scoreboard' ? (
          <ScoreboardScreen
            currentRound={room.currentRound}
            totalRounds={room.totalRounds}
            players={players}
            currentPlayerId={currentPlayerId}
            isHost={isHost}
            onAdvance={() => void runAction(() => gameEngine.advanceFromScoreboard())}
          />
        ) : room.state === 'winner' ? (
          <WinnerScreen
            players={players}
            currentPlayerId={currentPlayerId}
            isHost={isHost}
            onRematch={() => void runAction(() => gameEngine.rematch())}
            onLeaveRoom={leaveRoom}
          />
        ) : null}
      </main>

      <footer className="site-footer">
        <span className="font-semibold">Machan, Who Said That?</span>
        <span>In-Person Sri Lankan Party Comedy · English &amp; Singlish</span>
        {import.meta.env.DEV && <button onClick={() => setIsTestModalOpen(true)} className="btn btn-secondary text-sm">Rule Tests</button>}
      </footer>
      {/* Supabase Contract Modal */}
      {import.meta.env.DEV && <SupabaseConfigModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        onConfigUpdated={handleConfigUpdated}
      />}

      {/* Test Suite Modal */}
      {import.meta.env.DEV && <TestRunnerModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
      />}
    </div>
  );
}
