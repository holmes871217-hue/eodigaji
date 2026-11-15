// 빠진 장소 확인: tools/must-have.mjs 의 곳이 앱 데이터(spots.json + 직접 고른 장소)에 모두 있는지 본다.
// (동네 장소는 must 표시가 붙은 것만 센다. "코엑스 아쿠아리움"이 있다고 "코엑스"가 있는 건 아니므로)
// 사용: node tools/check-coverage.mjs   (빠진 곳이 있으면 목록을 찍고 종료 코드 1)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MUST_HAVE } from './must-have.mjs';
import { PLACES } from '../app/js/data/places.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const spots = JSON.parse(readFileSync(`${ROOT}app/data/spots.json`, 'utf8')).spots || [];
const missing = MUST_HAVE.filter(([q, , max, must]) => max && !spots.some((s) => s.must?.includes(q)) && !PLACES.some((p) => p.name.replace(/\s/g, '').includes(must.replace(/\s/g, ''))));
for (const [q] of MUST_HAVE.filter(([, , max]) => max)) {
  const hit = missing.some(([m]) => m === q) ? '❌ 없음' : '✅ 있음';
  console.log(`${hit}  ${q}`);
}
if (missing.length) {
  console.log(`\n누락 ${missing.length}건. 수집기(node tools/collect.mjs)를 다시 돌려 카카오에서 채워야 합니다.`);
  process.exit(1);
}
console.log('\n필수 장소 모두 있음');
