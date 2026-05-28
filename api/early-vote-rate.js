// V28.2 — 사전투표율 라이브 fetch
// 9회 전국동시지방선거 (2026.6.3) 사전투표 (5/29~5/30)
//
// 다중 소스 fallback:
//   1) data.go.kr NEC API (공식)
//   2) info.nec.go.kr 통계 페이지 (HTML parsing)
//   3) data/early-vote-fallback.json (수동 갱신 슬롯)
//   4) 8회(2022) 동일 시각 기준 표시 (last resort)
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
const SG_ID = '20260603';   // 9회 지선
const SG_TYPECODE = '3';     // 광역단체장 (전체 사전투표율 기준)

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

// data.go.kr NEC 시도 — 사전투표 진행 endpoint (실험)
async function tryNecOpenApi() {
  if (!NEC_KEY) return null;
  // 후보 endpoint들 (NEC가 공개하지 않을 수 있음, 시도)
  const urls = [
    // 사전투표율 endpoint (가설 — 실제 공개 여부 미확인)
    `https://apis.data.go.kr/9760000/PrelInfoInqireService/getPrelInfoInqire?serviceKey=${NEC_KEY}&sgId=${SG_ID}&sgTypecode=${SG_TYPECODE}&pageNo=1&numOfRows=20&_type=json`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'KoreaPatchNotes/28.2' } });
      if (!r.ok) continue;
      const j = await r.json();
      // 응답이 정상이면 (구조는 NEC가 결정)
      if (j?.response?.body?.items) {
        return { _raw: j, source: 'data.go.kr' };
      }
    } catch {}
  }
  return null;
}

// info.nec.go.kr HTML 통계 페이지 (CORS 우회 — 서버 fetch)
async function tryNecInfoScrape() {
  try {
    const url = 'https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml';
    // 실제 페이지는 PrimeFaces ViewState + AJAX form post 필요해서 GET으로 데이터 못 가져옴
    // 일단 페이지 도달 여부만 확인 (사용자에게 외부 링크 안내)
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 KoreaPatchNotes/28.2' },
    });
    if (r.ok) {
      // HTML body 안에 사전투표율 텍스트가 있는지 빠른 스캔
      const html = await r.text();
      const m = html.match(/사전투표율[^<]*?(\d+\.?\d*)\s*%/);
      if (m) {
        return { rate: parseFloat(m[1]), source: 'info.nec.go.kr (text)' };
      }
    }
    return null;
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

  // 1) data.go.kr 시도
  const necApi = await tryNecOpenApi();
  if (necApi?._raw) {
    // 응답 구조에 맞춰 파싱 (구조 미확인 → 일단 raw 노출 + 표시 안 함)
    result.source = 'data.go.kr';
    result.note = 'data.go.kr 응답 수신 — 파싱 패턴 검증 필요';
    return res.status(200).json({ ...result, _raw: necApi._raw });
  }

  // 2) info.nec.go.kr HTML scrape
  const scrape = await tryNecInfoScrape();
  if (scrape?.rate) {
    result.rate = scrape.rate;
    result.source = scrape.source;
    result.announcedAt = now.toISOString();
    return res.status(200).json(result);
  }

  // 3) 수동 갱신 fallback 파일
  const fb = readFallback();
  if (fb?.rate != null) {
    result.rate = fb.rate;
    result.byRegion = fb.byRegion || null;
    result.turnoutCount = fb.turnoutCount || null;
    result.announcedAt = fb.announcedAt || null;
    result.source = 'fallback (수동 갱신)';
    result.note = '운영자가 NEC 공식 발표 기반 수동 입력. 다음 자동화 라운드에서 개선.';
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
