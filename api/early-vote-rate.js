// V29.7 — 사전투표율 fetch (공식 data.go.kr API 연동)
// 9회 전국동시지방선거 (2026.6.3) 사전투표 (5/29~5/30)
//
// 다중 소스 fallback:
//   1) data.go.kr 중앙선관위 공식 API (ErVotingSttusInfoInqireService)
//      — "완료 선거"만 데이터 제공. 사전투표 진행 중엔 INFO-03 → 2)로 넘어감.
//      — 종료 후 공식 최종 수치+시도별 자동 반영. (Vercel env: DATA_GO_KR_KEY)
//   2) data/early-vote-fallback.json (수동 갱신 슬롯 — 진행 중 실시간용)
//   3) 8회(2022) 동일 시각 기준 표시 (last resort)
//
// 출력:
//   {
//     rate: 12.34,                  // 누적 사전투표율 %
//     phase: '1일차' | '2일차' | '종료',
//     announcedAt: '2026-05-29T11:00:00+09:00',
//     byRegion: { '서울': 13.2, '부산': 11.5, ... },
//     turnoutCount: 5_234_567,      // 누적 투표자수
//     totalVoters: 44_650_000,
//     source: 'data.go.kr' | 'info.nec.go.kr' | 'fallback' | 'historical',
//     prev8th: { rate: 20.62, label: '2022.6 8회 지선 최종' },
//     nextUpdate: '2026-05-29T13:00:00+09:00',
//   }

const fs = require('fs');
const path = require('path');

const NEC_KEY = process.env.DATA_GO_KR_KEY || '';
const SG_ID = '20260603';   // 9회 지선 (선거일 YYYYMMDD = sgId)

// 8회(2022) 사전투표율 시간별 (참고용 fallback)
const PREV_8TH_HOURLY = {
  '1일차_07': 0.85,
  '1일차_09': 2.20,
  '1일차_11': 4.20,
  '1일차_13': 6.15,
  '1일차_15': 8.05,
  '1일차_17': 10.18,
  '1일차_18': 11.05,
  '2일차_07': 11.85,
  '2일차_09': 13.40,
  '2일차_11': 15.10,
  '2일차_13': 16.65,
  '2일차_15': 18.10,
  '2일차_17': 19.95,
  '2일차_18': 20.62, // 최종
};

const FALLBACK_FILE = path.join(process.cwd(), 'data', 'early-vote-fallback.json');

