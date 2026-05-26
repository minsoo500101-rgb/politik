// AI 공약 분류 — Anthropic Claude Haiku 호출
// 평가·해석·비교 없이 객관 분류·요약만.
//
// GET /api/ai-classify?huboid=...&sg=3
//
// 환경변수:
//   ANTHROPIC_API_KEY        — 필수
//   AI_CLASSIFY_ENABLE       — '1'이면 활성, 아니면 503
//
// 안전 가드:
//   1. 선거 30일 전~선거일+1주 동안 자동 비활성 (공직선거법 250·251조 회피)
//   2. 평가·비방·예측 요청 거부 (시스템 프롬프트로 제한)
//   3. 결과 캐시 (메모리 7일)
//   4. 요청 속도 제한 (선택)

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5'; // 가장 저렴·빠른 모델

const cache = new Map();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 선거 가드 — 30일 전 ~ 선거일 + 7일 동안 비활성
function isElectionLockout() {
  const electionDate = new Date('2026-06-03T00:00:00+09:00');
  const lockStart = new Date(electionDate.getTime() - 30 * 86400000);
  const lockEnd = new Date(electionDate.getTime() + 7 * 86400000);
  const now = new Date();
  return now >= lockStart && now <= lockEnd;
}

// NEC 공약 fetch (자체)
async function fetchNecPledges(huboid, sg) {
  const NEC_API = 'https://apis.data.go.kr/9760000/PolicyService/getPolicyList';
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) return null;
  const params = new URLSearchParams({
    serviceKey: key,
    sgId: '20260603',
    sgTypecode: sg || '3',
    cnddtId: huboid,
    _type: 'json',
    numOfRows: '10',
    pageNo: '1',
  });
  try {
    const r = await fetch(NEC_API + '?' + params.toString());
    if (!r.ok) return null;
    const j = await r.json();
    let items = j?.response?.body?.items?.item || j?.body?.items?.item || [];
    if (!Array.isArray(items)) items = items ? [items] : [];
    if (!items.length) return [];
    const data = items[0];
    const pledges = [];
    for (let i = 1; i <= 10; i++) {
      const realm = data['prmsRealmName' + i] || '';
      const title = data['prmsTitle' + i] || '';
      const cont = data['prmsCont' + i] || '';
      if (realm || title) pledges.push({ realm, title, cont });
    }
    return pledges;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // 활성 여부 체크
  const enabled = process.env.AI_CLASSIFY_ENABLE === '1';
  if (!enabled) {
    return res.status(503).json({
      error: 'AI 분류 비활성 상태입니다',
      reason: 'AI_CLASSIFY_ENABLE 환경변수 미설정',
      note: '선거 종료 후(2026-06-04 이후) 운영자가 활성화합니다.'
    });
  }
  // 선거 가드
  if (isElectionLockout()) {
    return res.status(503).json({
      error: '선거 기간 AI 분석 차단',
      reason: '공직선거법 250·251조 위험 회피 — 선거 30일 전부터 선거일+7일까지 자동 비활성',
      lockout_period: '2026-05-04 ~ 2026-06-10',
      note: '선거가 끝나면 자동 재개됩니다.'
    });
  }

  const huboid = req.query.huboid;
  const sg = req.query.sg || '3';
  if (!huboid) {
    return res.status(400).json({ error: 'huboid 파라미터 필요' });
  }

  // 캐시 체크
  const cacheKey = huboid + ':' + sg;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return res.status(200).json({ ...cached.data, cached: true });
  }

  // API 키 체크
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY 미설정' });
  }

  // 공약 fetch
  const pledges = await fetchNecPledges(huboid, sg);
  if (!pledges) {
    return res.status(500).json({ error: 'NEC 공약 fetch 실패' });
  }
  if (!pledges.length) {
    return res.status(404).json({ error: '등록된 공약 없음', huboid });
  }

  // Claude Haiku 호출
  const SYSTEM_PROMPT = `당신은 한국 정치 데이터 분석 보조입니다. 후보자의 공약을 객관적으로 분류·요약하는 일만 합니다.

엄격한 규칙:
1. 후보를 평가·비방·예측·비교하지 않습니다 (공직선거법 위반 회피).
2. 공약 자체의 표면 정보만 다룹니다 — 의도·실현 가능성·정책 효과는 판단하지 않습니다.
3. 분류는 객관적 주제 태그만 합니다 (경제·교육·복지·안전·교통·환경·문화 등).
4. 요약은 1-2문장으로 사실 그대로 (의역·해석 X).
5. 정치적 견해·정당 비교·이념적 평가를 절대 하지 않습니다.

응답은 반드시 JSON 형식:
{
  "summary": "후보 공약 전체를 객관적으로 1문장 요약 (사실만)",
  "topics": ["주제1", "주제2", ...],
  "by_pledge": [
    { "ord": 1, "topic": "주제 태그", "summary": "공약 사실 요약" }
  ]
}`;

  const userMessage = '아래 공약을 객관 분류·요약하세요. 평가·비교·예측 금지.\n\n' +
    pledges.map((p, i) => `[공약 ${i + 1}] 분야: ${p.realm}\n제목: ${p.title}\n내용: ${(p.cont || '').slice(0, 300)}`).join('\n\n');

  try {
    const r = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: 'Claude API 실패', detail: text.slice(0, 200) });
    }
    const data = await r.json();
    const content = data?.content?.[0]?.text || '';
    // JSON 파싱 시도
    let parsed = null;
    try {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch (e) {}
    if (!parsed) {
      return res.status(502).json({ error: 'AI 응답 JSON 파싱 실패', raw: content.slice(0, 300) });
    }
    const result = {
      huboid,
      pledges_count: pledges.length,
      classified_at: new Date().toISOString(),
      model: MODEL,
      ...parsed,
    };
    cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL_MS });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
