#!/usr/bin/env python3
"""
법령 변경 랭킹/하이라이트 페이지 — 후킹 프레이밍 + 100% 팩트(법제처 신구표 데이터).
data/law/index.json + body/<mst>.json → law-changes.html (+ sitemap 엔트리는 build_sitemap이 처리)

섹션(전부 공식 데이터 기반, 의견 0):
  ⚡ 곧 시행 예정 (놓치면 벌금)  — 시행일이 미래인 개정
  🔥 가장 많이 뜯어고친 법 TOP   — 2025+ 개정 횟수
  💥 한 방에 가장 크게 바뀐 개정 — 단일 개정의 변경 조문 수
  📅 최근 시행된 개정            — 시행일 최신
각 항목은 /law/<법령>.html(SEO 페이지)·/law-diff.html(도구)로 내부 링크.
"""
import json, re, html
from pathlib import Path
from collections import defaultdict
from datetime import date

BASE = "https://patchkr.com"
TODAY = date.today().strftime("%Y%m%d")

def esc(s): return html.escape(str(s if s is not None else ""))
def strip_tags(s): return re.sub(r"<\/?[a-zA-Z][^>]*>", "", str(s or "")).replace("&amp;", "&").strip()
def slugify(name): return re.sub(r"[\\/:*?\"<>|#%&\s]+", "", str(name or "")).strip() or "law"
def fmt(s):
    s = str(s or "")
    return f"{s[0:4]}.{s[4:6]}.{s[6:8]}" if len(s) == 8 else s
def is_unchanged(s): return bool(re.search(r"현행과\s*같음", str(s or "")))
def is_header(s): return bool(re.match(r"^제\s*\d+조", strip_tags(s)))
def dday(ef):
    try:
        from datetime import date as d
        y, m, dd = int(ef[:4]), int(ef[4:6]), int(ef[6:8])
        diff = (d(y, m, dd) - d.today()).days
        return f"D-{diff}" if diff > 0 else ("D-Day" if diff == 0 else f"D+{-diff}")
    except Exception:
        return ""

def count_changed(body):
    old_by = {str(a.get("no")): a.get("content", "") for a in (body.get("old") or [])}
    rows = [{"no": str(a.get("no")), "o": old_by.get(str(a.get("no")), ""), "n": a.get("content", "")}
            for a in (body.get("new") or [])]
    groups, cur = [], None
    for r in rows:
        if cur is None or is_header(r["n"]) or is_header(r["o"]):
            cur = []; groups.append(cur)
        cur.append(r)
    return sum(1 for g in groups if any((not is_unchanged(r["n"])) and strip_tags(r["o"]) != strip_tags(r["n"]) for r in g))

