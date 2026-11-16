// 추천 점수 규칙 점검: "이동시간 한도를 길게 고를수록 가까움의 영향이 줄어든다"는 규칙이 지켜지는지 본다.
// 같은 장소를 가까운 곳(바로 옆)과 먼 곳(약 76분 거리)에 하나씩 두고, 한도별로 가까운 쪽이 몇 배 유리한지 잰다.
// 사용: node tools/check-scoring.mjs   (규칙이 깨지면 종료 코드 1)
import { PLACES } from '../app/js/data/places.js';
import { rankPlaces, nearWeight, memberScore, isKidsPlace, isKidsEvent } from '../app/js/core/scoring.js';
import { segKey } from '../app/js/core/segments.js';

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
  // 2026-11-16: 전체·큰 나들이 탭은 한도의 절반 이상 떨어진 먼 곳에 덧점(최대 +35%)을 줘서 1·2·3시간 결과가 달라지게 했다.
  // 그래서 "한도가 길수록 가까운 쪽 유리함이 줄어든다"는 단조 규칙은 이 탭에서 더 이상 성립하지 않는다. 대신 극단으로 치우치지 않는지만 본다.
  ok(r.every((x) => x.ratio > 0.8 && x.ratio < 1.4), `${scale}: 가까움·먼 곳 덧점이 한쪽으로 지나치게 치우쳤어요(${r.map((x) => x.ratio.toFixed(2)).join(', ')})`);
  ok(r[2].ratio < (scale === 'small' ? 1.25 : 1.12), `${scale}: 전국으로 고르면 거리 영향이 작아야 해요(지금 ${r[2].ratio.toFixed(2)}배)`);
}

// 2) "가까운 소소한 곳"은 보이는 범위가 45분으로 잘리지만, 이동시간을 길게 골랐다면 그 안에서도 가까움의 힘이 줄어야 한다.
//    (예전에는 범위가 잘린 값으로 힘을 계산해서, 이동시간을 3시간으로 늘려도 같은 곳만 위에 올라왔다.)
{
  const base = PLACES.find((p) => p.scale === 'small' && !p.spot);
  const near = { ...base, id: 'near', lat: 37.57, lng: 126.99, spot: false, kto: false };
  const mid = { ...base, id: 'mid', lat: 37.42, lng: 127.05, spot: false, kto: false }; // 서울에서 약 42분(45분 안쪽의 먼 편)
  const at = (maxMin) => {
    const rows = rankPlaces([near, mid], profile, [], maxMin, 'near');
    const n = rows.find((r) => r.place.id === 'near'), m = rows.find((r) => r.place.id === 'mid');
    return n && m ? { ratio: n.raw / m.raw, midMin: m.min } : null;
  };
  const rs = [45, 120, 9999].map(at);
  if (rs.some((x) => !x)) problems.push('가까운 소소한 곳: 시험용 장소가 45분 안에 안 들어와요(좌표 확인 필요)');
  else {
    console.log(`near 범위: 가까운 쪽이 유리한 배수  45분 선택 ${rs[0].ratio.toFixed(2)}배 · 2시간 ${rs[1].ratio.toFixed(2)}배 · 전국 ${rs[2].ratio.toFixed(2)}배 (먼 편 ${rs[0].midMin}분)`);
    ok(rs[0].ratio > rs[1].ratio && rs[1].ratio > rs[2].ratio, '가까운 소소한 곳: 이동시간을 길게 고를수록 가까운 쪽의 유리함이 줄어야 해요');
  }
}

// 3) 이동시간을 길게 고를수록 또래 인기(가족 관심도)가 높은 곳이 더 큰 덧점을 받아야 한다.
{
  const base = PLACES.find((p) => p.scale === 'big' && !p.spot);
  const scale = (k) => Object.fromEntries(Object.entries(base.interest).map(([key, v]) => [key, Math.min(100, Math.round(v * k))]));
  const hi = { ...base, id: 'hi', lat: 37.57, lng: 126.99, spot: false, kto: false, interest: scale(1.0), kid: { toddler: 0.9, lower: 0.9, upper: 0.9 } };
  const lo = { ...base, id: 'lo', lat: 37.57, lng: 126.99, spot: false, kto: false, interest: scale(0.5), kid: { toddler: 0.45, lower: 0.45, upper: 0.45 } };
  const gap = (maxMin) => {
    const rows = rankPlaces([hi, lo], profile, [], maxMin, 'all');
    const h = rows.find((r) => r.place.id === 'hi'), l = rows.find((r) => r.place.id === 'lo');
    return h.raw / l.raw;
  };
  const gs = [30, 120, 9999].map(gap);
  console.log(`또래 인기가 2배 높은 곳이 유리한 배수  30분 ${gs[0].toFixed(2)}배 · 2시간 ${gs[1].toFixed(2)}배 · 전국 ${gs[2].toFixed(2)}배`);
  ok(gs[0] < gs[1] && gs[1] < gs[2], '이동시간을 길게 고를수록 또래 인기가 높은 곳의 덧점이 커져야 해요');
  ok(gs[2] > gs[0] * 1.8, `전국으로 고르면 또래 인기 차이가 30분 한도보다 훨씬 크게(1.8배 이상) 반영돼야 해요(지금 ${(gs[2] / gs[0]).toFixed(2)}배)`);
}

