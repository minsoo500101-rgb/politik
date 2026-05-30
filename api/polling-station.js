// V31.12 — 투표소 찾기 프록시 (data.go.kr 중앙선관위 PolplcInfoInqireService2)
// 9회 전국동시지방선거 (2026.6.3). 본투표소(선거일)·사전투표소 모두 지원.
//   type=day → 선거일(본) 투표소  getPolplcOtlnmapTrnsportInfoInqire    (psName)
//   type=pre → 사전투표소         getPrePolplcOtlnmapTrnsportInfoInqire (evPsName)
//
// 요청:  /api/polling-station?sd=서울특별시[&wiw=종로구][&type=day|pre]
// 응답:  { sd, wiw, type, count, total, stations: [{ ps, place, addr, emd, wiw, floor }], source }
//
// 주의: 응답 XML 고정. numOfRows 100 하드캡 → totalCount 파악 후 청크 병렬 fetch.
//       키는 Vercel env DATA_GO_KR_KEY (레포 미커밋).

const NEC_KEY = process.env.DATA_GO_KR_KEY || '';
const SG_ID = '20260603'; // 9회 지선 (선거일 YYYYMMDD)
const SVC = 'https://apis.data.go.kr/9760000/PolplcInfoInqireService2';
const OPS = {
  day: { op: 'getPolplcOtlnmapTrnsportInfoInqire', name: 'psName' },      // 선거일(본) 투표소
  pre: { op: 'getPrePolplcOtlnmapTrnsportInfoInqire', name: 'evPsName' }, // 사전투표소
};
const MAX_PAGES = 60; // 본투표소(경기 등 대량) 커버
const CHUNK = 12;     // 동시 fetch 청크 (data.go.kr 부하 완화)

function xmlTag(s, t) {
  const m = s.match(new RegExp(`<${t}>([^<]*)</${t}>`));
  return m ? m[1] : null;
}
function decodeXml(s) {
  return s == null ? s : s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

async function fetchPage(op, sd, wiw, page) {
  const url = `${SVC}/${op}?serviceKey=${NEC_KEY}&sgId=${SG_ID}&sdName=${encodeURIComponent(sd)}`
    + (wiw ? `&wiwName=${encodeURIComponent(wiw)}` : '')
    + `&numOfRows=100&pageNo=${page}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (patchkr)' } });
  if (!r.ok) return { xml: '', ok: false };
  return { xml: await r.text(), ok: true };
}

function parseItems(xml, nameTag) {
  return xml.split('<item>').slice(1).map(it => ({
    ps: decodeXml(xmlTag(it, nameTag)),    // 투표소명 (본=psName / 사전=evPsName)
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
  // 투표소 위치는 사실상 정적 → 길게 캐시
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=21600, stale-while-revalidate=86400');

  const sd = (req.query.sd || req.query.sdName || '').toString().trim();
  const wiw = (req.query.wiw || req.query.wiwName || '').toString().trim();
  const typeKey = (req.query.type || 'day').toString().trim();
  const T = OPS[typeKey] || OPS.day;
  if (!sd) return res.status(400).json({ error: 'sd (시도명) 파라미터가 필요합니다.', stations: [] });
  if (!NEC_KEY) return res.status(200).json({ sd, stations: [], count: 0, source: 'none', note: 'DATA_GO_KR_KEY 미설정 — Vercel 환경변수 등록 필요' });

  try {
    const first = await fetchPage(T.op, sd, wiw, 1);
    if (!first.ok || !/INFO-00|NORMAL SERVICE/.test(first.xml)) {
      return res.status(200).json({ sd, wiw: wiw || null, type: typeKey, count: 0, stations: [], source: 'data.go.kr', note: '데이터 없음 (아직 미공개이거나 조건 불일치)' });
    }
    const totalCount = parseInt((first.xml.match(/<totalCount>(\d+)/) || [])[1] || '0', 10);
    const totalPages = Math.min(Math.ceil(totalCount / 100) || 1, MAX_PAGES);
    let stations = parseItems(first.xml, T.name);
    if (totalPages > 1) {
      const pages = [];
      for (let p = 2; p <= totalPages; p++) pages.push(p);
      for (let i = 0; i < pages.length; i += CHUNK) {
        const rest = await Promise.all(pages.slice(i, i + CHUNK).map(p => fetchPage(T.op, sd, wiw, p)));
        for (const r of rest) if (r.ok) stations = stations.concat(parseItems(r.xml, T.name));
      }
    }
    return res.status(200).json({ sd, wiw: wiw || null, type: typeKey, count: stations.length, total: totalCount, stations, source: 'data.go.kr (공식)' });
  } catch (e) {
    return res.status(200).json({ sd, wiw: wiw || null, type: typeKey, count: 0, stations: [], source: 'error', error: e.message });
  }
}
