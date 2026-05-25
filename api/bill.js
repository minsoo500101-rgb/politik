// Vercel Serverless — 법안 상세 정보 fetch
// 국회 OPEN API에서 단일 BILL_ID의 모든 필드 (SUMMARY, 제안이유 포함) 가져옴
//
// GET /api/bill?billId=PRC_XXX
//
// 환경변수: ASSEMBLY_API_KEY (있으면 사용, 없으면 default key)

const DEFAULT_KEY = '3aac055cce1641f2b5f1b9b359ec5957'; // 사용자가 활용신청한 키
const ASSEMBLY_BASE = 'https://open.assembly.go.kr/portal/openapi';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');

  const billId = req.query.billId;
  if (!billId) {
    return res.status(400).json({ error: 'billId 파라미터 필요' });
  }

  const key = process.env.ASSEMBLY_API_KEY || DEFAULT_KEY;

  // 1. nzmimeepazxkubdpn — 의안 정보 (SUMMARY 등 모든 필드)
  const billUrl = `${ASSEMBLY_BASE}/nzmimeepazxkubdpn?KEY=${key}&Type=json&pIndex=1&pSize=10&AGE=22&BILL_ID=${encodeURIComponent(billId)}`;
  // 2. ncocpgfiaoituanbr — 본회의 처리 의안 (표결 결과)
  const procUrl = `${ASSEMBLY_BASE}/ncocpgfiaoituanbr?KEY=${key}&Type=json&pIndex=1&pSize=10&AGE=22&BILL_ID=${encodeURIComponent(billId)}`;

  try {
    const [billResp, procResp] = await Promise.all([
      fetch(billUrl, { headers: { 'User-Agent': 'KoreaPatchNotes/1.0' } }),
      fetch(procUrl, { headers: { 'User-Agent': 'KoreaPatchNotes/1.0' } }),
    ]);
    const [billJson, procJson] = await Promise.all([
      billResp.json().catch(() => ({})),
      procResp.json().catch(() => ({})),
    ]);

    // 응답 정규화
    const bill = billJson?.nzmimeepazxkubdpn?.[1]?.row?.[0] || null;
    const proc = procJson?.ncocpgfiaoituanbr?.[1]?.row?.[0] || null;

    res.status(200).json({
      billId,
      bill,
      proc,
      _sources: {
        bill: 'nzmimeepazxkubdpn (의안 정보)',
        proc: 'ncocpgfiaoituanbr (본회의 처리)',
      },
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
