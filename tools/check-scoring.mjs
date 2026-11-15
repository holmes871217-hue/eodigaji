// 추천 점수 규칙 점검: "이동시간 한도를 길게 고를수록 가까움의 영향이 줄어든다"는 규칙이 지켜지는지 본다.
// 같은 장소를 가까운 곳(바로 옆)과 먼 곳(약 76분 거리)에 하나씩 두고, 한도별로 가까운 쪽이 몇 배 유리한지 잰다.
// 사용: node tools/check-scoring.mjs   (규칙이 깨지면 종료 코드 1)
import { PLACES } from '../app/js/data/places.js';
import { rankPlaces, nearWeight } from '../app/js/core/scoring.js';

const profile = {
  members: [
    { id: 'a', label: '나', age: 38, gender: 'm', weight: 1 },
    { id: 'b', label: '아이', age: 7, gender: 'f', weight: 3 },
  ],
  mode: 'hot',
  origin: { type: 'city', name: '서울', lat: 37.5665, lng: 126.978 },
};
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

// 0) 가까움의 힘은 한도가 길수록 줄어든다
const ws = [30, 60, 120, 180, 300].map(nearWeight);
ok(ws.every((w, i) => i === 0 || w < ws[i - 1]), `가까움의 힘이 한도가 길어져도 줄지 않아요: ${ws.map((w) => w.toFixed(2)).join(', ')}`);

// 1) 같은 장소를 가까이·멀리 둔 비교 (큰 곳·작은 곳 각각)
function ratio(scale, maxMin) {
  const base = PLACES.find((p) => p.scale === scale && !p.spot);
  const near = { ...base, id: 'near', lat: 37.57, lng: 126.99, spot: false, kto: false };
  const far = { ...base, id: 'far', lat: 37.4, lng: 127.6, spot: false, kto: false };
  const rows = rankPlaces([near, far], profile, [], maxMin, 'all');
  const n = rows.find((r) => r.place.id === 'near'), f = rows.find((r) => r.place.id === 'far');
  return n && f ? { ratio: n.raw / f.raw, nearMin: n.min, farMin: f.min } : null;
}
for (const scale of ['big', 'small']) {
  const r = [100, 150, 9999].map((m) => ratio(scale, m));
  if (r.some((x) => !x)) { problems.push(`${scale}: 시험용 장소가 한도 안에 안 들어와요(먼 곳 이동시간 확인 필요)`); continue; }
  console.log(`${scale}: 가까운 쪽이 먼 쪽보다 유리한 배수  100분 한도 ${r[0].ratio.toFixed(2)}배 · 150분 ${r[1].ratio.toFixed(2)}배 · 전국 ${r[2].ratio.toFixed(2)}배 (가까운 곳 ${r[0].nearMin}분, 먼 곳 ${r[0].farMin}분)`);
  ok(r[0].ratio >= r[1].ratio && r[1].ratio >= r[2].ratio, `${scale}: 한도가 길수록 가까운 쪽의 유리함이 줄어야 해요`);
  ok(r[2].ratio < (scale === 'small' ? 1.25 : 1.12), `${scale}: 전국으로 고르면 거리 영향이 작아야 해요(지금 ${r[2].ratio.toFixed(2)}배)`);
}

if (problems.length) {
  console.log(`\n❌ 문제 ${problems.length}건`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log('✅ 추천 점수 규칙 이상 없음');
process.exit(0);
