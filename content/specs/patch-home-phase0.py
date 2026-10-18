# -*- coding: utf-8 -*-
"""UI 개편 0단계 — 홈 제목·공유 문구를 상시 문구로, 조회 기록에서 봇 제외(1회용)."""
import io, sys
P = r'D:\politik\index.html'
s = io.open(P, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in s else '\n'
def once(a, b, label):
    global s
    n = s.count(a)
    if n != 1: sys.exit(f'{label}: {n}회')
    s = s.replace(a, b)

# 1) 제목·설명 — 6월 지방선거 문구가 넉 달째 첫머리였다. 지금 사이트가 실제로 답하는 것(법안·법령·인물·지표)으로.
#    '22대 국회 법안 N건' 문구는 sync-bill-count.js 규칙과 같은 모양이라 매일 숫자가 맞춰진다.
once('<title>9회 지방선거 결과 · 22대 국회 법안 1,911건 · 정치인 약 780명 · 한국 실검 — 대한민국 패치노트</title>',
     '<title>대한민국 패치노트 — 22대 국회 법안 1,911건 · 곧 시행되는 법령 · 정치인 약 780명 · 경제 지표</title>', 'title')
once('<meta property="og:title" content="9회 지선 결과 · 광역단체장 민주 11·국힘 5 · 22대 법안 1,911건 · 한국 실검 — 대한민국 패치노트">',
     '<meta property="og:title" content="대한민국 패치노트 — 22대 법안 1,911건 · 곧 시행되는 법령 · 정치인 약 780명">', 'og:title')
once('<meta name="twitter:title" content="9회 지선 결과 · 광역단체장 민주 11·국힘 5 — 대한민국 패치노트">',
     '<meta name="twitter:title" content="대한민국 패치노트 — 국회·법령·인물·경제 공공데이터">', 'tw:title')
once('<meta property="og:image:alt" content="대한민국 패치노트 — 9회 지선 결과 · 22대 법안 1,911건 · 한국 실검">',
     '<meta property="og:image:alt" content="대한민국 패치노트 — 22대 법안 1,911건 · 곧 시행되는 법령 · 정치인 약 780명">', 'og:alt')
once("  '/': { title: '대한민국 패치노트 — 정치·법안·선거·경제 종합 플랫폼', desc: SITE_DESC_FALLBACK },",
     "  '/': { title: '대한민국 패치노트 — 22대 국회 법안 · 곧 시행되는 법령 · 정치인 · 경제 지표', desc: SITE_DESC_FALLBACK },", 'route /')

# 2) 조회 기록에서 봇 제외 — 같은 사업자 모멘토 실측: 네이버 Yeti 가 JS 를 실행해 '브라우저 방문'의 63%가 로봇이었다.
#    화면이 실제로 보일 때만 센다(백그라운드 탭·사전 렌더 제외).
a = "function logPageView(pageType, pageId) {" + nl + "  if (!pageType || !pageId) return;" + nl
b = ("// UI 개편 0단계(2026-10-19) — 봇·자동화 브라우저는 조회로 세지 않는다." + nl +
     "function _isLikelyBot() {" + nl +
     "  try {" + nl +
     "    if (navigator.webdriver) return true;" + nl +
     "    return /bot|crawl|spider|slurp|Yeti|Daum|externalagent|Headless|Lighthouse|PageSpeed|InspectionTool|bingpreview|facebookexternalhit|Bytespider|GPTBot|ClaudeBot|PerplexityBot|Applebot/i.test(navigator.userAgent || '');" + nl +
     "  } catch { return false; }" + nl +
     "}" + nl +
     a +
     "  if (_isLikelyBot()) return;" + nl +
     "  if (document.visibilityState && document.visibilityState !== 'visible') {" + nl +
     "    // 보이지 않는 탭(사전 렌더·백그라운드)은 처음 보일 때 한 번만 센다" + nl +
     "    document.addEventListener('visibilitychange', function _pvOnce() {" + nl +
     "      if (document.visibilityState !== 'visible') return;" + nl +
     "      document.removeEventListener('visibilitychange', _pvOnce);" + nl +
     "      logPageView(pageType, pageId);" + nl +
     "    });" + nl +
     "    return;" + nl +
     "  }" + nl)
once(a, b, 'logPageView')
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('ok')
