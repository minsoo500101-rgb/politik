// 영어 트래커 갱신 적용 — 검증된 find/replace 목록을 HTML(본문·구조화 데이터)에 직접 반영
// 사용: node content/specs/apply-tracker-changes.js content/specs/tracker-2026-10-19.changes.json 2026-10-19
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const [changesPath, date] = process.argv.slice(2);
const r = JSON.parse(fs.readFileSync(changesPath, 'utf8'));
const unesc = (t) => t.replace(/&lt;(\/?)b&gt;/g, '<$1b>');
const ch = r.upd.changes.map((c) => ({ find: unesc(c.find), replace: unesc(c.replace) }));
for (const p of (r.chk?.problems || []).filter((x) => x && typeof x === 'object')) { // 글로만 된 지적(문자열)은 적용 대상이 아니다
  if (p.index >= 0 && p.index < ch.length && !/^Add a change/i.test(p.fix)) {
    const fix = p.fix.replace(/^Apply the same replace to both occurrences \(dek and cardDesc\): /, '').replace(/^"|"$/g, '');
    ch[p.index].replace = unesc(fix);
  }
  const m = p.fix.match(/find "([^"]+)" and replace with "([^"]+)"/);
  if (m) ch.push({ find: m[1], replace: m[2] });
}
const htmlEsc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/&lt;(\/?)b&gt;/g, '<$1b>');
const jsonEsc = (t) => JSON.stringify(t.replace(/<\/?b>/g, '')).slice(1, -1);
const jsonEscB = (t) => JSON.stringify(t).slice(1, -1);

function applyTo(file, required) {
  const f = path.join(ROOT, file);
  let s = fs.readFileSync(f, 'utf8');
  const miss = [];
  ch.forEach((c, i) => {
    let hits = 0;
    // 2026-10-23 고침: 네 가지 이스케이프 형태가 같은 문자열일 때(특수문자 없는 문장) 같은 치환이 네 번 돌았고,
    // replace 가 find 를 포함하는 '덧붙이기' 변경은 이미 바꾼 결과에 다시 걸려 문장이 4번 겹쳤다(10/19 트래커).
    // → 형태를 중복 제거하고, 먼저 모든 형태를 자리표시로 바꾼 뒤 한 번에 최종 문장으로 바꾼다(재매칭 불가).
    const pairs = []; const seen = new Set();
    for (const [a, b] of [[htmlEsc(c.find), htmlEsc(c.replace)], [jsonEscB(c.find), jsonEscB(c.replace)], [jsonEsc(c.find), jsonEsc(c.replace)], [c.find, c.replace]]) { if (a && !seen.has(a)) { seen.add(a); pairs.push([a, b]); } }
    pairs.sort((p, q) => q[0].length - p[0].length); // 긴 형태 먼저 — 짧은 형태가 긴 형태의 일부일 때 대비
    pairs.forEach(([a], k) => { if (s.includes(a)) { hits += s.split(a).length - 1; s = s.split(a).join(`\u0000TRK${i}_${k}\u0000`); } });
    pairs.forEach(([, b], k) => { s = s.split(`\u0000TRK${i}_${k}\u0000`).join(b); });
    if (!hits) miss.push(i);
  });
  s = s.replace(/"dateModified":"[0-9-]+"/, `"dateModified":"${date}"`)
    .replace(/updated (October|September) \d+, 2026 ·/, `updated ${new Date(date + 'T12:00:00+09:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Seoul' })} ·`);
  fs.writeFileSync(f, s);
  console.log(file, '적용', ch.length - miss.length, '/', ch.length, miss.length ? '미적용 #' + miss.join(',#') : '');
  if (required && miss.length) process.exitCode = 1;
}
applyTo('yoon-suk-yeol-trials-verdict-tracker-2026.html', true);
// 허브 카드 요약(cardDesc)도 같은 문장을 쓴다 — 맞으면 바꾸고 아니면 그대로
const hub = path.join(ROOT, 'english.html');
let h = fs.readFileSync(hub, 'utf8');
for (const c of ch) { const a = htmlEsc(c.find); if (h.includes(a)) h = h.split(a).join(htmlEsc(c.replace)); }
// 기준일은 인자 날짜를 따른다(예전엔 'Oct. 19'로 고정돼 있었다)
const short = new Date(date + 'T12:00:00+09:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Seoul' }).replace(/^(\w+) /, '$1. ');
h = h.replace(/as of (Sept?|Oct)\. \d+, 2026/g, 'as of ' + short);
fs.writeFileSync(hub, h);
