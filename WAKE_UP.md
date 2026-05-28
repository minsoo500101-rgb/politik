# 🌅 일어나서 첫 번째로 볼 곳

> **사이트 자동 감시 켜놨음. 깨면 여기 순서대로 보면 끝.**

---

## 1. 최근 health check 결과 (1분)

```bash
node -e "const log=require('./data/health-log.json'); const l=log[0]; console.log('마지막 체크:', l?.timestamp_kst || '아직 없음'); console.log('통과:', l?.pass_count+'/'+l?.total_count); console.log('버전:', l?.site_version); console.log('Critical 실패:', l?.critical_fail?.length || 0, '건'); if(l?.critical_fail?.length) console.log(JSON.stringify(l.critical_fail, null, 2));"
```

또는 그냥 `data/health-log.json` 열어서 첫 항목 보기.

---

## 2. GitHub Issue 확인 (Critical 실패 자동 알림)

https://github.com/minsoo500101-rgb/politik/issues?q=label:health-check

빨간 issue 있으면 그것부터.

---

## 3. 사전투표 fetch 작동 여부

```bash
curl -s https://patchkr.com/api/early-vote-rate | head -200
```

`rate` 값 나오면 ✅, `null`이면 NEC fetch 실패 → 수동 갱신 필요.

---

## 4. 수동 갱신 (필요 시)

NEC 공식 사이트(info.nec.go.kr)에서 사전투표율 확인 후:

```bash
node scripts/update-vote-rate.js --rate=4.50 --phase=1일차 --announced="2026-05-29T11:00:00+09:00"
git commit -am "data: 사전투표율 11시 갱신 4.50%"
git push
```

NEC 보통 발표 시각: **09 · 11 · 13 · 15 · 17 시** (5회/일)

---

## 5. 평온하면 (90% 시나리오)

- 위 1번 통과율 90%+
- Critical 실패 0건
- 사전투표 fetch 작동

→ **할 일 없음.** 인스타 카드 1번 올리고 일상으로.

---

## 자동 시스템 요약 (자는 동안 작동한 것)

| 시간 | 시스템 | 동작 |
|---|---|---|
| 매 시간 정시 | health-check.yml | 사이트 + API 16개 점검 → log 누적 |
| 매일 09:00 KST | daily-sync.yml | 위키 career + llms 자동 갱신 |
| Critical 실패 시 | health-check.yml | GitHub Issue 자동 생성 |
| 5/29 06:00 | 사이트 자동분기 | 홈 hero → "사전투표 진행 중" 모드 |

전부 자동. 사용자 개입 없어도 굴러감.
