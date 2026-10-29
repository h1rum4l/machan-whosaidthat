import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type SupabaseClient,
} from '@supabase/supabase-js';

export interface RoundQuestion {
  room_id: string;
  round_no: number;
  question: string;
  category: string;
}

export class QuestionGenerationUnavailableError extends Error {}

function message(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unknown error';
}

function validateQuestions(value: unknown, roomId: string): RoundQuestion[] {
  if (!Array.isArray(value) || value.length !== 10) {
    throw new Error('Expected exactly 10 questions. Nothing was saved.');
  }
  const rounds = new Set<number>();
  const questions = new Set<string>();
  const records = value.map((row: unknown) => {
    if (!row || typeof row !== 'object' || !('room_id' in row) || row.room_id !== roomId ||
      !('round_no' in row) || typeof row.round_no !== 'number' || !Number.isInteger(row.round_no) ||
      row.round_no < 1 || row.round_no > 10 || !('question' in row) || typeof row.question !== 'string' ||
      row.question.trim().length < 8 || row.question.trim().length > 130 ||
      ('category' in row && row.category !== undefined && typeof row.category !== 'string')) {
      throw new Error('Questions must belong to this room, include rounds 1–10 and have 8–130 characters with a text category. Nothing was saved.');
    }
    const normalized = row.question.trim().replace(/\s+/g, ' ').toLowerCase();
    if (rounds.has(row.round_no) || questions.has(normalized)) {
      throw new Error('Duplicate rounds or questions were returned. Nothing was saved.');
    }
    rounds.add(row.round_no);
    questions.add(normalized);
    const category = 'category' in row && typeof row.category === 'string' ? row.category.trim().slice(0, 40) : '';
    return { room_id: roomId, round_no: row.round_no, question: row.question.trim(), category: category || 'mixed' };
  });
  return records.sort((a, b) => a.round_no - b.round_no);
}

async function requireRoom(client: SupabaseClient, roomId: string): Promise<void> {
  if (!roomId.trim()) throw new Error('A saved Supabase room ID is required.');
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) {
    throw new Error('The host must be signed in to Supabase before generating or saving questions.');
  }
  const { data, error } = await client.schema('public').from('rooms').select('id,host_user_id,status').eq('id', roomId).maybeSingle();
  if (error) throw new Error(`Could not verify the saved room: ${message(error)}`);
  if (!data) throw new Error('This room has not been saved in Supabase, or the host cannot access it.');
  if (data.host_user_id !== auth.user.id) throw new Error('Only this room\'s authenticated host can generate or save questions.');
  if (data.status !== 'lobby') throw new Error('Questions can only be generated or saved while the room is in the lobby.');
}

export async function getSavedQuestions(client: SupabaseClient, roomId: string): Promise<RoundQuestion[] | null> {
  await requireRoom(client, roomId);
  const { data, error } = await client.schema('public').from('rounds')
    .select('room_id,round_no,question,category').eq('room_id', roomId).order('round_no');
  if (error) throw new Error(`Could not check saved questions: ${message(error)}`);
  if (Array.isArray(data) && data.length === 0) return null;
  try {
    return validateQuestions(data, roomId);
  } catch {
    throw new Error('This room has an incomplete or invalid saved question set. Ask the host to repair it before continuing; existing rounds were not changed.');
  }
}

async function functionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    let detail = '';
    try {
      const body: unknown = await response.clone().json();
      if (body && typeof body === 'object') {
        detail = 'error' in body ? message(body.error) : message(body);
      }
    } catch {
      // HTTP status still explains failures when a proxy returns non-JSON.
    }
    if (response.status === 401 || response.status === 403) {
      return new Error(`Generation was not authorized. Sign in as this room's host and try again.${detail ? ` ${detail}` : ''}`);
    }
    if (response.status === 429) {
      return new QuestionGenerationUnavailableError('Question generation is rate-limited. Use fallback questions, or try again later.');
    }
    if (response.status >= 500) {
      return new QuestionGenerationUnavailableError(`Question generation is unavailable. Use fallback questions, or try again later.${detail ? ` ${detail}` : ''}`);
    }
    return new Error(`Question generation failed (HTTP ${response.status}).${detail ? ` ${detail}` : ''}`);
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return new QuestionGenerationUnavailableError('Could not reach question generation. Check your connection or use fallback questions.');
  }
  return new Error(`Question generation failed: ${message(error)}. Please try again.`);
}

export async function generateQuestions(client: SupabaseClient, roomId: string): Promise<RoundQuestion[]> {
  const saved = await getSavedQuestions(client, roomId);
  if (saved) return saved;
  let result;
  try {
    result = await client.functions.invoke('generate-questions', { body: { roomId } });
  } catch (error) {
    throw await functionError(error);
  }
  if (result.error) throw await functionError(result.error);
  const payload: unknown = result.data;
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error) {
    const detail = message(payload.error);
    if (/quota|rate.?limit|resource.?exhausted|unavailable/i.test(detail)) {
      throw new QuestionGenerationUnavailableError(`Question generation failed: ${detail}. You can use fallback questions instead.`);
    }
    throw new Error(`Question generation failed: ${detail}. Please try again.`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('questions' in payload)) {
    throw new Error('Question generation returned an invalid response; expected a questions array. Nothing was saved.');
  }
  return validateQuestions(payload.questions, roomId);
}

export async function saveQuestions(client: SupabaseClient, roomId: string, records: RoundQuestion[]): Promise<RoundQuestion[]> {
  const saved = await getSavedQuestions(client, roomId);
  if (saved) return saved;
  const validated = validateQuestions(records, roomId);
  const { error } = await client.schema('public').from('rounds').insert(validated);
  if (error && error.code !== '23505') {
    throw new Error(`Could not save questions: ${message(error)}. Retry saving these questions; no new generation is needed.`);
  }
  const confirmed = await getSavedQuestions(client, roomId);
  if (!confirmed) {
    throw new Error(error
      ? 'A duplicate round prevented saving, but no complete question set could be read. Check the room permissions and existing rounds.'
      : 'Saving completed but the questions could not be confirmed. Check the room permissions before retrying.');
  }
  return confirmed;
}

export function createFallbackQuestions(roomId: string): RoundQuestion[] {
  const curated = [
    { category: 'banter', question: 'What should you never say to an angry Sri Lankan Amma? / Amma, mata bath epa!' },
    { category: 'relatable', question: "The tuk-tuk meter is broken. What is the real fare? / Meter kadila, shape eke yamu machan!" },
    { category: 'party', question: 'How do you win at a wedding buffet? / Last watalappam eka kawda ganne?' },
    { category: 'banter', question: "Your friend says '5 minutes, machan!' Where are they? / Thama gedara da?" },
    { category: 'relatable', question: "What does every Sri Lankan dad keep in his car? / Thaaththa gaawa mokakda thiyenne?" },
    { category: 'party', question: 'What gets you kicked out of a baila session? / Papare band eka nawaththuwada?' },
    { category: 'relatable', question: 'Your best excuse for being late to Galle Face? / Galle Road eke traffic machan!' },
    { category: 'food', question: "What is your 2:30 AM Colombo food order? / Cheese kottu da, roast paan da?" },
    { category: 'banter', question: 'What does the neighbourhood auntie ask at every party? / Putha, thama job ekak nadda?' },
    { category: 'party', question: 'FINALE: Describe this friend group in 6 words! / Full aathal machan, baila patan gamu!' },
  ];
  return validateQuestions(curated.map((prompt, index) => ({
    room_id: roomId,
    round_no: index + 1,
    question: prompt.question,
    category: prompt.category,
  })), roomId);
}
