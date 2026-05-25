// Cloudflare Worker — 중앙선거관리위원회 OpenAPI (data.go.kr) 프록시
// 배포: https://workers.cloudflare.com/ → Create Worker → 이 파일 붙여넣기
// 또는: cd worker && wrangler deploy
//
// 환경변수 (Secret):
//   DATA_GO_KR_KEY — data.go.kr OpenAPI 인증키 (Decoding 키 사용)
//
// 엔드포인트:
//   GET /candidates?sgId=20260603&sgTypecode=4&pageNo=1&numOfRows=300
//   GET /policies?sgId=20260603&sgTypecode=4&cnddtId=...
//   GET /winners?sgId=20220601&sgTypecode=4
//   GET /codes?sgId=20260603
//   GET /search?name=이재명
//   GET /health

const NEC_BASE = 'http://apis.data.go.kr/9760000';

const ALLOWED_ORIGINS = [
  'https://politik-phi.vercel.app',
  'https://minsoo500101-rgb.github.io',
  'https://patchkr.com',
  'http://localhost:8091',
  'http://127.0.0.1:8091',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin)
    || /^https:\/\/.*\.vercel\.app$/.test(origin || '')
    || /^https:\/\/.*\.netlify\.app$/.test(origin || '');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
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

    const key = env.DATA_GO_KR_KEY;
    if (!key && url.pathname !== '/' && url.pathname !== '/health') {
      return jsonErr(503, 'DATA_GO_KR_KEY 환경변수 미설정. wrangler secret put DATA_GO_KR_KEY', origin);
    }

    // 1) 후보자 정보 조회 (15000908)
    // 예: /candidates?sgId=20260603&sgTypecode=4
    //   sgTypecode: 1=대선, 2=총선, 3=시도지사, 4=구시군의장, 5=시도의원, 6=구시군의원,
    //               7=교육감, 8=교육의원, 9=비례시도의원, 10=비례구시군의원, 11=교육감
    if (url.pathname === '/candidates') {
      const params = passThrough(url.searchParams, ['sgId', 'sgTypecode', 'pageNo', 'numOfRows', 'sggName', 'sdName']);
      params.set('ServiceKey', key);
      params.set('resultType', 'json');
      if (!params.has('numOfRows')) params.set('numOfRows', '500');
      if (!params.has('pageNo')) params.set('pageNo', '1');
      return forward(
        // 정확한 메서드명: getPofelcddRegistSttusInfoInqire (Po-FEL-cdd)
        `${NEC_BASE}/PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire?${params}`,
        origin, 600
      );
    }
    // 역대 지방선거 실시상황 (NEW)
    if (url.pathname === '/local-status') {
      const params = passThrough(url.searchParams, ['sgId', 'sgTypecode', 'pageNo', 'numOfRows']);
      params.set('ServiceKey', key);
      params.set('resultType', 'json');
      if (!params.has('numOfRows')) params.set('numOfRows', '300');
      return forward(
        `${NEC_BASE}/ScgnLocElctExctSttnService/getScgnLocElctExctSttnInfoInqire?${params}`,
        origin, 3600
      );
    }

    // 2) 선거공약 정보 (15040587) — 후보자별 5대 공약
    // /policies?sgId=20260603&sgTypecode=4&cnddtId=XXXX
    if (url.pathname === '/policies') {
      const params = passThrough(url.searchParams, ['sgId', 'sgTypecode', 'cnddtId', 'pageNo', 'numOfRows']);
      params.set('ServiceKey', key);
      params.set('resultType', 'json');
      if (!params.has('numOfRows')) params.set('numOfRows', '50');
      return forward(
        `${NEC_BASE}/ElecPrmsInfoInqireService/getCnddtElecPrmsInfoInqire?${params}`,
        origin, 600
      );
    }

    // 3) 당선인 정보 (15000864) — 역대 당선 결과
    // /winners?sgId=20220601&sgTypecode=4
    if (url.pathname === '/winners') {
      const params = passThrough(url.searchParams, ['sgId', 'sgTypecode', 'pageNo', 'numOfRows']);
      params.set('ServiceKey', key);
      params.set('resultType', 'json');
      if (!params.has('numOfRows')) params.set('numOfRows', '500');
      return forward(
        `${NEC_BASE}/PofelcddElecInfoInqireService/getPoeswfCnddtRegistSttusInfoInqire?${params}`,
        origin, 3600
      );
    }

    // 4) 코드 정보 (15000897) — 알려진 선거 ID·종류 목록
    // /codes?sgId=20260603 (없으면 전체)
    if (url.pathname === '/codes') {
      const params = passThrough(url.searchParams, ['sgId', 'pageNo', 'numOfRows']);
      params.set('ServiceKey', key);
      params.set('resultType', 'json');
      if (!params.has('numOfRows')) params.set('numOfRows', '100');
      return forward(
        `${NEC_BASE}/CommonCodeService/getCommonSgCodeList?${params}`,
        origin, 86400  // 코드는 변경 거의 없음 → 1일 캐시
      );
    }

    // 5) 후보자 통합검색 (15140045) — 이름 기반 모든 선거 검색
    // /search?name=이재명
    if (url.pathname === '/search') {
      const params = passThrough(url.searchParams, ['name', 'huboNm', 'pageNo', 'numOfRows']);
      // API 파라미터는 huboNm 또는 cnddtNm
      if (params.has('name') && !params.has('huboNm')) {
        params.set('huboNm', params.get('name'));
        params.delete('name');
      }
      params.set('ServiceKey', key);
      params.set('resultType', 'json');
      if (!params.has('numOfRows')) params.set('numOfRows', '50');
      return forward(
        `${NEC_BASE}/CnddtNmInfoInqireService/getCnddtNmInfoInqire?${params}`,
        origin, 1800
      );
    }

    // 6) 헬스체크
    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonOk({
        name: 'NEC Proxy (data.go.kr)',
        version: '2.0.0',
        hasKey: !!key,
        endpoints: {
          '/candidates': 'sgId, sgTypecode (+ pageNo, numOfRows, sggName, sdName) — 후보자 명단',
          '/policies':   'sgId, sgTypecode, cnddtId — 후보 5대 공약',
          '/winners':    'sgId, sgTypecode — 역대 당선인',
          '/codes':      '[sgId] — 선거 ID/종류/지역 코드',
          '/search':     'name — 이름으로 모든 선거 통합 검색',
        },
        sgTypecode: {
          '1': '대통령선거', '2': '국회의원선거', '3': '시·도지사선거',
          '4': '구·시·군의장선거', '5': '시·도의원선거', '6': '구·시·군의원선거',
          '7': '교육감선거', '8': '교육의원선거',
          '9': '비례시도의원', '10': '비례구시군의원', '11': '교육감(공약대상)',
        },
        sample_sgId: {
          '20260603': '제9회 전국동시지방선거 (2026)',
          '20240410': '제22대 국회의원선거 (2024)',
          '20220601': '제8회 전국동시지방선거 (2022)',
          '20220309': '제20대 대통령선거 (2022)',
          '20180613': '제7회 전국동시지방선거 (2018)',
        },
      }, origin);
    }

    return jsonErr(404, 'Not Found — /candidates, /policies, /winners, /codes, /search, /health', origin);
  },
};

