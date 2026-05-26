# 📋 대한민국 패치 노트 (Korea Patch Notes)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-000?logo=vercel)](https://patchkr.com)
[![Buy Me a Coffee](https://img.shields.io/badge/☕-Buy_me_a_coffee-yellow)](https://buymeacoffee.com/HYTech)

> **한국의 모든 것을 데이터로** — 정치·법안·선거·인물·역사 종합 데이터 플랫폼.

🔗 **라이브 사이트**: [https://patchkr.com](https://patchkr.com)

---

## 🎯 5대 데이터 영역

| 영역 | 데이터 | 페이지 |
|---|---|---|
| 🏛 **정치** | 대통령·총리·17부처 장관/차관·외청장·헌법기관 27명 + 대통령실 4명 | `/` `/group/executive` |
| 📜 **법안** | 22대 국회 본회의 통과 1,595건 (발의자·정당·15분야·통과 속도) | `/bills` |
| 🗳 **선거** | 9회 지방선거 후보자 **697명 실시간** (5대 공약 포함) + 역대 7·8회 비교 | `/election2026` `/elections` |
| 👥 **인물** | 744명 종합 (22대 의원·단체장·사법부·검찰·역대 인물) | `/` |
| 📚 **역사** | 1948~현재 정당사 45개, 역대 광역단체장·사법부 수장·정당 대표 | `/history/parties` |

## ✨ 핵심 기능

- 🗺 **정치 분포 지도** — 17 시도 + 250 시군구 정당색 인터랙티브
- 📊 **법안 상세 분석** — 정당별 표결·반란표·관련 판례·헌재 결정·법령 본문
- 📰 **실시간 뉴스** — 네이버 검색 API로 인물·법안별 최신 보도
- 📈 **관심도 추적** — 위키백과 페이지뷰 30일 추이
- 🌐 **국제 비교** — 12개 민주국가 (의원수·여성비율·민주주의지수)
- 🌓 **다크·라이트 모드** — 시스템 설정 자동 감지

## 🛠 기술 스택

- **Frontend**: 순수 HTML 단일 파일 (10,000+ 줄), 인라인 CSS·JS, d3 v7
- **Hosting**: Vercel (CDN·서버리스 함수)
- **API 프록시**: Vercel Serverless (`/api/*`)
  - `api/nec.js` — 중앙선거관리위원회 후보자 데이터
  - `api/law.js` — 국가법령정보 (법령·판례·헌재 결정)
  - `api/naver.js` — 네이버 검색 (뉴스)
  - `api/bill.js` — 국회 법안 상세
- **데이터 출처** (11개 통합):
  - 대한민국 국회 OPEN API
  - 중앙선거관리위원회 OpenAPI
  - 국가법령정보센터 OpenAPI
  - 한국어 위키백과 + Wikimedia 페이지뷰
  - 네이버 검색 API
  - IPU Parline · EIU · RSF · TI · OECD

## 🚀 로컬 실행

```bash
git clone https://github.com/minsoo500101-rgb/politik.git
cd politik

# 정적 서버 — 예: Python 내장
python -m http.server 8000

# 브라우저에서 http://localhost:8000
```

API 프록시 기능을 로컬에서 테스트하려면 Vercel CLI:

```bash
npm i -g vercel
vercel link
vercel env pull        # .env.local 받기 (운영자만 가능)
vercel dev             # http://localhost:3000
```

## 🔐 환경 변수 (Vercel)

| Key | 용도 | 발급처 |
|---|---|---|
| `DATA_GO_KR_KEY` | 중앙선관위 후보자·공약 | data.go.kr |
| `LAW_GO_KR_OC` | 국가법령정보 (법령·판례) | open.law.go.kr |
| `NAVER_CLIENT_ID` | 네이버 검색 | developers.naver.com |
| `NAVER_CLIENT_SECRET` | 네이버 검색 (시크릿) | 동일 |

## 🤝 기여 (Contributing)

기여 환영합니다! 특히:

- 🐛 **버그 신고**: [이슈 등록](https://github.com/minsoo500101-rgb/politik/issues/new?template=bug-report.md)
- 📊 **데이터 오류 신고**: [데이터 신고](https://github.com/minsoo500101-rgb/politik/issues/new?template=data-correction.md)
- 💡 **기능 제안**: [기능 제안](https://github.com/minsoo500101-rgb/politik/issues/new?template=feature-request.md)
- 🔧 **코드 PR**: Fork → 수정 → PR

### 데이터 PR 시 검증 기준

- 한국어 위키백과 또는 정부 공식 발표 출처
- 객관 사실만 (평가·해석·의견 X)
- 출생년도·학력·주요 경력·임명년도 등 검증 가능한 정보

## 💼 비즈니스 문의

광고·데이터 라이선싱·컨설팅:

- 📧 [GitHub 문의 템플릿](https://github.com/minsoo500101-rgb/politik/issues/new?template=business-inquiry.md)
- 🌐 [사이트 문의 페이지](https://patchkr.com/#/business)

## ☕ 후원

서버 운영비·API 사용료에 사용됩니다:

- ☕ [Buy Me a Coffee](https://buymeacoffee.com/HYTech)
- ⭐ GitHub Star (무료 응원)

## 📊 누적 통계

| 항목 | 수치 |
|---|---|
| 등록 인물 | **744명** |
| career 데이터 | **141명** (27.6%) |
| 22대 통과 법안 | 1,595건 |
| 9회 지선 후보자 | 697명 |
| 통합 API | 11개 |
| 시군구 매핑 | 250 (100%) |

## 🛡 안정성 (Site Reliability)

### 자동 검증 (배포 전)
모든 `git push`에서 GitHub Actions가 자동 검증:
- ✅ politicians.json JSON 파싱
- ✅ 필수 필드 (id·name·type) + 중복 id 검사
- ✅ POLITICIANS_VER ↔ data version 일치
- ✅ sitemap.xml URL 유효성
- ✅ index.html 인라인 JS 신택스 (node --check)
- ✅ `</script>` 리터럴 검사 (HTML 파서 조기 종료 방지)
- ✅ API 파일에 하드코딩된 시크릿 검사

로컬 검증:
```bash
node scripts/validate.js
# 또는
npm run validate
```

### 런타임 에러 방지
- **전역 에러 핸들러** — JS 오류 시 빈 화면 대신 안내 카드 + 새로고침 버튼
- **Promise rejection 핸들러** — API 실패해도 UI 손상 X
- **이미지·외부 리소스 로드 실패는 무시** — 비핵심 자원이 메인 페이지를 깨지 못함

### 모니터링 권장
- **[UptimeRobot](https://uptimerobot.com)** — 무료 5분 간격 다운타임 알림
- **[Vercel Analytics](https://vercel.com/analytics)** — 빌트인 (이미 활성)
- **Sentry 무료 티어** — 클라이언트 에러 자동 수집 (선택)

## 📜 라이선스

- **코드**: [MIT](LICENSE)
- **데이터**: 각 출처 라이선스 (공공누리 1유형·CC BY-SA 4.0)

상업적 이용 가능. 출처 표기 권장.

---

## 운영자용 부록 — 네이버 검색 등록 / 분석 도구

<details>
<summary>네이버 서치어드바이저 등록 가이드</summary>

### 1단계: 가입
1. [searchadvisor.naver.com](https://searchadvisor.naver.com) 접속
2. 사이트 등록 → `https://patchkr.com` 입력

### 2단계: 소유 확인 (HTML 메타 태그)
1. 발급된 인증 코드 복사
2. `index.html`의 `<meta name="naver-site-verification">` content 교체
3. git push → 1~2분 후 "확인"

### 3단계: 사이트맵 제출
- 요청 → 사이트맵 제출 → `sitemap.xml` 입력

### 4단계: 색인 가속 (요청 → 웹페이지 수집)
주요 URL 10개 정도 수동 요청 (일 50회 가능)

</details>

<details>
<summary>분석 도구 권장</summary>

| 도구 | 가격 | 개인정보 | 무게 |
|---|---|---|---|
| **Plausible** ⭐ | $9/월 (or 셀프호스팅 무료) | 100% 익명·쿠키 X | 1KB |
| **Umami** | 셀프호스팅 무료 | 익명 | 2KB |
| **GA4** | 무료 | 추적·동의 필요 | 50KB+ |

추가 1줄로 적용:
```html
<script defer data-domain="patchkr.com" src="https://plausible.io/js/script.js"></script>
```

</details>

🤖 Open source · Built with [Claude Code](https://claude.com/claude-code)
