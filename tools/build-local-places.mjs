// tools/local-places-src.mjs 목록의 좌표를 카카오 장소 검색으로 찾아 app/js/data/places-local.js 를 만든다.
// 실행: node tools/build-local-places.mjs   (KAKAO_REST_KEY 필요, 결과 파일에는 키가 들어가지 않음)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SRC } from './local-places-src.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env };
try {
  for (const line of readFileSync(`${ROOT}.env`, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* 없음 */ }
if (!env.KAKAO_REST_KEY) { console.log('KAKAO_REST_KEY 가 없어요'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const failed = [];
const seen = new Set();

for (const [id, name, region, cat, tip, query] of SRC) {
  if (seen.has(id)) { failed.push(`${id} (id 중복)`); continue; }
  seen.add(id);
  const [sido, city] = region.split(' ');
  const q = query || name;
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=10`, {
    headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` },
  });
  const docs = (await res.json()).documents || [];
  const pre = sido === '광주' ? '전남광주' : sido.slice(0, 2); // 2026년 광주·전남 통합
  const hit = docs.find((d) => d.address_name.startsWith(pre) && d.address_name.includes(city));
  if (!hit) {
    failed.push(`${name} ← "${q}" (${docs.slice(0, 2).map((d) => d.address_name).join(' / ') || '결과 없음'})`);
  } else {
    // 검색어: 따로 준 것 > 이름 앞의 지역명을 뗀 것 (예: "대구 수성못" → "수성못")
    const first = name.split(' ')[0];
    const stripped = name.includes(' ') && region.split(' ').some((t) => first.startsWith(t) || t.startsWith(first))
      ? name.slice(first.length + 1) : name;
    const kw = (query || stripped).split('·')[0].trim();
    out.push([id, name, region, cat, Number(Number(hit.y).toFixed(5)), Number(Number(hit.x).toFixed(5)), tip, kw]);
    console.log(`${name} → ${hit.place_name} (${hit.address_name})`);
  }
  await sleep(60);
}

const body = out.map((r) => `  ${JSON.stringify(r)},`).join('\n');
writeFileSync(
  `${ROOT}app/js/data/places-local.js`,
  `// 자동 생성 파일: node tools/build-local-places.mjs (원본 목록은 tools/local-places-src.mjs)\n` +
    `// 전국 "가까운 소소한 곳". [id, 이름, 지역, 분류, 위도, 경도, 볼거리 요약, 검색어]\n` +
    `export const LOCAL = [\n${body}\n];\n`
);
console.log(`\n저장 ${out.length}곳, 실패 ${failed.length}곳`);
for (const f of failed) console.log(`  실패: ${f}`);
