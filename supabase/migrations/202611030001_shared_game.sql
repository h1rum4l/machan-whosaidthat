-- Shared multiplayer state. Existing starter rooms, players and rounds are preserved.
-- Requires public.create_room(p_nickname text, p_topic text) -> (room_id uuid, room_code text).
begin;

create table if not exists public.machan_game_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  phase text not null default 'lobby' check (phase in ('lobby','question','voting','reveal','scoreboard','winner')),
  round_no integer not null default 0 check (round_no between 0 and 10),
  ends_at timestamptz,
  revealed_index integer not null default -1,
  questions jsonb not null default '[]'::jsonb,
  closed boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.machan_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.machan_game_state(room_id) on delete cascade,
  user_id uuid not null,
  nickname text not null check (char_length(nickname) between 1 and 24),
  avatar text not null check (avatar in ('tuktuk','lion','coconut','kottu','teacup','cricket','peacock','mask')),
  score integer not null default 0 check (score >= 0),
  active boolean not null default true,
  playing boolean not null default false,
  joined_at timestamptz not null default clock_timestamp(),
  last_seen timestamptz not null default clock_timestamp(),
  unique (room_id, user_id)
);

create table if not exists public.machan_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.machan_game_state(room_id) on delete cascade,
  round_no integer not null check (round_no between 1 and 10),
  member_id uuid not null references public.machan_members(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 120),
  submitted_at timestamptz not null default clock_timestamp(),
  unique (room_id, round_no, member_id)
);

create table if not exists public.machan_votes (
  room_id uuid not null references public.machan_game_state(room_id) on delete cascade,
  round_no integer not null check (round_no between 1 and 10),
  voter_id uuid not null references public.machan_members(id) on delete cascade,
  answer_id uuid not null references public.machan_answers(id) on delete cascade,
  primary key (room_id, round_no, voter_id)
);

create index if not exists machan_answers_round on public.machan_answers(room_id, round_no);
create index if not exists machan_answers_member on public.machan_answers(member_id);
create index if not exists machan_votes_answer on public.machan_votes(answer_id);
create index if not exists machan_votes_voter on public.machan_votes(voter_id);

alter table public.machan_game_state enable row level security;
alter table public.machan_members enable row level security;
alter table public.machan_answers enable row level security;
alter table public.machan_votes enable row level security;
revoke all on public.machan_game_state, public.machan_members, public.machan_answers, public.machan_votes from public, anon, authenticated;

-- Internal helpers have no API grants. Only authenticated, authorized RPCs call them.
create or replace function public._machan_empty_state()
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_object('room',null,'players','[]'::jsonb,'currentPlayerId','',
    'answers','[]'::jsonb,'votes','[]'::jsonb,'roundResults','[]'::jsonb,
    'revealedIndex',-1,'isHost',false,'timeLeft',0,'totalTime',0,'hasAnswered',false,'hasVoted',false);
$$;

create or replace function public._machan_player(p_member_id uuid)
returns jsonb language sql set search_path = pg_catalog as $$
  select jsonb_build_object('id',m.id,'nickname',m.nickname,'avatar',m.avatar,'score',m.score,
    'isHost',m.user_id=r.host_user_id,'isReady',true,
    'connected',m.active and m.last_seen > clock_timestamp()-interval '45 seconds','isBot',false)
  from public.machan_members m join public.rooms r on r.id=m.room_id where m.id=p_member_id;
$$;

create or replace function public._machan_snapshot(p_room_id uuid, p_member_id uuid)
returns jsonb language plpgsql set search_path = pg_catalog as $$
declare
  s public.machan_game_state%rowtype;
  r public.rooms%rowtype;
  me public.machan_members%rowtype;
  prompt jsonb;
  players jsonb;
  answers jsonb := '[]'::jsonb;
  votes jsonb := '[]'::jsonb;
  results jsonb := '[]'::jsonb;
  host_id uuid;
  is_revealed boolean;
