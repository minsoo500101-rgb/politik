// V28.2 — 사전투표율 수동 갱신 도우미
// 사용: node scripts/update-vote-rate.js --rate=12.34 --region="서울:13.2,부산:11.5,..."
//
// NEC 공식 발표 후 운영자가 갱신 → 자동으로 data/early-vote-fallback.json 업데이트

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'early-vote-fallback.json');

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([\w-]+)=(.+)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function parseRegion(str) {
  if (!str) return null;
  const out = {};
  for (const pair of str.split(',')) {
    const [k, v] = pair.split(':').map(s => s.trim());
    if (k && v) out[k] = parseFloat(v);
  }
  return Object.keys(out).length ? out : null;
}

const args = parseArgs();
const cur = JSON.parse(fs.readFileSync(FILE, 'utf8'));

if (args.rate)         cur.rate = parseFloat(args.rate);
if (args.phase)        cur.phase = args.phase;
if (args.turnout)      cur.turnoutCount = parseInt(args.turnout, 10);
if (args.region)       cur.byRegion = parseRegion(args.region);
if (args.announced)    cur.announcedAt = args.announced;
cur._lastUpdate = new Date().toISOString();

fs.writeFileSync(FILE, JSON.stringify(cur, null, 2) + '\n', 'utf8');

console.log('✅ 갱신 완료:');
console.log('  rate:', cur.rate, '%');
console.log('  phase:', cur.phase);
console.log('  region:', cur.byRegion ? Object.keys(cur.byRegion).length + '개' : 'null');
console.log('  announcedAt:', cur.announcedAt);
console.log('  _lastUpdate:', cur._lastUpdate);
console.log();
console.log('예시: node scripts/update-vote-rate.js --rate=12.34 --phase=1일차 --region="서울:13.2,부산:11.5"');
