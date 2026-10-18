// 영어 트래커 갱신 적용 — 검증된 find/replace 목록을 HTML(본문·구조화 데이터)에 직접 반영
// 사용: node content/specs/apply-tracker-changes.js content/specs/tracker-2026-10-19.changes.json 2026-10-19
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const [changesPath, date] = process.argv.slice(2);
const r = JSON.parse(fs.readFileSync(changesPath, 'utf8'));
const unesc = (t) => t.replace(/&lt;(\/?)b&gt;/g, '<$1b>');
const ch = r.upd.changes.map((c) => ({ find: unesc(c.find), replace: unesc(c.replace) }));
for (const p of r.chk.problems) {
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
    for (const [a, b] of [[htmlEsc(c.find), htmlEsc(c.replace)], [jsonEscB(c.find), jsonEscB(c.replace)], [jsonEsc(c.find), jsonEsc(c.replace)], [c.find, c.replace]]) {
      if (a && s.includes(a)) { hits += s.split(a).length - 1; s = s.split(a).join(b); }
    }
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
h = h.replace(/as of Oct\. 11, 2026/g, 'as of Oct. 19, 2026');
fs.writeFileSync(hub, h);
