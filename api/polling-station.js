// V29.9 — 사전투표소 찾기 프록시 (data.go.kr 중앙선관위 PolplcInfoInqireService2)
// 9회 전국동시지방선거 (2026.6.3) 사전투표 (5/29~5/30) 사전투표소 위치 안내.
//
// 요청:  /api/polling-station?sd=서울특별시[&wiw=종로구]
// 응답:  { sd, wiw, count, stations: [{ ps, place, addr, emd, wiw, floor }], source }
//
// 주의: 응답 XML 고정. numOfRows 100 하드캡 → 1페이지로 totalCount 파악 후 나머지 병렬 fetch.
//       키는 Vercel env DATA_GO_KR_KEY (레포 미커밋).

const NEC_KEY = process.env.DATA_GO_KR_KEY || '';
const SG_ID = '20260603'; // 9회 지선 (선거일 YYYYMMDD)
const ENDPOINT = 'https://apis.data.go.kr/9760000/PolplcInfoInqireService2/getPrePolplcOtlnmapTrnsportInfoInqire';
const MAX_PAGES = 14; // 경기(최다)도 커버

function xmlTag(s, t) {
  const m = s.match(new RegExp(`<${t}>([^<]*)</${t}>`));
  return m ? m[1] : null;
}
function decodeXml(s) {
  return s == null ? s : s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

async function fetchPage(sd, wiw, page) {
  const url = `${ENDPOINT}?serviceKey=${NEC_KEY}&sgId=${SG_ID}&sdName=${encodeURIComponent(sd)}`
    + (wiw ? `&wiwName=${encodeURIComponent(wiw)}` : '')
    + `&numOfRows=100&pageNo=${page}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (patchkr)' } });
  if (!r.ok) return { xml: '', ok: false };
  return { xml: await r.text(), ok: true };
}

function parseItems(xml) {
  return xml.split('<item>').slice(1).map(it => ({
    ps: decodeXml(xmlTag(it, 'evPsName')),     // 사전투표소명
    place: decodeXml(xmlTag(it, 'placeName')), // 장소 (건물·실)
    addr: decodeXml(xmlTag(it, 'addr')),       // 주소
    emd: decodeXml(xmlTag(it, 'emdName')),     // 읍면동
    wiw: decodeXml(xmlTag(it, 'wiwName')),     // 구시군
    floor: decodeXml(xmlTag(it, 'floor')),     // 층
  })).filter(s => s.ps || s.place);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // 사전투표소 위치는 사실상 정적 → 길게 캐시
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=21600, stale-while-revalidate=86400');

  const sd = (req.query.sd || req.query.sdName || '').toString().trim();
  const wiw = (req.query.wiw || req.query.wiwName || '').toString().trim();
  if (!sd) return res.status(400).json({ error: 'sd (시도명) 파라미터가 필요합니다.', stations: [] });
  if (!NEC_KEY) return res.status(200).json({ sd, stations: [], count: 0, source: 'none', note: 'DATA_GO_KR_KEY 미설정 — Vercel 환경변수 등록 필요' });

  try {
    const first = await fetchPage(sd, wiw, 1);
    if (!first.ok || !/INFO-00|NORMAL SERVICE/.test(first.xml)) {
      return res.status(200).json({ sd, wiw: wiw || null, count: 0, stations: [], source: 'data.go.kr', note: '데이터 없음' });
    }
    const totalCount = parseInt((first.xml.match(/<totalCount>(\d+)/) || [])[1] || '0', 10);
    const totalPages = Math.min(Math.ceil(totalCount / 100) || 1, MAX_PAGES);
    let stations = parseItems(first.xml);
    if (totalPages > 1) {
      const pages = [];
      for (let p = 2; p <= totalPages; p++) pages.push(p);
      const rest = await Promise.all(pages.map(p => fetchPage(sd, wiw, p)));
      for (const r of rest) if (r.ok) stations = stations.concat(parseItems(r.xml));
    }
    return res.status(200).json({ sd, wiw: wiw || null, count: stations.length, stations, source: 'data.go.kr (공식)' });
  } catch (e) {
    return res.status(200).json({ sd, wiw: wiw || null, count: 0, stations: [], source: 'error', error: e.message });
  }
}