function readFallback() {
  try { return JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8')); }
  catch { return null; }
}

function getPhase() {
  const now = new Date();
  const d1Start = new Date('2026-05-29T06:00:00+09:00');
  const d1End = new Date('2026-05-29T18:00:00+09:00');
  const d2Start = new Date('2026-05-30T06:00:00+09:00');
  const d2End = new Date('2026-05-30T18:00:00+09:00');
  if (now < d1Start) return 'pre';
  if (now < d1End)   return '1일차';
  if (now < d2Start) return '1일차_종료';
  if (now < d2End)   return '2일차';
  return '종료';
}

function getHistoricalReference() {
  const now = new Date();
  const d1 = new Date('2026-05-29T00:00:00+09:00');
  const d2 = new Date('2026-05-30T00:00:00+09:00');
  const hour = now.getHours();
  const day = now < d1 ? null : now < d2 ? '1일차' : '2일차';
  if (!day) return null;
  const key = `${day}_${String(hour).padStart(2, '0')}`;
  const rate = PREV_8TH_HOURLY[key];
  if (rate) return { rate, label: `2022.6 8회 지선 동시간대 (${day} ${hour}시)` };
  return { rate: PREV_8TH_HOURLY['2일차_18'], label: '2022.6 8회 지선 최종 (참고)' };
}

function xmlTag(s, t) {
  const m = s.match(new RegExp(`<${t}>([^<]*)</${t}>`));
  return m ? m[1] : null;
}

// data.go.kr 중앙선관위 공식 사전투표 결과 API (ErVotingSttusInfoInqireService)
// 주의: 이 API는 "완료된 선거"만 데이터 제공. 사전투표 진행 중에는 INFO-03(데이터 없음).
//   → 사전투표 종료 후 공식 최종 수치 + 시도별 자동 반영. 진행 중 실시간은 manual fallback이 담당.
// 응답은 XML 고정(_type=json 무시). https + UA 로 호출. 키는 Vercel env DATA_GO_KR_KEY.
async function tryNecOpenApi() {
  if (!NEC_KEY) return null;
  // erVotingDiv: 0=전체(누적). numOfRows는 100으로 하드캡 → 페이지네이션 필수(8회 268건=3p).
  const base = 'https://apis.data.go.kr/9760000/ErVotingSttusInfoInqireService/getErVotingSttusInfoInqire'
    + `?serviceKey=${NEC_KEY}&sgId=${SG_ID}&erVotingDiv=0&numOfRows=100`;
  try {
    let allItems = [];
    const MAX_PAGES = 6; // 안전 상한 (지선 268건이면 3p)
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await fetch(`${base}&pageNo=${page}`, { headers: { 'User-Agent': 'Mozilla/5.0 (patchkr)' } });
      if (!r.ok) break;
      const xml = await r.text();
      if (page === 1 && !/INFO-00|NORMAL SERVICE/.test(xml)) return null; // INFO-03(진행 중) → fallback
      const items = xml.split('<item>').slice(1);
      if (!items.length) break;
      allItems = allItems.concat(items);
      const totalCount = parseInt((xml.match(/<totalCount>(\d+)/) || [])[1] || '0', 10);
      if (allItems.length >= totalCount || items.length < 100) break;
    }
    if (!allItems.length) return null;
    let national = null;
    const byRegion = {};
    for (const it of allItems) {
      const sd = xmlTag(it, 'sdName');
      const wiw = xmlTag(it, 'wiwName');
      const turnout = parseFloat(xmlTag(it, 'erTurnout'));
      if (sd === '합계' && wiw === '합계') {
        national = {
          rate: turnout,
          turnoutCount: parseInt(xmlTag(it, 'erVotingCnt'), 10) || null,
          totalVoters: parseInt(xmlTag(it, 'votersCnt'), 10) || null,
        };
      } else if (wiw === '합계' && sd && !isNaN(turnout)) {
        byRegion[sd] = turnout; // 시도별 합계
      }
    }
    if (!national || isNaN(national.rate)) return null;
    return { ...national, byRegion: Object.keys(byRegion).length ? byRegion : null, source: 'data.go.kr (공식)' };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 사전투표 진행 중에는 5분 캐시, 외에는 30분
  const phase = getPhase();
  const cacheSecs = (phase === '1일차' || phase === '2일차') ? 300 : 1800;
  res.setHeader('Cache-Control', `public, max-age=60, s-maxage=${cacheSecs}, stale-while-revalidate=600`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const now = new Date();
  const result = {
    rate: null,
    phase,
    announcedAt: null,
    byRegion: null,
    turnoutCount: null,
    totalVoters: 44650000, // election_2026 voter_estimate 합
    source: null,
    prev8th: { rate: 20.62, label: '2022.6 8회 지선 최종 (참고)' },
    nextUpdate: null,
    note: null,
    generatedAt: now.toISOString(),
  };

  // 1) data.go.kr 공식 사전투표 결과 API (완료 선거만 — 진행 중엔 INFO-03 → 다음 단계로)
  const official = await tryNecOpenApi();
  if (official && official.rate != null && !isNaN(official.rate)) {
    result.rate = official.rate;
    result.turnoutCount = official.turnoutCount;
    if (official.totalVoters) result.totalVoters = official.totalVoters;
    result.byRegion = official.byRegion;
    result.source = official.source;
    result.announcedAt = now.toISOString();
    result.note = '중앙선관위 공식 data.go.kr API (사전투표 결과)';
    return res.status(200).json(result);
  }

  // 2) 수동 갱신 fallback 파일 (사전투표 진행 중 실시간 갱신용)
  const fb = readFallback();
  if (fb?.rate != null) {
    result.rate = fb.rate;
    result.byRegion = fb.byRegion || null;
    result.turnoutCount = fb.turnoutCount || null;
    result.announcedAt = fb.announcedAt || null;
    result.source = 'nec-stat';
    result.note = null;
    return res.status(200).json(result);
  }

  // 4) 8회 동시간대 참고치
  const hist = getHistoricalReference();
  if (hist) {
    result.rate = null;
    result.source = 'historical';
    result.note = `NEC 실시간 발표 fetch 실패. 참고: ${hist.label} = ${hist.rate}%`;
    result.prev8th = hist;
    return res.status(200).json(result);
  }

  // 5) 사전투표 시작 전
  result.source = 'pending';
  result.note = '사전투표 시작 전. 5/29 06:00 KST부터 라이브 시작.';
  return res.status(200).json(result);
}
