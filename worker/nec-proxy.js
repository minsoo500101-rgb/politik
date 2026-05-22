// Cloudflare Worker — 중앙선거관리위원회 / 정책공약마당 CORS 프록시
// 배포: https://workers.cloudflare.com/ → Create Service → 이 파일 붙여넣기
// 호스트: nec-proxy.{your-subdomain}.workers.dev
//
// 사용법:
//   GET /candidates?sgId=20260603&sgTypecode=4
//   GET /policies?sgId=20260603&candidateId=...
//   GET /raw?url=https%3A%2F%2Finfo.nec.go.kr%2F...
//
// 클라이언트:
//   fetch('https://nec-proxy.you.workers.dev/raw?url=' + encodeURIComponent(realUrl))
//
// 환경변수 (선택):
//   DATA_GO_KR_KEY — data.go.kr OpenAPI 키 (등록 후 발급)

const ALLOWED_HOSTS = [
  'info.nec.go.kr',
  'policy.nec.go.kr',
  'www.nec.go.kr',
  'apis.data.go.kr',
];

const ALLOWED_ORIGINS = [
  'https://minsoo500101-rgb.github.io',
  'https://patchkr.com',           // 커스텀 도메인 추가 시
  'https://*.vercel.app',
  'https://*.netlify.app',
  'http://localhost:8091',          // 로컬 개발
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.some(p => {
    if (p.includes('*')) return new RegExp(p.replace('*', '.*')).test(origin || '');
    return p === origin;
  }) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // 1) data.go.kr OpenAPI — 후보자 등록 정보
    if (url.pathname === '/candidates') {
      const sgId = url.searchParams.get('sgId') || '20260603';
      const sgTypecode = url.searchParams.get('sgTypecode') || '4'; // 4=광역단체장
      const key = env.DATA_GO_KR_KEY;
      if (!key) return jsonErr(503, 'DATA_GO_KR_KEY 환경변수 미설정', origin);
      const apiUrl = `https://apis.data.go.kr/9760000/PofelcddInfoInqireService2/getPoelpcddRegistSttusInfoInqire?serviceKey=${key}&sgId=${sgId}&sgTypecode=${sgTypecode}&pageNo=1&numOfRows=300&resultType=json`;
      return forward(apiUrl, origin, 600);
    }

    // 2) 정책공약마당 — 후보자 공약 PDF/JSON
    if (url.pathname === '/policies') {
      const sgId = url.searchParams.get('sgId') || '20260603';
      const apiUrl = `https://policy.nec.go.kr/svc/policy/openapi/getPolicyList.do?sgId=${sgId}&pageNo=1&numOfRows=500`;
      return forward(apiUrl, origin, 600);
    }

    // 3) 일반 raw 프록시 (화이트리스트 도메인만)
    if (url.pathname === '/raw') {
      const target = url.searchParams.get('url');
      if (!target) return jsonErr(400, 'url 파라미터 필요', origin);
      let targetUrl;
      try { targetUrl = new URL(target); } catch { return jsonErr(400, '잘못된 URL', origin); }
      if (!ALLOWED_HOSTS.includes(targetUrl.host)) {
        return jsonErr(403, `허용되지 않은 호스트: ${targetUrl.host}`, origin);
      }
      return forward(targetUrl.toString(), origin, 300);
    }

    // 4) 헬스체크
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        name: 'NEC Proxy',
        version: '1.0.0',
        endpoints: ['/candidates', '/policies', '/raw'],
        allowed_hosts: ALLOWED_HOSTS,
      }, null, 2), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
      });
    }

    return jsonErr(404, 'Not Found — /candidates · /policies · /raw 중 하나 사용', origin);
  },
};

async function forward(targetUrl, origin, cacheSecs = 300) {
  try {
    const r = await fetch(targetUrl, {
      cf: { cacheTtl: cacheSecs, cacheEverything: true },
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KoreaPatchNotes/1.0; +https://github.com/minsoo500101-rgb/politik)',
        'Accept': 'application/json, text/html, */*',
      },
    });
    const body = await r.text();
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    return new Response(body, {
      status: r.status,
      headers: {
        'Content-Type': ct,
        'Cache-Control': `public, max-age=${cacheSecs}`,
        'X-Proxy-Target': targetUrl,
        ...corsHeaders(origin),
      },
    });
  } catch (e) {
    return jsonErr(502, '프록시 실패: ' + e.message, origin);
  }
}

function jsonErr(status, message, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}
