// api/count.js — 9회 지선 시도지사 실시간 개표 (NEC 개표진행상황 크롤 결과 서빙)
// V31.18. data/count-fallback.json (count.yml 크롤러가 갱신) 그대로 전달.
// data.go.kr 개표 API는 "선거 종료 2개월 후" 제공이라 실시간 미사용 — info.nec.go.kr 크롤이 담당.

const fs = require('fs');
const path = require('path');

const FILE = path.join(process.cwd(), 'data', 'count-fallback.json');

function readFb() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return null; }
}

function getPhase() {
  const now = Date.now();
  const open = Date.parse('2026-06-03T18:00:00+09:00');
  const done = Date.parse('2026-06-04T06:00:00+09:00');
  if (now < open) return 'pre';
  if (now < done) return 'counting';
  return 'done';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const phase = getPhase();
  const cache = phase === 'counting' ? 120 : 1800;     // 개표 중 2분, 외 30분
  res.setHeader('Cache-Control', `public, max-age=30, s-maxage=${cache}, stale-while-revalidate=600`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const fb = readFb();
  const regions = (fb && Array.isArray(fb.regions)) ? fb.regions : [];
  return res.status(200).json({
    phase,
    updatedAt: (fb && fb.updatedAt) || null,
    regions,
    counted: regions.length,
    source: (regions.length && fb && fb._source) ? fb._source : (phase === 'pre' ? 'pending' : 'historical'),
    note: regions.length ? null : (phase === 'pre' ? '개표 시작 전 (6/3 18:00)' : '개표 집계 대기 — 중앙선관위 실시간 참고'),
    generatedAt: new Date().toISOString(),
  });
}
