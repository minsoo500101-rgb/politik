#!/usr/bin/env node
/**
 * 인라인 CSS 분리(UI 개편 1단계) — 여러 페이지가 똑같이 들고 있는 <style> 블록을 공통 파일로 빼고 <link> 로 바꾼다.
 *
 * 왜: 법령 페이지 4,930개가 같은 스타일 1.3KB를 각자 들고 있었고(합계 약 6.4MB), 기사·레이더·폴리시 블록도
 *     수십 쪽에 복사돼 있었다. 홈 앱(index.html)은 스타일만 306KB라 방문할 때마다 HTML 과 함께 다시 받았다.
 *     공통 파일은 한 번 받으면 캐시되고, 고칠 곳도 한 곳이 된다.
 *
 * 규칙
 *  - 같은 내용이 2쪽 이상에 있는 블록 → assets/css/<이름>-<해시8>.css. 이름은 id 가 있으면 id, 없으면 위치(law·radar·page).
 *    내용이 바뀌면 해시가 바뀌어 새 파일이 생기고, 아무 페이지도 안 쓰는 옛 파일은 지운다(캐시 무효화가 자동).
 *  - 한 쪽에만 있는 블록은 그 페이지 고유 스타일이라 그대로 둔다.
 *  - <style id="ko-type"> 는 184바이트라 요청 하나를 늘릴 가치가 없어 인라인 유지(원본은 assets/ko-type.css).
 *  - index.html 의 큰 스타일(20KB 넘는 것)은 assets/app.css 로 — 이 파일이 홈 앱 CSS 의 원본이 된다(앞으로 여기서 고친다).
 *  - 생성기들은 지금처럼 인라인으로 쓰고, 이 스크립트가 뒤에서 바꾼다. 생성기 CSS 가 바뀌면 해시가 달라져 새 파일이 생길 뿐 깨지지 않는다.
 *    CI(build-static-pages·law-singu)와 기사 등록 루틴에서 생성 직후 실행한다.
 *
 * 사용: node scripts/extract-css.js [--dry]   (멱등)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');
const OUT = path.join(ROOT, 'assets/css');
// 줄바꿈을 LF 로 맞춰 해시한다 — Windows 작업본(CRLF)과 CI(LF)가 같은 버전을 내야 CI 가 매번 ?v= 를 바꿔 쓰지 않는다
const h8 = (s) => crypto.createHash('sha1').update(String(s).replace(/\r\n/g, '\n')).digest('hex').slice(0, 8);

const files = [];
for (const d of ['.', 'law-radar', 'law']) {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.html')) files.push(d === '.' ? f : `${d}/${f}`);
}
const STYLE_RE = /<style([^>]*)>([\s\S]*?)<\/style>/g;
const idOf = (attr) => (attr.match(/id="([^"]+)"/) || [])[1] || '';
const group = (f) => (f.startsWith('law/') ? 'law' : f.startsWith('law-radar') || f === 'law-radar.html' ? 'radar' : 'page');

// 1) 홈 앱 CSS — index.html 의 큰 블록
let appChanged = false;
{
  const p = path.join(ROOT, 'index.html');
  let s = fs.readFileSync(p, 'utf8');
  const big = [...s.matchAll(STYLE_RE)].filter((m) => m[2].length > 20000 && !idOf(m[1]));
  if (big.length) {
    const css = big.map((m) => m[2]).join('\n');
    const v = h8(css);
    if (!DRY) fs.writeFileSync(path.join(ROOT, 'assets/app.css'), css);
    big.forEach((m, i) => { s = s.replace(m[0], i === 0 ? `<link rel="stylesheet" href="/assets/app.css?v=${v}">` : ''); });
    if (!DRY) fs.writeFileSync(p, s);
    appChanged = true;
    console.log(`index.html 스타일 ${big.length}블록 ${(css.length / 1024).toFixed(0)}KB → assets/app.css`);
  } else if (fs.existsSync(path.join(ROOT, 'assets/app.css'))) {
    // 이미 분리됨 — app.css 를 고쳤으면 링크의 ?v= 를 내용 해시로 맞춘다
    const v = h8(fs.readFileSync(path.join(ROOT, 'assets/app.css'), 'utf8'));
    const t = s.replace(/\/assets\/app\.css\?v=[0-9a-f]+/, `/assets/app.css?v=${v}`);
    if (t !== s) { appChanged = true; if (!DRY) fs.writeFileSync(p, t); console.log('assets/app.css 버전 갱신'); }
  }
}

// 2) 공통 블록 집계
const count = new Map();   // key = hash → { css, name, n }
const cache = new Map();
for (const f of files) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  cache.set(f, s);
  for (const m of s.matchAll(STYLE_RE)) {
    const id = idOf(m[1]);
    if (id === 'ko-type') continue;
    if (f === 'index.html' && m[2].length > 20000) continue;
    const k = h8(m[2]);
    const e = count.get(k) || { css: m[2], name: id || group(f), n: 0 };
    e.n++;
    count.set(k, e);
  }
}

// 3) 바꾸기
if (!DRY) fs.mkdirSync(OUT, { recursive: true });
let pages = 0, blocks = 0;
const used = new Set();
for (const f of files) {
  let s = cache.get(f);
  const before = s;
  s = s.replace(STYLE_RE, (all, attr, css) => {
    const id = idOf(attr);
    if (id === 'ko-type') return all;
    const k = h8(css);
    const e = count.get(k);
    if (!e || e.n < 2) return all;
    const name = `${e.name.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'page'}-${k}.css`;
    used.add(name);
    blocks++;
    return `<link rel="stylesheet" href="/assets/css/${name}"${id ? ` id="${id}"` : ''}>`;
  });
  for (const m of s.matchAll(/\/assets\/css\/([a-z0-9-]+\.css)/g)) used.add(m[1]);
  if (s !== before) { pages++; if (!DRY) fs.writeFileSync(path.join(ROOT, f), s); }
}
// 파일 쓰기(바뀐 것만) · 안 쓰는 옛 파일 지우기
let wrote = 0, removed = 0;
for (const [k, e] of count) {
  if (e.n < 2) continue;
  const name = `${e.name.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'page'}-${k}.css`;
  const p = path.join(OUT, name);
  if (!fs.existsSync(p)) { wrote++; if (!DRY) fs.writeFileSync(p, e.css); }
}
if (fs.existsSync(OUT)) for (const f of fs.readdirSync(OUT)) if (f.endsWith('.css') && !used.has(f)) { removed++; if (!DRY) fs.unlinkSync(path.join(OUT, f)); }
console.log(`${DRY ? '(dry) ' : ''}공통 CSS ${used.size}개 파일(새 ${wrote}·삭제 ${removed}) · ${pages}쪽에서 ${blocks}블록을 링크로${appChanged ? ' · 홈 앱 CSS 처리' : ''}`);
