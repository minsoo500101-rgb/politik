-- ============================================================
-- V22.0 — 통합 소셜 투표 (정치 + 경제 + 트렌드 + 이슈)
-- 사용자 작업: Supabase Dashboard → SQL Editor → 이 파일 통째로 Run
-- ============================================================
-- 컨셉:
-- - 텍스트 댓글 X (편향·법적 위험 회피)
-- - 정량 투표 O (찬성/반대, 지지/반대, 동의/우려, 주목/별로 등)
-- - 정치 + 경제 + 트렌드 + 이슈 모든 영역 통합

create table if not exists social_votes (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in (
    'politician',  -- 정치인 지지/반대
    'bill',        -- 법안 찬성/반대
    'pledge',      -- 공약 찬성/반대 (평점과 별개)
    'economy',     -- 경제 지표 동의/우려 (금리·환율 등)
    'trend',       -- 트렌드 키워드 주목/별로
    'news',        -- 뉴스 동의/비동의
    'topic'        -- 이슈 일반
  )),
  target_id text not null,           -- mona_cd, bill_id, '{huboid}-{ord}', indicator id 등
  target_label text,                  -- 표시용 라벨 (이름·제목 등)
  meta jsonb,                          -- 부가 정보 (정당·시도·분야 등)
  user_id text not null,
  vote text not null check (vote in ('support', 'oppose')),
  created_at timestamptz default now(),
  unique (target_type, target_id, user_id)
);
create index if not exists idx_sv_target on social_votes(target_type, target_id);
create index if not exists idx_sv_user on social_votes(user_id);
create index if not exists idx_sv_date on social_votes(created_at);

alter table social_votes enable row level security;
drop policy if exists "anon read social" on social_votes;
drop policy if exists "anon write social" on social_votes;
drop policy if exists "anon update social" on social_votes;
drop policy if exists "anon delete social" on social_votes;
create policy "anon read social" on social_votes for select using (true);
create policy "anon write social" on social_votes for insert with check (true);
create policy "anon update social" on social_votes for update using (true);
create policy "anon delete social" on social_votes for delete using (true);

-- 집계 RPC — 단일 target
create or replace function get_vote_counts(p_target_type text, p_target_id text)
returns table(vote text, count bigint) as $$
  select vote, count(*) as count
  from social_votes
  where target_type = p_target_type and target_id = p_target_id
  group by vote;
$$ language sql stable;

-- 인기 target Top N (특정 type)
create or replace function top_voted(p_target_type text, p_days int default 7, p_limit int default 10)
returns table(target_id text, target_label text, total bigint, support_count bigint, oppose_count bigint) as $$
  select
    target_id,
    max(target_label) as target_label,
    count(*) as total,
    count(*) filter (where vote = 'support') as support_count,
    count(*) filter (where vote = 'oppose') as oppose_count
  from social_votes
  where target_type = p_target_type
    and created_at >= now() - (p_days || ' days')::interval
  group by target_id
  order by total desc
  limit p_limit;
$$ language sql stable;