begin
  select * into strict s from public.machan_game_state where room_id=p_room_id;
  select * into strict r from public.rooms where id=p_room_id;
  select * into strict me from public.machan_members where id=p_member_id and room_id=p_room_id;
  select id into strict host_id from public.machan_members where room_id=p_room_id and user_id=r.host_user_id;
  is_revealed := s.phase in ('reveal','scoreboard','winner');
  prompt := s.questions -> greatest(s.round_no-1,0);
  select coalesce(jsonb_agg(public._machan_player(m.id) order by m.joined_at,m.id),'[]'::jsonb)
    into players from public.machan_members m
    where m.room_id=p_room_id and (case when s.phase='lobby' then m.active else m.playing end);

  if s.phase='voting' or is_revealed then
    -- Voting targets are opaque answer UUIDs; roster IDs cannot identify another author.
    select coalesce(jsonb_agg(jsonb_build_object('round',s.round_no,
      'playerId',case when is_revealed or a.member_id=me.id then a.member_id else a.id end,
      'authorNickname',case when is_revealed then m.nickname else '' end,
      'text',a.text,'submittedAt',case when is_revealed then floor(extract(epoch from a.submitted_at)*1000)::bigint else 0 end)
      order by a.id),'[]'::jsonb)
      into answers from public.machan_answers a join public.machan_members m on m.id=a.member_id
      where a.room_id=p_room_id and a.round_no=s.round_no;
  end if;
  if is_revealed then
    select coalesce(jsonb_agg(jsonb_build_object('round',s.round_no,'voterId',v.voter_id,'targetPlayerId',a.member_id)
      order by v.voter_id),'[]'::jsonb)
      into votes from public.machan_votes v join public.machan_answers a on a.id=v.answer_id
      where v.room_id=p_room_id and v.round_no=s.round_no;
    select coalesce(jsonb_agg(jsonb_build_object('playerId',m.id,'authorNickname',m.nickname,
      'avatar',m.avatar,'answerText',a.text,
      'votesReceived',(select coalesce(jsonb_agg(public._machan_player(v.voter_id) order by v.voter_id),'[]'::jsonb)
        from public.machan_votes v where v.answer_id=a.id),
      'pointsEarned',(select count(*)::integer from public.machan_votes v where v.answer_id=a.id)
        * case when s.round_no=10 then 2 else 1 end) order by a.id),'[]'::jsonb)
      into results from public.machan_answers a join public.machan_members m on m.id=a.member_id
      where a.room_id=p_room_id and a.round_no=s.round_no;
  end if;

  return jsonb_build_object(
    'room',jsonb_build_object('id',r.id,'code',r.code,'hostId',host_id,'state',s.phase,
      'currentRound',greatest(s.round_no,1),'totalRounds',10,'category',r.topic,
      'currentPrompt',jsonb_build_object('id',r.id::text||':'||greatest(s.round_no,1)::text,
        'promptEnglish',coalesce(prompt->>'question','Your room questions will appear when the host starts.'),
        'category',coalesce(prompt->>'category','mixed')),
      'createdAt',floor(extract(epoch from s.created_at)*1000)::bigint),
    'players',players,'currentPlayerId',me.id,'answers',answers,'votes',votes,'roundResults',results,
    'revealedIndex',s.revealed_index,'isHost',me.user_id=r.host_user_id,
    'timeLeft',case when s.ends_at is null then 0 else greatest(0,ceil(extract(epoch from s.ends_at-clock_timestamp())))::integer end,
    'totalTime',case s.phase when 'question' then 20 when 'voting' then 15 else 0 end,
    'hasAnswered',exists(select 1 from public.machan_answers where room_id=p_room_id and round_no=s.round_no and member_id=me.id),
    'hasVoted',exists(select 1 from public.machan_votes where room_id=p_room_id and round_no=s.round_no and voter_id=me.id),
    'serverNow',floor(extract(epoch from clock_timestamp())*1000)::bigint,
    'phaseEndsAt',case when s.ends_at is null then null else floor(extract(epoch from s.ends_at)*1000)::bigint end);
end;
$$;

