-- update-7: 리뷰 여러 번 남기기 + 처음 쓴 날짜 유지
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전해요)

-- 1) 처음 쓴 시각 칸. 이미 있는 리뷰는 지금 남아 있는 시각(마지막 수정 시각)으로 채워요
alter table public.ratings add column if not exists created_at timestamptz;
update public.ratings set created_at = updated_at where created_at is null;
alter table public.ratings alter column created_at set default now();
alter table public.ratings alter column created_at set not null;

-- 2) "한 사람이 한 사케에 하나" 규칙 풀기 (같은 사케를 여러 번 기록할 수 있게)
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.ratings'::regclass and contype = 'u' loop
    execute format('alter table public.ratings drop constraint %I', c.conname);
  end loop;
end $$;

-- 3) 사케별·사람별로 빨리 찾기 위한 색인
create index if not exists ratings_sake_nick_idx on public.ratings (sake_id, nickname);
