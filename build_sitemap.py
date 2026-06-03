#!/usr/bin/env python3
"""
동적 sitemap.xml 생성기
politicians.json 파싱하여 모든 인물 URL을 포함한 완전한 sitemap 생성.
"""
import json
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

BASE = "https://patchkr.com"
TODAY = datetime.now().strftime("%Y-%m-%d")

# 고정 페이지 (메인 + 정적 SEO + SPA 라우트)
STATIC_PAGES = [
    {"path": "/",              "priority": "1.0", "freq": "daily"},
    {"path": "/bills",         "priority": "0.95", "freq": "daily"},
    {"path": "/law-diff.html", "priority": "0.95", "freq": "daily"},
    {"path": "/law-changes.html", "priority": "0.9", "freq": "daily"},
    {"path": "/crisis.html",   "priority": "0.9", "freq": "daily"},
    {"path": "/ballot-shortage.html", "priority": "0.9", "freq": "daily"},
    {"path": "/ballot-shortage-en.html", "priority": "0.85", "freq": "daily"},
    {"path": "/judiciary.html",  "priority": "0.85", "freq": "weekly"},
    {"path": "/martial-law.html", "priority": "0.9", "freq": "weekly"},
    {"path": "/election2026",  "priority": "0.95", "freq": "hourly"},
    {"path": "/committees",    "priority": "0.85", "freq": "weekly"},
    {"path": "/map",           "priority": "0.8",  "freq": "weekly"},
    {"path": "/world",         "priority": "0.75", "freq": "monthly"},
    {"path": "/elections",     "priority": "0.7",  "freq": "monthly"},
    {"path": "/relations",     "priority": "0.6",  "freq": "weekly"},
    {"path": "/#/history/parties",       "priority": "0.5", "freq": "monthly"},
    {"path": "/#/group/legislative",     "priority": "0.5", "freq": "weekly"},
    {"path": "/#/group/executive",       "priority": "0.5", "freq": "weekly"},
    {"path": "/#/group/judicial",        "priority": "0.5", "freq": "weekly"},
    {"path": "/#/group/local",           "priority": "0.5", "freq": "weekly"},
    {"path": "/#/group/historical",      "priority": "0.5", "freq": "monthly"},
]

def url_entry(path, priority="0.5", freq="weekly", lastmod=None):
    loc = BASE + path
    out = ["  <url>"]
    out.append(f"    <loc>{escape(loc)}</loc>")
    out.append(f"    <changefreq>{freq}</changefreq>")
    out.append(f"    <priority>{priority}</priority>")
    if lastmod:
        out.append(f"    <lastmod>{lastmod}</lastmod>")
    out.append("  </url>")
    return "\n".join(out)

def build():
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']

    # 고정 페이지
    out.append("\n  <!-- 메인 + 정적 SEO 페이지 -->")
    for p in STATIC_PAGES[:15]:
        out.append(url_entry(p["path"], p["priority"], p["freq"], TODAY))

    out.append("\n  <!-- SPA 그룹 라우트 -->")
    for p in STATIC_PAGES[15:]:
        out.append(url_entry(p["path"], p["priority"], p["freq"]))

    # 정당 페이지 (PARTY_INFO 기반)
    try:
        pj = json.load(open("data/politicians.json", encoding="utf-8"))
        parties = list(pj.get("parties", {}).keys())
        if parties:
            out.append("\n  <!-- 정당 페이지 -->")
            for p in parties:
                import urllib.parse
                enc = urllib.parse.quote(p, safe='')
                out.append(url_entry(f"/#/party/{enc}", "0.55", "weekly"))

        # 인물 detail (44명 정도만 — 너무 많으면 sitemap이 비대해짐)
        # 중요 인물 우선: president, PM, ministers, governors, judges
        IMPORTANT_TYPES = {
            'president', 'prime_minister', 'minister', 'vice_minister',
            'chief_of_staff', 'agency_head', 'judge',
            'assembly_leader', 'committee_chair',
            'local_gov_head', 'local_council_speaker', 'edu_superintendent',
            'former_president', 'former_pm', 'former_party_leader', 'former_judge'
        }
        people = [p for p in pj.get("people", []) if p.get("type") in IMPORTANT_TYPES]
        if people:
            out.append(f"\n  <!-- 주요 인물 detail ({len(people)}명) -->")
            for person in people:
                pid = person.get("id", "")
                if not pid:
                    continue
                import urllib.parse
                enc = urllib.parse.quote(pid, safe='')
                # 인물 type별 우선순위
                t = person.get("type", "")
                pri = {
                    "president": "0.7", "prime_minister": "0.7",
                    "minister": "0.55", "agency_head": "0.5",
                    "judge": "0.5", "local_gov_head": "0.55",
                    "assembly_leader": "0.6", "committee_chair": "0.55",
                    "former_president": "0.5"
                }.get(t, "0.4")
                out.append(url_entry(f"/#/m/{enc}", pri, "monthly"))
    except Exception as e:
        print(f"[WARN] politicians.json 파싱 실패: {e}")

    # 법안 detail URL 추가 (캐시된 데이터 기반 — 없으면 skip)
    # 실제 BILL_ID는 API 호출 후 매핑 필요. 여기선 sitemap-bills.xml 별도 추천.
    # 대신 핵심 50건만 추가
    try:
        # ./data/bills_sample.json 같은 파일이 있으면 fetch
        import urllib.request
        bills_path = Path("D:/politik/data/bills_cache.json")
        if bills_path.exists():
            bills = json.load(bills_path.open(encoding="utf-8"))
            out.append(f"\n  <!-- 법안 detail (상위 {len(bills)}건) -->")
            for b in bills:
                bid = b.get("BILL_ID", "")
                if bid:
                    import urllib.parse
                    enc = urllib.parse.quote(bid, safe='')
                    out.append(url_entry(f"/#/bill/{enc}", "0.4", "monthly"))
    except Exception:
        pass

    out.append("</urlset>")
    content = "\n".join(out)
    Path("D:/politik/sitemap.xml").write_text(content, encoding="utf-8")

    # 카운트 출력
    url_count = content.count("<url>")
    size_kb = len(content.encode("utf-8")) / 1024
    print(f"[OK] sitemap.xml 생성 완료")
    print(f"     URL 수: {url_count}")
    print(f"     크기: {size_kb:.1f} KB")
    print(f"     최대 한도: 50,000 URL / 50 MB (모두 OK)")

if __name__ == "__main__":
    build()