-- Caller holds the room and state row locks. Each phase can score only once.
create or replace function public._machan_progress(p_room_id uuid)
returns void language plpgsql set search_path = pg_catalog as $$
declare s public.machan_game_state%rowtype;
begin
  select * into strict s from public.machan_game_state where room_id=p_room_id;
  if s.phase='question' and (s.ends_at <= clock_timestamp() or not exists (
    select 1 from public.machan_members m where m.room_id=p_room_id and m.active and m.playing
      and not exists(select 1 from public.machan_answers a where a.room_id=p_room_id and a.round_no=s.round_no and a.member_id=m.id)
  )) then
    update public.machan_game_state set phase='voting',ends_at=clock_timestamp()+interval '15 seconds' where room_id=p_room_id;
    update public.rooms set status='voting',phase_ends_at=clock_timestamp()+interval '15 seconds' where id=p_room_id;
    select * into strict s from public.machan_game_state where room_id=p_room_id;
  end if;
  if s.phase='voting' and (s.ends_at <= clock_timestamp() or not exists (
    select 1 from public.machan_members m where m.room_id=p_room_id and m.active and m.playing
      and exists(select 1 from public.machan_answers a where a.room_id=p_room_id and a.round_no=s.round_no and a.member_id<>m.id)
      and not exists(select 1 from public.machan_votes v where v.room_id=p_room_id and v.round_no=s.round_no and v.voter_id=m.id)
  )) then
    update public.machan_members m set score=m.score+points.earned
      from (select a.member_id,count(v.*)::integer*case when s.round_no=10 then 2 else 1 end as earned
        from public.machan_answers a join public.machan_votes v on v.answer_id=a.id
        where a.room_id=p_room_id and a.round_no=s.round_no group by a.member_id) points
      where m.id=points.member_id and m.room_id=p_room_id;
    update public.machan_game_state set phase='reveal',ends_at=null,
      revealed_index=case when exists(select 1 from public.machan_answers where room_id=p_room_id and round_no=s.round_no) then 0 else -1 end
      where room_id=p_room_id;
    update public.rooms set status='reveal',phase_ends_at=null where id=p_room_id;
  end if;
end;
$$;

