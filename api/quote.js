// Vercel Serverless Function — 한국 시장 시세 프록시 (v4 — Origin 화이트리스트)
//
// 변경 이력:
// v1: Yahoo v7 quote → 2023년 Unauthorized 차단
// v2: Yahoo v8 chart 단독 → Vercel 데이터센터 IP 일부 차단 가능
// v3: Yahoo v8 chart 우선, 실패 시 Stooq CSV fallback (무료 5분 지연)
// v4: CORS:* 제거 → patchkr.com origin 화이트리스트 (Yahoo Finance ToS 재배포 금지 대응)
//
// 사용 (patchkr.com 내부 전용):
//   GET /api/quote?symbols=^KS11,^KQ11,KRW=X
//
// ⚠️ 제3자 사용 금지: Yahoo Finance ToS·Stooq personal-use 조건상
// 이 endpoint의 응답은 patchkr.com 페이지에서만 소비될 수 있음.
//
// Stooq 심볼 매핑:
//   ^KS11 → ^kospi
//   ^KQ11 → ^kosdaq
//   KRW=X → usdkrw
//   CL=F → cl.f
//   GC=F → gc.f
//   BTC-USD → btcusd

// 허용된 Origin (preview deploys 포함)
const ALLOWED_ORIGINS = [
  'https://patchkr.com',
  'https://www.patchkr.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5500',
];
// Vercel preview deploy 패턴 (politik-*.vercel.app)
const VERCEL_PREVIEW_RE = /^https:\/\/politik-[a-z0-9-]+\.vercel\.app$/;

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (VERCEL_PREVIEW_RE.test(origin)) return true;
  return false;
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const referer = req.headers.referer || '';
  res.setHeader('Vary', 'Origin');
  // Origin 헤더 없는 same-origin 요청은 Referer로 검증 (브라우저 페이지 nav)
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    return { ok: true, origin };
  }
  // CORS preflight 외 same-origin 요청
  if (!origin && (referer.startsWith('https://patchkr.com') ||
                  referer.startsWith('https://www.patchkr.com') ||
                  referer.includes('localhost'))) {
    return { ok: true, origin: null };
  }
  return { ok: false, origin };
}

const YF_BASE = 'https://query1.finance.yahoo.com';
const STOOQ_BASE = 'https://stooq.com/q';

const STOOQ_MAP = {
  '^KS11': '^kospi',
  '^KQ11': '^kosdaq',
  'KRW=X': 'usdkrw',
  'JPY=X': 'usdjpy',
  'EUR=X': 'eurusd',
  'CL=F': 'cl.f',
  'GC=F': 'gc.f',
  'SI=F': 'si.f',
  'BTC-USD': 'btcusd',
  '^GSPC': '^spx',
  '^IXIC': '^ndq',
  '^DJI': '^dji',
  '^N225': '^nkx',
};

