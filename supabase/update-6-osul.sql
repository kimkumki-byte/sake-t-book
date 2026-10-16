-- 업데이트 6: 오술(오늘 마실 술) — 운영자가 날짜별로 사케와 순서를 정해요 (Supabase > SQL Editor 에서 한 번만 실행)
create table if not exists public.osul (
  day date not null,
  sake_id bigint not null references public.sakes(id) on delete cascade,
  pos int not null default 0,
  created_at timestamptz not null default now(),
  primary key (day, sake_id)
);
create index if not exists osul_day_pos_idx on public.osul (day, pos);
alter table public.osul enable row level security;

-- 그날의 오술을 통째로 바꾸기 (지우고 새 순서로 넣기를 한 번에)
create or replace function public.set_osul(p_day date, p_ids bigint[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.osul where day = p_day;
  insert into public.osul (day, sake_id, pos)
  select p_day, t.id, t.ord from unnest(coalesce(p_ids, '{}'::bigint[])) with ordinality as t(id, ord);
end;
$$;

-- 우리 서버(비밀 키)만 실행할 수 있게
revoke execute on function public.set_osul(date, bigint[]) from public, anon, authenticated;
grant execute on function public.set_osul(date, bigint[]) to service_role;
