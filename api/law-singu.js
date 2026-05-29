// V31.5 — 법령 신구비교 프록시 (국가법령정보 OPEN API, target=oldAndNew)
// OC는 env(LAW_OC), Referer는 등록 도메인(patchkr.com). 클라이언트에 OC 미노출.
//   /api/law-singu?action=list&q=철도안전법  → 신구표 목록(법/시행령/시행규칙)
//   /api/law-singu?action=body&mst=280129    → 신구 본문(구/신 조문 배열)
const BASE = 'https://www.law.go.kr/DRF';
const REFERER = process.env.LAW_REFERER || 'https://patchkr.com';
const asArr = x => Array.isArray(x) ? x : (x == null ? [] : [x]);

async function drf(path, params, OC, tries = 3) {
  const u = new URL(`${BASE}/${path}`);
  u.searchParams.set('OC', OC);
  u.searchParams.set('type', 'json');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  let lastErr;
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch(u, { headers: { Referer: REFERER, 'User-Agent': 'Mozilla/5.0 (compatible; patchkr/1.0; +https://patchkr.com)' } });
      const t = await r.text();
      if (t && t.trim()) return JSON.parse(t);
      lastErr = new Error('빈 응답');
    } catch (e) { lastErr = e; }
    if (a < tries - 1) await new Promise(r => setTimeout(r, 500));
  }
  throw lastErr || new Error('재시도 초과');
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
  const OC = process.env.LAW_OC;
  if (!OC) return res.status(200).json({ error: 'LAW_OC 환경변수 미설정' });

  const action = (req.query?.action) || 'list';
  try {
    if (action === 'body') {
      const mst = req.query?.mst || '';
      const j = await drf('lawService.do', { target: 'oldAndNew', MST: mst }, OC);
      const s = j?.OldAndNewService || {};
      return res.status(200).json({
        name: s.법령명, ef: s.시행일자,
        old: asArr(s?.구조문목록?.조문),
        new: asArr(s?.신조문목록?.조문),
      });
    }
    // action === 'list'
    const q = req.query?.q || '';
    const j = await drf('lawSearch.do', { target: 'oldAndNew', query: q, display: '50' }, OC);
    const items = asArr(j?.OldAndNewLawSearch?.oldAndNew).map(it => ({
      name: it.신구법명, kind: it.법령구분명, rev: it.제개정구분명,
      ef: it.시행일자, pub: it.공포일자, pubNo: it.공포번호,
      dept: it.소관부처명, mst: it.신구법일련번호,
    }));
    return res.status(200).json(items);
  } catch (e) {
    return res.status(200).json({ error: (e && e.message) || 'fetch 실패', cause: e?.cause?.code || e?.cause?.message || String(e?.cause || '') });
  }
}
