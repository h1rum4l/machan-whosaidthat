begin;
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.machan_game(uuid,text,text,uuid,integer)'::regprocedure);
  if position('cardinality(string_to_array(clean,'' ''))>6' in definition)=0
    or position('Answers must contain 1–6 words' in definition)=0 then
    raise exception 'Unexpected answer validation; inspect machan_game before changing the word limit.';
  end if;
  definition := replace(definition,'cardinality(string_to_array(clean,'' ''))>6','cardinality(string_to_array(clean,'' ''))>10');
  definition := replace(definition,'Answers must contain 1–6 words','Answers must contain 1–10 words');
  execute definition;
end;
$migration$;
notify pgrst, 'reload schema';
commit;
