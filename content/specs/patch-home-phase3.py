# -*- coding: utf-8 -*-
"""UI 개편 3단계 — 홈 첫 화면을 '오늘 볼 것'으로, 지표 카드는 아래로, 하단 탭은 글자 라벨(1회용)."""
import io, re, sys
P = r'D:\politik\index.html'
s = io.open(P, encoding='utf-8', newline='').read()
NL = '\r\n' if '\r\n' in s else '\n'
def once(a, b, label):
    global s
    a = a.replace('\n', NL); b = b.replace('\n', NL)
    n = s.count(a)
    if n != 1: sys.exit(f'{label}: {n}회')
    s = s.replace(a, b)

# ── A. 하단 탭: 이모지 아이콘 제거, 자리 = 역할(홈·법안·법령·인물·기사). 실검은 메뉴(☰)에 남는다.
i = s.index('<nav class="mobile-bottom-nav" id="mobile-bottom-nav"')
j = s.index('</nav>', i) + len('</nav>')
nav = NL.join([
    '<nav class="mobile-bottom-nav" id="mobile-bottom-nav" aria-label="모바일 주요 페이지">',
    '  <a href="/" class="mbn-item" data-path="/"><span class="mbn-label">홈</span></a>',
    '  <a href="/bills" class="mbn-item" data-path="/bills"><span class="mbn-label">법안</span></a>',
    '  <a href="/law-radar.html" class="mbn-item" data-path="/law-radar.html"><span class="mbn-label">법령</span></a>',
    '  <a href="/dex" class="mbn-item" data-path="/dex"><span class="mbn-label">인물</span></a>',
    '  <a href="/analysis.html" class="mbn-item" data-path="/analysis.html"><span class="mbn-label">기사</span></a>',
    '</nav>'])
s = s[:i] + nav + s[j:]
once('  .mbn-label {\n    font-size: 10.5px;',
     '  /* UI 개편 3단계 — 글자 라벨만. 현재 위치는 위쪽 막대로 표시(색 하나에 기대지 않게) */\n'
     '  .mobile-bottom-nav .mbn-item { min-height: 48px; border-radius: 0; }\n'
     '  .mobile-bottom-nav .mbn-item.active { box-shadow: inset 0 2px 0 var(--accent); font-weight: 700; }\n'
     '  .mbn-label {\n    font-size: 13px;', 'mbn css')

# ── B. 이슈 목록 데이터를 함수로 분리 — 홈 첫 화면과 목록이 같은 배열을 쓴다
once('function renderHomeIssueRows(){\n  // 홈 주요 이슈 — 여기 배열에 항목만 추가하면 date(d) 기준 최신순 자동 정렬됨.\n  var items=[',
     'function homeIssueItems(){\n  // 홈 주요 이슈 — 여기 배열에 항목만 추가하면 date(d) 기준 최신순 자동 정렬됨.\n  var items=[', 'items fn')
once('  items.sort(function(a,b){return a.d<b.d?1:(a.d>b.d?-1:0);});\n  var row=',
     '  items.sort(function(a,b){return a.d<b.d?1:(a.d>b.d?-1:0);});\n  return items;\n}\n\n'
     '// UI 개편 3단계 — 홈 첫 화면 \'오늘 볼 것\': 날짜 줄 + 칩 한 줄 + 큰 카드 하나.\n'
     '// 무엇을 앞에 둘지는 시계가 아니라 데이터 날짜(기사 사건일)가 정한다. 큰 카드 = 가장 최근 사안, 숫자 하나(부제의 첫 <b>).\n'
     'function renderHomeToday(){\n'
     '  var items=homeIssueItems();\n'
     '  if(!items.length) return \'\';\n'
     '  var top=items[0];\n'
     '  var now=new Date(Date.now()+9*3600000);\n'
     '  var wd=[\'일\',\'월\',\'화\',\'수\',\'목\',\'금\',\'토\'][now.getUTCDay()];\n'
     '  var dateTx=(now.getUTCMonth()+1)+\'월 \'+now.getUTCDate()+\'일 \'+wd+\'요일\';\n'
     '  var big=(top.sub.match(/<b>([^<]+)<\\/b>/)||[])[1]||\'\';\n'
     '  var subTx=top.sub.replace(/<\\/?b>/g,\'\');\n'
     '  var short=function(t){return String(t).split(/ — | - /)[0];};\n'
     '  var chips=items.slice(1,6).map(function(x){return \'<a class="ht-chip" href="\'+x.href+\'">\'+escapeHtml(short(x.tt))+\'</a>\';}).join(\'\');\n'
     '  chips+=\'<a class="ht-chip" href="/law-radar.html">곧 시행되는 법령</a><a class="ht-chip ht-chip-all" href="/analysis.html">전체 →</a>\';\n'
     '  var d=top.d.slice(5).replace(\'-\',\'.\');\n'
     '  return \'<section class="home-today" aria-label="오늘 볼 것">\'+\n'
     '    \'<div class="ht-date"><b>\'+dateTx+\' · 오늘 볼 것</b><span>최근 사안 \'+d+\'</span></div>\'+\n'
     '    \'<nav class="ht-rail" aria-label="오늘 볼 것 목록">\'+chips+\'</nav>\'+\n'
     '    \'<a class="ht-lead" href="\'+top.href+\'">\'+\n'
     '      \'<h2 class="ht-tt">\'+escapeHtml(top.tt)+\'</h2>\'+\n'
     '      (big?\'<div class="ht-big">\'+escapeHtml(big)+\'</div>\':\'\')+\n'
     '      \'<p class="ht-sub">\'+escapeHtml(subTx)+\'</p>\'+\n'
     '      \'<span class="ht-go">기사 보기 →</span>\'+\n'
     '    \'</a></section>\';\n'
     '}\n\n'
     'function renderHomeIssueRows(){\n  var items=homeIssueItems();\n  var row=', 'today fn')

