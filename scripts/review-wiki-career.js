#!/usr/bin/env node
// 위키 약력 제안 검토 (V32.6) — wiki-auto-career.js --propose 가 쌓은 제안을 사람이 읽고 승인·거절한다.
// 승인된 것만 data/politicians.json 의 career 로 들어간다. 위키 문서가 훼손된 순간 받아 온 거짓 약력이
// 검토 없이 도감에 실리던 경로(매일 자동 저장)를 막기 위한 단계다.
//
//   node scripts/review-wiki-career.js --list              검토 대기 목록(전문)
//   node scripts/review-wiki-career.js --approve <id> …    승인 → politicians.json 반영
//   node scripts/review-wiki-career.js --reject <id> …     거절 → 다시 제안하지 않음
//   node scripts/review-wiki-career.js --refresh <id> …    보류된 제안을 지금 위키로 다시 받기
//
// 승인 직전 위키를 다시 받아, 제안 때와 요약이 달라졌으면(그사이 문서가 고쳐짐) 승인을 멈추고 알린다.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROPS = path.join(ROOT, 'data/wiki-career-proposals.json');
const POL = path.join(ROOT, 'data/politicians.json');
const args = process.argv.slice(2);
const pick = (flag) => { const i = args.indexOf(flag); return i < 0 ? null : args.slice(i + 1).filter((a) => !a.startsWith('--')); };

const props = (() => { try { return JSON.parse(fs.readFileSync(PROPS, 'utf8')); } catch { return { items: [] }; } })();
const pending = props.items.filter((x) => x.status === 'pending');

async function stillSame(item) {
  try {
    const title = decodeURIComponent(String(item.source || '').split('/wiki/')[1] || item.name_ko);
    const r = await fetch('https://ko.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title), { headers: { 'User-Agent': 'patchkr-review/1.0 (https://patchkr.com)' } });
    if (!r.ok) return false;
    const j = await r.json();
    const now = String(j.extract || '').trim();
    const then = item.career.replace(/\n\n\[출처:[^\]]*\]$/, '').replace(/…$/, '');
    return now.startsWith(then.slice(0, 200));
  } catch { return false; }
}

(async () => {
  if (args.includes('--list') || !args.length) {
    if (!pending.length) { console.log('검토 대기 없음'); return; }
    console.log(`검토 대기 ${pending.length}건\n`);
    for (const x of pending) console.log(`■ ${x.id} · ${x.name_ko} · ${x.role} ${x.region} (${x.type})\n  받은 날 ${x.fetchedAt.slice(0, 10)} · ${x.source}\n  ${x.career.replace(/\n+/g, ' ')}\n`);
    return;
  }
  // --refresh <id> … : 보류된 제안을 지금 위키 요약으로 다시 받아 대기열에 둔다(다시 --list 로 읽고 승인)
  for (const id of pick('--refresh') || []) {
    const x = props.items.find((q) => q.id === id && q.status === 'pending'); if (!x) { console.log(`? ${id} 대기 목록에 없음`); continue; }
    const title = decodeURIComponent(String(x.source || '').split('/wiki/')[1] || x.name_ko);
    const j = await fetch('https://ko.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title), { headers: { 'User-Agent': 'patchkr-review/1.0 (https://patchkr.com)' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!j?.extract) { console.log(`? ${id} 위키 요약을 받을 수 없음`); continue; }
    let c = j.extract.trim(); if (c.length > 500) c = c.slice(0, 500) + '…';
    x.career = c + '\n\n[출처: 한국어 위키백과 CC BY-SA 4.0]'; x.fetchedAt = new Date().toISOString();
    console.log(`↻ ${id} ${x.name_ko} 다시 받음 — --list 로 읽고 승인할 것`);
  }
  const ap = pick('--approve') || [], rj = pick('--reject') || [];
  const find = (id) => props.items.find((x) => x.id === id && x.status === 'pending');
  const pol = JSON.parse(fs.readFileSync(POL, 'utf8'));
  let applied = 0;
  for (const id of rj) { const x = find(id); if (!x) { console.log(`? ${id} 대기 목록에 없음`); continue; } x.status = 'rejected'; x.reviewedAt = new Date().toISOString(); console.log(`✗ 거절 ${id} ${x.name_ko}`); }
  for (const id of ap) {
    const x = find(id); if (!x) { console.log(`? ${id} 대기 목록에 없음`); continue; }
    if (!(await stillSame(x))) { console.log(`⚠ ${id} ${x.name_ko}: 위키 요약이 제안 때와 다르거나 받을 수 없음 — 승인 보류(다시 확인 필요)`); continue; }
    const p = pol.people.find((q) => q.id === id); if (!p) { console.log(`? ${id} 도감에 없음`); continue; }
    if (p.career && p.career.length) { console.log(`- ${id} ${x.name_ko}: 이미 약력 있음 — 덮어쓰지 않음`); x.status = 'superseded'; continue; }
    p.career = x.career; x.status = 'approved'; x.reviewedAt = new Date().toISOString(); applied++;
    console.log(`✓ 승인 ${id} ${x.name_ko}`);
  }
  if (applied) { pol.version = (pol.version || 11) + 1; pol.syncedAt = new Date().toISOString(); fs.writeFileSync(POL, JSON.stringify(pol, null, 2) + '\n', 'utf8'); console.log(`📦 politicians.json version → ${pol.version}`);
    // 앱이 ?v= 로 캐시를 깨므로 index.html 의 버전도 같이 올린다(daily-sync 의 'POLITICIANS_VER 동기화' 단계와 같은 치환)
    const ix = path.join(ROOT, 'index.html');
    const h = fs.readFileSync(ix, 'utf8').replace(/const POLITICIANS_VER = \d+;/, `const POLITICIANS_VER = ${pol.version};`).replace(/href="\/data\/politicians\.json\?v=\d+"/, `href="/data/politicians.json?v=${pol.version}"`);
    fs.writeFileSync(ix, h); }
  props.updatedAt = new Date().toISOString();
  fs.writeFileSync(PROPS, JSON.stringify(props, null, 2) + '\n', 'utf8');
})();
