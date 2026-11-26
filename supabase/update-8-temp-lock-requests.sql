-- update-8: 마신 온도, 로그인 시도 제한, 사케 요청
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전해요)
-- ⚠️ update-7 을 먼저 실행한 뒤에 실행하세요.

-- 1) 마신 온도 (비워도 돼요): cold 차갑게 · room 상온 · warm 따뜻하게 · hot 뜨겁게
alter table public.ratings add column if not exists temp text;
alter table public.ratings drop constraint if exists ratings_temp_check;
alter table public.ratings add constraint ratings_temp_check check (temp is null or temp in ('cold', 'room', 'warm', 'hot'));

-- 2) 로그인 시도 제한: 5번 틀리면 10분 잠금 (key = 'g:닉네임소문자' 또는 'admin')
create table if not exists public.login_fails (
  key text primary key,
  fails int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.login_fails enable row level security;

-- 3) 사케 요청: 손님이 "이 사케 마셔보고 싶어요"를 운영자에게
create table if not exists public.requests (
  id bigint generated always as identity primary key,
  nickname text not null,
  name text not null check (char_length(name) between 1 and 80),
  note text not null default '' check (char_length(note) <= 200),
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists requests_created_idx on public.requests (created_at desc);
alter table public.requests enable row level security;

-- 4) 닉네임 바꾸기·탈퇴에 사케 요청·로그인 기록도 함께
create or replace function public.rename_guest(old_nick text, new_nick text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.guests set nickname = new_nick where nick_key = lower(old_nick);
  if not found then raise exception 'guest not found'; end if;
  update public.ratings set nickname = new_nick where nickname = old_nick;
  update public.wishes set nickname = new_nick where nickname = old_nick;
  update public.requests set nickname = new_nick where nickname = old_nick;
  delete from public.login_fails where key = 'g:' || lower(old_nick);
end;
$$;

create or replace function public.delete_guest(p_nick text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.ratings where nickname = p_nick;
  delete from public.wishes where nickname = p_nick;
  delete from public.requests where nickname = p_nick;
  delete from public.login_fails where key = 'g:' || lower(p_nick);
  delete from public.guests where nick_key = lower(p_nick);
end;
$$;

revoke execute on function public.rename_guest(text, text) from public, anon, authenticated;
revoke execute on function public.delete_guest(text) from public, anon, authenticated;
grant execute on function public.rename_guest(text, text) to service_role;
grant execute on function public.delete_guest(text) to service_role;