// 3-2) "가까운 소소한 곳" 탭도 이동시간을 고른 만큼 후보가 넓어져야 한다(예전에는 45분에서 잘라 1·2·3시간이 거의 같았다).
{
  const base = PLACES.find((p) => p.scale === 'small' && !p.spot);
  const far = { ...base, id: 'far', lat: 37.4, lng: 127.6, spot: false, kto: false }; // 서울에서 약 76분
  const has = (maxMin) => rankPlaces([far], profile, [], maxMin, 'near').length > 0;
  ok(!has(60) && has(120), '가까운 소소한 곳: 이동시간을 길게 고르면(2시간) 그만큼 먼 곳도 후보에 들어와야 해요');
}

// 4) 어른 점수는 "아이 없는 또래의 인기"(interestFree, 없으면 분류별 배율 freeFactor)를 써야 한다(영유아 부모에 희석되지 않게).
{
  const base = PLACES.find((p) => p.scale === 'big' && !p.spot);
  const m = { age: 38, gender: 'm', weight: 1 };
  const key = segKey(m.gender, m.age);
  ok(memberScore({ ...base, interestFree: { [key]: 10 } }, m) === 10, '어른 점수가 interestFree(아이 없는 또래의 인기)를 쓰지 않아요');
  const half = memberScore({ ...base, freeFactor: { [key]: 0.5 } }, m);
  ok(half === Math.round(base.interest[key] * 0.5), `어른 점수가 분류별 배율(freeFactor)을 곱하지 않아요(${half})`);
  ok(memberScore({ ...base }, m) === (base.interest[key] ?? 0), '측정값이 없는 장소는 예전 점수 그대로여야 해요');
  const kid = { age: 7, gender: 'f', weight: 3 };
  ok(memberScore({ ...base, interestFree: { f6: 1 }, freeFactor: { f6: 0.1 } }, kid) === Math.round(((base.kid && base.kid.lower) ?? 0.5) * 100), '아이 점수는 아이 적합도 표를 그대로 써야 해요(어른 보정 영향 없음)');
}

// 5) 동행인에 아이(12세 이하)가 없으면 아이 전용 장소(키즈 분류·이름에 키즈/어린이 등)는 추천에서 빠져야 한다. 아이가 있으면 그대로 나온다.
{
  const base = PLACES.find((p) => p.scale === 'big' && !p.spot);
  const mk = (id, name, cat) => ({ ...base, id, name, cat, lat: 37.57, lng: 126.99, spot: false, kto: false });
  const kidsCat = mk('k1', '시험 방방랜드', 'kids');
  const kidsName = mk('k2', '시험 어린이박물관', 'museum');
  const okPark = mk('k3', '시험 서울어린이대공원', 'theme');
  const normal = mk('n1', '시험 박물관', 'museum');
  const adults = { ...profile, members: [{ id: 'a', label: '나', age: 38, gender: 'm', weight: 1 }, { id: 'b', label: '배우자', age: 36, gender: 'f', weight: 1 }] };
  const ids = (prof, opt) => rankPlaces([kidsCat, kidsName, okPark, normal], prof, [], 9999, 'all', opt).map((r) => r.place.id).sort().join(',');
  ok(ids(adults) === 'k3,n1', `아이가 없으면 키즈 분류·이름에 어린이가 든 곳은 빠지고 어린이대공원은 남아야 해요(지금 ${ids(adults)})`);
  ok(ids(profile) === 'k1,k2,k3,n1', '아이가 있으면 키즈 장소도 그대로 나와야 해요');
  ok(ids(adults, { hideKids: false }) === 'k1,k2,k3,n1', '상세 창·찜 목록용 전체 순위는 아이가 없어도 키즈 장소를 빼지 않아야 해요');
  ok(isKidsPlace({ name: '아이파크몰', cat: 'shop' }) === false && isKidsPlace({ name: '트릭아이뮤지엄', cat: 'theme' }) === false, '"아이"가 이름에 들어간 어른 장소(아이파크몰 등)를 키즈 장소로 잘못 보면 안 돼요');
}

// 6) 아이 전용 행사 판별(아이가 없는 가족에게는 축제 탭에서 뺀다).
{
  const yes = [{ source: 'kopis', title: '뮤지컬 시험' }, { title: '[구립도서관] 유아 미술 책놀이' }, { title: '제38회 춘천인형극제' }, { title: '[서울상상나라] 그림책 작업실' }, { title: '키즈인비또 12월' }];
  const no = [{ title: '서울 빛초롱 축제' }, { title: '[구립도서관] 어른이를 위한 그림책 11월' }, { title: '서울어린이대공원 가을 걷기' }, { title: '남산 단풍 야간 산책' }, { title: '재즈 콘서트' }];
  for (const e of yes) ok(isKidsEvent(e), `아이 전용 행사로 봐야 해요: ${e.title}`);
  for (const e of no) ok(!isKidsEvent(e), `아이 전용 행사로 보면 안 돼요: ${e.title}`);
}

if (problems.length) {
  console.log(`\n❌ 문제 ${problems.length}건`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log('✅ 추천 점수 규칙 이상 없음');
process.exit(0);
