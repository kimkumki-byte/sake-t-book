-- 업데이트 2: 술 설명 칸 추가 (Supabase > SQL Editor 에서 한 번만 실행)
alter table public.sakes add column if not exists desc_title text not null default '';
alter table public.sakes add column if not exists desc_body text not null default '';
