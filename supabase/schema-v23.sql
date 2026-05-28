-- ============================================================
-- V23.3 — 한국의 마음 (Korea Pulse) RPC 함수
-- "국민이 곧 국가" — 시민 익명 의견 라이브 집계
-- 사용자 작업: Supabase Dashboard → SQL Editor → 이 파일 통째로 Run
-- ============================================================

-- 1) 정치인 지지·반대 Top N (최근 N일)
-- social_votes의 politician 타겟 + user_stances 통합
create or replace function pulse_top_politicians(
  p_days int default 30,
  p_limit int default 10,
  p_min_votes int default 5
)
returns table(
  politician_id text,
  politician_name text,
  support_count bigint,
  oppose_count bigint,
  total bigint,
  net_score numeric,
  approval_pct numeric
) as $$
  with combined as (
    -- social_votes 정치인 타겟
    select target_id as pid, target_label as pname,
           case when vote = 'support' then 1 else 0 end as is_support
    from social_votes
    where target_type = 'politician'
      and created_at >= now() - (p_days || ' days')::interval
    union all
    -- user_stances 정치인 입장
    select politician_id as pid, politician_name as pname,
           case when stance = 'support' then 1 else 0 end as is_support
    from user_stances
    where created_at >= now() - (p_days || ' days')::interval
  )
  select
    pid as politician_id,
    max(pname) as politician_name,
    sum(is_support)::bigint as support_count,
    (count(*) - sum(is_support))::bigint as oppose_count,
    count(*)::bigint as total,
    (sum(is_support) - (count(*) - sum(is_support)))::numeric as net_score,
    round((sum(is_support)::numeric / nullif(count(*),0) * 100), 1) as approval_pct
  from combined
  group by pid
  having count(*) >= p_min_votes
  order by net_score desc, total desc
  limit p_limit;
$$ language sql stable;

-- 2) 정치인 반대 Top N (가장 반대받는)
create or replace function pulse_bottom_politicians(
  p_days int default 30,
  p_limit int default 10,
  p_min_votes int default 5
)
returns table(
  politician_id text,
  politician_name text,
  support_count bigint,
  oppose_count bigint,
  total bigint,
  net_score numeric,
  approval_pct numeric
) as $$
  with combined as (
    select target_id as pid, target_label as pname,
           case when vote = 'support' then 1 else 0 end as is_support
    from social_votes
    where target_type = 'politician'
      and created_at >= now() - (p_days || ' days')::interval
    union all
    select politician_id as pid, politician_name as pname,
           case when stance = 'support' then 1 else 0 end as is_support
    from user_stances
    where created_at >= now() - (p_days || ' days')::interval
  )
  select
    pid as politician_id,
    max(pname) as politician_name,
    sum(is_support)::bigint as support_count,
    (count(*) - sum(is_support))::bigint as oppose_count,
    count(*)::bigint as total,
    (sum(is_support) - (count(*) - sum(is_support)))::numeric as net_score,
    round((sum(is_support)::numeric / nullif(count(*),0) * 100), 1) as approval_pct
  from combined
  group by pid
  having count(*) >= p_min_votes
  order by net_score asc, total desc
  limit p_limit;
$$ language sql stable;

-- 3) 법안 동의도 Top N (찬성률 기준, 최근 N일)
create or replace function pulse_top_bills(
  p_days int default 30,
  p_limit int default 5,
  p_min_votes int default 5
)
returns table(
  bill_id text,
  bill_label text,
  support_count bigint,
  oppose_count bigint,
  total bigint,
  approval_pct numeric
) as $$
  select
    target_id as bill_id,
    max(target_label) as bill_label,
    count(*) filter (where vote = 'support') as support_count,
    count(*) filter (where vote = 'oppose') as oppose_count,
    count(*) as total,
    round((count(*) filter (where vote = 'support')::numeric / nullif(count(*),0) * 100), 1) as approval_pct
  from social_votes
  where target_type = 'bill'
    and created_at >= now() - (p_days || ' days')::interval
  group by target_id
  having count(*) >= p_min_votes
  order by approval_pct desc, total desc
  limit p_limit;
