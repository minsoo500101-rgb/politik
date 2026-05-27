-- ============================================================
-- V21.7 — 전체 데이터 캐싱 + 사용자 동기화
-- 사용자 작업: Supabase Dashboard → SQL Editor → 이 파일 통째로 붙여넣고 Run
-- ============================================================

-- 1. NEC 후보자 캐시 (8회·9회 통합, sg_id로 구분)
-- Why: NEC API 후보 696명 × 1 fetch/모달 = 매우 느림. 캐시하면 즉시.
create table if not exists nec_candidates_cache (
  huboid text primary key,
  sg_id text not null,                    -- '20220601' (8회) or '20260603' (9회)
  sg_typecode text not null,
  name text,
  party text,
  sd_name text,
  sgg_name text,
  giho text,
  gender text,
  age int,
  birthday text,
  job text,
  edu text,
  career1 text,
  career2 text,
  addr text,
  status text,
  cached_at timestamptz default now()
);
create index if not exists idx_nec_cand_sg on nec_candidates_cache(sg_id, sg_typecode);
create index if not exists idx_nec_cand_name on nec_candidates_cache(name, sd_name);

-- 2. NEC 공약 캐시 (8회·9회 통합)
create table if not exists nec_pledges_cache (
  pledge_key text primary key,            -- '{sg_id}-{huboid}-{ordinal}'
  huboid text not null,
  sg_id text not null,
  ordinal int not null,
  realm text,
  title text,
  content text,
  cached_at timestamptz default now()
);
create index if not exists idx_nec_pledges_huboid on nec_pledges_cache(huboid);
create index if not exists idx_nec_pledges_sg on nec_pledges_cache(sg_id);

-- 3. 페이지뷰 카운터 (정치인·법안·후보자)
-- Why: "이 정치인 1,234회 조회" 사회적 증명 + 인기 페이지 통계
create table if not exists page_views (
  id bigint generated always as identity primary key,
  page_type text not null check (page_type in ('politician', 'bill', 'candidate', 'pledge')),
  page_id text not null,
  user_id text,
  viewed_at timestamptz default now()
);
create index if not exists idx_pv_page on page_views(page_type, page_id);
create index if not exists idx_pv_date on page_views(viewed_at);

-- 4. 북마크 다기기 동기화 (localStorage → Supabase)
create table if not exists bookmarks (
  id bigint generated always as identity primary key,
  user_id text not null,
  item_type text not null check (item_type in ('politician', 'bill', 'candidate')),
  item_id text not null,
  item_name text,
  meta jsonb,                              -- 부가 정보 (정당·시도 등)
  created_at timestamptz default now(),
  unique (user_id, item_type, item_id)
);
create index if not exists idx_bookmarks_user on bookmarks(user_id);

-- 5. stance 다기기 동기화 (지지/반대)
create table if not exists user_stances (
  id bigint generated always as identity primary key,
  user_id text not null,
  politician_id text not null,
  politician_name text,
  stance text not null check (stance in ('support', 'oppose')),
  created_at timestamptz default now(),
  unique (user_id, politician_id)
);
create index if not exists idx_stances_user on user_stances(user_id);

-- ============================================================
-- Row Level Security — anon 키로 모든 작업 허용 (unique constraint로 안전 보장)
-- ============================================================
alter table nec_candidates_cache enable row level security;
alter table nec_pledges_cache enable row level security;
alter table page_views enable row level security;
alter table bookmarks enable row level security;
alter table user_stances enable row level security;

-- nec_candidates_cache
drop policy if exists "anon read candidates" on nec_candidates_cache;
drop policy if exists "anon write candidates" on nec_candidates_cache;
drop policy if exists "anon update candidates" on nec_candidates_cache;
create policy "anon read candidates" on nec_candidates_cache for select using (true);
create policy "anon write candidates" on nec_candidates_cache for insert with check (true);
create policy "anon update candidates" on nec_candidates_cache for update using (true);

-- nec_pledges_cache
drop policy if exists "anon read pledges_cache" on nec_pledges_cache;
drop policy if exists "anon write pledges_cache" on nec_pledges_cache;
drop policy if exists "anon update pledges_cache" on nec_pledges_cache;
create policy "anon read pledges_cache" on nec_pledges_cache for select using (true);
create policy "anon write pledges_cache" on nec_pledges_cache for insert with check (true);
create policy "anon update pledges_cache" on nec_pledges_cache for update using (true);

-- page_views (insert·read만 허용, update·delete X)
drop policy if exists "anon read pageviews" on page_views;
drop policy if exists "anon write pageviews" on page_views;
create policy "anon read pageviews" on page_views for select using (true);
create policy "anon write pageviews" on page_views for insert with check (true);

-- bookmarks
drop policy if exists "anon read bookmarks" on bookmarks;
drop policy if exists "anon write bookmarks" on bookmarks;
drop policy if exists "anon delete bookmarks" on bookmarks;
create policy "anon read bookmarks" on bookmarks for select using (true);
create policy "anon write bookmarks" on bookmarks for insert with check (true);
create policy "anon delete bookmarks" on bookmarks for delete using (true);

-- user_stances
drop policy if exists "anon read stances" on user_stances;
drop policy if exists "anon write stances" on user_stances;
drop policy if exists "anon update stances" on user_stances;
drop policy if exists "anon delete stances" on user_stances;
create policy "anon read stances" on user_stances for select using (true);
create policy "anon write stances" on user_stances for insert with check (true);
create policy "anon update stances" on user_stances for update using (true);
create policy "anon delete stances" on user_stances for delete using (true);

-- ============================================================
-- 헬퍼 함수 — 페이지뷰 집계 (RPC 호출용)
-- ============================================================
create or replace function get_page_view_count(p_page_type text, p_page_id text)
returns int as $$
  select count(*)::int from page_views where page_type = p_page_type and page_id = p_page_id;
$$ language sql stable;

-- 인기 정치인 Top N (최근 7일 페이지뷰 기준)
create or replace function top_politicians_by_views(p_days int default 7, p_limit int default 10)
returns table(page_id text, view_count bigint) as $$
  select page_id, count(*) as view_count
  from page_views
  where page_type = 'politician'
    and viewed_at >= now() - (p_days || ' days')::interval
  group by page_id
  order by view_count desc
  limit p_limit;
$$ language sql stable;
