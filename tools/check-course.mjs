// D 항목 점검: 자동 생성한 코스가 "실제로 갈 수 없는 일정"이 아닌지, 확인되지 않은 정보를 지어내지 않는지 자동 확인한다.
// 사용: node tools/check-course.mjs   (문제가 있으면 종료 코드 1)
import { buildCourse, schedule, orderByTravel, validateCourse, travelMin, toMin, MAX_STOPS } from '../app/js/core/course.js';
import { PLACES } from '../app/js/data/places.js';

const problems = [];
const ok = (c, m) => { if (!c) problems.push(m); };
const origin = { name: '서울', lat: 37.5665, lng: 126.978 };
const near = PLACES.filter((p) => p.scale === 'big' && Math.abs(p.lat - 37.5) < 0.5 && Math.abs(p.lng - 127) < 0.6).slice(0, 8);
ok(near.length >= 6, '시험용 가까운 장소가 모자라요');
const cands = near.map((place, i) => ({ place, score: 100 - i }));

// 1) 기본 코스: 시간 안에 들어가고 겹치지 않으며 점심이 있고 출발지로 돌아온다
{
  const c = buildCourse({ origin, date: '2026-11-21', start: '09:00', end: '18:00', candidates: cands });
  ok(c.ok, `기본 코스가 만들어져야 해요(${c.reason || ''})`);
  if (c.ok) {
    ok(validateCourse(c, { startMin: toMin('09:00'), endMin: toMin('18:00') }).length === 0, '기본 코스가 검증을 통과해야 해요');
    ok(c.items.some((i) => i.kind === 'lunch' || i.lunchIn), '9시~18시 코스에는 점심(따로 또는 장소 안에서)이 들어가야 해요');
    ok(c.items.at(-1).type === 'return' && c.items.at(-1).end <= toMin('18:00'), '출발지로 돌아오는 시각이 끝 시각 안이어야 해요');
    const visits = c.items.filter((i) => i.type === 'visit');
    ok(visits.length >= 1 && visits.length <= MAX_STOPS, `방문 곳 수는 1~${MAX_STOPS}곳이어야 해요(${visits.length})`);
    ok(c.warnings.some((w) => w.includes('영업시간')), '영업시간을 확인하지 못했다는 안내가 있어야 해요');
    ok(c.items.every((i) => !('open' in i) && !('hours' in i) && !('closed' in i)), '영업시간·휴무일을 지어내서 넣으면 안 돼요');
  }
}

// 2) 너무 먼 곳(제주)은 시간 안에 못 가므로 빼야 한다
{
  const jeju = PLACES.find((p) => /제주/.test(p.region || '') && p.scale === 'big');
  if (jeju) {
    const c = buildCourse({ origin, date: '2026-11-21', start: '09:00', end: '18:00', candidates: [{ place: jeju, score: 99 }, ...cands.slice(0, 2)] });
    ok(c.ok && !c.items.some((i) => i.type === 'visit' && i.place.id === jeju.id), '하루에 못 가는 먼 곳은 코스에서 빠져야 해요');
    ok(c.dropped.some((d) => d.place.id === jeju.id), '빠진 이유가 기록돼야 해요');
  }
}

// 3) 너무 짧은 시간은 코스를 만들지 않는다
ok(buildCourse({ origin, date: '2026-11-21', start: '09:00', end: '10:30', candidates: cands }).ok === false, '2시간보다 짧으면 코스를 만들면 안 돼요');

// 4) 일정이 끝 시각을 넘으면 schedule 이 null 을 돌려줘야 한다
ok(schedule(origin, near.slice(0, 6), { startMin: toMin('09:00'), endMin: toMin('11:00'), mode: 'car' }) === null, '시간이 모자라면 일정을 만들지 않아야 해요');

