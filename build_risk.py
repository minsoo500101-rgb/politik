#!/usr/bin/env python3
"""
대한민국 위기 지표판 생성기
data/risk-indicators.json (검증된 정적 지표 + 후킹 프레이밍)
  + data/economy.json (live: 가계부채/GDP·기준금리·환율·국가신용등급)
  -> crisis.html  (신호등 🔴🟡🟢 대시보드, 100% 공식 출처)
홈(index.html) 위기 카드에서 링크. sitemap 등록은 build_sitemap이 처리.
"""
import json, html
from pathlib import Path

BASE = "https://patchkr.com"
SIG = {
    "red":    {"dot": "🔴", "name": "위험", "col": "#dc2626"},
    "yellow": {"dot": "🟡", "name": "경고", "col": "#d97706"},
    "green":  {"dot": "🟢", "name": "양호", "col": "#16a34a"},
}

def esc(s): return html.escape(str(s if s is not None else ""))

def load(p):
    return json.load(open(p, encoding="utf-8"))

def latest(econ, idd):
    """economy.json indicators에서 id의 최신 데이터값."""
    for it in econ.get("indicators", []):
        if it.get("id") == idd:
            d = it.get("data") or []
            if d:
                return d[-1].get("value")
    return None

def fmt_live(idd, v):
    if v is None: return "—"
    try:
        if idd == "base_rate": return f"{float(v):.2f}"
        if idd == "usd_krw":   return f"{float(v):,.0f}"
        f = float(v)
        return f"{f:,.0f}" if f >= 1000 else (f"{f:g}")
    except Exception:
        return str(v)

def credit_str(econ):
    """S&P AA · Moody's Aa2 · Fitch AA- 형태로."""
    ags = (econ.get("credit_ratings") or {}).get("agencies") or []
    short = {"sp": "S&P", "moodys": "무디스", "fitch": "피치"}
    parts = []
    for a in ags:
        nm = short.get(a.get("id"), a.get("name", ""))
        parts.append(f"{nm} {a.get('current','')}")
    return " · ".join(parts) if parts else "AA급"

def econ_series(econ, idd):
    """economy.json indicators에서 id의 (연도,값) 시계열."""
    for it in econ.get("indicators", []):
        if it.get("id") == idd:
            return [(d.get("year"), d.get("value")) for d in (it.get("data") or [])]
    return None

def fmt_sv(v):
    try: return f"{float(v):g}"
    except Exception: return str(v)

def sparkline(pairs, color):
    """pairs: [(year,value), ...] -> 인라인 SVG 미니 추세선 + 양끝 라벨."""
    pts = [(y, float(v)) for y, v in (pairs or []) if v is not None]
    if len(pts) < 2:
        return ""
    vals = [v for _, v in pts]
    mn, mx = min(vals), max(vals)
    rng = (mx - mn) or 1
    W, H, pad = 132, 32, 4
    n = len(pts)
    X = lambda i: pad + i * (W - 2 * pad) / (n - 1)
    Y = lambda v: pad + (H - 2 * pad) * (1 - (v - mn) / rng)
    line = " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, (_, v) in enumerate(pts))
    area = ("M" + f"{X(0):.1f},{H - pad:.1f} L"
            + " L".join(f"{X(i):.1f},{Y(v):.1f}" for i, (_, v) in enumerate(pts))
            + f" L{X(n - 1):.1f},{H - pad:.1f} Z")
    (y0, v0), (y1, v1) = pts[0], pts[-1]
    return (f'<div class="spark"><svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">'
            f'<path d="{area}" fill="{color}" opacity="0.10"/>'
            f'<polyline points="{line}" fill="none" stroke="{color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>'
            f'<circle cx="{X(0):.1f}" cy="{Y(v0):.1f}" r="2" fill="{color}" opacity="0.45"/>'
            f'<circle cx="{X(n - 1):.1f}" cy="{Y(v1):.1f}" r="2.6" fill="{color}"/></svg>'
            f"<div class=\"spark-x\"><span>’{str(y0)[2:]} {fmt_sv(v0)}</span><span>’{str(y1)[2:]} {fmt_sv(v1)}</span></div></div>")

