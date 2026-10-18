// north-korea-military-explained-2026.html — 10/12 발사 반영(근거: 검증된 한국어 기사 nk-tactical-ballistic-missile-oct12-hgv-dispute-2026)
const fs = require('fs');
const f = require('path').join(__dirname, '../../north-korea-military-explained-2026.html');
let s = fs.readFileSync(f, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';
function rep(a, b, label) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${label}: ${n}회`); s = s.replace(a, b); }
rep('most recently on <b>October 3</b>. North Korea called that missile interm',
  'most recently on <b>October 12</b>, when Japan reported at least two missiles, one flying 910 km or more. On October 3, North Korea fired a missile it called interm', 'lead');
rep('<tr><td>3 October</td><td>Wonsan area</td><td>One ballistic missile, during the DMZ landmine dispute</td><td>700 km or more (JCS)</td></tr>',
  '<tr><td>3 October</td><td>Wonsan area</td><td>One ballistic missile, during the DMZ landmine dispute</td><td>700 km or more (JCS)</td></tr>' + nl +
  '<tr><td>12 October</td><td>Pyongyang area</td><td>At least two ballistic missiles; KCNA called it a tactical ballistic missile test</td><td>~220 km and 910+ km (Japan MoD)</td></tr>', 'table');
const OLD_FAQ = "As of October 2026, the most recent launch was on 3 October 2026. South Korea's JCS said one ballistic missile was fired from the Wonsan area and flew 700 km or more. North Korea's KCNA said it was an intermediate-range hypersonic missile that hit a target about 1,000 km away, which is North Korea's own claim. The previous launch, on 20 September, was two short-range ballistic missiles (JCS, via Stars and Stripes).";
const NEW_FAQ = "As of October 19, 2026, the most recent launch was on 12 October 2026. South Korea's JCS detected several ballistic missiles fired from the Pyongyang area toward the East Sea; Japan's Defense Ministry said at least two were launched, one flying about 220 km and the other 910 km or more. North Korea's KCNA called it a tactical ballistic missile test and gave no specifications. The previous launch, on 3 October, was one ballistic missile from the Wonsan area that flew 700 km or more (JCS); KCNA called it an intermediate-range hypersonic missile, which is North Korea's own claim.";
const n = s.split(OLD_FAQ).length - 1;
if (n !== 2) throw new Error('FAQ ' + n);   // 화면 FAQ + FAQPage 구조화 데이터
s = s.split(OLD_FAQ).join(NEW_FAQ);
s = s.replace('"dateModified":"2026-10-11"', '"dateModified":"2026-10-19"');
fs.writeFileSync(f, s);
console.log('ok');
