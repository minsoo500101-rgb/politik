// api/turnout.js — 9회 지선 본투표(선거일) 실시간 투표율
// V31.17. 소스 우선순위:
//   1) data/turnout-fallback.json  — NEC 헤드리스 크롤러(turnout.yml)/수동 갱신
//   2) 8회(2022) 참고치 + 중앙선관위 라이브 링크 (집계 대기 상태)
// 주의: data.go.kr 투·개표 API는 "선거 종료 약 2개월 후" 제공이라 실시간 미사용.
//       선거일 실시간은 info.nec.go.kr 크롤(turnout.yml)이 담당.

const fs = require('fs');
const path = require('path');

const FALLBACK_FILE = path.join(process.cwd(), 'data', 'turnout-fallback.json');
const PREV_8TH_FINAL = 50.9;          // 2022.6 8회 지선 최종 투표율
const ELECTION_DAY = '2026-06-03';

function readFallback() {
  try { return JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8')); }
  catch { return null; }
}

function getPhase() {
  const now = Date.now();
  const open  = Date.parse(`${ELECTION_DAY}T06:00:00+09:00`);
  const close = Date.parse(`${ELECTION_DAY}T18:00:00+09:00`);
  const countCut = Date.parse('2026-06-04T03:00:00+09:00');
  if (now < open)     return 'pre';      // 투표 시작 전
  if (now < close)    return 'voting';   // 본 투표 진행 중 (06~18시)
  if (now < countCut) return 'counting'; // 개표 진행 중
  return 'done';                         // 개표 완료
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const phase = getPhase();
  // 투표 중엔 5분, 그 외 30분 CDN 캐시
  const cacheSecs = phase === 'voting' ? 300 : 1800;
  res.setHeader('Cache-Control', `public, max-age=60, s-maxage=${cacheSecs}, stale-while-revalidate=600`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const now = new Date();
  const result = {
    rate: null,
    phase,
    announcedAt: null,
    byRegion: null,
    turnoutCount: null,
    totalVoters: 44649908,                 // 9회 선거인명부(사전투표 최종 발표 기준)
    source: null,
    prev8th: { rate: PREV_8TH_FINAL, label: '2022.6 8회 지선 최종' },
    note: null,
    generatedAt: now.toISOString(),
  };

  // 1) 크롤러/수동 갱신 fallback (실시간)
  const fb = readFallback();
  if (fb && fb.rate != null && !isNaN(fb.rate)) {
    result.rate = fb.rate;
    result.byRegion = (fb.byRegion && Object.keys(fb.byRegion).length) ? fb.byRegion : null;
    result.turnoutCount = fb.turnoutCount || null;
    if (fb.totalVoters) result.totalVoters = fb.totalVoters;
    result.announcedAt = fb.announcedAt || null;
    result.source = fb._source || 'nec-stat';
    result.note = fb._note || null;
    return res.status(200).json(result);
  }

  // 2) 집계 대기 — 8회 참고 + NEC 라이브 안내
  if (phase === 'pre') {
    result.source = 'pending';
    result.note = '본투표 시작 전 (6/3 06:00 시작)';
  } else if (phase === 'voting') {
    result.source = 'historical';
    result.note = '선관위 집계 대기 — 실시간 수치는 중앙선관위 라이브에서 확인';
  } else if (phase === 'counting') {
    result.source = 'historical';
    result.note = '투표 마감 — 최종 투표율은 중앙선관위 공식 발표 참고';
  } else {
    result.source = 'historical';
    result.note = '개표 완료 — 최종 결과는 중앙선관위 공식 발표 참고';
  }
  return res.status(200).json(result);
}
