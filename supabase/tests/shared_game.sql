-- Execute AFTER the migration in a disposable local database. All test data rolls back.
begin;
create function pg_temp.check_game(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Shared-game test failed: %',message; end if; end;
$$;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role anon;
do $$ begin
  begin
    perform public.machan_host_room('Denied anonymous role','lion');
    raise exception 'Anonymous database role unexpectedly executed host RPC';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  perform public.machan_host_room('Authenticated RPC role','lion');
  begin
    perform id from public.machan_answers;
    raise exception 'Authenticated role unexpectedly read answers directly';
  exception when insufficient_privilege then null; end;
  begin
    perform public._machan_empty_state();
    raise exception 'Authenticated role unexpectedly executed private helper';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$
declare
  host_uid uuid:='11111111-1111-4111-8111-111111111111';
  guest_uid uuid:='22222222-2222-4222-8222-222222222222';
  third_uid uuid:='33333333-3333-4333-8333-333333333333';
  outsider_uid uuid:='44444444-4444-4444-8444-444444444444';
  state jsonb; host_state jsonb; guest_state jsonb; third_state jsonb;
  room uuid; room_code text; host_id uuid; guest_id uuid; third_id uuid;
  capacity_room uuid; capacity_code text; cross_answer uuid;
  answer_host uuid; answer_guest uuid; answer_third uuid;
  room_before bigint; player_before bigint;
  n integer; round_index integer;
begin
  perform pg_temp.check_game(not has_table_privilege('authenticated','public.machan_answers','select'),'answers must not be readable directly');
  perform pg_temp.check_game(not has_table_privilege('authenticated','public.machan_votes','insert'),'votes must not be inserted directly');
  perform pg_temp.check_game(not has_function_privilege('anon','public.machan_host_room(text,text)','execute'),'anonymous role must not execute host RPC');
  perform pg_temp.check_game(not has_function_privilege('authenticated','public._machan_snapshot(uuid,uuid)','execute'),'private snapshot helper must not be exposed');
  perform pg_temp.check_game((select bool_and(relrowsecurity) from pg_class where oid in (
    'public.machan_game_state'::regclass,'public.machan_members'::regclass,'public.machan_answers'::regclass,'public.machan_votes'::regclass)), 'RLS must be enabled');
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.machan_host_room('No auth','lion');
    raise exception 'Unauthenticated host unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',host_uid::text,true);
  select count(*) into room_before from public.rooms;
  select count(*) into player_before from public.players;
  host_state:=public.machan_host_room('Kasun','tuktuk');
  room:=(host_state#>>'{room,id}')::uuid; room_code:=host_state#>>'{room,code}';
  perform pg_temp.check_game(room_code ~ '^0[0-9]{5}$','leading zeroes in room codes survive snapshots');
  host_id:=(host_state->>'currentPlayerId')::uuid;
  perform pg_temp.check_game(jsonb_array_length(host_state->'players')=1,'new room contains only the real host');
  perform pg_temp.check_game(host_state->>'isHost'='true' and (host_state#>>'{room,hostId}')::uuid=host_id,'host identity is the member UUID');
  perform pg_temp.check_game((select count(*)=room_before+1 from public.rooms) and (select count(*)=player_before+1 from public.players),'existing create_room creates the starter room/host exactly once');
  begin
    perform public.machan_game(room,'start');
    raise exception 'Start with one player unexpectedly allowed';
  exception when raise_exception then
    if sqlerrm not like 'At least 3 connected players%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',outsider_uid::text,true);
  begin
    perform public.machan_game(room,'read');
    raise exception 'Outsider read unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.machan_join_room('ABC123','Outsider','lion');
    raise exception 'Alphabetic fake code unexpectedly allowed';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.machan_join_room('999999','Outsider','lion');
    raise exception 'Unknown code unexpectedly allowed';
  exception when no_data_found then null; end;

  perform set_config('request.jwt.claim.sub',guest_uid::text,true);
  guest_state:=public.machan_join_room(room_code,'Shenali','peacock');
  guest_id:=(guest_state->>'currentPlayerId')::uuid;
  perform pg_temp.check_game(guest_state#>>'{room,id}'=room::text and guest_state#>>'{room,hostId}'=host_id::text,'guest joins same UUID and real host');
  perform pg_temp.check_game(guest_state->>'isHost'='false','guest is not promoted to host');
  state:=public.machan_join_room(room_code,'Shenali','peacock');
  perform pg_temp.check_game(jsonb_array_length(state->'players')=2 and state->>'currentPlayerId'=guest_id::text,'rejoining is idempotent');
  begin
    perform public.machan_game(room,'start');
    raise exception 'Guest start unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',third_uid::text,true);
  third_state:=public.machan_join_room(room_code,'Nimal','kottu');
  third_id:=(third_state->>'currentPlayerId')::uuid;
  perform pg_temp.check_game(jsonb_array_length(third_state->'players')=3,'three real members share the roster');
  perform set_config('request.jwt.claim.sub',host_uid::text,true);
  begin
    perform public.machan_game(room,'start');
    raise exception 'Start without questions unexpectedly allowed';
  exception when raise_exception then
    if sqlerrm not like 'Save exactly 10 valid%' then raise; end if;
  end;
  insert into public.rounds(room_id,round_no,question,category)
    select room,series.round_number,'What is your funniest Sri Lankan excuse number '||series.round_number||'?','mixed'
    from generate_series(1,10) as series(round_number);

  -- Capacity and distinct-room isolation are enforced server-side.
  state:=public.machan_host_room('Other host','lion');
  capacity_room:=(state#>>'{room,id}')::uuid; capacity_code:=state#>>'{room,code}';
  for n in 2..10 loop
    perform set_config('request.jwt.claim.sub',('00000000-0000-4000-8000-'||lpad(n::text,12,'0')),true);
    state:=public.machan_join_room(capacity_code,'Player '||n,'lion');
  end loop;
  perform pg_temp.check_game(jsonb_array_length(state->'players')=10,'ten player capacity is allowed');
  perform set_config('request.jwt.claim.sub',outsider_uid::text,true);
  begin
    perform public.machan_join_room(capacity_code,'Eleventh','lion');
    raise exception 'Eleventh member unexpectedly allowed';
  exception when raise_exception then
    if sqlerrm not like 'This room is full%' then raise; end if;
  end;
  insert into public.machan_answers(room_id,round_no,member_id,text)
    select capacity_room,1,id,'Other room answer' from public.machan_members where room_id=capacity_room limit 1
    returning id into cross_answer;

  perform set_config('request.jwt.claim.sub',host_uid::text,true);
  state:=public.machan_game(room,'start');
  perform pg_temp.check_game(state#>>'{room,state}'='question' and state->>'timeLeft'='30' and state->>'totalTime'='30','server starts the 30-second answer deadline');
  perform pg_temp.check_game(state#>>'{room,currentPrompt,promptEnglish}'='What is your funniest Sri Lankan excuse number 1?','saved first question is used');
  update public.rounds set question='This changed after the game started' where room_id=room and round_no=1;
  state:=public.machan_game(room,'read');
  perform pg_temp.check_game(state#>>'{room,currentPrompt,promptEnglish}'='What is your funniest Sri Lankan excuse number 1?','active question set is frozen at start');
  perform set_config('request.jwt.claim.sub',outsider_uid::text,true);
  begin
    perform public.machan_join_room(room_code,'Late arrival','lion');
    raise exception 'New midgame member unexpectedly allowed';
  exception when raise_exception then
    if sqlerrm not like 'The game has already started%' then raise; end if;
  end;

  for round_index in 1..10 loop
    if round_index=2 then
      perform set_config('request.jwt.claim.sub',host_uid::text,true);
      begin
        perform public.machan_game(room,'answer','Delayed previous round answer',p_expected_round=>1);
        raise exception 'A delayed prior-round answer unexpectedly saved';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.machan_game(room,'vote',null,answer_guest,1);
        raise exception 'A delayed prior-round vote unexpectedly saved';
      exception when invalid_parameter_value then null; end;
      perform pg_temp.check_game(not exists(select 1 from public.machan_answers where room_id=room and round_no=2), 'stale actions cannot create current-round records');
      -- Expiry advances shared state without inventing answers or votes.
      update public.machan_game_state set ends_at=clock_timestamp()-interval '1 second' where room_id=room;
      perform set_config('request.jwt.claim.sub',guest_uid::text,true);
      state:=public.machan_game(room,'read');
      perform pg_temp.check_game(state#>>'{room,state}'='reveal' and jsonb_array_length(state->'answers')=0 and jsonb_array_length(state->'votes')=0,'empty timed-out round has no fabricated activity');
    else
      perform set_config('request.jwt.claim.sub',host_uid::text,true);
      if round_index=1 then
        begin
          perform public.machan_game(room,'answer','Missing round binding');
          raise exception 'Answer without an expected round unexpectedly allowed';
        exception when invalid_parameter_value then null; end;
        begin
          perform public.machan_game(room,'answer','One two three four five six seven',p_expected_round=>round_index);
          raise exception 'Overlong answer unexpectedly allowed';
        exception when invalid_parameter_value then null; end;
      end if;
      host_state:=public.machan_game(room,'answer','Amma knows everything',p_expected_round=>round_index);
      perform pg_temp.check_game(jsonb_array_length(host_state->'answers')=0,'answers remain private during answering');
      if round_index=1 then
        begin
          perform public.machan_game(room,'answer','A second answer',p_expected_round=>round_index);
          raise exception 'Duplicate answer unexpectedly allowed';
        exception when unique_violation then null; end;
      end if;
      perform set_config('request.jwt.claim.sub',guest_uid::text,true);
      guest_state:=public.machan_game(room,'answer','Meter is broken machan',p_expected_round=>round_index);
      perform set_config('request.jwt.claim.sub',third_uid::text,true);
      third_state:=public.machan_game(room,'answer','Kottu before everything machan',p_expected_round=>round_index);
      perform pg_temp.check_game(third_state#>>'{room,state}'='voting','last answer advances every client to voting');
      perform pg_temp.check_game(jsonb_array_length(third_state->'answers')=3,'all submitted answers become visible for voting');
      perform pg_temp.check_game(not exists(select 1 from jsonb_array_elements(third_state->'answers') a where a->>'authorNickname'<>'' or a->>'submittedAt'<>'0'),'voting does not expose names or submission timing');
      perform pg_temp.check_game(not exists(select 1 from jsonb_array_elements(third_state->'answers') a where a->>'playerId' in (host_id::text,guest_id::text)),'other authors cannot be matched to roster IDs');
      select id into answer_host from public.machan_answers where room_id=room and round_no=round_index and member_id=host_id;
      select id into answer_guest from public.machan_answers where room_id=room and round_no=round_index and member_id=guest_id;
      select id into answer_third from public.machan_answers where room_id=room and round_no=round_index and member_id=third_id;
      perform set_config('request.jwt.claim.sub',host_uid::text,true);
      if round_index=1 then
        begin
          perform public.machan_game(room,'vote',null,answer_host,round_index);
          raise exception 'Self-vote unexpectedly allowed';
        exception when invalid_parameter_value then null; end;
        begin
          perform public.machan_game(room,'vote',null,cross_answer,round_index);
          raise exception 'Cross-room vote unexpectedly allowed';
        exception when invalid_parameter_value then null; end;
      end if;
      host_state:=public.machan_game(room,'vote',null,answer_guest,round_index);
      if round_index=1 then
        begin
          perform public.machan_game(room,'vote',null,answer_third,round_index);
          raise exception 'Duplicate vote unexpectedly allowed';
        exception when unique_violation then null; end;
      end if;
      perform set_config('request.jwt.claim.sub',guest_uid::text,true);
      guest_state:=public.machan_game(room,'vote',null,answer_third,round_index);
      perform set_config('request.jwt.claim.sub',third_uid::text,true);
      state:=public.machan_game(room,'vote',null,answer_host,round_index);
      perform pg_temp.check_game(state#>>'{room,state}'='reveal','all votes advance to shared reveal');
      perform pg_temp.check_game(jsonb_array_length(state->'roundResults')=3,'revealed results identify real authors');
      perform pg_temp.check_game(not exists(select 1 from jsonb_array_elements(state->'roundResults') a where (a->>'pointsEarned')::integer<>case when round_index=10 then 2 else 1 end),'round ten uses double points');
      third_state:=public.machan_game(room,'read');
      perform pg_temp.check_game(third_state->'players'=state->'players','polling does not score a round twice');
    end if;
    perform set_config('request.jwt.claim.sub',guest_uid::text,true);
    begin
      perform public.machan_game(room,'scoreboard',p_expected_round=>round_index);
      raise exception 'Guest phase control unexpectedly allowed';
    exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claim.sub',host_uid::text,true);
    state:=public.machan_game(room,'reveal_all',p_expected_round=>round_index);
    state:=public.machan_game(room,'scoreboard',p_expected_round=>round_index);
    state:=public.machan_game(room,'next',p_expected_round=>round_index);
    if round_index<10 then
      perform pg_temp.check_game(state->>'totalTime'='30' and state->>'timeLeft'='30','each new answer round gets 30 seconds');
    end if;
  end loop;
  perform pg_temp.check_game(state#>>'{room,state}'='winner','all ten rounds reach the winner screen');
  perform pg_temp.check_game(not exists(select 1 from jsonb_array_elements(state->'players') p where (p->>'score')::integer<>10),'cumulative score includes one empty round and double final points');
  state:=public.machan_game(room,'rematch',p_expected_round=>10);
  perform pg_temp.check_game(state#>>'{room,state}'='lobby','rematch returns everyone to lobby');
  perform pg_temp.check_game(not exists(select 1 from public.machan_answers where room_id=room) and not exists(select 1 from public.machan_votes where room_id=room),'rematch clears only this room play records');
  perform pg_temp.check_game(not exists(select 1 from public.machan_members where room_id=room and score<>0),'rematch resets member scores');
  perform pg_temp.check_game((select count(*)=10 from public.rounds where room_id=room),'rematch retains saved questions');
  state:=public.machan_game(room,'start');
  perform pg_temp.check_game(state#>>'{room,currentPrompt,promptEnglish}'='What is your funniest Sri Lankan excuse number 1?','rematch reuses the frozen question set');
  perform set_config('request.jwt.claim.sub',guest_uid::text,true);
  state:=public.machan_game(room,'leave');
  perform pg_temp.check_game(state->'room'='null'::jsonb and jsonb_array_length(state->'players')=0,'leave returns an empty client state');
  begin
    perform public.machan_game(room,'read');
    raise exception 'Departed member read unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  state:=public.machan_join_room(room_code,'Different nickname','lion');
  perform pg_temp.check_game(state->>'currentPlayerId'=guest_id::text,'existing participant can reconnect to the same identity');
  perform set_config('request.jwt.claim.sub',host_uid::text,true);
  state:=public.machan_game(room,'leave');
  perform set_config('request.jwt.claim.sub',guest_uid::text,true);
  begin
    perform public.machan_game(room,'read');
    raise exception 'Host-closed room unexpectedly accessible';
  exception when no_data_found then
    if sqlerrm<>'The host has closed this room.' then raise; end if;
  end;
  raise notice 'Shared-game lifecycle, authorization, privacy, scoring and rematch checks passed.';
end;
$$;
rollback;
