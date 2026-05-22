# 📋 대한민국 패치 노트 (Korea Patch Notes)

[**🔗 라이브 사이트 →**](https://minsoo500101-rgb.github.io/politik/)

22대 국회 본회의 통과 법안을 **패치 노트** 형식으로 시각화. 어느 당·누가 발의했는지, 분야별·통과 속도까지 한눈에.

---

## 핵심 데이터

| 항목 | 수치 |
|---|---|
| 등록 인물 | **744명** (22대 MP 286 + 정치인 458) |
| 본회의 처리 의안 | 1,595건 |
| 발의자 매핑 | 17,224건 |
| 위원회 | 25개 (상임 17 + 특별 8) |
| 광역·기초 단체장 | 244명 |
| 국제 비교 | 12개 민주국가 |
| 광역단체장 선거 데이터 | 2018·2022 (34 race) |

---

## 네이버 검색 등록 가이드

본 사이트를 네이버에 노출시키려면 **네이버 서치어드바이저**에 등록해야 합니다.

### 1단계: 네이버 서치어드바이저 가입
1. [https://searchadvisor.naver.com](https://searchadvisor.naver.com) 접속
2. 네이버 계정으로 로그인
3. 우상단 "웹마스터 도구" → "사이트 등록"
4. URL 입력: `https://minsoo500101-rgb.github.io/politik/`

### 2단계: 사이트 소유 확인
네이버가 두 가지 방법 중 하나로 소유 확인을 요청합니다:

**방법 A — HTML 메타 태그 (권장)**
1. 발급된 인증 코드 복사 (예: `naver1234abcd...`)
2. `index.html`의 다음 줄을 찾아서:
   ```html
   <meta name="naver-site-verification" content="REPLACE_WITH_NAVER_VERIFICATION_CODE">
   ```
   `content` 값을 발급된 코드로 교체
3. git commit + push
4. GitHub Pages 반영 후 (1-2분) 서치어드바이저에서 "확인"

**방법 B — HTML 파일 업로드**
1. 발급된 파일 (예: `naverabc123.html`) 다운로드
2. 저장소 루트에 업로드
3. git commit + push
4. 서치어드바이저에서 "확인"

### 3단계: 사이트맵 제출
1. 서치어드바이저 사이트 관리 페이지 진입
2. 좌측 메뉴 "요청" → "사이트맵 제출"
3. URL 입력: `sitemap.xml`
4. 확인 클릭

### 4단계: RSS 등록
1. "요청" → "RSS 제출"
2. URL 입력: `feed.xml`
3. 등록

### 5단계: 색인 요청 (선택, 빠른 노출)
1. "요청" → "웹페이지 수집"
2. 주요 URL 입력 (홈, /bills, /election2026 등)
3. 일 50회까지 가능

### 6단계: 검증 (필수)
1. "검증" → "robots.txt" 확인
2. "검증" → "사이트맵" 형식 확인
3. 모두 정상이어야 노출됨

---

## 구글·빙 동시 등록 (권장)

### 구글 서치 콘솔
1. [https://search.google.com/search-console](https://search.google.com/search-console)
2. URL 접두어 추가: `https://minsoo500101-rgb.github.io/politik/`
3. `<meta name="google-site-verification">` 코드 교체 후 push
4. 사이트맵 제출

### 빙 웹마스터 도구
1. [https://www.bing.com/webmasters](https://www.bing.com/webmasters)
2. `<meta name="msvalidate.01">` 코드 교체

---

## 검색 노출 최적화 (이미 적용됨)

- ✅ `sitemap.xml` — 14개 URL 등록
- ✅ `robots.txt` — Naver Yeti·Daumoa·Googlebot 명시 허용
- ✅ `feed.xml` — RSS 2.0 피드
- ✅ JSON-LD 구조화 데이터 (Organization · WebSite · WebPage · Dataset)
- ✅ Open Graph + Twitter Card
- ✅ `<noscript>` 정적 콘텐츠 (검색봇 대응)
- ✅ Canonical URL
- ✅ 한국어 우선 (`<html lang="ko">`, `og:locale=ko_KR`)

### Hash 라우팅 한계
SPA의 `#/bills` 같은 hash 경로는 검색엔진이 별도 페이지로 인덱싱하지 않습니다.
- **인덱싱되는 것**: 메인 URL (`/`) + `<noscript>` 콘텐츠 + JSON-LD
- **개선 옵션**: History API 라우팅으로 변경 (별도 작업 필요)

---

## 기술 스택

- 순수 HTML 단일 파일 (6,000+ 줄), 인라인 CSS/JS
- d3 v7 (지도·관계도·차트)
- Pretendard·Inter 폰트
- 국회 OPEN API + Wikipedia REST + MediaWiki API
- localStorage 캐시 (24h TTL)
- 다크/라이트 모드, 모바일 반응형

## 데이터 출처

- [국회 OPEN API](https://open.assembly.go.kr) (공공누리 1유형)
- [Wikipedia REST API](https://ko.wikipedia.org) (CC BY-SA 4.0)
- [중앙선거관리위원회](https://info.nec.go.kr)
- [IPU Parline](https://data.ipu.org)
- [EIU Democracy Index 2024](https://www.eiu.com/democracy-index)
- [RSF Press Freedom Index](https://rsf.org)
- [Transparency International CPI](https://www.transparency.org)

## 라이선스

MIT License — 자유 사용·수정·배포

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
