// Deploy with user-JWT authentication enabled. Secrets stay in Supabase.
import { withSupabase } from 'npm:@supabase/server@1';
import { geminiFailure, geminiModel } from './gemini.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

    let body: { roomId?: string };
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body?.roomId || typeof body.roomId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.roomId)) {
      return json({ error: 'roomId must be a UUID' }, 400);
    }
    const { data: room, error: roomError } = await ctx.supabase
      .from('rooms').select('id,host_user_id,topic,status').eq('id', body.roomId).single();
    if (roomError || !room) return json({ error: 'Room not found' }, 404);
    if (room.host_user_id !== ctx.userClaims?.id) return json({ error: 'Host only' }, 403);
    if (room.status !== 'lobby') return json({ error: 'Game already started' }, 409);
    const { count, error: countError } = await ctx.supabase
      .from('rounds').select('round_no', { count: 'exact', head: true }).eq('room_id', body.roomId);
    if (countError) return json({ error: 'Cannot check questions' }, 500);
    if (count && count > 0) return json({ error: 'Questions already saved' }, 409);

    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'Missing server-side GEMINI_API_KEY secret' }, 500);
    let model: string;
    try { model = geminiModel(Deno.env.get('GEMINI_MODEL')); }
    catch { return json({ error: 'Invalid server-side GEMINI_MODEL. Set a model ID, not a URL.' }, 500); }

    const instruction = `Generate EXACTLY 10 original, short, hilarious party-game QUESTIONS.
Theme: Sri Lankan young adults and university friends. Mode: ${room.topic}.
Use English and Singlish (romanized Sinhala in English letters), never require Sinhala script.
Questions should be immediately understandable and inspire witty answers in 1-6 words.
Variety: campus, lecturers, jobs, tuk-tuks, relatives, social media, safe political satire.
Politics must be hypothetical, about public behavior, not unverified claims or crimes.
No slurs, hate, explicit sexual material, graphic violence, tragedy/victim mockery,
identifiable private-person accusations, or invented news presented as real.
You have no live news feed. Do NOT claim any specific incident is current.
Return JSON with property "questions": array of 10 objects, each with
"question" (8 to 130 characters) and "category" (short ASCII label).
No extra text.`;

    let apiRes: Response;
    try {
      apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: instruction }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      });
    } catch { return json({ error: 'Could not reach Gemini. Use fallback questions or try again later.' }, 502); }
    if (!apiRes.ok) {
      const detail = await geminiFailure(apiRes, key);
      console.error('Gemini request failed', { model, status: apiRes.status, detail });
      if (apiRes.status === 400) return json({
        error: `Gemini rejected the request (400): ${detail}. Use fallback questions for now.`,
      }, 502);
      if (apiRes.status === 404) return json({
        error: 'Gemini model unavailable (404). The host must check the server GEMINI_MODEL setting and model access. Use fallback questions for now.',
      }, 502);
      if (apiRes.status === 429) return json({ error: 'Gemini is rate-limited. Use fallback questions or try again later.' }, 429);
      return json({ error: `Gemini request failed (${apiRes.status}). Use fallback questions or check the function logs.` }, 502);
    }

    try {
      const apiJson = await apiRes.json();
      const raw = apiJson.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
      const items = JSON.parse(raw).questions;
      if (!Array.isArray(items) || items.length !== 10) throw Error('Expected 10 questions');
      const questions = items.map((q: { question?: unknown; category?: unknown }, i: number) => {
        if (!q || typeof q.question !== 'string') throw Error('Invalid question');
        return {
          room_id: room.id, round_no: i + 1, question: q.question.trim(),
          category: typeof q.category === 'string' ? q.category.trim().slice(0, 40) || 'mixed' : 'mixed',
        };
      });
      if (questions.some(q => q.question.length < 8 || q.question.length > 130)) throw Error('Invalid question length');
      if (new Set(questions.map(q => q.question.replace(/\s+/g, ' ').toLowerCase())).size !== 10) throw Error('Duplicate question');
      return json({ questions });
    } catch {
      console.error('Could not validate Gemini output');
      return json({ error: 'AI returned invalid questions; try again' }, 502);
    }
  }),
};
