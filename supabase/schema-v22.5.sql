-- ============================================================
-- V22.5 — 인기 랭킹 RPC 함수 (페이지뷰 집계 범용)
-- 사용자 작업: Supabase Dashboard → SQL Editor → 이 파일 통째로 Run
-- ============================================================

-- 범용 페이지뷰 Top N (page_type별)
-- politician, bill, candidate, pledge 등 모든 page_type 지원
create or replace function top_pageviews(
  p_page_type text,
  p_days int default 7,
  p_limit int default 10
)
returns table(page_id text, view_count bigint) as $$
  select page_id, count(*) as view_count
  from page_views
  where page_type = p_page_type
    and viewed_at >= now() - (p_days || ' days')::interval
  group by page_id
  order by view_count desc
  limit p_limit;
$$ language sql stable;

-- 페이지별 고유 사용자 수 (중복 제거)
create or replace function top_pageviews_unique(
  p_page_type text,
  p_days int default 7,
  p_limit int default 10
)
returns table(page_id text, unique_users bigint, total_views bigint) as $$
  select
    page_id,
    count(distinct user_id) as unique_users,
    count(*) as total_views
  from page_views
  where page_type = p_page_type
    and viewed_at >= now() - (p_days || ' days')::interval
    and user_id is not null
  group by page_id
  order by unique_users desc
  limit p_limit;
$$ language sql stable;