def main():
    idx = json.load(open("data/law/index.json", encoding="utf-8"))
    by_name = defaultdict(list)
    for e in idx:
        if e.get("name"):
            by_name[e["name"]].append(e)

    # 변경 조문 수 계산 (본문 보유분)
    amds = []
    for e in idx:
        p = Path(f"data/law/body/{e.get('mst')}.json")
        if not p.exists():
            continue
        try:
            cc = count_changed(json.load(open(p, encoding="utf-8")))
        except Exception:
            continue
        if cc > 0:
            amds.append({**e, "cc": cc})

    have = {n for n, a in by_name.items() if any(Path(f"data/law/body/{x.get('mst')}.json").exists() for x in a)}
    def law_link(name):
        return f"/law/{esc(slugify(name))}.html" if name in have else "/law-diff.html"

    most = [(n, len(a)) for n, a in by_name.items() if len(a) > 1]
    most.sort(key=lambda x: -x[1]); most = most[:20]
    biggest = sorted(amds, key=lambda x: -x["cc"])[:15]
    upcoming = sorted([e for e in amds if str(e.get("ef") or "") > TODAY], key=lambda x: str(x.get("ef")))[:12]
    recent = sorted([e for e in amds if str(e.get("ef") or "") <= TODAY], key=lambda x: str(x.get("ef") or ""), reverse=True)[:20]

    def row(name, right, sub=""):
        return (f'<a class="r" href="{law_link(name)}"><div class="rn">{esc(name)}'
                + (f'<span class="rs">{sub}</span>' if sub else '') + f'</div><div class="rr">{right}</div></a>')

    sec = []
    if upcoming:
        items = "".join(row(e["name"], f'<b class="dd">{dday(e.get("ef"))}</b>', f'{esc(e.get("kind"))} · {fmt(e.get("ef"))} 시행 · {e["cc"]}개 조 변경') for e in upcoming)
        sec.append(f'<section><h2>⚡ 곧 시행됩니다 — 미리 안 보면 벌금</h2><p class="sd">시행일이 다가오는 개정. 시행 전에 바뀐 조문을 확인하세요.</p><div class="list">{items}</div></section>')
    if most:
        items = "".join(row(n, f'<b class="cnt">{c}</b><span class="u">회 개정</span>', f'2025년 이후') for n, c in most)
        sec.append(f'<section><h2>🔥 2025년, 가장 많이 뜯어고친 법 TOP {len(most)}</h2><p class="sd">2025년 이후 가장 자주 개정된 법령. 그만큼 챙길 게 많다는 뜻.</p><div class="list">{items}</div></section>')
    if biggest:
        items = "".join(row(e["name"], f'<b class="cnt">{e["cc"]}</b><span class="u">개 조</span>', f'{esc(e.get("kind"))} · {fmt(e.get("ef"))} 시행 · 제{esc(e.get("pubNo"))}호') for e in biggest)
        sec.append(f'<section><h2>💥 한 방에 가장 크게 바뀐 개정 TOP {len(biggest)}</h2><p class="sd">단 한 번의 개정으로 가장 많은 조문을 갈아엎은 사례.</p><div class="list">{items}</div></section>')
    if recent:
        items = "".join(row(e["name"], f'<b>{fmt(e.get("ef"))}</b><span class="u">시행</span>', f'{esc(e.get("kind"))} · {e["cc"]}개 조 변경 · {esc(e.get("rev"))}') for e in recent)
        sec.append(f'<section><h2>📅 최근 시행된 개정</h2><p class="sd">방금 시행됐거나 곧 적용되는 개정.</p><div class="list">{items}</div></section>')

    title = "🔥 2025년 가장 많이 바뀐 법 TOP 20 · 곧 시행되는 개정 — 법령 변경 랭킹 | 대한민국 패치노트"
    desc = ("2025년 이후 대한민국 법령이 어떻게 바뀌고 있는지 한눈에. 가장 많이 개정된 법 TOP 20, "
            "한 번에 가장 크게 바뀐 개정, 곧 시행되는 개정까지 — 법제처 국가법령정보 공식 신구조문대비표 기반. 무료.")
    ld = json.dumps({"@context": "https://schema.org", "@type": "CollectionPage",
                     "name": "법령 변경 랭킹 — 2025년 가장 많이 바뀐 법",
                     "description": desc, "inLanguage": "ko",
                     "isBasedOn": "법제처 국가법령정보 (신구조문대비표)",
                     "publisher": {"@type": "Organization", "name": "대한민국 패치노트", "url": BASE}}, ensure_ascii=False)

    page = f"""<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{BASE}/law-changes.html">
<meta property="og:type" content="website"><meta property="og:title" content="🔥 2025년 가장 많이 바뀐 법 TOP 20 · 곧 시행되는 개정">
<meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{BASE}/law-changes.html">
<meta property="og:image" content="{BASE}/og-image.png"><meta property="og:site_name" content="대한민국 패치노트">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{ld}</script>
<style>
:root{{--bd:#e5e7eb;--tx:#1f2937;--dim:#6b7280;--ac:#4F46E5;--hot:#dc2626}}
*{{box-sizing:border-box}}body{{font-family:'Pretendard','Malgun Gothic',-apple-system,system-ui,sans-serif;color:var(--tx);margin:0;line-height:1.6;background:#fafafa}}
.wrap{{max-width:820px;margin:0 auto;padding:18px 16px 70px}}
.top a{{font-size:13px;color:var(--ac);text-decoration:none}}
h1{{font-size:25px;margin:14px 0 4px;letter-spacing:-.6px;line-height:1.25}}
.sub{{font-size:13.5px;color:var(--dim);margin-bottom:18px}}
section{{margin:26px 0}}h2{{font-size:18px;margin:0 0 4px}}.sd{{font-size:12.5px;color:var(--dim);margin:0 0 10px}}
.list{{display:flex;flex-direction:column;gap:7px;counter-reset:r}}
.r{{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--bd);border-radius:9px;padding:11px 14px;text-decoration:none;color:inherit;transition:.12s}}
.r:hover{{border-color:var(--ac);box-shadow:0 1px 7px rgba(0,0,0,.05)}}
.r::before{{counter-increment:r;content:counter(r);min-width:24px;text-align:center;font-weight:800;font-size:13px;color:var(--ac)}}
.rn{{flex:1;font-weight:700;font-size:14.5px;min-width:0}}.rs{{display:block;font-weight:400;font-size:11.5px;color:var(--dim);margin-top:1px}}
.rr{{text-align:right;font-size:12.5px;color:var(--dim);white-space:nowrap}}.rr b{{font-size:18px;color:var(--tx)}}.rr .cnt{{color:var(--hot)}}.rr .u{{font-size:11px;margin-left:2px}}.rr .dd{{color:var(--hot)}}
.cta{{display:inline-block;margin:8px 0 0;font-size:13.5px;font-weight:700;color:#fff;background:var(--ac);padding:10px 16px;border-radius:9px;text-decoration:none}}
footer{{margin-top:30px;font-size:11.5px;color:var(--dim);border-top:1px solid var(--bd);padding-top:12px}}
</style></head><body><div class="wrap">
<div class="top"><a href="/law-diff.html">← 법령 신구비교 (전체 검색)</a> · <a href="/">대한민국 패치노트</a></div>
<h1>🔥 법령 변경 추적 — 지금 가장 뜨거운 개정</h1>
<div class="sub">2025년 이후 대한민국 법, 이렇게 바뀌고 있다 · <b>법제처 국가법령정보 공식 신구조문대비표</b> 기반 · 매일 자동 갱신</div>
{''.join(sec)}
<a class="cta" href="/law-diff.html">▶ 전체 법령 신구비교 검색·엑셀 다운로드</a>
<footer>본 자료는 정보 제공용이며 법률 자문이 아닙니다. 순위는 법제처 공식 신구조문대비표 데이터(2025년+ 시행 개정)를 집계한 것입니다. · 출처: 법제처 국가법령정보</footer>
</div></body></html>"""

    Path("law-changes.html").write_text(page, encoding="utf-8")
    print(f"[law-changes] 생성: 곧시행 {len(upcoming)} / 다개정 {len(most)} / 대형개정 {len(biggest)} / 최근 {len(recent)} (본문보유 {len(amds)})")

if __name__ == "__main__":
    main()