// 5) 이동 순서 최적화: 가까운 순서가 입력 순서보다 나쁘면 안 된다
{
  const total = (r) => { let t = travelMin(origin, r[0], 'car'); for (let i = 1; i < r.length; i++) t += travelMin(r[i - 1], r[i], 'car'); return t + travelMin(r.at(-1), origin, 'car'); };
  const raw = near.slice(0, 5), opt = orderByTravel(origin, raw, 'car');
  ok(opt.length === raw.length && new Set(opt.map((p) => p.id)).size === raw.length, '순서를 바꿔도 장소가 빠지거나 겹치면 안 돼요');
  ok(total(opt) <= total(raw), '최적화한 순서가 입력 순서보다 이동시간이 길면 안 돼요');
}

// 6) 대중교통은 추정이라 자동차보다 길고, 추정이라는 안내가 있어야 한다
{
  const a = travelMin(origin, near[0], 'car'), b = travelMin(origin, near[0], 'transit');
  ok(b > a, '대중교통 이동시간은 자동차보다 길게 어림해야 해요');
  const c = buildCourse({ origin, date: '2026-11-21', start: '08:00', end: '20:00', mode: 'transit', candidates: cands.slice(0, 3) });
  ok(!c.ok || c.warnings.some((w) => w.includes('추정')), '대중교통 코스에는 추정 안내가 있어야 해요');
}

// 7) 월요일에 박물관·미술관이 있으면 일반 안내(특정 장소 단정 아님)
{
  const museum = PLACES.find((p) => p.cat === 'museum' && p.scale === 'big');
  const c = buildCourse({ origin, date: '2026-11-16', start: '09:00', end: '18:00', candidates: [{ place: museum, score: 1 }] }); // 2026-11-16 은 월요일
  ok(c.ok && c.warnings.some((w) => w.includes('월요일')), '월요일 박물관 코스에는 일반 안내가 있어야 해요');
}

// 9) 찜한 맛집은 점심 시간에 방문으로 들어가고, 이어서 카페가 나온다(식당이 없다는 안내가 나오면 안 된다)
{
  const shop = (id, cat, lat, lng) => ({ id, name: id, lat, lng, cat, shop: true, kind: cat });
  const f = shop('맛집A', 'food', origin.lat + 0.02, origin.lng + 0.02), cf = shop('카페A', 'cafe', origin.lat + 0.021, origin.lng + 0.021);
  const c = buildCourse({ origin, date: '2026-11-21', start: '09:00', end: '18:00', candidates: [...cands.slice(0, 3), { place: f, score: 1e9 }, { place: cf, score: 1e9 }] });
  ok(c.ok, '맛집·카페가 있는 코스가 만들어져야 해요');
  if (c.ok) {
    const v = c.items.filter((i) => i.type === 'visit');
    const fi = v.findIndex((i) => i.place === f);
    ok(fi >= 0 && v[fi].meal === 'lunch', '찜한 맛집이 점심으로 들어가야 해요');
    ok(fi >= 0 && v[fi + 1]?.place === cf, '맛집 바로 다음에 카페가 이어져야 해요');
    ok(!c.items.some((i) => i.type === 'meal' && i.kind === 'lunch'), '맛집이 있으면 "식당 미정" 점심 칸이 따로 나오면 안 돼요');
    ok(v[fi].start >= toMin('11:00') && v[fi].start <= toMin('14:30'), '점심 맛집은 점심 시간대여야 해요(' + v[fi].start + ')');
    ok(validateCourse(c, { startMin: toMin('09:00'), endMin: toMin('18:00') }).length === 0, '맛집 코스도 검증을 통과해야 해요');
  }
}

// 8) 검증기는 겹치는 일정을 잡아낸다
ok(validateCourse({ items: [{ type: 'visit', start: 600, end: 700 }, { type: 'visit', start: 650, end: 720 }, { type: 'return', start: 720, end: 760 }] }, { startMin: 540, endMin: 1080 }).length > 0, '겹치는 일정을 검증기가 잡아내야 해요');

if (problems.length) { console.log(`❌ 문제 ${problems.length}건\n - ` + problems.join('\n - ')); process.exit(1); }
console.log('✅ 코스 생성 규칙 이상 없음');
