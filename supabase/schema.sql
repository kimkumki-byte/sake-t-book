-- 사케치북 데이터베이스 만들기
-- Supabase 대시보드 > SQL Editor 에 이 내용을 통째로 붙여넣고 Run 을 한 번만 누르세요.

-- 1) 사케
create table if not exists public.sakes (
  id bigint generated always as identity primary key,
  name text not null,
  rice text not null default '',
  polish text not null default '',   -- 정미율(%)
  abv text not null default '',      -- 도수(%)
  smv text not null default '',      -- 주도
  acid text not null default '',     -- 산도
  brewer text not null default '',   -- 주조사
  origin text not null default '',   -- 원산지
  tint text not null default '#4f7cac',
  img_url text,
  desc_title text not null default '',  -- 술 설명 제목
  desc_body text not null default '',   -- 술 설명 본문
  created_at timestamptz not null default now()
);
-- 예전에 만든 데이터베이스에 설명 칸 추가 (이미 있으면 그냥 넘어가요)
alter table public.sakes add column if not exists desc_title text not null default '';
alter table public.sakes add column if not exists desc_body text not null default '';

-- 2) 게스트 (닉네임 + 암호화된 비밀번호)
create table if not exists public.guests (
  id bigint generated always as identity primary key,
  nickname text not null,
  nick_key text generated always as (lower(nickname)) stored unique,
  pw_hash text not null,
  created_at timestamptz not null default now()
);

-- 3) 평가 (한 사람이 한 사케에 하나)
create table if not exists public.ratings (
  id bigint generated always as identity primary key,
  sake_id bigint not null references public.sakes(id) on delete cascade,
  nickname text not null,
  v int[] not null check (
    array_length(v, 1) = 5 and v <@ array[1,2,3,4,5]
  ),                                  -- 단맛, 산미, 바디감, 알콜감, 여운
  comment text not null default '' check (char_length(comment) <= 50),
  drank_on date not null default ((now() at time zone 'Asia/Seoul')::date),  -- 마신 날짜
  stars numeric(2,1) constraint ratings_stars_check check (stars >= 0.5 and stars <= 5 and stars * 2 = trunc(stars * 2)),  -- 만족도 별점 (0.5~5, 반 개 단위)
  updated_at timestamptz not null default now(),
  unique (sake_id, nickname)
);
create index if not exists ratings_sake_idx on public.ratings (sake_id);
create index if not exists ratings_nick_idx on public.ratings (nickname, drank_on);
-- 예전에 만든 데이터베이스에 별점 칸 추가 (이미 있으면 그냥 넘어가요)
alter table public.ratings add column if not exists stars numeric(2,1);
-- 별점을 반 개 단위(0.5~5)로 (예전에 정수로 만든 칸도 바꿔요)
alter table public.ratings drop constraint if exists ratings_stars_check;
alter table public.ratings alter column stars type numeric(2,1);
alter table public.ratings add constraint ratings_stars_check check (stars >= 0.5 and stars <= 5 and stars * 2 = trunc(stars * 2));

-- 3-1) 찜, 닉네임 변경·탈퇴 함수
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

-- 4) 보안: 화면(브라우저)에서는 테이블에 직접 접근 못 하게 잠그고,
--    우리 서버(비밀 키)만 읽고 쓰게 해요.
alter table public.sakes enable row level security;
alter table public.guests enable row level security;
alter table public.ratings enable row level security;

-- 5) 사케 사진 보관함 (누구나 사진을 볼 수는 있고, 올리는 건 서버만 가능)
insert into storage.buckets (id, name, public)
values ('sake-images', 'sake-images', true)
on conflict (id) do nothing;
