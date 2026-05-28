-- ============================================================
-- V23.8 — page_views 테이블 쓰레기 데이터 정리
-- 사용자 작업: Supabase Dashboard → SQL Editor → 이 파일 실행
-- ============================================================
-- 배경: 어딘가 코드에서 template literal (${...}) 또는 HTML/JS 문자열이
-- raw string으로 page_id에 저장됨. V23.8에서 입력 검증 추가로 차단했으나,
-- 기존 누적된 쓰레기 데이터는 직접 삭제 필요.

-- 1) 영향받는 row 먼저 확인 (DELETE 전 확인)
select id, page_type, page_id, viewed_at, user_id
from page_views
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
order by viewed_at desc
limit 100;

-- 2) 확인 후 실제 삭제 (위 select 결과 확인하고 실행)
-- 주의: 되돌릴 수 없음. 위에서 확인한 다음 아래 주석 풀고 실행하세요.
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
  or length(page_id) = 0;
*/

-- 3) 정리 후 캐시 무효화 — 다음 RPC 호출 시 자동 재계산되므로 별도 작업 불필요

-- 4) 향후 방어 — Supabase RLS policy로 page_id 길이/패턴 제약 (선택사항)
-- 현재 RLS는 anon insert 허용 상태. 더 엄격하게 하려면:
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
);
*/

-- 동일 정리를 social_votes·bookmarks·user_stances에도 적용 (선택)
/*
delete from social_votes where target_id like '%${%' or target_id like '%<%' or length(target_id) > 100;
delete from bookmarks where politician_id like '%${%' or politician_id like '%<%' or length(politician_id) > 100;
delete from user_stances where politician_id like '%${%' or politician_id like '%<%' or length(politician_id) > 100;
*/