# ── C. 홈 순서: 오늘 볼 것 → 주요 이슈 → 법령 배너 → 히어로 → 지표 카드 …
k0 = s.index('      ${(() => {' + NL + '        // V30.7 — 상단 KPI 스트립 (대시보드 시그니처)')
k1 = s.index('      })()}' + NL, k0) + len('      })()}' + NL)
kpi = s[k0:k1]
s = s[:k0] + '      ${renderHomeToday()}' + NL + s[k1:]
# 지난 선거 타일(9회 지선 민주 11)은 넉 달 지난 값 — 곧 시행되는 법령으로 교체
kpi_new = kpi.replace(
    '            <a class="kpi-tile kpi-tile--accent" href="/election2026">' + NL +
    '              <div class="kpi-l">9회 지선</div>' + NL +
    '              <div class="kpi-v">민주 11</div>' + NL +
    '              <div class="kpi-d kpi-d--accent">광역 결과 →</div>' + NL +
    '            </a>',
    '            <a class="kpi-tile kpi-tile--accent" href="/law-radar.html">' + NL +
    '              <div class="kpi-l">곧 시행되는 법령</div>' + NL +
    '              <div class="kpi-v" id="kpi-lawr-v">—</div>' + NL +
    '              <div class="kpi-d kpi-d--accent">업무별로 보기 →</div>' + NL +
    '            </a>')
if kpi_new == kpi: sys.exit('kpi tile 교체 실패')
# 히어로·배너 블록을 이슈 목록 뒤로 — 첫 화면은 오늘 볼 것 + 이슈
h0 = s.index('      <div class="dash-hero${_isElectionSeason')
h1 = s.index('      <!-- V31.54 — 홈 주요 이슈 컴팩트 리스트')
hero = s[h0:h1]
s = s[:h0] + s[h1:]
anchor = '        ${renderHomeIssueRows()}' + NL + '      </div>' + NL
p = s.index(anchor) + len(anchor)
s = s[:p] + NL + hero + kpi_new + s[p:]
once('<div class="home-issues-h">📌 지금 한국 · 주요 이슈</div>', '<div class="home-issues-h">새 기사</div>', 'issues h')

# 지표 카드의 '곧 시행되는 법령' 숫자 — 배너와 같은 값
once('    el.textContent = _lawRadarN + "건";',
     '    el.textContent = _lawRadarN + "건";\n    var kv = document.getElementById("kpi-lawr-v"); if (kv) kv.textContent = _lawRadarN + "건";', 'kpi lawr fill')

# ── D. 스타일
css = '''
  /* UI 개편 3단계 — 홈 '오늘 볼 것' (시안 A). 한 카드 = 한 질문 + 한 숫자. */
  .home-today { margin: 4px 0 18px; }
  .ht-date { display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
  .ht-date b { font-size:13px; letter-spacing:.04em; color:var(--text-2); font-weight:600; }
  .ht-date span { font-size:12px; color:var(--text-3, var(--text-2)); white-space:nowrap; }
  .ht-rail { display:flex; gap:8px; overflow-x:auto; padding:10px 0 4px; scrollbar-width:none; }
  .ht-rail::-webkit-scrollbar { display:none; }
  .ht-chip { flex:0 0 auto; border:1px solid var(--border-strong); background:var(--bg-card); color:var(--text); border-radius:999px; padding:6px 12px; font-size:13.5px; text-decoration:none; white-space:nowrap; }
  .ht-chip:hover { border-color:var(--accent); color:var(--accent); }
  .ht-chip-all { color:var(--text-2); }
  .ht-lead { display:block; margin-top:12px; background:var(--bg-card); border:1px solid var(--border-strong); border-radius:6px; padding:18px 20px; text-decoration:none; color:var(--text); }
  .ht-lead:hover { border-color:var(--accent); }
  .ht-tt { font-size:22px; line-height:1.32; letter-spacing:-.4px; margin:0; text-wrap:balance; }
  .ht-big { font-size:34px; font-weight:800; letter-spacing:-1px; margin:10px 0 2px; font-variant-numeric:tabular-nums; color:var(--accent); }
  .ht-sub { margin:8px 0 0; color:var(--text-2); font-size:14.5px; line-height:1.6; border-left:3px solid var(--text); padding-left:10px; }
  .ht-go { display:inline-flex; align-items:center; min-height:40px; margin-top:12px; font-weight:700; font-size:14px; color:var(--accent); }
  @media (max-width:600px){ .ht-tt{font-size:20px} .ht-big{font-size:30px} }
'''
once('  .kpi-strip {\n    display: grid;\n    grid-template-columns: repeat(6, 1fr);', css.strip('\n') + '\n  .kpi-strip {\n    display: grid;\n    grid-template-columns: repeat(6, 1fr);', 'css')

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('ok')
