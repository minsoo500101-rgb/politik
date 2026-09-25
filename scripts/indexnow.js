#!/usr/bin/env node
/**
 * IndexNow — 새 기사·바뀐 페이지를 검색엔진에 즉시 알린다.
 * 받는 곳: 네이버 서치어드바이저 + api.indexnow.org(빙·얀덱스·세즈남 등이 공유).
 *
 * 왜: 한국어 사이트는 유입 대부분이 네이버 검색이고, 기사를 올린 날 색인되느냐가 그날 트래픽을 가른다.
 * 지금까지 패치노트는 사이트맵을 두고 크롤러가 찾아오길 기다리기만 했다(같은 사업자의 Clinch 는 이미 쓰는 방식).
 *
 * 사용:
 *   node scripts/indexnow.js /yoon-...-2026.html /law-radar.html     # 경로 직접
 *   node scripts/indexnow.js --changed=HEAD~1..HEAD                  # 그 범위에서 바뀐 HTML
 *   node scripts/indexnow.js --since="26 hours ago"                  # 최근 커밋에서 바뀐 HTML(크론용)
 *   node scripts/indexnow.js --sitemap                               # sitemap.xml 전체(최초 1회용)
 *   옵션: --dry(전송 안 함) · --wait(첫 URL이 새 내용으로 뜰 때까지 최대 4분 대기 — 배포 지연 대비)
 *
 * 규칙:
 *   - noindex 페이지는 보내지 않는다(색인 거부한 페이지를 색인해 달라고 하면 신호가 엇갈린다).
 *   - 법령 페이지 대량 재전송 금지 — 실제로 바뀐 파일만. IndexNow 는 '변경 통지'이지 재제출 도구가 아니다.
 *   - 키는 비밀이 아니다(도메인 소유 확인용, 루트의 <키>.txt 로 공개).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HOST = 'patchkr.com';
const KEY = 'cd47e2866a111400879b72fd62a619d8';
const ENDPOINTS = [
  'https://searchadvisor.naver.com/indexnow',
  'https://api.indexnow.org/indexnow',
];
const MAX_PER_CALL = 1000;

const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  const i = hit.indexOf('=');
  return i === -1 ? '' : hit.slice(i + 1);
};
const DRY = flag('dry') !== null;
const WAIT = flag('wait') !== null;

/** 저장소 파일 경로 → 공개 URL. index.html 은 루트, 그 외 .html 은 그대로(사이트가 .html 주소를 정본으로 쓴다). */
function fileToUrl(rel) {
  const p = rel.replace(/\\/g, '/');
  if (p === 'index.html') return `https://${HOST}/`;
  const enc = p.split('/').map(encodeURIComponent).join('/');
  return `https://${HOST}/${enc}`;
}

function isIndexable(rel) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return false;                       // 삭제된 파일
  const head = fs.readFileSync(f, 'utf8').slice(0, 6000);
  return !/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(head);
}

/** 배포 파이프라인이 아닌 파일(도구·목업·템플릿)은 제외 */
const SKIP = /^(mockups|docs|scripts|node_modules|api|\.github)\//;

function htmlFromGit(cmd) {
  const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8' });
  return [...new Set(out.split(/\r?\n/).map((s) => s.trim())
    .filter((s) => s.endsWith('.html') && !SKIP.test(s)))];
}

function urlsFromSitemap(file) {
  const xml = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

async function waitLive(url) {
  // 방금 푸시한 커밋이 배포되기 전에 통지하면 크롤러가 옛 내용이나 404를 가져간다.
  const deadline = Date.now() + 4 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache' } });
      if (r.ok) return true;
    } catch { /* 재시도 */ }
    await new Promise((res) => setTimeout(res, 15000));
  }
  return false;
}

(async () => {
  let files = [];
  let urls = [];
  const changed = flag('changed');
  const since = flag('since');
  const sitemap = flag('sitemap');

  if (changed) files = htmlFromGit(`git diff --name-only ${changed}`);
  else if (since) files = htmlFromGit(`git log --since="${since}" --name-only --pretty=format:`);
  // 템플릿 일괄 재생성(예: 법령 페이지 4,877개에 광고 코드 추가)은 내용 변경이 아니다.
  // 한 번에 수백 개가 바뀌면 법령 페이지는 통지하지 않는다 — 대량 재전송은 스팸 신호가 된다.
  const BULK = 150;
  const lawFiles = files.filter((f) => f.startsWith('law/'));
  if (lawFiles.length > BULK) {
    console.log(`법령 페이지 ${lawFiles.length}개 동시 변경 = 템플릿 일괄 재생성으로 보고 통지 제외`);
    files = files.filter((f) => !f.startsWith('law/'));
  }
  if (files.length) {
    const kept = files.filter(isIndexable);
    const dropped = files.length - kept.length;
    if (dropped) console.log(`noindex·삭제 파일 ${dropped}개는 제외`);
    urls = kept.map(fileToUrl);
  }
  if (sitemap !== null && !changed && !since) urls = urlsFromSitemap(sitemap || 'sitemap.xml');
  urls.push(...args.filter((a) => !a.startsWith('--')).map((p) => (p.startsWith('http') ? p : `https://${HOST}${p.startsWith('/') ? p : '/' + p}`)));
  urls = [...new Set(urls)];

  if (!urls.length) { console.log('통지할 URL 없음'); return; }
  console.log(`통지 대상 ${urls.length}개`);
  urls.slice(0, 8).forEach((u) => console.log('  ' + decodeURIComponent(u)));
  if (urls.length > 8) console.log(`  … 외 ${urls.length - 8}개`);
  if (DRY) { console.log('(dry) 전송하지 않음'); return; }

  if (WAIT) {
    const ok = await waitLive(urls[0]);
    console.log(ok ? '배포 반영 확인' : '⚠️ 4분 안에 확인 못 함 — 그래도 전송');
  }

  let failed = 0;
  for (let i = 0; i < urls.length; i += MAX_PER_CALL) {
    const batch = urls.slice(i, i + MAX_PER_CALL);
    const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: batch });
    for (const ep of ENDPOINTS) {
      try {
        const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body });
        // 200 = 수신, 202 = 수신·키 검증 대기. 그 외는 실패로 본다.
        const ok = r.status === 200 || r.status === 202;
        if (!ok) failed++;
        console.log(`  ${ok ? '✅' : '❌'} ${new URL(ep).host} ← ${batch.length}개 · HTTP ${r.status}${ok ? '' : ' ' + (await r.text()).slice(0, 120)}`);
      } catch (e) {
        failed++;
        console.log(`  ❌ ${new URL(ep).host} ← ${e.message}`);
      }
    }
  }
  // 통지 실패는 사이트 동작과 무관하므로 CI 를 깨지 않는다(경고만). 로그로 추적한다.
  if (failed) console.log(`::warning::IndexNow 전송 실패 ${failed}건`);
})();
