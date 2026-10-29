import { useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../services/supabaseClient';
import {
  createFallbackQuestions,
  generateQuestions,
  getSavedQuestions,
  saveQuestions,
  QuestionGenerationUnavailableError,
  type RoundQuestion,
} from '../services/roomQuestions';

type Phase = 'checking' | 'ready' | 'generating' | 'saving' | 'saved' | 'error';

export function RoomQuestions({ roomId, onSaved }: { roomId: string; onSaved?: (records: RoundQuestion[]) => void }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  const [draft, setDraft] = useState<RoundQuestion[] | null>(null);
  const [fallbackAvailable, setFallbackAvailable] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const operation = useRef(0);
  const onSavedRef = useRef(onSaved);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  const client = () => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase is not configured. Connect your Supabase project before saving questions.');
    return supabase;
  };

  const check = async () => {
    if (busy.current) return;
    busy.current = true;
    const current = ++operation.current;
    setPhase('checking');
    setError('');
    try {
      if (roomId.startsWith('room-')) throw new Error('This is a local demo room. Configure Supabase and create a new room to generate and save questions.');
      const saved = await getSavedQuestions(client(), roomId);
      if (!mounted.current || current !== operation.current) return;
      setChecked(true);
      if (saved) onSavedRef.current?.(saved);
      setPhase(saved ? 'saved' : 'ready');
    } catch (cause) {
      if (!mounted.current || current !== operation.current) return;
      setError(cause instanceof Error ? cause.message : 'Could not check saved questions. Please try again.');
      setPhase('error');
    } finally {
      if (current === operation.current) busy.current = false;
    }
  };

  useEffect(() => {
    mounted.current = true;
    void check();
    return () => {
      mounted.current = false;
      operation.current++;
      busy.current = false;
    };
    // The parent keys this panel by room id so drafts never cross rooms.
  }, []);

  const prepare = async (source: 'generated' | 'fallback' | 'retry') => {
    if (busy.current || phase === 'saved' || !checked) return;
    if (source === 'fallback' && !fallbackAvailable) return;
    busy.current = true;
    const current = ++operation.current;
    setError('');
    if (source === 'generated') setFallbackAvailable(false);
    try {
      const supabase = client();
      setPhase('checking');
      const existing = await getSavedQuestions(supabase, roomId);
      if (!mounted.current || current !== operation.current) return;
      if (existing) {
        onSavedRef.current?.(existing);
        setDraft(null);
        setPhase('saved');
        return;
      }

      let records = draft;
      if (!records) {
        if (source === 'retry') throw new Error('There are no questions waiting to be saved. Check this room again.');
        setPhase(source === 'generated' ? 'generating' : 'saving');
        records = source === 'generated'
          ? await generateQuestions(supabase, roomId)
          : createFallbackQuestions(roomId);
        if (!mounted.current || current !== operation.current) return;
        setDraft(records);
      }

      setPhase('saving');
      const saved = await saveQuestions(supabase, roomId, records);
      if (!mounted.current || current !== operation.current) return;
      onSavedRef.current?.(saved);
      setDraft(null);
      setPhase('saved');
    } catch (cause) {
      if (!mounted.current || current !== operation.current) return;
      if (cause instanceof QuestionGenerationUnavailableError) setFallbackAvailable(true);
      setError(cause instanceof Error ? cause.message : 'Questions could not be saved. Please try again.');
      setPhase('error');
    } finally {
      if (current === operation.current) busy.current = false;
    }
  };

  const pending = ['checking', 'generating', 'saving'].includes(phase);
  const progress = phase === 'checking' ? 'Checking saved questions…'
    : phase === 'generating' ? 'Generating 10 questions…'
    : 'Saving 10 questions…';

  return (
    <section className="paper-panel flex flex-col gap-4" aria-labelledby="room-questions-title" aria-busy={pending}>
      <h2 id="room-questions-title" className="text-2xl font-bold">Questions for this room</h2>
      {phase === 'saved' ? (
        <p role="status" className="body-copy font-semibold">10 questions saved. Ready, machan!</p>
      ) : (
        <>
          <p className="body-copy">Generate 10 fresh AI questions for your room.</p>
          {pending && <p role="status" className="font-semibold">{progress}</p>}
          {error && <p role="alert" className="error-message">{error}</p>}
          {draft && <p className="text-sm">Your questions are ready. Retry saving this same set; no new generation is needed.</p>}
          {!checked && !pending && <button className="btn btn-secondary" onClick={() => void check()}>Check again</button>}
          {draft ? (
            <button className="btn btn-primary" disabled={pending} onClick={() => void prepare('retry')}>Retry saving questions</button>
          ) : (
            <div className="flex flex-col gap-3">
              <button className="btn btn-primary" disabled={pending || !checked} onClick={() => void prepare('generated')}>Generate 10 Questions</button>
              {fallbackAvailable && (
                <>
                  <p className="text-sm">AI is unavailable. Keep this game going with 10 prewritten Sri Lankan English/Singlish questions. Saving still needs a Supabase connection.</p>
                  <button className="btn btn-secondary" disabled={pending || !checked} onClick={() => void prepare('fallback')}>Use fallback questions</button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
