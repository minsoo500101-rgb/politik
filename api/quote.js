// Vercel Serverless Function — Yahoo Finance 시세 프록시 (v2 — v8 chart only)
//
// 변경 이력:
// v1: v7 quote API 사용 → 2023년 Yahoo가 crumb/cookie 요구하면서 Unauthorized 차단
// v2: v8 chart API 단독 사용 → 무인증 작동, quote + history 한 번에 추출
//
// 사용:
//   GET /api/quote?symbols=^KS11,^KQ11,KRW=X       (각 심볼의 quote + 1개월 sparkline)
//   GET /api/quote?symbols=^KS11&range=1mo&interval=1d   (range/interval 커스텀)
//
// 응답:
//   {
//     quotes: [
//       {
//         symbol, price, previousClose, change, changePercent,
//         currency, marketState, exchangeName, dayHigh, dayLow,
//         fiftyTwoWeekHigh, fiftyTwoWeekLow, volume,
//         sparkline: [...] (close 가격 배열)
//       }, ...
//     ]
//   }

const YF_BASE = 'https://query1.finance.yahoo.com';

// User-Agent 필수
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchChart(symbol, range = '1mo', interval = '1d') {
  const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) {
    return { error: `Yahoo Finance ${r.status}` };
  }
  const data = await r.json();
  const result = data?.chart?.result?.[0];
  if (!result) {
    const err = data?.chart?.error?.description || 'No data';
    return { error: err };
  }
  return { result };
}

function quoteFromChart(symbol, result) {
  const meta = result.meta || {};
  const price = meta.regularMarketPrice;
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  const change = (price != null && prev != null) ? price - prev : null;
  const changePct = (change != null && prev) ? (change / prev * 100) : null;

  // sparkline: 시계열 close 배열 (null 제외)
  const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c != null);
  const timestamps = result.timestamp || [];

  return {
    symbol: meta.symbol || symbol,
    price,
    previousClose: prev,
    change,
    changePercent: changePct,
    currency: meta.currency,
    marketState: meta.marketState || (meta.regularMarketTime ? 'CLOSED' : 'UNKNOWN'),
    exchangeName: meta.fullExchangeName || meta.exchangeName,
    shortName: meta.shortName || meta.longName,
    instrumentType: meta.instrumentType,
    regularMarketTime: meta.regularMarketTime,
    dayHigh: meta.regularMarketDayHigh,
    dayLow: meta.regularMarketDayLow,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
    volume: meta.regularMarketVolume,
    sparkline: closes,
    sparklineTimestamps: timestamps,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const { symbols, range, interval } = req.query;

  // 헬스체크
  if (!symbols) {
    return res.status(200).json({
      name: 'Yahoo Finance Proxy (v2)',
      version: '2.0.0',
      description: 'v8 chart API 단독 — quote + sparkline 한 번에',
      usage: '/api/quote?symbols=^KS11,^KQ11,KRW=X',
      supportedSymbols: {
        '^KS11': 'KOSPI (코스피)',
        '^KQ11': 'KOSDAQ (코스닥)',
        'KRW=X': 'USD/KRW 환율',
        'JPY=X': 'USD/JPY 환율',
        'CL=F': 'WTI 원유',
        'GC=F': '국제 금',
        'SI=F': '국제 은',
        'BTC-USD': '비트코인',
        'ETH-USD': '이더리움',
        '^GSPC': 'S&P 500',
        '^IXIC': 'Nasdaq',
        '^DJI': '다우존스',
        '^N225': '닛케이 225',
        '000001.SS': '상해 종합',
        '^HSI': '항셍',
      },
    });
  }

  const list = symbols.split(',').map(s => s.trim()).filter(Boolean);
  const r = range || '1mo';
  const i = interval || '1d';

  try {
    // 병렬 fetch (각 심볼별)
    const results = await Promise.all(list.map(sym => fetchChart(sym, r, i)));
    const quotes = [];
    const errors = [];
    results.forEach((res, idx) => {
      const sym = list[idx];
      if (res.error) {
        errors.push({ symbol: sym, error: res.error });
      } else {
        quotes.push(quoteFromChart(sym, res.result));
      }
    });

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      quotes,
      errors: errors.length ? errors : undefined,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(502).json({ error: 'Proxy fetch failed: ' + e.message });
  }
}
