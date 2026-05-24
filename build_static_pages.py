#!/usr/bin/env python3
"""
정적 SEO 랜딩 페이지 생성기
각 주요 라우트에 대해 별도 HTML 파일을 생성하여 검색엔진 인덱싱을 최대화.

생성 결과:
- bills.html, election2026.html, committees.html, map.html,
  world.html, elections.html, relations.html, history.html

각 파일은:
1. 고유한 title, description, og:title, og:url (검색엔진용)
2. <noscript> 정적 콘텐츠 (봇 친화적)
3. JS 활성 시 자동으로 SPA(/#/...)로 리다이렉트
4. JS 비활성 시 meta refresh로 폴백
"""
import json
from pathlib import Path

PAGES = [
    {
        "file": "bills.html",
        "hash": "#/bills",
        "title": "22대 국회 통과 법안 1,595건 — 패치 노트로 보는 의안",
        "desc": "2024-05~현재 22대 국회 본회의 처리 의안 1,595건. 발의자(정부·위원장·의원)·정당·15개 분야·통과 속도까지 필터·검색. 실시간 국회 OPEN API 데이터.",
        "h1": "📋 22대 국회 본회의 처리 의안 1,595건",
        "content": [
            "**대한민국 22대 국회**의 본회의에서 처리된 모든 법안을 패치 노트 형식으로 정리합니다.",
            "**발의자 분류**: 정부 발의 ⚖, 위원장 발의 🏢, 의원 발의 👤 (정당별)",
            "**분야 15종**: 환경·기후, 복지·보건, 노동, 교육, 국방·안보, 경제·산업, 교통·국토, 농수산, 사법·법무, 문화·체육, 외교·통일, 과학·통신, 행정·자치, 안전·재난",
            "**필터**: 결과(가결/부결) · 발의자 종류 · 정당 · 위원회 · 분야 · 키워드 검색",
            "**통과 속도**: 발의일 → 본회의 처리일까지 일수 (30일 미만 강조)",
            "**페이지네이션**: 30개씩, '더 보기' 버튼으로 +50씩 추가",
        ],
    },
    {
        "file": "election2026.html",
        "hash": "#/election2026",
        "title": "🔴 제9회 전국동시지방선거 — 2026년 6월 3일 (LIVE)",
        "desc": "제9회 전국동시지방선거 정보. 광역단체장 17·기초단체장 226·광역의원·기초의원·교육감 등 총 4,040석 선출. D-day 카운트다운, 17개 광역 현직 단체장, 공식 후보·공약 직링크.",
        "h1": "🗳 제9회 전국동시지방선거 (2026-06-03)",
        "content": [
            "**선거일**: 2026년 6월 3일 (수) 06:00 ~ 18:00",
            "**사전투표**: 2026년 5월 29일~30일",
            "**선거운동 기간**: 2026년 5월 21일 ~ 6월 2일 (13일)",
            "**총 선출 의석**: 4,040석 — 광역단체장 17·기초단체장 226·광역의원 ~792·기초의원 ~2988·교육감 17",
            "**유권자**: 약 4,426만명 (만 18세 이상)",
            "**1인 7표** (광역단체장·기초단체장·광역의원 지역구·비례·기초의원 지역구·비례·교육감)",
            "**현직 17 광역단체장 임기 만료**: 2026-06-30 → 새 당선자 2026-07-01 취임",
            "각 광역별 후보자·공약 정보는 중앙선거관리위원회 공식 사이트(info.nec.go.kr, policy.nec.go.kr) 직링크 제공.",
        ],
    },
    {
        "file": "committees.html",
        "hash": "#/committees",
        "title": "22대 국회 위원회 25개 — 위원장·정당·처리 의안",
        "desc": "22대 국회 17개 상임위원회 + 8개 특별위원회. 각 위원회별 위원장·간사·정당 분포·처리 의안 수. 위원회 클릭 시 위원 명단과 최근 처리 의안 표시.",
        "h1": "🏢 22대 국회 위원회 25개",
        "content": [
            "**상임위 17**: 법사·정무·기재·교육·과방·외통·국방·행안·문체·농해수·산자·복지·환노·국토·정보·여가·운영",
            "**특별위 8**: 예결특위, 윤리특위, 정개특위 등",
            "**위원장 정보**: 22대 전반기(2024.6 ~ 2026.5) 위원장 17명 + 간사 33명",
            "**위원회별 처리 의안**: 위원회별 본회의 처리 의안 1,595건 분류",
            "**예시**: 국토교통위원회 — 위원장 맹성규(민), 29명, 121건 처리, 가결률 99.2%",
        ],
    },
    {
        "file": "map.html",
        "hash": "#/map",
        "title": "정치 분포 지도 — 17개 시도 + 250개 시군구",
        "desc": "대한민국 17개 광역시도 + 250개 시군구의 광역단체장·기초단체장 정당색 지도. 줌·드래그 인터랙티브, 호버 시 단체장 정보 표시.",
        "h1": "🗺 대한민국 정치 분포 지도",
        "content": [
            "**광역 레이어**: 17개 시도지사 정당색 — 임기 2022.7.1 ~ 2026.6.30",
            "**시군구 레이어**: 250개 기초단체장 정당색",
            "**상호작용**: 휠 확대 (1x~8x), 드래그 이동 (화면 밖 제한), 줌 컨트롤 +/−/⤾",
            "**호버 정보**: 단체장 이름·정당·당선일",
            "**클릭**: 해당 단체장 상세 페이지로 이동",
        ],
    },
    {
        "file": "world.html",
        "hash": "#/world",
        "title": "국제 비교 — 대한민국 vs 11개 민주국가",
        "desc": "대한민국과 미국·일본·독일·영국·프랑스·대만·스웨덴·캐나다·호주·노르웨이·뉴질랜드 12개 민주국가 비교. 의원 수·여성 비율·투표율·민주주의 지수·언론자유·청렴도.",
        "h1": "🌐 국제 비교 — 대한민국 vs 11개국",
        "content": [
            "**12개 민주국가**: 🇰🇷 한국·🇺🇸 미국·🇯🇵 일본·🇩🇪 독일·🇬🇧 영국·🇫🇷 프랑스·🇹🇼 대만·🇸🇪 스웨덴·🇨🇦 캐나다·🇦🇺 호주·🇳🇴 노르웨이·🇳🇿 뉴질랜드",
            "**비교 지표 10개**: 의원 수·10만명당 의원·여성 비율·평균 연령·투표율·임기·정당 수·민주주의 지수·언론자유·부패인식",
            "**KPI 4종**: 한국 vs 평균 차이 (▲▼ 화살표)",
            "**막대 차트 6**: 정렬된 12개국, 한국 빨간 강조",
            "**출처**: IPU Parline · EIU Democracy Index 2024 · RSF Press Freedom 2024 · TI CPI 2024 · OECD",
        ],
    },
    {
        "file": "elections.html",
        "hash": "#/elections",
        "title": "역대 지방선거 결과 — 제7회(2018) · 제8회(2022)",
        "desc": "2018년 6·13 지방선거(7회), 2022년 6·1 지방선거(8회) 17개 광역단체장 비교. 당선자·차점자·득표율·격차·박빙 race·정권교체 지역.",
        "h1": "🗳 역대 지방선거 — 7회·8회 광역단체장",
        "content": [
            "**2022 제8회 지선**: 국민의힘 12 / 더불어민주당 5 — 12곳 정권교체",
            "**2018 제7회 지선**: 더불어민주당 14 / 자유한국당 2 / 무소속 1 (제주 원희룡)",
            "**박빙 race (≤5%p)**: 경기 김동연·김은혜 0.15%p(8,913표 차) · 대전 4.70%p",
            "**민주 강세**: 전북 84%, 광주 78%, 전남 76%",
            "**보수 강세**: 대구 79%, 경북 78%, 부산 66%",
            "**역대 시도지사 23명** + 정당별 의석 (광역·기초·광역의회·교육감)",
        ],
    },
    {
        "file": "relations.html",
        "hash": "#/relations",
        "title": "위원회별 발의 활동 네트워크 — 22대 국회",
        "desc": "22대 국회의원 286명을 17개 위원회 클러스터로 배치. 노드 크기 = 대표발의 건수, 색 = 정당. 분야 필터로 영역별 활성 의원 발견.",
        "h1": "🕸 위원회별 발의 활동 네트워크",
        "content": [
            "**노드 크기 = 대표발의 건수** (5~28px scaleSqrt)",
            "**위치 = 소속 위원회** (19개 클러스터 원형 배치)",
            "**색 = 정당** (정당색 자동 매핑)",
            "**분야 필터**: 환경/복지/교육/국방/외교 등 15종",
            "**최소 발의 필터**: 1·2·3·5건+",
            "**현재 활성 발의자**: 194명 (전체) → 환경 분야: 13명 (국민의힘 7명 최다)",
        ],
    },
]

TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="author" content="Korea Patch Notes">

<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="https://minsoo500101-rgb.github.io/politik/{file}">
<meta property="og:image" content="https://minsoo500101-rgb.github.io/politik/og-image.png">
<meta property="og:locale" content="ko_KR">
<meta property="og:site_name" content="대한민국 패치 노트">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">

<link rel="canonical" href="https://minsoo500101-rgb.github.io/politik/{file}">
<link rel="alternate" type="application/rss+xml" title="대한민국 패치 노트" href="/feed.xml">

<!-- 검색엔진 인증 (메인과 동일) -->
<meta name="naver-site-verification" content="REPLACE_WITH_NAVER_VERIFICATION_CODE">
<meta name="google-site-verification" content="REPLACE_WITH_GOOGLE_VERIFICATION_CODE">

<!-- JS 활성: SPA로 즉시 리다이렉트 -->
<script>location.replace('/politik/{hash}');</script>
<!-- JS 비활성: meta refresh 폴백 -->
<meta http-equiv="refresh" content="0; url=/politik/{hash}">

<style>
body {{ font-family: 'Pretendard Variable', 'Inter', -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 24px; color: #1f2937; }}
h1 {{ font-size: 28px; font-weight: 800; margin-bottom: 16px; }}
.lead {{ font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 24px; }}
ul {{ padding-left: 24px; line-height: 1.7; }}
li {{ margin-bottom: 8px; color: #374151; font-size: 14px; }}
.cta {{ display: inline-block; margin-top: 24px; padding: 14px 28px; background: #111827; color: #fff !important; border-radius: 8px; text-decoration: none; font-weight: 700; }}
.footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }}
.footer a {{ color: #4b5563; }}
strong {{ color: #111827; }}
</style>
</head>
<body>
<h1>{h1}</h1>
<p class="lead">{desc}</p>

<ul>
{content_html}
</ul>

<a class="cta" href="/politik/{hash}">📋 인터랙티브 사이트 열기 →</a>

<div class="footer">
<strong>대한민국 패치 노트</strong> · Korea Patch Notes<br>
출처: 국회 OPEN API (공공누리 1유형) · 위키미디어 · 중앙선거관리위원회<br>
<a href="https://github.com/minsoo500101-rgb/politik">GitHub 저장소 (MIT)</a> ·
<a href="/politik/">홈으로</a>
</div>
</body>
</html>
"""

def md_to_html(text):
    """Convert **bold** to <strong> for simple inline formatting."""
    out = ""
    i = 0
    while i < len(text):
        if text[i:i+2] == "**":
            end = text.find("**", i+2)
            if end != -1:
                out += "<strong>" + text[i+2:end] + "</strong>"
                i = end + 2
                continue
        out += text[i]
        i += 1
    return out

def build():
    out_dir = Path("D:/politik")
    count = 0
    for page in PAGES:
        content_html = "\n".join(f"  <li>{md_to_html(c)}</li>" for c in page["content"])
        html = TEMPLATE.format(
            title=page["title"],
            desc=page["desc"],
            h1=page["h1"],
            file=page["file"],
            hash=page["hash"],
            content_html=content_html,
        )
        out_path = out_dir / page["file"]
        out_path.write_text(html, encoding="utf-8")
        count += 1
        print(f"[OK] {page['file']} ({len(html)} bytes)")
    print(f"\n{count} static SEO pages generated.")

if __name__ == "__main__":
    build()
