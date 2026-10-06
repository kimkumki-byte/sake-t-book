-- 업데이트 4: 만족도 별점을 반 개 단위(0.5~5)로 (Supabase > SQL Editor 에서 한 번만 실행)
alter table public.ratings drop constraint if exists ratings_stars_check;
alter table public.ratings alter column stars type numeric(2,1);
alter table public.ratings add constraint ratings_stars_check check (stars >= 0.5 and stars <= 5 and stars * 2 = trunc(stars * 2));
