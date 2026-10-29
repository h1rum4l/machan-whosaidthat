import type { SupabaseClient } from '@supabase/supabase-js';

export async function createSupabaseRoom(client: SupabaseClient, nickname: string): Promise<{ id: string; code: string }> {
  const cleanNickname = nickname.trim();
  if (cleanNickname.length < 1 || cleanNickname.length > 24) {
    throw new Error('Choose a nickname between 1 and 24 characters, machan.');
  }

  const { data: current, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error(`Could not read your Supabase session: ${sessionError.message}`);
  let user = current.session?.user;
  if (!user) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.session || !data.user) {
      throw new Error(`Could not sign in anonymously: ${error?.message ?? 'No authenticated session was returned.'}`);
    }
    user = data.user;
  }

  const { data, error } = await client.rpc('create_room', { p_nickname: cleanNickname, p_topic: 'mixed' });
  if (error) throw new Error(`Could not create the Supabase room: ${error.message}`);
  const result: unknown = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!result || typeof result !== 'object' || !('room_id' in result) || typeof result.room_id !== 'string' ||
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(result.room_id) ||
      !('room_code' in result) || typeof result.room_code !== 'string' || !/^\d{6}$/.test(result.room_code)) {
    throw new Error('create_room returned an invalid room UUID or six-digit room code. No local room was opened.');
  }

  const { data: room, error: roomError } = await client.schema('public').from('rooms')
    .select('id,host_user_id,status').eq('id', result.room_id).single();
  if (roomError) throw new Error(`The room was created, but host access could not be confirmed: ${roomError.message}`);
  if (!room || room.id !== result.room_id || room.host_user_id !== user.id) {
    throw new Error('The created room does not belong to your authenticated host account.');
  }
  if (room.status !== 'lobby') throw new Error('The created room is no longer in the lobby.');
  return { id: result.room_id, code: result.room_code };
}
