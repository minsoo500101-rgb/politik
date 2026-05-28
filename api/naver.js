// Vercel Serverless — 네이버 뉴스/백과 검색 API 프록시 (v2 — Origin 화이트리스트)
// https://developers.naver.com/docs/serviceapi/search/news/news.md
//
// 환경변수:
//   NAVER_CLIENT_ID
//   NAVER_CLIENT_SECRET
//
// ⚠️ 제3자 사용 금지: 네이버 개발자 이용약관상 검색 API 결과의
// 단순 노출·재배포가 금지됩니다. 이 endpoint는 patchkr.com 내부 전용.
//
// GET /api/naver?q=정청래&display=5&type=news       (뉴스 검색)
// GET /api/naver?q=정청래&type=encyc                (백과사전)
// GET /api/naver?action=health

const NAVER_BASE = 'https://openapi.naver.com/v1/search';

// V26.3 — Origin 화이트리스트
const ALLOWED_ORIGINS = [
  'https://patchkr.com',
  'https://www.patchkr.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5500',
];
const VERCEL_PREVIEW_RE = /^https:\/\/politik-[a-z0-9-]+\.vercel\.app$/;

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (VERCEL_PREVIEW_RE.test(origin)) return true;
  return false;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const referer = req.headers.referer || '';
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Origin 검증 — 헬스체크는 예외
  const isHealthCheck = req.query.action === 'health';
  let corsOk = false;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    corsOk = true;
  } else if (!origin && (
    referer.startsWith('https://patchkr.com') ||
    referer.startsWith('https://www.patchkr.com') ||
    referer.includes('localhost')
  )) {
    corsOk = true;
  }

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!corsOk && !isHealthCheck) {
    return res.status(403).json({
      error: 'origin not allowed',
      message: '이 endpoint는 patchkr.com 내부 전용입니다. 네이버 개발자 이용약관상 검색 API 결과의 재배포가 금지됩니다.',
    });
  }

  // 뉴스는 자주 바뀌므로 CDN 캐시 짧게, 브라우저 캐시 잠깐
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');

  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  const { action, q, query, display = '5', start = '1', sort = 'sim', type = 'news' } = req.query;
  const keyword = q || query;

  if (action === 'health') {
    return res.status(200).json({
      name: 'Naver Search API Proxy',
      version: '1.0.0',
      hasId: !!id,
      hasSecret: !!secret,
      endpoints: {
        '/api/naver?q=KEYWORD&type=news':  '뉴스 검색 (최대 100건, sort=sim/date)',
        '/api/naver?q=KEYWORD&type=encyc': '백과사전 검색',
        '/api/naver?q=KEYWORD&type=blog':  '블로그 검색',
        '/api/naver?q=KEYWORD&type=webkr': '웹문서 검색',
      },
    });
  }

  if (!id || !secret) {
    return res.status(503).json({
      error: 'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수 미설정',
      hint: 'developers.naver.com 가입 후 Vercel env 추가',
    });
  }

  if (!keyword) {
    return res.status(400).json({ error: 'q 파라미터 필요' });
  }

  // 타입 검증
  const validTypes = ['news', 'encyc', 'blog', 'webkr', 'book'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `type은 ${validTypes.join('/')} 중 하나` });
  }

  const url = `${NAVER_BASE}/${type}.json?query=${encodeURIComponent(keyword)}&display=${display}&start=${start}&sort=${sort}`;

  try {
    const r = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': id,
        'X-Naver-Client-Secret': secret,
      },
    });
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
