// Vercel Serverless Function — 중앙선거관리위원회 (data.go.kr) 프록시
// 환경변수: DATA_GO_KR_KEY (Vercel 대시보드 → Environment Variables에 설정)
//
// 사용:
//   GET /api/nec?endpoint=candidates&sgId=20260603&sgTypecode=3
//   GET /api/nec?endpoint=policies&sgId=20260603&sgTypecode=3&cnddtId=XXX
//   GET /api/nec?endpoint=local-status&sgId=20220601
//   GET /api/nec?endpoint=health  (헬스체크)

const NEC_BASE = 'https://apis.data.go.kr/9760000';

// 엔드포인트 매핑 (정확한 메서드명)
const ENDPOINTS = {
  // 후보자 정보
  candidates: {
    path: '/PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire',
    allowed: ['sgId', 'sgTypecode', 'pageNo', 'numOfRows', 'sggName', 'sdName'],
    cacheSecs: 600,
  },
  // 선거공약 정보
  policies: {
    path: '/ElecPrmsInfoInqireService/getCnddtElecPrmsInfoInqire',
    allowed: ['sgId', 'sgTypecode', 'cnddtId', 'pageNo', 'numOfRows'],
    cacheSecs: 600,
  },
  // 역대 지방선거 실시상황 (신규)
  'local-status': {
    path: '/ScgnLocElctExctSttnService/getScgnLocElctExctSttnInfoInqire',
    allowed: ['sgId', 'sgTypecode', 'pageNo', 'numOfRows'],
    cacheSecs: 3600,
  },
};

export default async function handler(req, res) {
  // CORS — 같은 도메인이라 사실 불필요하지만 명시
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { endpoint, ...rest } = req.query;

  // 헬스체크
  if (!endpoint || endpoint === 'health') {
    return res.status(200).json({
      name: 'NEC Proxy (Vercel Serverless)',
      version: '1.0.0',
      hasKey: !!process.env.DATA_GO_KR_KEY,
      endpoints: Object.keys(ENDPOINTS),
      sgTypecode: {
        '1': '대통령선거', '2': '국회의원선거', '3': '시·도지사선거',
        '4': '구·시·군의장선거', '5': '시·도의원선거', '6': '구·시·군의원선거',
        '7': '교육감선거', '8': '교육의원선거',
        '11': '교육감(공약대상)',
      },
      sample_sgId: {
        '20260603': '제9회 전국동시지방선거 (2026, 진행 중)',
        '20240410': '제22대 국회의원선거 (2024)',
        '20220601': '제8회 전국동시지방선거 (2022)',
        '20180613': '제7회 전국동시지방선거 (2018)',
      },
      usage: '/api/nec?endpoint=candidates&sgId=20220601&sgTypecode=3',
    });
  }

  const spec = ENDPOINTS[endpoint];
  if (!spec) {
    return res.status(404).json({
      error: `Unknown endpoint: ${endpoint}`,
      available: Object.keys(ENDPOINTS),
    });
  }

  const key = process.env.DATA_GO_KR_KEY;
  if (!key) {
    return res.status(503).json({
      error: 'DATA_GO_KR_KEY 환경변수 미설정',
      hint: 'Vercel 대시보드 → Settings → Environment Variables에 추가',
    });
  }

  // 파라미터 구성 (allowed만)
  const params = new URLSearchParams();
  for (const k of spec.allowed) {
    if (rest[k] !== undefined) params.set(k, rest[k]);
  }
  params.set('serviceKey', key);
  params.set('resultType', 'json');
  if (!params.has('numOfRows')) params.set('numOfRows', '500');
  if (!params.has('pageNo')) params.set('pageNo', '1');

  const targetUrl = `${NEC_BASE}${spec.path}?${params}`;

  try {
    const r = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KoreaPatchNotes/1.0; +https://patchkr.com)',
        'Accept': 'application/json, application/xml, */*',
      },
    });
    const ct = r.headers.get('content-type') || '';
    let body = await r.text();

    // XML이면 JSON으로 변환
    if (ct.includes('xml') || body.trim().startsWith('<?xml') || body.trim().startsWith('<')) {
      try { body = JSON.stringify(parseXmlSimple(body)); } catch (_) { /* keep xml */ }
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', `public, max-age=${spec.cacheSecs}, s-maxage=${spec.cacheSecs}`);
    res.setHeader('X-NEC-Path', spec.path);
    res.status(r.status).send(body);
  } catch (e) {
    return res.status(502).json({
      error: '프록시 실패: ' + e.message,
      target: targetUrl.replace(key, '***'),
    });
  }
}

// 간단한 XML → JS 객체 변환 (NEC 응답 구조)
function parseXmlSimple(xml) {
  function parseEl(s) {
    const obj = {};
    const re = /<([\w:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const [, tag, val] = m;
      const trimmed = val.trim();
      const child = trimmed.includes('<') ? parseEl(trimmed) : trimmed;
      if (obj[tag] === undefined) obj[tag] = child;
      else if (Array.isArray(obj[tag])) obj[tag].push(child);
      else obj[tag] = [obj[tag], child];
    }
    return obj;
  }
  const cleaned = xml.replace(/<\?xml[^?]*\?>/, '');
  return parseEl(cleaned);
}