$$ language sql stable;

-- 4) 경제 지표 우려도 (찬성=동의, 반대=우려)
create or replace function pulse_economy(
  p_days int default 30,
  p_limit int default 10,
  p_min_votes int default 3
)
returns table(
  indicator_id text,
  indicator_label text,
  agree_count bigint,
  concern_count bigint,
  total bigint,
  concern_pct numeric
) as $$
  select
    target_id as indicator_id,
    max(target_label) as indicator_label,
    count(*) filter (where vote = 'support') as agree_count,
    count(*) filter (where vote = 'oppose') as concern_count,
    count(*) as total,
    round((count(*) filter (where vote = 'oppose')::numeric / nullif(count(*),0) * 100), 1) as concern_pct
  from social_votes
  where target_type = 'economy'
    and created_at >= now() - (p_days || ' days')::interval
  group by target_id
  having count(*) >= p_min_votes
  order by concern_pct desc, total desc
  limit p_limit;
$$ language sql stable;

-- 5) 시도별 정치 성향 분포 (politicians.json 매핑 필요 — meta에 region 저장)
-- social_votes.meta->>'region' 또는 별도 매핑 테이블 활용
-- 우선 버전: meta JSON에서 region 추출
create or replace function pulse_region_distribution(
  p_days int default 30,
  p_min_samples int default 20
)
returns table(
  region text,
  total bigint,
  support_count bigint,
  oppose_count bigint,
  support_pct numeric
) as $$
  select
    meta->>'region' as region,
    count(*)::bigint as total,
    count(*) filter (where vote = 'support')::bigint as support_count,
    count(*) filter (where vote = 'oppose')::bigint as oppose_count,
    round((count(*) filter (where vote = 'support')::numeric / nullif(count(*),0) * 100), 1) as support_pct
  from social_votes
  where target_type = 'politician'
    and created_at >= now() - (p_days || ' days')::interval
    and meta->>'region' is not null
  group by meta->>'region'
  having count(*) >= p_min_samples
  order by total desc;
$$ language sql stable;

-- 6) 일별 시민 참여 추이 (지난 N일)
create or replace function pulse_daily_activity(
  p_days int default 14
)
returns table(
  activity_date date,
  votes_count bigint,
  pageviews_count bigint
) as $$
  with d as (
    select generate_series(
      current_date - (p_days - 1),
      current_date,
      '1 day'::interval
    )::date as d
  )
  select
    d.d as activity_date,
    coalesce((select count(*) from social_votes where created_at::date = d.d), 0) as votes_count,
    coalesce((select count(*) from page_views where viewed_at::date = d.d), 0) as pageviews_count
  from d
  order by d.d asc;
$$ language sql stable;

-- 7) 종합 통계 — Korea Pulse 헤더용
create or replace function pulse_overview(p_days int default 30)
returns table(
  total_votes bigint,
  total_stances bigint,
  total_pageviews bigint,
  total_bookmarks bigint,
  unique_voters bigint,
  voters_today bigint
) as $$
  select
    (select count(*) from social_votes where created_at >= now() - (p_days || ' days')::interval) as total_votes,
    (select count(*) from user_stances where created_at >= now() - (p_days || ' days')::interval) as total_stances,
    (select count(*) from page_views where viewed_at >= now() - (p_days || ' days')::interval) as total_pageviews,
    (select count(*) from bookmarks where created_at >= now() - (p_days || ' days')::interval) as total_bookmarks,
    (select count(distinct user_id) from social_votes where created_at >= now() - (p_days || ' days')::interval) as unique_voters,
    (select count(distinct user_id) from social_votes where created_at::date = current_date) as voters_today;
$$ language sql stable;
