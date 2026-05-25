// Vercel Serverless — 국가법령정보 OpenAPI 프록시
// https://open.law.go.kr/LSO/openApi/openApiManual.do
//
// 환경변수: LAW_GO_KR_OC (회원 ID, 무료 가입 후 발급)
// 도메인 등록: open.law.go.kr 가입 시 politik-phi.vercel.app 등록
//
// GET /api/law?action=search&query=항공안전법
// GET /api/law?action=detail&mst=259420
// GET /api/law?action=health

const LAW_BASE = 'https://www.law.go.kr/DRF';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');

  const oc = process.env.LAW_GO_KR_OC;
  const { action = 'health', query, mst, target = 'law' } = req.query;

  if (action === 'health') {
    return res.status(200).json({
      name: 'Korea Law Info Proxy',
      version: '1.0.0',
      hasOC: !!oc,
      endpoints: {
        '/api/law?action=search&query=NAME': '법령 검색 (lawSearch.do)',
        '/api/law?action=detail&mst=ID':    '법령 본문 (lawService.do)',
      },
      target_types: {
        'law':       '현행법령',
        'prec':      '판례',
        'admrul':    '행정규칙',
        'ordin':     '자치법규',
        'detc':      '헌법재판소 결정',
        'expc':      '법령해석례',
      },
      setup: {
        '1': 'https://open.law.go.kr 가입 (무료)',
        '2': '내 정보 → API 신청 → 회원ID(OC) 확인',
        '3': 'API 사용 서버 도메인 등록 (politik-phi.vercel.app)',
        '4': 'Vercel env LAW_GO_KR_OC = 발급받은 OC',
      },
    });
  }

  if (!oc) {
    return res.status(503).json({
      error: 'LAW_GO_KR_OC 환경변수 미설정',
      hint: 'open.law.go.kr 가입 후 회원ID(OC)를 Vercel env로 추가',
    });
  }

  let url;
  if (action === 'search') {
    if (!query) return res.status(400).json({ error: 'query 파라미터 필요' });
    url = `${LAW_BASE}/lawSearch.do?OC=${oc}&target=${target}&query=${encodeURIComponent(query)}&type=JSON&display=20`;
  } else if (action === 'detail') {
    if (!mst) return res.status(400).json({ error: 'mst 파라미터 필요 (법령 마스터번호)' });
    url = `${LAW_BASE}/lawService.do?OC=${oc}&target=${target}&MST=${encodeURIComponent(mst)}&type=JSON`;
  } else {
    return res.status(400).json({ error: 'action은 search 또는 detail' });
  }

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KoreaPatchNotes/1.0)',
        'Accept': 'application/json',
        // ★ open.law.go.kr API는 Origin/Referer 헤더가 등록된 도메인과 일치해야 작동
        'Origin': 'https://politik-phi.vercel.app',
        'Referer': 'https://politik-phi.vercel.app/',
      },
    });
    const ct = r.headers.get('content-type') || '';
    let body = await r.text();
    res.setHeader('Content-Type', ct.includes('json') ? 'application/json; charset=utf-8' : 'application/xml; charset=utf-8');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
