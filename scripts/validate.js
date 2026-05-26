#!/usr/bin/env node
/**
 * politicians.json 무결성 검증
 * - JSON 파싱 가능 여부
 * - people 배열 존재
 * - 필수 필드 (id, name_ko, type) 검사
 * - 중복 id 검사
 * - sitemap.xml URL 유효성
 * - index.html POLITICIANS_VER 와 데이터 version 일치 여부
 *
 * 실행: node scripts/validate.js
 * GitHub Actions에서도 호출됨
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let errors = 0;
let warnings = 0;

function err(msg) { console.error('❌ ERROR:', msg); errors++; }
function warn(msg) { console.warn('⚠️  WARN:', msg); warnings++; }
function ok(msg) { console.log('✅', msg); }

// 1. politicians.json
let data;
try {
  const raw = fs.readFileSync(path.join(ROOT, 'data/politicians.json'), 'utf8');
  data = JSON.parse(raw);
  ok(`politicians.json 파싱 OK (${(raw.length / 1024).toFixed(1)} KB)`);
} catch (e) {
  err(`politicians.json 파싱 실패: ${e.message}`);
  process.exit(1);
}

if (!data.people || !Array.isArray(data.people)) {
  err('people 배열이 없음');
  process.exit(1);
}
ok(`people 배열 ${data.people.length}명`);

// 2. 필수 필드 검사
const seenIds = new Set();
const dupIds = new Set();
let missingId = 0, missingName = 0, missingType = 0;
let withCareer = 0;

data.people.forEach((p, i) => {
  if (!p.id) { missingId++; warn(`[${i}] id 없음 — name=${p.name_ko}`); }
  if (!p.name_ko) { missingName++; warn(`[${i}] name_ko 없음 — id=${p.id}`); }
  if (!p.type) { missingType++; warn(`[${i}] type 없음 — id=${p.id}`); }
  if (p.id) {
    if (seenIds.has(p.id)) dupIds.add(p.id);
    seenIds.add(p.id);
  }
  if (p.career) withCareer++;
});

if (missingId) warn(`id 없는 인물 ${missingId}명`);
if (missingName) warn(`name_ko 없는 인물 ${missingName}명`);
if (missingType) warn(`type 없는 인물 ${missingType}명`);
if (dupIds.size) {
  err(`중복 id ${dupIds.size}개: ${[...dupIds].join(', ')}`);
}
ok(`career 등록 ${withCareer}/${data.people.length} (${(withCareer / data.people.length * 100).toFixed(1)}%)`);

// 3. index.html POLITICIANS_VER 일치 검사
try {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/const POLITICIANS_VER\s*=\s*(\d+)/);
  if (!m) {
    warn('index.html에 POLITICIANS_VER 상수 없음');
  } else {
    const htmlVer = parseInt(m[1]);
    if (htmlVer !== data.version) {
      err(`버전 불일치: politicians.json version=${data.version}, index.html POLITICIANS_VER=${htmlVer}`);
      err('→ 둘 다 같은 숫자로 맞춰야 캐시 정상 갱신');
    } else {
      ok(`POLITICIANS_VER 일치 (${htmlVer})`);
    }
  }
  // preload 링크도 확인
  const pm = html.match(/data\/politicians\.json\?v=(\d+)/);
  if (pm) {
    const pv = parseInt(pm[1]);
    if (pv !== data.version) {
      warn(`<link preload> 버전 ${pv} ≠ data version ${data.version}`);
    }
  }
} catch (e) {
  warn('index.html 검사 실패: ' + e.message);
}

// 4. sitemap.xml 검증
try {
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const urls = [...sm.matchAll(/<loc>(.+?)<\/loc>/g)].map(m => m[1]);
  const oldDomains = urls.filter(u => u.includes('politik-phi.vercel.app') || u.includes('minsoo500101-rgb.github.io'));
  if (oldDomains.length) {
    err(`sitemap.xml에 이전 도메인 URL ${oldDomains.length}개 남아있음`);
  } else {
    ok(`sitemap.xml URL ${urls.length}개 — 모두 patchkr.com`);
  }
} catch (e) {
  warn('sitemap.xml 검사 실패: ' + e.message);
}

// 5. index.html 인라인 script 안에 위험한 </script> 문자열 검사
try {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // 마지막 <script> 블록 (메인 인라인 JS) 안에 </script> 리터럴이 있으면 위험
  const mainScript = html.match(/<script>\s*'use strict';([\s\S]+?)<\/script>\s*<\/body>/);
  if (mainScript) {
    const body = mainScript[1];
    // </script> 가 백틱 안이거나 문자열·주석에 있으면 안 됨
    const danger = body.match(/<\/script>/i);
    if (danger) {
      err('index.html 메인 script 블록 안에 </script> 리터럴 발견 — HTML 파서가 조기 종료시킴');
      err('  → 백틱 템플릿이나 주석에 </script> 쓰지 말 것 (escape 필요: <\\/script>)');
    } else {
      ok('index.html 메인 script 안에 위험한 </script> 리터럴 없음');
    }
  }
} catch (e) {
  warn('index.html script 검사 실패: ' + e.message);
}

// 6. API 파일 환경변수 검사
const apiFiles = ['api/law.js', 'api/nec.js', 'api/naver.js'];
apiFiles.forEach(f => {
  try {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (c.match(/(?:client_secret|apikey|api_key|password)\s*[:=]\s*['"][a-zA-Z0-9]{10,}/i)) {
      err(`${f}: 하드코딩된 시크릿 의심 — process.env 사용해야 함`);
    } else {
      ok(`${f} 시크릿 OK`);
    }
  } catch {}
});

// 결과 요약
console.log('\n' + '='.repeat(50));
if (errors > 0) {
  console.error(`💥 검증 실패: ${errors}개 오류, ${warnings}개 경고`);
  process.exit(1);
}
console.log(`✨ 검증 통과: 0개 오류, ${warnings}개 경고`);
process.exit(0);
