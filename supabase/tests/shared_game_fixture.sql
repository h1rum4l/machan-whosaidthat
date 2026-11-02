-- LOCAL TEST DATABASE ONLY. Refuses to run over any existing starter/auth schema.
do $$ begin
  if to_regclass('public.rooms') is not null or to_regclass('auth.users') is not null then
    raise exception 'Test fixture requires an empty, disposable PostgreSQL database.';
  end if;
end $$;

do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{6}$'),
  host_user_id uuid not null,
  topic text not null default 'mixed',
  status text not null default 'lobby' check (status in ('lobby','answering','voting','reveal','finished')),
  round_no integer not null default 0 check (round_no between 0 and 10),
  phase_ends_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id),
  user_id uuid not null,
  nickname text not null
);
create table public.rounds (
  room_id uuid not null references public.rooms(id),
  round_no integer not null check (round_no between 1 and 10),
  question text not null,
  category text,
  unique(room_id,round_no)
);
create sequence public.test_room_codes start 1;
create function public.create_room(p_nickname text,p_topic text)
returns table(room_id uuid,room_code text) language plpgsql security definer set search_path=pg_catalog as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.rooms(code,host_user_id,topic)
    values(lpad(nextval('public.test_room_codes')::text,6,'0'),auth.uid(),p_topic)
    returning id,code into room_id,room_code;
  insert into public.players(room_id,user_id,nickname) values(room_id,auth.uid(),p_nickname);
  return next;
end;
$$;
