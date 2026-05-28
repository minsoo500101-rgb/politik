// Vercel Serverless Function — Yahoo Finance 시세 프록시
// KRX 라이선스 제약으로 TradingView 무료 위젯에서 KOSPI/KOSDAQ 표시 불가
// → Yahoo Finance 우회로 정식 한국 인덱스 fetch
//
// 사용:
//   GET /api/quote?symbols=^KS11,^KQ11,KRW=X
//   GET /api/quote?symbols=^KS11&history=1mo  (1개월 시계열)
//
// 응답 (현재가):
//   { quotes: [{ symbol, price, change, changePercent, prevClose, marketState, ... }] }
//
// 응답 (시계열):
//   { history: { timestamp: [...], close: [...] } }

const YF_BASE = 'https://query1.finance.yahoo.com';

// User-Agent 필수 — Yahoo 봇 차단 회피
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const { symbols, history, range, interval } = req.query;

  // 헬스체크
  if (!symbols) {
    return res.status(200).json({
      name: 'Yahoo Finance Proxy',
      version: '1.0.0',
      usage: {
        quote: '/api/quote?symbols=^KS11,^KQ11,KRW=X',
        history: '/api/quote?symbols=^KS11&history=1&range=1mo&interval=1d',
      },
      supportedSymbols: {
        '^KS11': 'KOSPI (코스피)',
        '^KQ11': 'KOSDAQ (코스닥)',
        'KRW=X': 'USD/KRW 환율',
        'CL=F': 'WTI 원유',
        'GC=F': '국제 금',
        'BTC-USD': '비트코인',
        '^GSPC': 'S&P 500',
        '^IXIC': 'Nasdaq',
        '^N225': '닛케이 225',
        '000001.SS': '상해 종합',
      },
    });
  }

  try {
    // 시계열 요청
    if (history) {
      const symbol = symbols.split(',')[0];
      const r = range || '1mo';
      const i = interval || '1d';
      const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(r)}&interval=${encodeURIComponent(i)}`;
      const resp = await fetch(url, { headers: HEADERS });
      if (!resp.ok) {
        return res.status(502).json({ error: 'Yahoo Finance chart fetch failed', status: resp.status });
      }
      const data = await resp.json();
      const result = data?.chart?.result?.[0];
      if (!result) {
        return res.status(404).json({ error: 'No chart data for ' + symbol });
      }
      const out = {
        symbol: result.meta?.symbol,
        currency: result.meta?.currency,
        timestamp: result.timestamp || [],
        close: result.indicators?.quote?.[0]?.close || [],
        open: result.indicators?.quote?.[0]?.open || [],
        high: result.indicators?.quote?.[0]?.high || [],
        low: result.indicators?.quote?.[0]?.low || [],
        volume: result.indicators?.quote?.[0]?.volume || [],
        meta: {
          regularMarketPrice: result.meta?.regularMarketPrice,
          previousClose: result.meta?.previousClose,
          chartPreviousClose: result.meta?.chartPreviousClose,
          exchangeName: result.meta?.exchangeName,
        },
      };
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({ history: out });
    }

    // 현재가 일괄 요청 (v7 quote endpoint)
    const url = `${YF_BASE}/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
    const resp = await fetch(url, { headers: HEADERS });
    if (!resp.ok) {
      // v7이 차단되면 v6 fallback 시도
      const list = symbols.split(',').map(s => s.trim()).filter(Boolean);
      const quotes = [];
      for (const sym of list) {
        try {
          const r2 = await fetch(`${YF_BASE}/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`, { headers: HEADERS });
          if (!r2.ok) continue;
          const d2 = await r2.json();
          const meta = d2?.chart?.result?.[0]?.meta;
          if (!meta) continue;
          const price = meta.regularMarketPrice;
          const prev = meta.chartPreviousClose || meta.previousClose;
          const change = price - prev;
          quotes.push({
            symbol: meta.symbol,
            price,
            previousClose: prev,
            change,
            changePercent: prev ? (change / prev * 100) : 0,
            currency: meta.currency,
            marketState: meta.marketState,
            exchangeName: meta.exchangeName,
            instrumentType: meta.instrumentType,
            regularMarketTime: meta.regularMarketTime,
          });
        } catch {}
      }
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({ quotes, source: 'chart-fallback' });
    }

    const data = await resp.json();
    const list = data?.quoteResponse?.result || [];
    const quotes = list.map(q => ({
      symbol: q.symbol,
      price: q.regularMarketPrice,
      previousClose: q.regularMarketPreviousClose,
      change: q.regularMarketChange,
      changePercent: q.regularMarketChangePercent,
      currency: q.currency,
      marketState: q.marketState,
      exchangeName: q.fullExchangeName,
      shortName: q.shortName || q.longName,
      regularMarketTime: q.regularMarketTime,
      regularMarketDayHigh: q.regularMarketDayHigh,
      regularMarketDayLow: q.regularMarketDayLow,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow,
    }));

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({ quotes });
  } catch (e) {
    return res.status(502).json({ error: 'Proxy fetch failed: ' + e.message });
  }
}
