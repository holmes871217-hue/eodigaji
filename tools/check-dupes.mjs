// 추천 목록에 같은 장소가 두 번 나오는지 점검한다. 문제가 있으면 종료 코드 1.
// 폰 앱이 실제로 쓰는 불러오기 코드(app/js/data/live.js)를 그대로 돌려 최종 장소 목록을 만든 뒤,
// 겹침 규칙은 app/js/data/dedupe.js (3km 안 + 이름이 같거나 한쪽이 다른 쪽의 맨 앞 이름, 예: "서울대공원"과 "서울대공원 서울동물원").
// 사용: node tools/check-dupes.mjs [--list]   (--list: 찾은 쌍을 모두 출력)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
globalThis.fetch = async (path) => {
  try {
    const text = readFileSync(`${root}/app/${String(path).replace(/^\.?\//, '')}`, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  } catch { return { ok: false, status: 404, json: async () => ({}) }; }
};
const { PLACES } = await import(pathToFileURL(`${root}/app/js/data/places.js`).href);
const { loadLive } = await import(pathToFileURL(`${root}/app/js/data/live.js`).href);
await loadLive();

const { sameVenue, nameKeys } = await import(pathToFileURL(`${root}/app/js/data/dedupe.js`).href);
const items = PLACES.map((p) => ({ p, keys: nameKeys(p.name) }));
const pairs = [];
for (let i = 0; i < items.length; i++) {
  for (let j = i + 1; j < items.length; j++) {
    if (Math.abs(items[i].p.lat - items[j].p.lat) > 0.03) continue;
    if (sameVenue(items[i].p, items[j].p, items[i].keys, items[j].keys)) pairs.push([items[i].p, items[j].p]);
  }
}
console.log(`최종 장소 ${PLACES.length}곳에서 겹치는 쌍 ${pairs.length}개`);
if (pairs.length) {
  for (const [a, b] of pairs.slice(0, process.argv.includes('--list') ? 9999 : 25)) console.log(`  "${a.name}"(${a.id}) ↔ "${b.name}"(${b.id})`);
  if (pairs.length > 25 && !process.argv.includes('--list')) console.log(`  … 나머지는 --list 로 확인`);
  process.exit(1);
}
console.log('✅ 겹치는 장소 없음');
process.exit(0);