create or replace function public.machan_game(p_room_id uuid, p_action text default 'read', p_text text default null, p_target uuid default null, p_expected_round integer default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  uid uuid := auth.uid();
  r public.rooms%rowtype;
  s public.machan_game_state%rowtype;
  me public.machan_members%rowtype;
  target public.machan_answers%rowtype;
  clean text;
  prepared jsonb;
  result_count integer;
begin
  if uid is null then raise exception 'Sign in before joining a game.' using errcode='42501'; end if;
  if p_action is null or p_action not in ('read','start','answer','vote','reveal_next','reveal_all','scoreboard','next','rematch','leave') then
    raise exception 'Unknown game action.' using errcode='22023';
  end if;
  -- All entry points lock in this order, including concurrent joins and room controls.
  select * into r from public.rooms where id=p_room_id for update;
  if not found then raise exception 'Room not found.' using errcode='P0002'; end if;
  select * into s from public.machan_game_state where room_id=p_room_id for update;
  if not found then raise exception 'This room does not support shared play. Ask the host to create a new room.' using errcode='P0002'; end if;
  if s.closed then raise exception 'The host has closed this room.' using errcode='P0002'; end if;
  select * into me from public.machan_members where room_id=p_room_id and user_id=uid;
  if not found or not me.active then raise exception 'Join this room before playing.' using errcode='42501'; end if;
  update public.machan_members set last_seen=clock_timestamp() where id=me.id;
  if p_action='leave' then
    update public.machan_members set active=false,last_seen=clock_timestamp() where id=me.id;
    if uid=r.host_user_id then
      update public.machan_game_state set closed=true,ends_at=null where room_id=p_room_id;
      update public.rooms set status='finished',phase_ends_at=null where id=p_room_id;
    end if;
    return public._machan_empty_state();
  end if;
  if p_action in ('start','reveal_next','reveal_all','scoreboard','next','rematch') and uid<>r.host_user_id then
    raise exception 'Only the host can control the game.' using errcode='42501';
  end if;
  perform public._machan_progress(p_room_id);
  select * into strict s from public.machan_game_state where room_id=p_room_id;
  if (p_action in ('answer','vote') and p_expected_round is null)
    or (p_action in ('answer','vote','reveal_next','reveal_all','scoreboard','next','rematch')
      and p_expected_round is not null and p_expected_round<>s.round_no) then
    raise exception 'This round has changed. Refresh the game before trying again.' using errcode='22023';
  end if;

  if p_action='start' then
    if s.phase<>'lobby' then raise exception 'The game has already started.'; end if;
    if (select count(*) from public.machan_members where room_id=p_room_id and active and last_seen>clock_timestamp()-interval '45 seconds')<3 then
      raise exception 'At least 3 connected players are required to start.';
    end if;
    prepared := s.questions;
    if jsonb_array_length(prepared)=0 then
      if (select count(*) from public.rounds where room_id=p_room_id)<>10
        or (select count(distinct round_no) from public.rounds where room_id=p_room_id and round_no between 1 and 10)<>10
        or exists(select 1 from public.rounds where room_id=p_room_id and (question is null or char_length(btrim(question)) not between 8 and 130))
        or (select count(distinct lower(regexp_replace(btrim(question),'\s+',' ','g'))) from public.rounds where room_id=p_room_id)<>10 then
        raise exception 'Save exactly 10 valid, distinct questions before starting.';
      end if;
      select jsonb_agg(jsonb_build_object('question',btrim(question),'category',left(coalesce(nullif(btrim(category),''),'mixed'),40)) order by round_no)
        into prepared from public.rounds where room_id=p_room_id;
    end if;
    update public.machan_members set playing=active where room_id=p_room_id;
    update public.machan_game_state set phase='question',round_no=1,ends_at=clock_timestamp()+interval '20 seconds',revealed_index=-1,questions=prepared where room_id=p_room_id;
    update public.rooms set status='answering',round_no=1,phase_ends_at=clock_timestamp()+interval '20 seconds' where id=p_room_id;
  elsif p_action='answer' then
    if s.phase<>'question' or not me.playing then raise exception 'Answers are closed for this round.'; end if;
    clean := btrim(regexp_replace(coalesce(p_text,''),'\s+',' ','g'));
    if char_length(clean) not between 1 and 120 or cardinality(string_to_array(clean,' '))>6 then
      raise exception 'Answers must contain 1–6 words and at most 120 characters.' using errcode='22023';
    end if;
    if exists(select 1 from public.machan_answers where room_id=p_room_id and round_no=s.round_no and member_id=me.id) then
      raise exception 'Your answer is already saved for this round.' using errcode='23505';
    end if;
    insert into public.machan_answers(room_id,round_no,member_id,text) values(p_room_id,s.round_no,me.id,clean);
  elsif p_action='vote' then
    if s.phase<>'voting' or not me.playing then raise exception 'Voting is closed for this round.'; end if;
    select * into target from public.machan_answers where id=p_target and room_id=p_room_id and round_no=s.round_no;
    if not found then raise exception 'Choose an answer from this round.' using errcode='22023'; end if;
    if target.member_id=me.id then raise exception 'You cannot vote for your own answer.' using errcode='22023'; end if;
    if exists(select 1 from public.machan_votes where room_id=p_room_id and round_no=s.round_no and voter_id=me.id) then
      raise exception 'Your vote is already saved for this round.' using errcode='23505';
    end if;
    insert into public.machan_votes(room_id,round_no,voter_id,answer_id) values(p_room_id,s.round_no,me.id,target.id);
  elsif p_action in ('reveal_next','reveal_all','scoreboard') then
    if s.phase<>'reveal' then raise exception 'This round is not revealing answers.'; end if;
    select count(*)::integer into result_count from public.machan_answers where room_id=p_room_id and round_no=s.round_no;
    if p_action='reveal_next' then
      update public.machan_game_state set revealed_index=least(revealed_index+1,result_count-1) where room_id=p_room_id;
    elsif p_action='reveal_all' then
      update public.machan_game_state set revealed_index=result_count-1 where room_id=p_room_id;
    else
      if s.revealed_index<result_count-1 then raise exception 'Reveal all answers before opening the leaderboard.'; end if;
      update public.machan_game_state set phase='scoreboard' where room_id=p_room_id;
    end if;
  elsif p_action='next' then
    if s.phase<>'scoreboard' then raise exception 'Open the leaderboard before advancing.'; end if;
    if s.round_no=10 then
      update public.machan_game_state set phase='winner',ends_at=null where room_id=p_room_id;
      update public.rooms set status='finished',phase_ends_at=null where id=p_room_id;
    else
      update public.machan_game_state set phase='question',round_no=round_no+1,ends_at=clock_timestamp()+interval '20 seconds',revealed_index=-1 where room_id=p_room_id;
      update public.rooms set status='answering',round_no=s.round_no+1,phase_ends_at=clock_timestamp()+interval '20 seconds' where id=p_room_id;
    end if;
  elsif p_action='rematch' then
    if s.phase<>'winner' then raise exception 'Finish the game before starting a rematch.'; end if;
    delete from public.machan_votes where room_id=p_room_id;
    delete from public.machan_answers where room_id=p_room_id;
    update public.machan_members set score=0,playing=false where room_id=p_room_id;
    update public.machan_game_state set phase='lobby',round_no=0,ends_at=null,revealed_index=-1 where room_id=p_room_id;
    update public.rooms set status='lobby',round_no=0,phase_ends_at=null where id=p_room_id;
  end if;
  perform public._machan_progress(p_room_id);
  return public._machan_snapshot(p_room_id,me.id);
end;
$$;

create or replace function public.machan_host_room(p_nickname text, p_avatar text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare uid uuid:=auth.uid(); clean text:=btrim(regexp_replace(coalesce(p_nickname,''),'\s+',' ','g')); new_id uuid; new_code text;
begin
  if uid is null then raise exception 'Sign in before creating a room.' using errcode='42501'; end if;
  if char_length(clean) not between 1 and 24 then raise exception 'Choose a nickname between 1 and 24 characters.' using errcode='22023'; end if;
  if p_avatar is null or p_avatar not in ('tuktuk','lion','coconut','kottu','teacup','cricket','peacock','mask') then
    raise exception 'Choose a valid avatar.' using errcode='22023';
  end if;
  select c.room_id,c.room_code into strict new_id,new_code from public.create_room(p_nickname=>clean,p_topic=>'mixed') c;
  if new_code !~ '^[0-9]{6}$' or not exists(select 1 from public.rooms where id=new_id and code=new_code and host_user_id=uid and status='lobby') then
    raise exception 'The starter could not create an owned lobby room.';
  end if;
  insert into public.machan_game_state(room_id) values(new_id);
  insert into public.machan_members(room_id,user_id,nickname,avatar) values(new_id,uid,clean,p_avatar);
  return public.machan_game(new_id,'read');
end;
$$;

create or replace function public.machan_join_room(p_code text, p_nickname text, p_avatar text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  uid uuid:=auth.uid(); clean_code text:=btrim(coalesce(p_code,'')); clean text:=btrim(regexp_replace(coalesce(p_nickname,''),'\s+',' ','g'));
  r public.rooms%rowtype; s public.machan_game_state%rowtype; me public.machan_members%rowtype;
begin
  if uid is null then raise exception 'Sign in before joining a room.' using errcode='42501'; end if;
  if clean_code !~ '^[0-9]{6}$' then raise exception 'Enter the six-digit room code.' using errcode='22023'; end if;
  if char_length(clean) not between 1 and 24 then raise exception 'Choose a nickname between 1 and 24 characters.' using errcode='22023'; end if;
  if p_avatar is null or p_avatar not in ('tuktuk','lion','coconut','kottu','teacup','cricket','peacock','mask') then
    raise exception 'Choose a valid avatar.' using errcode='22023';
  end if;
  select * into r from public.rooms where rooms.code=clean_code for update;
  if not found then raise exception 'Room not found. Check the code with your host.' using errcode='P0002'; end if;
  select * into s from public.machan_game_state where room_id=r.id for update;
  if not found then raise exception 'This room was created with an older app. Ask the host to create a new room.' using errcode='P0002'; end if;
  if s.closed then raise exception 'The host has closed this room.' using errcode='P0002'; end if;
  select * into me from public.machan_members where room_id=r.id and user_id=uid;
  if s.phase<>'lobby' and (me.id is null or not me.playing) then raise exception 'The game has already started. Wait for a rematch.'; end if;
  if (me.id is null or not me.active) and (select count(*) from public.machan_members where room_id=r.id and active)>=10 then
    raise exception 'This room is full (10 players).';
  end if;
  if me.id is null then
    insert into public.machan_members(room_id,user_id,nickname,avatar) values(r.id,uid,clean,p_avatar);
  else
    update public.machan_members set active=true,last_seen=clock_timestamp(),
      nickname=case when s.phase='lobby' then clean else nickname end,
      avatar=case when s.phase='lobby' then p_avatar else avatar end where id=me.id;
  end if;
  return public.machan_game(r.id,'read');
end;
$$;

revoke all on function public._machan_empty_state() from public,anon,authenticated;
revoke all on function public._machan_player(uuid) from public,anon,authenticated;
revoke all on function public._machan_snapshot(uuid,uuid) from public,anon,authenticated;
revoke all on function public._machan_progress(uuid) from public,anon,authenticated;
revoke all on function public.machan_game(uuid,text,text,uuid,integer) from public,anon,authenticated;
revoke all on function public.machan_host_room(text,text) from public,anon,authenticated;
revoke all on function public.machan_join_room(text,text,text) from public,anon,authenticated;
grant execute on function public.machan_game(uuid,text,text,uuid,integer) to authenticated;
grant execute on function public.machan_host_room(text,text) to authenticated;
grant execute on function public.machan_join_room(text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
