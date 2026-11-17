// 신규 외부 공급원 실행기(8단계). 승인(approved)되고 키가 있는 공급원만 호출하고, 결과는 app/data/signals/<id>.json 에 따로 저장한다.
// 어떤 경우에도 종료 코드 0 — 공급원이 실패해도 수집·게시를 멈추지 않는다(기존 서비스 보호).
// --mock: 모의 데이터를 tools/.mock-signals/ 에만 쓴다(앱 폴더에는 절대 쓰지 않으므로 화면에 나오지 않는다).
//
// 사용: node tools/run-adapters.mjs [--mock] [--limit 숫자]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ADAPTERS, EXCLUDED, isLive } from './adapters/index.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MOCK = process.argv.includes('--mock');
const li = process.argv.indexOf('--limit');
const LIMIT = li > 0 ? Number(process.argv[li + 1]) : 40;

export async function runAdapters({ adapters = ADAPTERS, env = process.env, mock = MOCK, limit = LIMIT, spots = null, outDir = null } = {}) {
  const summary = [];
  const list = spots || JSON.parse(readFileSync(`${ROOT}app/data/spots.json`, 'utf8')).spots;
  const top = [...list].filter((s) => typeof s.yearly === 'number').sort((a, b) => b.yearly - a.yearly).slice(0, limit);
  for (const a of adapters) {
    if (mock) {
      const dir = outDir || `${ROOT}tools/.mock-signals`;
      mkdirSync(dir, { recursive: true });
      const out = {};
      for (const s of top.slice(0, 5)) out[s.id] = a.mock(s);
      writeFileSync(`${dir}/${a.id}.json`, JSON.stringify({ mock: true, adapter: a.id, signals: out }));
      summary.push(`${a.label}: 모의 데이터(앱에 표시되지 않음)`);
      continue;
    }
    if (!isLive(a, env)) {
      summary.push(`${a.label}: 미연동 — ${a.status !== 'approved' ? `승인 전(${a.blockers[0]})` : '키 없음'}`);
      continue;
    }
    const signals = {};
    let ok = 0, fail = 0;
    for (const s of top.slice(0, Math.min(limit, a.dailyBudget))) {
      try {
        const r = await a.fetchSignals(s, env);
        if (r.ok) { signals[s.id] = r.data; ok++; } else fail++;
      } catch (e) { fail++; } // 한 장소가 실패해도 계속
    }
    const dir = outDir || `${ROOT}app/data/signals`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${a.id}.json`, JSON.stringify({ adapter: a.id, updatedAt: new Date().toISOString(), signals }));
    summary.push(`${a.label}: 성공 ${ok} · 실패 ${fail}`);
  }
  for (const x of EXCLUDED) summary.push(`${x.id}: 제외 — ${x.reason}`);
  return summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    console.log('외부 공급원:\n  ' + (await runAdapters()).join('\n  '));
  } catch (e) {
    console.log(`외부 공급원 실행 중 오류(무시하고 계속): ${e.message}`);
  }
  process.exit(0);
}
