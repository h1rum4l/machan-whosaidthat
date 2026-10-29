/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { mockGameEngine, MockGameState } from './services/mockGameEngine';
import { getSupabaseClient, isSupabaseConfigured } from './services/supabaseClient';
import { createSupabaseRoom } from './services/createRoom';
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


export default function App() {
  const [gameState, setGameState] = useState<MockGameState>(() => mockGameEngine.getState());
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isSupabaseReady, setIsSupabaseReady] = useState(() => isSupabaseConfigured());

  // Loading Screen State: triggers on initial boot and room entry
  const [isLoading, setIsLoading] = useState(true);
  const [loadingTitle, setLoadingTitle] = useState('Fun ekata ready da?');
  const [roomEntryError, setRoomEntryError] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const roomEntryBusy = useRef(false);

  useEffect(() => {
    const unsubscribe = mockGameEngine.subscribe((updated) => {
      setGameState(updated);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const handleConfigUpdated = () => {
    setIsSupabaseReady(isSupabaseConfigured());
  };

  const handleHostRoom = (nickname: string, avatar: AvatarId) => {
    if (roomEntryBusy.current) return;
    roomEntryBusy.current = true;
    setIsCreatingRoom(true);
    setRoomEntryError('');
    setLoadingTitle('Fun ekata ready da?');
    setIsLoading(true);
    setTimeout(async () => {
      try {
        const client = getSupabaseClient();
        const savedRoom = client ? await createSupabaseRoom(client, nickname) : undefined;
        mockGameEngine.createRoom(nickname, avatar, savedRoom);
      } catch (cause) {
        setRoomEntryError(cause instanceof Error ? cause.message : 'Could not create the room. Please try again.');
        setIsLoading(false);
      } finally {
        roomEntryBusy.current = false;
        setIsCreatingRoom(false);
      }
    }, 1200);
  };

  const handleJoinRoom = (code: string, nickname: string, avatar: AvatarId) => {
    setRoomEntryError('');
    setLoadingTitle('Fun ekata ready da?');
    setIsLoading(true);
    setTimeout(() => {
      mockGameEngine.joinRoom(code, nickname, avatar);
    }, 1200);
  };

  const { room, players, currentPlayerId, answers, roundResults, revealedIndex, timeLeft, totalTime, hasAnswered, hasVoted } = gameState;
  const isHost = room?.hostId === currentPlayerId;

  return (
    <div className="app-shell">
      {/* Printed Logo Loading Screen */}
      <DarkSoulsLoadingScreen
        isActive={isLoading}
        title={loadingTitle}
        durationMs={1500}
        onFinished={() => setIsLoading(false)}
      />

      {/* Top Bar Contract Navigation */}
      <Header
        roomCode={room?.code}
        round={room?.currentRound}
        totalRounds={room?.totalRounds || 10}
        playerCount={players.length}
        onOpenSupabaseConfig={() => setIsSupabaseModalOpen(true)}
        onLeaveRoom={() => mockGameEngine.leaveRoom()}
      />

      {/* Simulator Mode Banner */}
      {import.meta.env.DEV && <MockDataBanner
        isConfigured={isSupabaseReady}
        onOpenSupabaseConfig={() => setIsSupabaseModalOpen(true)}
      />}

      {/* Main Dynamic Viewport */}
      <main className="app-main">
        {roomEntryError && <p className="error-message max-w-xl mx-auto mb-6" role="alert">{roomEntryError}</p>}
        {!room || room.state === 'welcome' ? (
          <WelcomeScreen
            isSubmitting={isCreatingRoom}
            onHostRoom={handleHostRoom}
            onJoinRoom={handleJoinRoom}
          />
        ) : room.state === 'lobby' ? (
          <LobbyScreen
            roomId={room.id}
            onQuestionsSaved={(records) => mockGameEngine.setRoomQuestions(room.id, records.map((record) => ({
              id: `${room.id}:${record.round_no}`,
              category: record.category,
              promptEnglish: record.question,
            })))}
            roomCode={room.code}
            players={players}
            currentPlayerId={currentPlayerId}
            isHost={isHost}
            onStartGame={() => mockGameEngine.startGame()}
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
            onSubmitAnswer={(text) => mockGameEngine.submitAnswer(text)}
          />
        ) : room.state === 'voting' ? (
          <VotingScreen
            currentRound={room.currentRound}
            totalRounds={room.totalRounds}
            prompt={room.currentPrompt}
            answers={answers}
            currentPlayerId={currentPlayerId}
            timeLeft={timeLeft}
            totalTime={totalTime}
            hasVoted={hasVoted}
            onCastVote={(targetId) => mockGameEngine.castVote(targetId)}
          />
        ) : room.state === 'reveal' ? (
          <RevealScreen
            currentRound={room.currentRound}
            totalRounds={room.totalRounds}
            roundResults={roundResults}
            revealedIndex={revealedIndex}
            isHost={isHost}
            onRevealNext={() => mockGameEngine.revealNextCard()}
            onRevealAll={() => mockGameEngine.revealAllCards()}
            onGoToScoreboard={() => mockGameEngine.transitionToScoreboard()}
          />
        ) : room.state === 'scoreboard' ? (
          <ScoreboardScreen
            currentRound={room.currentRound}
            totalRounds={room.totalRounds}
            players={players}
            currentPlayerId={currentPlayerId}
            isHost={isHost}
            onAdvance={() => mockGameEngine.advanceFromScoreboard()}
          />
        ) : room.state === 'winner' ? (
          <WinnerScreen
            players={players}
            currentPlayerId={currentPlayerId}
            isHost={isHost}
            onRematch={() => mockGameEngine.rematch()}
            onLeaveRoom={() => mockGameEngine.leaveRoom()}
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
