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
  updated_at timestamptz not null default now(),
  unique (sake_id, nickname)
);
create index if not exists ratings_sake_idx on public.ratings (sake_id);
create index if not exists ratings_nick_idx on public.ratings (nickname, drank_on);

-- 4) 보안: 화면(브라우저)에서는 테이블에 직접 접근 못 하게 잠그고,
--    우리 서버(비밀 키)만 읽고 쓰게 해요.
alter table public.sakes enable row level security;
alter table public.guests enable row level security;
alter table public.ratings enable row level security;

-- 5) 사케 사진 보관함 (누구나 사진을 볼 수는 있고, 올리는 건 서버만 가능)
insert into storage.buckets (id, name, public)
values ('sake-images', 'sake-images', true)
on conflict (id) do nothing;
