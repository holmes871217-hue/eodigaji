// 골픽 해외 항공권: 운영자의 네이버 항공권 MCP 서버(구글 클라우드 런, 서울)에 물어 인천 왕복 최저가를 받는다.
// 공항마다 날짜 두 번(2주 뒤 목요일 출발 4박, 그 1주 뒤) 조회해 비교하고 tools/golf/data/flights.json 의 fare 를 바꾼다.
// 비행 시간(직항/경유)은 그대로 둔다. 네이버에서 값을 못 받은 공항은 이전 값을 그대로 둔다.
// 실행: node tools/golf/naver-fares.mjs  (공항 몇 개만: node tools/golf/naver-fares.mjs BKK NRT)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MCP = process.env.NAVER_FLIGHT_MCP || 'https://naver-flight-mcp-oqvj6zwx3q-du.a.run.app/mcp';
const FILE = fileURLToPath(new URL('./data/flights.json', import.meta.url));
const BUDGET_MS = Number(process.env.NAVER_BUDGET_MS || 20 * 60 * 1000); // 최대 20분
const WORKERS = 2; // 서버(네이버)가 동시에 많이 받으면 실패해서 2개씩만

const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);

// 한국 날짜 기준 14일 뒤부터 첫 목요일
function tripDates(now = new Date()) {
  const kst = new Date(ymd(new Date(now.getTime() + 9 * 36e5)) + 'T00:00:00Z');
  let d = addDays(kst, 14);
  while (d.getUTCDay() !== 4) d = addDays(d, 1);
  return [[ymd(d), ymd(addDays(d, 4))], [ymd(addDays(d, 7)), ymd(addDays(d, 11))]];
}

async function search(iata, dep, ret) {
  const body = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_naver_flights', arguments: { departure: 'ICN', arrival: iata, departureDate: dep, returnDate: ret } } };
  const r = await fetch(MCP, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  const raw = await r.text();
  const line = raw.split('\n').find((l) => l.startsWith('data:'));
  const j = JSON.parse(line ? line.slice(5) : raw);
  const text = j.result?.content?.map((c) => c.text).join('\n') || '';
  const m = text.match(/최저가:\s*([\d,]+)원/);
  const prices = [...text.matchAll(/총요금:\s*([\d,]+)원/g)].map((x) => Number(x[1].replace(/,/g, '')));
  const min = m ? Number(m[1].replace(/,/g, '')) : prices.length ? Math.min(...prices) : null;
  return min && min > 10000 ? min : null;
}

// 두 값이 40% 넘게 다르면 싼 값, 아니면 평균 (기존 규칙과 같음)
function recommend(vals) {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return { lo, hi, rec: vals.length > 1 && hi <= lo * 1.4 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length / 100) * 100 : lo };
}

const naverUrl = (iata, dep, ret) => `https://flight.naver.com/flights/international/ICN-${iata}-${dep.replace(/-/g, '')}/${iata}-ICN-${ret.replace(/-/g, '')}?adult=1&fareType=Y`;

async function main() {
  const data = JSON.parse(readFileSync(FILE, 'utf8'));
  const only = process.argv.slice(2).map((s) => s.toUpperCase());
  const list = Object.keys(data.airports).filter((k) => !only.length || only.includes(k));
  const dates = tripDates();
  const start = Date.now();
  let i = 0, ok = 0, fail = 0;
  const save = () => {
    data.source = '네이버 항공권(운영자 네이버 항공권 MCP 서버, 서울) 인천 왕복 최저가. 비행 시간은 구글 항공편 조회값';
    data.observedAt = new Date().toISOString();
    data.searchDate = dates[0][0];
    writeFileSync(FILE, JSON.stringify(data, null, 1) + '\n');
  };
  const worker = async () => {
    while (i < list.length && Date.now() - start < BUDGET_MS) {
      const iata = list[i++];
      const samples = [];
      for (const [dep, ret] of dates) {
        for (let t = 0; t < 2; t++) { // 실패하면 5초 쉬고 한 번 더
          try { const min = await search(iata, dep, ret); if (min) { samples.push({ dep, ret, min }); break; } } catch { /* 다시 */ }
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
      const a = data.airports[iata];
      if (!samples.length) { fail++; console.log(`${iata}: 네이버 결과 없음 (이전 값 유지)`); continue; }
      const { lo, hi, rec } = recommend(samples.map((s) => s.min));
      a.fare = { src: 'naver', min: lo, direct: null, dep: samples[0].dep, ret: samples[0].ret, at: Date.now(), url: naverUrl(iata, samples[0].dep, samples[0].ret), samples, rec, lo, hi };
      ok++;
      save(); // 공항마다 바로 저장(중간에 멈춰도 받은 값은 남게)
      console.log(`${iata}: ${samples.map((s) => `${s.dep} ${s.min.toLocaleString()}원`).join(' / ')} → 추천 ${rec.toLocaleString()}원`);
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  if (ok) save();
  console.log(`네이버 항공권: 성공 ${ok} · 실패 ${fail} · 남음 ${list.length - ok - fail} (${Math.round((Date.now() - start) / 1000)}초)`);
}

main().catch((e) => { console.error('네이버 항공권 수집 실패(이전 값 유지):', e.message); process.exit(0); });
