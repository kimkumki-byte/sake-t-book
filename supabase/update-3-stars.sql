-- 업데이트 3: 만족도 별점 칸 추가 (Supabase > SQL Editor 에서 한 번만 실행)
alter table public.ratings add column if not exists stars smallint check (stars between 1 and 5);