const HEADERS_BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/html,*/*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

async function fetchYahoo(symbol, range = '1mo', interval = '1d') {
  const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
  try {
    const r = await fetch(url, { headers: HEADERS_BROWSER });
    if (!r.ok) return { error: `Yahoo ${r.status}`, source: 'yahoo' };
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      return { error: data?.chart?.error?.description || 'Yahoo no data', source: 'yahoo' };
    }
    const meta = result.meta || {};
    const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c != null);
    return {
      symbol: meta.symbol || symbol,
      price: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose ?? meta.previousClose,
      change: null, // 아래에서 계산
      changePercent: null,
      currency: meta.currency,
      marketState: meta.marketState || 'CLOSED',
      exchangeName: meta.fullExchangeName || meta.exchangeName,
      shortName: meta.shortName || meta.longName,
      regularMarketTime: meta.regularMarketTime,
      dayHigh: meta.regularMarketDayHigh,
      dayLow: meta.regularMarketDayLow,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      volume: meta.regularMarketVolume,
      sparkline: closes,
      source: 'yahoo',
    };
  } catch (e) {
    return { error: 'Yahoo fetch: ' + e.message, source: 'yahoo' };
  }
}

// Stooq CSV — Date,Open,High,Low,Close,Volume
async function fetchStooq(symbol) {
  const stooqSym = STOOQ_MAP[symbol] || symbol.toLowerCase();
  // 일별 데이터 (1개월 정도)
  const url = `${STOOQ_BASE}/d/l/?s=${encodeURIComponent(stooqSym)}&d1=${stooqDate(-35)}&d2=${stooqDate(0)}&i=d`;
  try {
    const r = await fetch(url, { headers: HEADERS_BROWSER });
    if (!r.ok) return { error: `Stooq ${r.status}`, source: 'stooq' };
    const text = await r.text();
    if (!text || text.startsWith('No data')) {
      return { error: 'Stooq no data', source: 'stooq' };
    }
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { error: 'Stooq empty', source: 'stooq' };
    const dataRows = lines.slice(1).map(line => {
      const [date, open, high, low, close, volume] = line.split(',');
      return {
        date,
        open: parseFloat(open),
        high: parseFloat(high),
        low: parseFloat(low),
        close: parseFloat(close),
        volume: parseFloat(volume) || 0,
      };
    }).filter(r => !isNaN(r.close));
    if (!dataRows.length) return { error: 'Stooq parse failed', source: 'stooq' };
    const last = dataRows[dataRows.length - 1];
    const prev = dataRows[dataRows.length - 2] || last;
    return {
      symbol: symbol,
      price: last.close,
      previousClose: prev.close,
      change: null,
      changePercent: null,
      currency: symbol.includes('KS') || symbol.includes('KQ') ? 'KRW' : 'USD',
      marketState: 'CLOSED',
      exchangeName: 'Stooq',
      shortName: STOOQ_MAP[symbol] || symbol,
      regularMarketTime: Math.floor(new Date(last.date).getTime() / 1000),
      dayHigh: last.high,
      dayLow: last.low,
      sparkline: dataRows.map(r => r.close),
      source: 'stooq',
    };
  } catch (e) {
    return { error: 'Stooq fetch: ' + e.message, source: 'stooq' };
  }
}

function stooqDate(daysOffset) {
  const d = new Date(Date.now() + daysOffset * 86400000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function fillChange(q) {
  if (q.price != null && q.previousClose != null) {
    q.change = q.price - q.previousClose;
    q.changePercent = q.previousClose ? (q.change / q.previousClose * 100) : 0;
  }
  return q;
}

export default async function handler(req, res) {
  // V26.3 — Origin 화이트리스트 (Yahoo/Stooq ToS 대응, 제3자 재배포 차단)
  const cors = applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!cors.ok) {
    return res.status(403).json({
      error: 'origin not allowed',
      message: '이 endpoint는 patchkr.com 내부 전용입니다. Yahoo Finance·Stooq의 ToS상 제3자 재배포가 제한됩니다.',
      hint: '공공데이터는 /api/data·/api/nec·/api/law·/api/bill·/api/ecos 사용 가능',
    });
  }

  const { symbols, range, interval, debug } = req.query;

  if (!symbols) {
    return res.status(200).json({
      name: 'Quote Proxy (v3 — Yahoo + Stooq fallback)',
      version: '3.0.0',
      usage: '/api/quote?symbols=^KS11,^KQ11,KRW=X',
      stooqMap: STOOQ_MAP,
    });
  }

  const list = symbols.split(',').map(s => s.trim()).filter(Boolean);
  const r = range || '1mo';
  const i = interval || '1d';

  try {
    // 각 심볼별로 Yahoo 시도 → 실패 시 Stooq fallback
    const results = await Promise.all(list.map(async sym => {
      const yResult = await fetchYahoo(sym, r, i);
      if (!yResult.error && yResult.price != null) return fillChange(yResult);
      // Yahoo 실패 → Stooq
      const sResult = await fetchStooq(sym);
      if (!sResult.error && sResult.price != null) {
        sResult._yahooError = yResult.error;
        return fillChange(sResult);
      }
      return {
        symbol: sym,
        error: yResult.error || sResult.error || 'Both sources failed',
        _yahoo: yResult.error,
        _stooq: sResult.error,
      };
    }));

    const quotes = results.filter(q => !q.error);
    const errors = results.filter(q => q.error);

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      quotes,
      errors: errors.length ? errors : undefined,
      generatedAt: new Date().toISOString(),
      sources: [...new Set(quotes.map(q => q.source))],
    });
  } catch (e) {
    return res.status(502).json({ error: 'Proxy failed: ' + e.message });
  }
}
