-- Preserve the existing authorization/game logic and change only answer timing.
begin;
do $migration$
declare
  definition text;
  old_interval constant text := 'interval ''20 seconds''';
begin
  definition := pg_get_functiondef('public.machan_game(uuid,text,text,uuid,integer)'::regprocedure);
  if (length(definition)-length(replace(definition,old_interval,'')))/length(old_interval) <> 4 then
    raise exception 'Unexpected answer deadlines in machan_game; inspect before changing timing.';
  end if;
  execute replace(definition,old_interval,'interval ''30 seconds''');

  definition := pg_get_functiondef('public._machan_snapshot(uuid,uuid)'::regprocedure);
  if position('when ''question'' then 20' in definition)=0 then
    raise exception 'Unexpected answer duration in _machan_snapshot.';
  end if;
  execute replace(definition,'when ''question'' then 20','when ''question'' then 30');
end;
$migration$;

-- Extend still-open answering windows by the same ten seconds; leave votes alone.
with extended as (
  update public.machan_game_state set ends_at=ends_at+interval '10 seconds'
  where phase='question' and not closed and ends_at>clock_timestamp()
  returning room_id,ends_at
)
update public.rooms r set phase_ends_at=e.ends_at from extended e where r.id=e.room_id;
notify pgrst, 'reload schema';
commit;
