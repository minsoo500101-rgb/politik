#!/usr/bin/env python3
"""
sitemap.xml 생성기 — 클린 경로(History API)만 출력.
구 #/ 해시 URL은 레거시(구글이 # 무시 → 홈 중복)라 전부 제외.
politicians.json의 주요 인물/정당을 클린 경로로 포함.
"""
import json
import urllib.parse
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

BASE = "https://patchkr.com"
TODAY = datetime.now().strftime("%Y-%m-%d")

# 색인 가능한 실제 페이지 (클린 경로). 구 #/그룹·#/history 도 클린으로 전환.
STATIC_PAGES = [
    {"path": "/",                        "priority": "1.0",  "freq": "daily"},
    {"path": "/bills",                   "priority": "0.95", "freq": "daily"},
    {"path": "/analysis.html",           "priority": "0.92", "freq": "weekly"},
    {"path": "/election-analysis-2026.html", "priority": "0.9", "freq": "weekly"},
    {"path": "/assembly-22-composition.html","priority": "0.9", "freq": "monthly"},
    {"path": "/economy-2026-review.html",     "priority": "0.9", "freq": "weekly"},
    {"path": "/gwangju-jeonnam-merge.html",   "priority": "0.9", "freq": "weekly"},
    {"path": "/yellow-envelope-100days.html", "priority": "0.9", "freq": "weekly"},
    {"path": "/korea-security-2026.html",     "priority": "0.9", "freq": "weekly"},
    {"path": "/dmz-frontline-2026.html",      "priority": "0.9", "freq": "weekly"},
    {"path": "/en",                           "priority": "0.85","freq": "weekly"},
    {"path": "/korea-martial-law-explained.html","priority": "0.9","freq": "weekly"},
    {"path": "/fake-news-law-2026.html",       "priority": "0.9", "freq": "weekly"},
    {"path": "/prosecution-reform-2026.html", "priority": "0.9", "freq": "weekly"},
    {"path": "/kim-keonhee-verdict-2026.html","priority": "0.9", "freq": "weekly"},
    {"path": "/han-seongsuk-pm-2026.html",    "priority": "0.9", "freq": "weekly"},
    {"path": "/hynix-us-listing-2026.html",   "priority": "0.9", "freq": "weekly"},
    {"path": "/worldcup-2026.html",      "priority": "0.9",  "freq": "daily"},
    {"path": "/drone-treason.html",      "priority": "0.9",  "freq": "weekly"},
    {"path": "/president-1year.html",     "priority": "0.9",  "freq": "weekly"},
    {"path": "/memorial-day.html",       "priority": "0.85", "freq": "monthly"},
    {"path": "/nvidia-huang.html",       "priority": "0.88", "freq": "weekly"},
    {"path": "/law-diff.html",           "priority": "0.95", "freq": "daily"},
    {"path": "/law-changes.html",        "priority": "0.9",  "freq": "daily"},
    {"path": "/election2026",            "priority": "0.9",  "freq": "weekly"},
    {"path": "/crisis.html",             "priority": "0.9",  "freq": "weekly"},
    {"path": "/martial-law.html",        "priority": "0.9",  "freq": "weekly"},
    {"path": "/dex",                     "priority": "0.85", "freq": "weekly"},
    {"path": "/ballot-shortage.html",    "priority": "0.85", "freq": "weekly"},
    {"path": "/ballot-shortage-en.html", "priority": "0.8",  "freq": "weekly"},
    {"path": "/judiciary.html",          "priority": "0.8",  "freq": "weekly"},
    {"path": "/economy",                 "priority": "0.8",  "freq": "daily"},
    {"path": "/committees",              "priority": "0.8",  "freq": "weekly"},
    {"path": "/map",                     "priority": "0.8",  "freq": "weekly"},
    {"path": "/glossary",                "priority": "0.7",  "freq": "monthly"},
    {"path": "/about",                   "priority": "0.7",  "freq": "monthly"},
    {"path": "/business",                "priority": "0.55", "freq": "monthly"},
    {"path": "/privacy",                 "priority": "0.4",  "freq": "yearly"},
    {"path": "/world",                   "priority": "0.7",  "freq": "monthly"},
    {"path": "/relations",               "priority": "0.65", "freq": "weekly"},
    {"path": "/pledge-tracker",          "priority": "0.6",  "freq": "monthly"},
    {"path": "/history/parties",         "priority": "0.6",  "freq": "monthly"},
    {"path": "/group/legislative",       "priority": "0.6",  "freq": "weekly"},
    {"path": "/group/executive",         "priority": "0.6",  "freq": "weekly"},
    {"path": "/group/judicial",          "priority": "0.55", "freq": "weekly"},
    {"path": "/group/local",             "priority": "0.6",  "freq": "weekly"},
    {"path": "/group/historical",        "priority": "0.5",  "freq": "monthly"},
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

    # 1) 메인 + 정적 + 그룹 페이지 (클린 경로)
    out.append("\n  <!-- 메인 + 정적/그룹 페이지 (클린 경로, History API) -->")
    for p in STATIC_PAGES:
        out.append(url_entry(p["path"], p["priority"], p["freq"], TODAY))

    try:
        pj = json.load(open("data/politicians.json", encoding="utf-8"))

        # 2) 정당 페이지 — /party/{name}
        parties = list(pj.get("parties", {}).keys())
        if parties:
            out.append("\n  <!-- 정당 페이지 (/party/) -->")
            for name in parties:
                enc = urllib.parse.quote(name, safe='')
                out.append(url_entry(f"/party/{enc}", "0.55", "weekly", TODAY))

        # 3) 주요 인물 detail — /m/{id}  (큐레이션: 핵심 직책자만)
        IMPORTANT_TYPES = {
            'president', 'prime_minister', 'minister', 'vice_minister',
            'chief_of_staff', 'agency_head', 'judge',
            'assembly_leader', 'committee_chair',
            'local_gov_head', 'local_council_speaker', 'edu_superintendent',
            'former_president', 'former_pm', 'former_party_leader', 'former_judge'
        }
        people = [p for p in pj.get("people", []) if p.get("type") in IMPORTANT_TYPES and p.get("id")]
        if people:
            out.append(f"\n  <!-- 주요 인물 detail (/m/, {len(people)}명) -->")
            PRI = {
                "president": "0.75", "prime_minister": "0.7",
                "minister": "0.55", "agency_head": "0.5", "judge": "0.5",
                "local_gov_head": "0.6", "assembly_leader": "0.6",
                "committee_chair": "0.55", "former_president": "0.5",
            }
            for person in people:
                enc = urllib.parse.quote(person["id"], safe='')
                pri = PRI.get(person.get("type", ""), "0.45")
                out.append(url_entry(f"/m/{enc}", pri, "monthly", TODAY))
    except Exception as e:
        print(f"[WARN] politicians.json 파싱 실패: {e}")

    out.append("</urlset>")
    content = "\n".join(out)
    if open("D:/politik/sitemap.xml", "rb").read().endswith(b"\n"):
        content += "\n"
    open("D:/politik/sitemap.xml", "w", encoding="utf-8", newline="").write(content)

    url_count = content.count("<url>")
    hash_count = content.count("/#/")
    size_kb = len(content.encode("utf-8")) / 1024
    print(f"[OK] sitemap.xml 생성 — URL {url_count}개, 해시(/#/) {hash_count}개, {size_kb:.1f} KB")


if __name__ == "__main__":
    build()
