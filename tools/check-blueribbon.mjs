// 블루리본 표시 점검: 허락 표시가 없으면 아무 일도 하지 않고, 허락된 자료가 있으면 같은 이름·가까운 곳에만 붙고 우선 순위가 오른다.
import { readFileSync } from 'node:fs';
const problems = [];
const ok = (c, m) => { if (!c) problems.push(m); };
const data = JSON.parse(readFileSync(new URL('../app/data/blueribbon.json', import.meta.url), 'utf8'));
ok(data.license && ['none', 'permitted'].includes(data.license.status), 'license.status 는 none 또는 permitted 여야 해요');
if (data.license.status !== 'permitted') ok(data.items.length === 0, '허락이 확인되지 않았는데 자료가 들어 있어요(운영에 쓰면 안 돼요)');
else ok(data.license.source && data.license.verifiedAt && data.items.every((i) => i.n && Number.isFinite(i.lat) && Number.isFinite(i.lng)), '허락된 자료에는 출처·확인일이 있고 각 항목에 이름·좌표가 있어야 해요');
let N;
try { N = await import('../app/js/core/nearby.js'); } catch (e) { N = null; }
if (N) {
  const rows = [
    { id: 'a', name: '가나 식당', lat: 37.5, lng: 127.0, km: 0.5, rating: 4.7, reviews: 500 },
    { id: 'b', name: '다라 식당', lat: 37.501, lng: 127.001, km: 0.6, rating: 4.1, reviews: 100 },
    { id: 'c', name: '가나식당', lat: 38.5, lng: 127.0, km: 0.7, rating: 4.0, reviews: 50 },
  ];
  N.tagBlueRibbon(rows, []);
  ok(rows.every((r) => !r.br), '자료가 없으면 아무것도 붙으면 안 돼요');
  N.tagBlueRibbon(rows, [{ n: '다라식당', lat: 37.501, lng: 127.001, y: 2026 }, { n: '가나식당', lat: 37.5, lng: 127.0, y: 2026 }]);
  ok(rows[1].br && rows[0].br && !rows[2].br, '같은 이름이면서 가까운 곳에만 붙어야 해요(멀리 있는 같은 이름은 아님)');
  rows.forEach((r) => { r.br = r.id === 'b' ? 2026 : null; });
  ok(N.pickBest(rows)[0].id === 'b', '블루리본 선정은 평점이 더 높은 곳보다 앞에 와야 해요');
}
if (problems.length) { console.log(`❌ 문제 ${problems.length}건\n - ` + problems.join('\n - ')); process.exit(1); }
console.log('✅ 블루리본 연동 점검 이상 없음' + (N ? '' : ' (nearby.js 는 브라우저 전용이라 동작 시험은 건너뜀)'));