function passThrough(sp, allowed) {
  const out = new URLSearchParams();
  for (const k of allowed) if (sp.has(k)) out.set(k, sp.get(k));
  return out;
}

async function forward(targetUrl, origin, cacheSecs = 300) {
  try {
    const r = await fetch(targetUrl, {
      cf: { cacheTtl: cacheSecs, cacheEverything: true },
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KoreaPatchNotes/2.0; +https://politik-phi.vercel.app)',
        'Accept': 'application/json, application/xml, text/xml, */*',
      },
    });
    const ct = r.headers.get('content-type') || '';
    let body = await r.text();

    // XML → JSON 자동 변환 (실패 시 그대로)
    if (ct.includes('xml') || body.startsWith('<?xml')) {
      try {
        body = JSON.stringify(parseXmlSimple(body));
      } catch (_) { /* leave as XML */ }
    }

    return new Response(body, {
      status: r.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${cacheSecs}`,
        'X-Proxy-Target': new URL(targetUrl).pathname,
        ...corsHeaders(origin),
      },
    });
  } catch (e) {
    return jsonErr(502, '프록시 실패: ' + e.message, origin);
  }
}

// 매우 단순한 XML → JS 객체 (NEC 응답 구조: <response><body><items><item>...</item></items></body></response>)
function parseXmlSimple(xml) {
  function parseEl(s) {
    const obj = {};
    const re = /<([\w-]+)>([\s\S]*?)<\/\1>/g;
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
  return parseEl(xml.replace(/<\?xml[^?]*\?>/, ''));
}

function jsonOk(data, origin) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      ...corsHeaders(origin),
    },
  });
}

function jsonErr(status, message, origin) {
  return new Response(JSON.stringify({ error: message, status }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}
