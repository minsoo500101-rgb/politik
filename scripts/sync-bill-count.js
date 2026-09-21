#!/usr/bin/env node
/**
 * index.html 에 하드코딩된 "22대 통과 법안 N건" 표기를 국회 OPEN API 실측으로 맞춘다.
 *
 * 왜 필요한가: 홈 화면의 KPI 타일은 브라우저가 국회 API에서 받아 그리므로 늘 최신인데,
 * <title>·description·og:*·keywords·소개 카드의 숫자는 손으로 박아 둔 값이라 같이 늘지 않는다.
 * 2026-09-21 점검에서 화면은 1,847건인데 <title>은 1,595건으로 252건(-13.6%) 뒤처져 있었다.
 * 검색결과에 그대로 노출되는 문장이라 방치하면 계속 틀린 수치가 색인된다.
 *
 *   node scripts/sync-bill-count.js          # 조회만
 *   node scripts/sync-bill-count.js --write  # index.html 반영
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'index.html');
const WRITE = process.argv.includes('--write');

// index.html 의 SVC.bills_processed / ASSEMBLY_AGE 와 같은 값. 공개 기본키(사이트에 이미 내장).
const KEY = process.env.ASSEMBLY_API_KEY || '3aac055cce1641f2b5f1b9b359ec5957';
const ENDPOINT = 'ncocpgfiaoituanbr'; // 본회의 처리 의안
const AGE = 22;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'KoreaPatchNotes/1.0' } }, (res) => {
      // 청크를 문자열로 이어붙이면 한글이 경계에서 깨진다 — Buffer로 모아 한 번에 디코딩.
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('JSON parse: ' + e.message + ' / ' + body.slice(0, 160))); }
      });
    }).on('error', reject);
  });
}

(async () => {
  const url = `https://open.assembly.go.kr/portal/openapi/${ENDPOINT}` +
              `?KEY=${KEY}&Type=json&pIndex=1&pSize=1&AGE=${AGE}`;
  const j = await fetchJson(url);
  const node = j[ENDPOINT];
  const total = node && node[0] && node[0].head && node[0].head[0] && node[0].head[0].list_total_count;
  if (!Number.isFinite(total)) {
    console.error('❌ 총건수를 읽지 못했습니다:', JSON.stringify(j).slice(0, 300));
    process.exit(1);
  }

  const fmt = total.toLocaleString('en-US');           // 1,847
  const plain = String(total);                          // 1847
  let h = fs.readFileSync(HTML, 'utf8');

  // 현재 박혀 있는 숫자 — "법안 N,NNN건" / "N,NNN</div><div class=\"about-stat-l\">22대 통과 법안"
  const cur = (h.match(/22대 (?:국회 )?(?:통과 )?법안 ([\d,]+)건/) || [])[1]
           || (h.match(/about-stat-n">([\d,]+)<\/div><div class="about-stat-l">22대 통과 법안/) || [])[1];

  console.log(`국회 OPEN API 실측 : ${fmt}건 (22대 본회의 처리 의안)`);
  console.log(`index.html 표기     : ${cur || '(없음)'}`);

  if (cur === fmt) { console.log('✅ 이미 일치'); return; }
  if (!WRITE) { console.log('\n(dry-run) 반영하려면 --write'); return; }

  const before = h;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (cur) {
    h = h.split(esc(cur).replace(/\\/g, '')).join(fmt);      // "1,595" → "1,847"
    h = h.split(cur.replace(/,/g, '')).join(plain);          // keywords 의 "1595건 법안"
  }
  if (h === before) { console.log('⚠️  치환 대상을 찾지 못했습니다.'); return; }

  fs.writeFileSync(HTML, h, 'utf8');
  const n = (before.match(new RegExp(esc(cur), 'g')) || []).length;
  console.log(`✅ index.html ${n}곳 갱신 — ${cur} → ${fmt}`);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
