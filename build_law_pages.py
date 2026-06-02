#!/usr/bin/env python3
"""
법령별 SEO 정적 페이지 생성기
data/law/index.json + data/law/body/<mst>.json → law/<slug>.html (법령당 1페이지)

각 페이지:
- 검색 타깃 title/description/og/canonical ("OO법 신구조문대비표", "OO법 2025 개정 내용")
- 그 법령의 '최신 시행 개정' 신구조문대비표 본문(구/신 조문 텍스트)을 미리 렌더 = 봇 친화 콘텐츠
- 같은 법령의 다른 2025+ 개정 목록 + 인터랙티브 도구(/law-diff.html) 링크
- JSON-LD(Article) 구조화 데이터
출력: law/*.html + sitemap-law.xml (root)
"""
import json, re, html
from pathlib import Path
from collections import defaultdict

BASE = "https://patchkr.com"
OUT = Path("law"); OUT.mkdir(exist_ok=True)

def esc(s): return html.escape(str(s if s is not None else ""))
def strip_tags(s): return re.sub(r"<\/?[a-zA-Z][^>]*>", "", str(s or "")).replace("&amp;", "&").strip()
def slugify(name):
    s = re.sub(r"[\\/:*?\"<>|#%&\s]+", "", str(name or "")).strip()
    return s or "law"
def fmt_date(s):
    s = str(s or "")
    return f"{s[0:4]}.{s[4:6]}.{s[6:8]}" if len(s) == 8 else s
def iso_date(s):
    s = str(s or "")
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 else ""

def is_unchanged(s): return bool(re.search(r"현행과\s*같음", str(s or "")))
def is_header(s): return bool(re.match(r"^제\s*\d+조", strip_tags(s)))
def extract_title(s):
    s = strip_tags(s)
    m = re.match(r"^제\s*\d+조(?:의\d+)?\s*\([^)]*\)", s) or re.match(r"^제\s*\d+조(?:의\d+)?", s)
    return m.group(0).strip() if m else ""

def changed_articles(body):
    old_by = {str(a.get("no")): a.get("content", "") for a in (body.get("old") or [])}
    rows = [{"no": str(a.get("no")), "oldC": old_by.get(str(a.get("no")), ""), "newC": a.get("content", "")}
            for a in (body.get("new") or [])]
    groups, cur = [], None
    for r in rows:
        if cur is None or is_header(r["newC"]) or is_header(r["oldC"]):
            cur = {"title": extract_title(r["newC"]) or extract_title(r["oldC"]) or ("제" + r["no"]), "rows": []}
            groups.append(cur)
        cur["rows"].append(r)
    out = []
    for g in groups:
        changed = [r for r in g["rows"] if (not is_unchanged(r["newC"])) and strip_tags(r["oldC"]) != strip_tags(r["newC"])]
        if not changed:
            continue
        old_txt = " ".join(strip_tags(r["oldC"]) for r in g["rows"] if strip_tags(r["oldC"]) and not is_unchanged(r["oldC"]))
        new_txt = " ".join(strip_tags(r["newC"]) for r in g["rows"] if not is_unchanged(r["newC"]))
        out.append({"title": g["title"], "old": old_txt, "new": new_txt})
    return out

TEMPLATE = """<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{base}/law/{slug}.html">
<meta name="robots" content="index,follow">
<meta property="og:type" content="article"><meta property="og:title" content="{ogtitle}">
<meta property="og:description" content="{desc}"><meta property="og:url" content="{base}/law/{slug}.html">
<meta property="og:image" content="{base}/og-image.png"><meta property="og:site_name" content="대한민국 패치노트">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{ld}</script>
<style>
:root{{--bd:#e5e7eb;--tx:#1f2937;--dim:#6b7280;--ac:#4F46E5;--del:#b91c1c;--ins:#1d4ed8}}
*{{box-sizing:border-box}}body{{font-family:'Pretendard','Malgun Gothic',-apple-system,system-ui,sans-serif;color:var(--tx);margin:0;line-height:1.7;background:#fff}}
.wrap{{max-width:880px;margin:0 auto;padding:18px 18px 60px}}
.top a{{font-size:13px;color:var(--ac);text-decoration:none}}
h1{{font-size:22px;margin:14px 0 4px;letter-spacing:-.4px}}
.meta{{font-size:13px;color:var(--dim);margin-bottom:6px}}
.lead{{font-size:14px;background:#f7f7fb;border:1px solid var(--bd);border-radius:8px;padding:12px 14px;margin:12px 0}}
.cta{{display:inline-block;margin:6px 0 14px;font-size:13.5px;font-weight:700;color:#fff;background:var(--ac);padding:9px 14px;border-radius:8px;text-decoration:none}}
.art{{border:1px solid var(--bd);border-radius:8px;padding:12px 14px;margin:10px 0}}
.art h2{{font-size:15px;margin:0 0 8px;color:var(--ac)}}
.art .ov,.art .nv{{font-size:13.5px;margin:6px 0}}.art b{{font-size:11.5px;color:var(--dim);font-weight:700}}
.art .ov p{{margin:3px 0;color:var(--del)}}.art .nv p{{margin:3px 0;color:var(--ins)}}
h2.sec{{font-size:16px;margin:22px 0 8px}}ul{{font-size:13.5px;color:var(--dim)}}
footer{{margin-top:26px;font-size:11.5px;color:var(--dim);border-top:1px solid var(--bd);padding-top:10px}}
</style></head><body><div class="wrap">
<div class="top"><a href="/law-diff.html">← 법령 신구비교 (전체 검색)</a> · <a href="/">대한민국 패치노트</a></div>
<h1>{h1name} 신구조문대비표</h1>
<div class="meta">{kind} · 시행 <b>{ef}</b> · 공포 {pub} 제{pubno}호 · {rev} · 출처 법제처 국가법령정보</div>
<div class="lead">{lead}</div>
<a class="cta" href="/law-diff.html">▶ 인터랙티브 도구에서 색구분·엑셀 다운로드</a>
{arts}
{others}
<p style="font-size:13px;margin-top:18px"><a href="https://www.law.go.kr/법령/{h1name}" target="_blank" rel="noopener">법제처에서 {h1name} 전체 연혁·원문 보기 ↗</a></p>
<footer>본 자료는 정보 제공용이며 법률 자문이 아닙니다. 적용 판단은 원문·전문가 확인을 권장합니다. · 출처: 법제처 국가법령정보 (신구조문대비표)</footer>
</div></body></html>"""

