-- ============================================================
-- V23.8/V25.3/V25.5 — page_views 쓰레기 데이터 정리
-- 사용자 작업: Supabase Dashboard → SQL Editor → 이 파일 실행
-- ============================================================
-- 배경: 누군가 가짜 URL(/m/12345)로 직접 접근하거나, 과거 코드 버그로
-- template literal raw string(${...})이 page_id로 저장됨.
-- candidate 9자리 NEC ID(예: 100163128)는 정상이므로 제외.

-- ============================================================
-- 1) 영향받는 row 먼저 확인 (DELETE 전 검토)
-- ============================================================
select id, page_type, page_id, viewed_at, user_id
from page_views
where
  -- 공통 (XSS·인젝션 시도 패턴, 모든 page_type)
  page_id like '%${%'
  or page_id like '%<%'
  or page_id like '%>%'
  or page_id like '%javascript:%'
  or page_id like 'undefined%'
  or page_id like 'null%'
  or page_id like '[object%'
  or length(page_id) > 100
  or length(page_id) = 0
  -- politician/bill: 순수 숫자는 가짜 (우리 ID는 영문 포함: MONA_CD·PRC_*·kr.*)
  or (page_type in ('politician', 'bill') and page_id ~ '^\d+$')
  -- candidate: 5자리 이하 숫자는 가짜 (NEC 후보 ID는 9자리 표준)
  or (page_type = 'candidate' and page_id ~ '^\d{1,5}$')
order by viewed_at desc
limit 100;

-- ============================================================
-- 2) 확인 후 삭제 (위 SELECT 결과 검토 후 아래 주석 풀어 실행)
-- ============================================================
-- 주의: 되돌릴 수 없음.
/*
delete from page_views
where
  page_id like '%${%'
  or page_id like '%<%'
  or page_id like '%>%'
  or page_id like '%javascript:%'
  or page_id like 'undefined%'
  or page_id like 'null%'
  or page_id like '[object%'
  or length(page_id) > 100
  or length(page_id) = 0
  or (page_type in ('politician', 'bill') and page_id ~ '^\d+$')
  or (page_type = 'candidate' and page_id ~ '^\d{1,5}$');
*/

-- ============================================================
-- 3) social_votes·user_stances·bookmarks도 같이 정리 (선택)
-- ============================================================
/*
delete from social_votes where target_id like '%${%' or target_id like '%<%' or length(target_id) > 100;
delete from bookmarks where politician_id like '%${%' or politician_id like '%<%' or length(politician_id) > 100;
delete from user_stances where politician_id like '%${%' or politician_id like '%<%' or length(politician_id) > 100;
*/

-- ============================================================
-- 4) RLS 정책 강화 (선택 — 향후 가짜 데이터 INSERT 자체 차단)
-- ============================================================
/*
drop policy if exists "anon insert pageview" on page_views;
create policy "anon insert pageview" on page_views
for insert
to anon
with check (
  page_type in ('politician','bill','candidate','pledge','topic')
  and length(page_id) > 0
  and length(page_id) <= 100
  and page_id not like '%${%'
  and page_id not like '%<%'
  and page_id not like '%>%'
  and page_id not like '%javascript:%'
  -- politician/bill은 순수 숫자 거부, candidate는 6자리 이상 숫자만 허용
  and (
    (page_type = 'candidate' and page_id ~ '^[A-Za-z0-9_.-]{6,}$')
    or (page_type in ('politician','bill','pledge','topic') and page_id ~ '^[A-Za-z][A-Za-z0-9_.-]*$')
  )
);
*/
