-- 업데이트 5: 찜, 닉네임 변경·탈퇴 (Supabase > SQL Editor 에서 한 번만 실행)
create table if not exists public.wishes (
  nickname text not null,
  sake_id bigint not null references public.sakes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (nickname, sake_id)
);
alter table public.wishes enable row level security;

-- 닉네임 바꾸기: 회원 정보·평가·찜을 한 번에
create or replace function public.rename_guest(old_nick text, new_nick text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.guests set nickname = new_nick where nick_key = lower(old_nick);
  if not found then raise exception 'guest not found'; end if;
  update public.ratings set nickname = new_nick where nickname = old_nick;
  update public.wishes set nickname = new_nick where nickname = old_nick;
end;
$$;

-- 탈퇴: 평가·찜·회원 정보를 한 번에 삭제
create or replace function public.delete_guest(p_nick text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.ratings where nickname = p_nick;
  delete from public.wishes where nickname = p_nick;
  delete from public.guests where nick_key = lower(p_nick);
end;
$$;

-- 이 두 함수는 우리 서버(비밀 키)만 실행할 수 있게
revoke execute on function public.rename_guest(text, text) from public, anon, authenticated;
revoke execute on function public.delete_guest(text) from public, anon, authenticated;
grant execute on function public.rename_guest(text, text) to service_role;
grant execute on function public.delete_guest(text) to service_role;