def main():
    idx = json.load(open("data/law/index.json", encoding="utf-8"))
    by_name = defaultdict(list)
    for e in idx:
        if e.get("name"):
            by_name[e["name"]].append(e)

    urls, gen, skip = [], 0, 0
    for name, ams in by_name.items():
        ams.sort(key=lambda x: str(x.get("ef") or ""), reverse=True)
        main_am, arts = None, []
        for a in ams:
            p = Path(f"data/law/body/{a.get('mst')}.json")
            if not p.exists():
                continue
            try:
                body = json.load(open(p, encoding="utf-8"))
            except Exception:
                continue
            ca = changed_articles(body)
            if ca:
                main_am, arts = a, ca
                break
        if not main_am:
            skip += 1
            continue
        slug = slugify(name)
        art_names = ", ".join(a["title"] for a in arts[:8])
        title = f"{name} 신구조문대비표 — {fmt_date(main_am['ef'])} 시행 개정 신·구 비교 | 대한민국 패치노트"
        desc = (f"{name} {fmt_date(main_am['ef'])} 시행 개정의 신구조문대비표(개정 전·후 비교). "
                f"변경 조문: {art_names}. 법제처 국가법령정보 공식 데이터로 무료 신·구 비교·엑셀 다운로드.")[:300]
        lead = (f"<b>{esc(name)}</b>의 {esc(fmt_date(main_am['ef']))} 시행 개정에서 바뀐 조문(<b>{len(arts)}개 조</b>)의 "
                f"개정 전(구조문)·후(신조문)를 비교합니다. 변경 조문: {esc(art_names)}.")
        arts_html = ""
        for a in arts[:25]:
            ov = esc(a["old"]) if a["old"] else "(신설)"
            arts_html += (f'<section class="art"><h2>{esc(a["title"])}</h2>'
                          f'<div class="ov"><b>구 (개정 전)</b><p>{ov}</p></div>'
                          f'<div class="nv"><b>신 (개정 후)</b><p>{esc(a["new"])}</p></div></section>')
        if len(arts) > 25:
            arts_html += (f'<p style="font-size:13px;color:var(--dim)">…외 {len(arts) - 25}개 조 변경. '
                          f'<a href="/law-diff.html">전체 신구비교는 도구에서 →</a></p>')
        others = [a for a in ams if a is not main_am][:12]
        others_html = ""
        if others:
            lis = "".join(f'<li>{esc(fmt_date(a.get("ef")))} 시행 · 제{esc(a.get("pubNo"))}호 · {esc(a.get("rev"))}</li>' for a in others)
            others_html = f'<h2 class="sec">{esc(name)}의 다른 개정 (2025년 이후)</h2><ul>{lis}</ul>'
        ld = json.dumps({
            "@context": "https://schema.org", "@type": "Article",
            "headline": f"{name} 신구조문대비표 ({fmt_date(main_am['ef'])} 시행 개정)",
            "datePublished": iso_date(main_am.get("pub")), "dateModified": iso_date(main_am.get("ef")),
            "inLanguage": "ko",
            "author": {"@type": "Organization", "name": "대한민국 패치노트"},
            "publisher": {"@type": "Organization", "name": "대한민국 패치노트", "url": BASE},
            "isBasedOn": "법제처 국가법령정보 (신구조문대비표)", "description": desc,
            "mainEntityOfPage": f"{BASE}/law/{slug}.html",
        }, ensure_ascii=False)
        pageHtml = TEMPLATE.format(
            title=esc(title), desc=esc(desc), ogtitle=esc(f"{name} 신구조문대비표 — {fmt_date(main_am['ef'])} 시행 개정"),
            slug=slug, base=BASE, ld=ld, h1name=esc(name), kind=esc(main_am.get("kind")),
            ef=esc(fmt_date(main_am.get("ef"))), pub=esc(fmt_date(main_am.get("pub"))), pubno=esc(main_am.get("pubNo")),
            rev=esc(main_am.get("rev")), lead=lead, arts=arts_html, others=others_html)
        (OUT / f"{slug}.html").write_text(pageHtml, encoding="utf-8")
        urls.append((slug, iso_date(main_am.get("ef"))))
        gen += 1

    # sitemap-law.xml
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for slug, lm in urls:
        from urllib.parse import quote
        loc = f"{BASE}/law/{quote(slug)}.html"
        sm.append(f"  <url><loc>{loc}</loc><changefreq>monthly</changefreq><priority>0.7</priority>" +
                  (f"<lastmod>{lm}</lastmod>" if lm else "") + "</url>")
    sm.append("</urlset>")
    Path("sitemap-law.xml").write_text("\n".join(sm), encoding="utf-8")
    print(f"[law SEO] 생성 {gen}개 / 스킵(본문 없음·전부개정·별표) {skip} / 고유 법령명 {len(by_name)}")
    print(f"[law SEO] sitemap-law.xml - {len(urls)} URL")

if __name__ == "__main__":
    main()