def main():
    risk = load("data/risk-indicators.json")
    try:
        econ = load("data/economy.json")
    except Exception:
        econ = {}

    cats = {c["id"]: c for c in risk.get("categories", [])}
    inds = risk.get("indicators", [])

    # live 값 주입 + 표시값 계산
    counts = {"red": 0, "yellow": 0, "green": 0}
    for ind in inds:
        sig = ind.get("signal")
        if sig in counts: counts[sig] += 1
        live = ind.get("live")
        if live and live.get("credit"):
            ind["_value"] = "AA"
            ind["_note"] = credit_str(econ)
        elif live and live.get("id"):
            raw = latest(econ, live["id"])
            ind["_value"] = fmt_live(live["id"], raw)
            ind["_raw"] = raw
        else:
            ind["_value"] = ind.get("value", "—")
        # 스파크라인 시계열: 정적 series 우선, 없으면 economy 라이브 시계열
        if ind.get("series"):
            ind["_series"] = [(p[0], p[1]) for p in ind["series"]]
        elif live and live.get("id"):
            ind["_series"] = econ_series(econ, live["id"])
        else:
            ind["_series"] = None
        # context의 {value} 치환
        ctx = ind.get("context", "")
        if "{value}" in ctx:
            ind["context"] = ctx.replace("{value}", str(ind["_value"]))

    red, yellow, green = counts["red"], counts["yellow"], counts["green"]

    # 카테고리별 카드
    def card(ind):
        s = SIG.get(ind.get("signal"), SIG["yellow"])
        note = ind.get("_note", "")
        compare = ind.get("compare", "")
        spark = sparkline(ind.get("_series"), s['col'])
        return f"""<div class="card sig-{ind.get('signal')}">
  <div class="ch"><span class="dot">{s['dot']}</span><span class="lbl">{esc(ind.get('label'))}</span><span class="asof">{esc(ind.get('asof'))}</span></div>
  <div class="big"><span class="val">{esc(ind.get('_value'))}</span><span class="unit">{esc(ind.get('unit'))}</span></div>
  {f'<div class="note">{esc(note)}</div>' if note else ''}
  {spark}
  <div class="hl">{esc(ind.get('headline'))}</div>
  <div class="ctx">{esc(ind.get('context'))}</div>
  <div class="cf">{f'<span class="cmp">기준 · {esc(compare)}</span>' if compare else '<span></span>'}<a class="src" href="{esc(ind.get('source_url'))}" target="_blank" rel="noopener nofollow">출처: {esc(ind.get('source'))} ↗</a></div>
</div>"""

    sections = []
    for cid, cat in cats.items():
        cis = [i for i in inds if i.get("cat") == cid]
        if not cis: continue
        cards = "".join(card(i) for i in cis)
        sections.append(f"""<section class="cat">
  <div class="cat-h"><span class="cat-ic">{cat.get('icon','')}</span><div><h2>{esc(cat.get('title'))}</h2><p class="cat-sub">{esc(cat.get('subtitle'))}</p></div></div>
  <div class="grid">{cards}</div>
</section>""")

    # live 시장 스트립
    strip = []
    for m in risk.get("market_strip", []):
        live = m.get("live", {})
        v = fmt_live(live.get("id",""), latest(econ, live.get("id",""))) if live.get("id") else "—"
        strip.append(f'<div class="ms"><span class="ms-l">{esc(m.get("label"))}</span><span class="ms-v">{esc(v)}<small>{esc(m.get("unit"))}</small></span></div>')
    strip_html = f'<div class="strip">{"".join(strip)}<span class="ms-as">오늘 기준 · 한국은행 ECOS</span></div>' if strip else ""

    updated = esc(risk.get("updatedAt", ""))
    title = f"🚨 대한민국, 지금 괜찮은가 — 국가 위기 지표판 (빨간불 {red}개) | 대한민국 패치노트"
    desc = (f"출산율 0.75명·가계부채 GDP 육박·식량자급 20%·에너지 94% 수입… 대한민국의 위기 신호를 한 화면에. "
            f"빨간불 {red}·노란불 {yellow}·파란불 {green}. 통계청·한국은행·기재부 공식 데이터 기반. 무료.")
    ld = json.dumps({
        "@context": "https://schema.org", "@type": "CollectionPage",
        "name": "대한민국 국가 위기 지표판",
        "description": desc, "inLanguage": "ko",
        "isBasedOn": "통계청·한국은행·기획재정부·농림축산식품부·에너지경제연구원 공식 통계",
        "publisher": {"@type": "Organization", "name": "대한민국 패치노트", "url": BASE},
    }, ensure_ascii=False)

    summary = (
        f'<div class="sum"><div class="sum-row">'
        f'<div class="sb red"><b>{red}</b><span>🔴 위험</span></div>'
        f'<div class="sb yellow"><b>{yellow}</b><span>🟡 경고</span></div>'
        f'<div class="sb green"><b>{green}</b><span>🟢 양호</span></div>'
        f'</div><p class="sum-cap">8개 핵심 지표 중 <b>{red}개에 빨간불</b>이 켜졌습니다.</p></div>'
    )

    page = f"""<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{BASE}/crisis.html">
<meta property="og:type" content="website">
<meta property="og:title" content="🚨 대한민국, 지금 괜찮은가 — 위기 지표판 (빨간불 {red}개)">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{BASE}/crisis.html">
<meta property="og:image" content="{BASE}/og-image.png"><meta property="og:site_name" content="대한민국 패치노트">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{ld}</script>
<script>try{{var t=localStorage.getItem('politik:theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.setAttribute('data-theme','dark');}}catch(e){{}}</script>
<style>
:root{{--bg:#f7f7f8;--card:#fff;--bd:#e5e7eb;--tx:#1f2937;--dim:#6b7280;--ac:#4F46E5;--red:#dc2626;--yellow:#d97706;--green:#16a34a}}
[data-theme=dark]{{--bg:#0f1115;--card:#171a21;--bd:#2a2f3a;--tx:#e5e7eb;--dim:#9aa3b2;--ac:#818cf8;--red:#f87171;--yellow:#fbbf24;--green:#4ade80}}
*{{box-sizing:border-box}}
body{{font-family:'Pretendard','Malgun Gothic',-apple-system,system-ui,sans-serif;color:var(--tx);margin:0;line-height:1.6;background:var(--bg)}}
.wrap{{max-width:920px;margin:0 auto;padding:16px 16px 80px}}
.top{{display:flex;justify-content:space-between;align-items:center;font-size:13px}}
.top a{{color:var(--ac);text-decoration:none}}
.tt{{background:none;border:1px solid var(--bd);border-radius:8px;width:34px;height:30px;cursor:pointer;font-size:15px;line-height:1;padding:0;color:var(--tx)}}
.hero{{text-align:center;padding:18px 0 6px}}
h1{{font-size:30px;margin:8px 0 6px;letter-spacing:-.8px;line-height:1.2}}
.hero .lede{{font-size:14px;color:var(--dim);max-width:640px;margin:0 auto}}
.sum{{margin:18px auto;max-width:520px}}
.sum-row{{display:flex;gap:10px}}
.sb{{flex:1;background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:14px 6px;text-align:center}}
.sb b{{display:block;font-size:34px;font-weight:800;line-height:1}}
.sb span{{font-size:12px;color:var(--dim)}}
.sb.red b{{color:var(--red)}}.sb.yellow b{{color:var(--yellow)}}.sb.green b{{color:var(--green)}}
.sum-cap{{text-align:center;font-size:14px;color:var(--dim);margin:12px 0 0}}.sum-cap b{{color:var(--red)}}
.strip{{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;justify-content:center;background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:11px 14px;margin:14px 0 6px}}
.ms{{display:flex;align-items:baseline;gap:7px}}.ms-l{{font-size:12.5px;color:var(--dim)}}.ms-v{{font-size:17px;font-weight:800}}.ms-v small{{font-size:11px;font-weight:500;color:var(--dim);margin-left:1px}}
.ms-as{{font-size:11px;color:var(--dim)}}
.cat{{margin:30px 0 0}}
.cat-h{{display:flex;align-items:center;gap:12px;margin:0 0 12px;padding-bottom:9px;border-bottom:2px solid var(--bd)}}
.cat-ic{{font-size:26px}}
.cat-h h2{{font-size:19px;margin:0}}.cat-sub{{font-size:12.5px;color:var(--dim);margin:1px 0 0}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}
.card{{background:var(--card);border:1px solid var(--bd);border-left:4px solid var(--bd);border-radius:12px;padding:15px 16px;display:flex;flex-direction:column}}
.card.sig-red{{border-left-color:var(--red)}}.card.sig-yellow{{border-left-color:var(--yellow)}}.card.sig-green{{border-left-color:var(--green)}}
.ch{{display:flex;align-items:center;gap:7px;margin-bottom:2px}}
.ch .dot{{font-size:11px}}.ch .lbl{{font-weight:700;font-size:14px;flex:1}}.ch .asof{{font-size:11px;color:var(--dim)}}
.big{{display:flex;align-items:baseline;gap:3px;margin:2px 0}}
.big .val{{font-size:38px;font-weight:800;letter-spacing:-1px;line-height:1}}
.big .unit{{font-size:15px;color:var(--dim);font-weight:600}}
.note{{font-size:12px;color:var(--dim);margin:-1px 0 3px;font-weight:600}}
.spark{{margin:7px 0 3px}}
.spark svg{{width:100%;height:32px;display:block}}
.spark-x{{display:flex;justify-content:space-between;font-size:10.5px;color:var(--dim);margin-top:1px;font-variant-numeric:tabular-nums}}
.sig-red .big .val{{color:var(--red)}}.sig-yellow .big .val{{color:var(--yellow)}}.sig-green .big .val{{color:var(--green)}}
.hl{{font-weight:800;font-size:14.5px;margin:6px 0 4px;letter-spacing:-.3px;line-height:1.35}}
.ctx{{font-size:12.7px;color:var(--dim);line-height:1.62;flex:1}}
.cf{{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:11px;flex-wrap:wrap}}
.cmp{{font-size:11px;color:var(--dim);background:var(--bg);border:1px solid var(--bd);border-radius:20px;padding:3px 9px}}
.src{{font-size:11px;color:var(--dim);text-decoration:none}}.src:hover{{color:var(--ac)}}
.cta-wrap{{text-align:center;margin:34px 0 0}}
.cta{{display:inline-block;font-size:14px;font-weight:700;color:#fff;background:var(--ac);padding:12px 22px;border-radius:10px;text-decoration:none}}
.share{{display:inline-block;margin-left:8px;font-size:14px;font-weight:700;color:var(--ac);background:transparent;border:1px solid var(--ac);padding:12px 18px;border-radius:10px;text-decoration:none;cursor:pointer}}
footer{{margin-top:30px;font-size:11.5px;color:var(--dim);border-top:1px solid var(--bd);padding-top:14px;line-height:1.7}}
@media(max-width:640px){{h1{{font-size:24px}}.grid{{grid-template-columns:1fr}}.big .val{{font-size:34px}}}}
</style></head><body><div class="wrap">
<div class="top"><a href="/">← 대한민국 패치노트</a><button class="tt" onclick="(function(){{var d=document.documentElement,n=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',n);try{{localStorage.setItem('politik:theme',n)}}catch(e){{}}}})()">🌓</button></div>
<div class="hero">
  <h1>🚨 대한민국, 지금 괜찮은가</h1>
  <p class="lede">출산율·빚·식량·에너지… 나라의 핵심 지표에 켜진 신호등을 한 화면에 모았습니다. <b>전부 정부·공식기관 통계</b>, 매일 자동 갱신.</p>
</div>
{summary}
{strip_html}
{''.join(sections)}
<div class="cta-wrap">
  <a class="cta" href="/law-diff.html">▶ 지금 바뀌는 법, 신구비교로 확인</a>
  <a class="share" onclick="navigator.share?navigator.share({{title:document.title,url:location.href}}):(navigator.clipboard.writeText(location.href),this.textContent='링크 복사됨')">공유하기</a>
</div>
<footer>
  본 지표판은 정보 제공용이며, 모든 수치는 아래 공식 출처의 가장 최근 공표값입니다. 신호등(🔴 위험 / 🟡 경고 / 🟢 양호)은 국제 기준선·추세를 근거로 한 편집부 분류이며 특정 정파의 입장이 아닙니다.<br>
  · 인구: 통계청 · 가계부채·금리·환율·신용등급: 한국은행 ECOS / 기획재정부 · 잠재성장률: 한국은행·OECD · 곡물자급률: 농림축산식품부 · 에너지: 에너지경제연구원<br>
  최종 데이터 갱신: {updated} · © 대한민국 패치노트
</footer>
</div></body></html>"""

    Path("crisis.html").write_text(page, encoding="utf-8")
    print(f"[crisis] 생성 완료: 지표 {len(inds)}개 (red {red} / yellow {yellow} / green {green}) -> crisis.html")

if __name__ == "__main__":
    main()
