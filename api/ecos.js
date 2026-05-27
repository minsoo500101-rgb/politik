// 한국은행 ECOS OpenAPI 프록시
// ECOS_API_KEY 환경변수가 있으면 라이브 fetch, 없으면 503 (사이트는 정적 fallback)
//
// GET /api/ecos?stat=722Y001&item=0101000&period=A&start=2015&end=2025
//   stat: 통계표코드 (예: 722Y001 = 기준금리)
//   item: 통계항목코드
//   period: A(연)·M(월)·D(일)
//
// 자주 쓰는 통계표 코드:
//   722Y001 — 한국은행 기준금리
//   731Y004 — 시장금리 (CD·국채)
//   036Y001 — 환율 (원/달러)
//   901Y009 — 소비자물가지수 (CPI)
//   200Y001 — 국민계정 (GDP)
//   903Y049 — 가계신용

const ECOS_BASE = 'https://ecos.bok.or.kr/api/StatisticSearch';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const key = process.env.ECOS_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: 'ECOS_API_KEY 미설정',
      hint: 'https://ecos.bok.or.kr 에서 무료 가입 후 Vercel env에 ECOS_API_KEY 추가하세요',
      fallback: 'data/economy.json 정적 데이터로 사이트는 정상 동작'
    });
  }

  const { stat, item = '', period = 'A', start = '2015', end = '2025', count = '100' } = req.query;
  if (!stat) {
    return res.status(400).json({ error: 'stat 파라미터 필요 (예: 722Y001 = 기준금리)' });
  }

  // ECOS URL 패턴: /key/json/lang/start/count/stat/period/start_date/end_date/item
  const url = `${ECOS_BASE}/${key}/json/kr/1/${count}/${stat}/${period}/${start}/${end}${item ? '/' + item : ''}`;

  try {
    const r = await fetch(url);
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    // debug 모드: 원본 그대로 반환 (URL에서 키만 마스킹)
    if (req.query.debug === '1') {
      const maskedUrl = url.replace(key, '***KEY***');
      return res.status(200).json({
        debug: true,
        request_url: maskedUrl,
        http_status: r.status,
        ecos_raw: data || text.slice(0, 1000),
      });
    }

    if (!r.ok) {
      return res.status(502).json({ error: 'ECOS API 오류', status: r.status, body: text.slice(0, 200) });
    }
    // ECOS는 에러도 200으로 응답하고 RESULT 객체에 코드 넣음
    if (data?.RESULT?.CODE && data.RESULT.CODE !== 'INFO-000') {
      return res.status(200).json({
        stat,
        period,
        count: 0,
        data: [],
        ecos_error: { code: data.RESULT.CODE, message: data.RESULT.MESSAGE },
        source: '한국은행 ECOS',
      });
    }
    // ECOS 응답 정규화
    const rows = data?.StatisticSearch?.row || [];
    const normalized = rows.map(r => ({
      time: r.TIME,
      value: parseFloat(r.DATA_VALUE),
      unit: r.UNIT_NAME,
      item: r.ITEM_NAME1,
    }));
    return res.status(200).json({
      stat,
      period,
      count: normalized.length,
      data: normalized,
      source: '한국은행 ECOS',
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
