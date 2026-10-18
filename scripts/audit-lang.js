#!/usr/bin/env node
/**
 * 페이지 언어 분류 감사 — 루트 *.html 의 실제 본문 언어와 표기(lang·og:locale·hreflang·inLanguage)가 맞는지.
 * 본문 언어는 태그를 걷어낸 텍스트의 한글 비율로 판정한다(≥ 30% 한국어, ≤ 5% 영어, 그 사이 혼합).
 * 사용: node scripts/audit-lang.js [--json]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const rows = [];
for (const f of files) {
  const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const body = (h.split(/<body[^>]*>/i)[1] || h)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const letters = (body.match(/[A-Za-z가-힣]/g) || []).length || 1;
  const ko = (body.match(/[가-힣]/g) || []).length / letters;
  const actual = ko >= 0.3 ? 'ko' : ko <= 0.05 ? 'en' : 'mixed';
  const lang = (h.match(/<html[^>]*\blang="([^"]+)"/i) || [])[1] || '';
  const locale = (h.match(/og:locale" content="([^"]+)"/) || [])[1] || '';
  const inLang = (h.match(/"inLanguage":"([^"]+)"/) || [])[1] || '';
  const hreflang = [...h.matchAll(/hreflang="([^"]+)" href="([^"]+)"/gi)].map((m) => `${m[1]}=${m[2].replace('https://patchkr.com', '')}`);
  const robots = (h.match(/name="robots" content="([^"]+)"/) || [])[1] || '';
  const problems = [];
  if (!lang) problems.push('lang 없음');
  else if (actual !== 'mixed' && lang.slice(0, 2) !== actual) problems.push(`lang=${lang} 인데 본문은 ${actual}`);
  if (locale && actual !== 'mixed' && locale.slice(0, 2) !== actual) problems.push(`og:locale=${locale}`);
  if (inLang && actual !== 'mixed' && inLang.slice(0, 2) !== actual) problems.push(`inLanguage=${inLang}`);
  rows.push({ f, actual, ko: Math.round(ko * 100), lang, locale, inLang, hreflang, robots, problems });
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
const by = (k) => rows.filter((r) => r.actual === k);
console.log(`전체 ${rows.length} · 한국어 ${by('ko').length} · 영어 ${by('en').length} · 혼합 ${by('mixed').length}`);
console.log('\n[영어 페이지]');
by('en').forEach((r) => console.log(`  ${r.f}  lang=${r.lang} locale=${r.locale || '-'} hreflang=${r.hreflang.join(',') || '-'}`));
console.log('\n[혼합]');
by('mixed').forEach((r) => console.log(`  ${r.f} (한글 ${r.ko}%) lang=${r.lang}`));
const bad = rows.filter((r) => r.problems.length);
console.log(`\n[표기 불일치 ${bad.length}]`);
bad.forEach((r) => console.log(`  ${r.f}: ${r.problems.join(' · ')}`));
