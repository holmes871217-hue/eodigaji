// D 항목: 여행 코스 자동 생성.
// 입력: 출발지·날짜·시작/끝 시각·이동수단·후보 장소(찜 우선 + 추천 상위). 출력: 시각표가 붙은 방문 순서.
//
// 지키는 것(실제로 갈 수 없는 일정이 나오지 않게 — validateCourse 가 마지막에 다시 검사한다):
//   - 모든 일정이 [시작, 끝] 안에 들어가고 서로 겹치지 않는다.
//   - 이동시간은 core/geo.js 의 driveEstimate(자동차). 대중교통은 ×1.7+10분으로 "추정"한다.
//   - 점심(11:30~13:30 사이 60분)·저녁(17:30 이후까지 이어지는 일정이면 60분)·휴식(3시간 넘게 쉬지 않았으면 20분)을 넣는다.
//   - 마지막에 출발지로 돌아오는 시간을 끝 시각 안에 넣는다.
// 지어내지 않는 것:
//   - 영업시간·휴무일은 앱에 자료가 없다. 장소마다 "영업시간 미확인"으로 표시하고 일정에서 영업시간을 가정하지 않는다.
//     (월요일처럼 쉬는 곳이 많은 요일은 "일반 안내"로만 알린다. 특정 장소가 쉰다고 단정하지 않는다.)
//   - 체류시간은 분류별 평균을 "추정"으로 쓴다. 식사 장소는 정하지 않고 "근처 맛집 찾기"로 이어 준다.
import { driveEstimate } from './geo.js';

export const DWELL = { theme: 240, zoo: 150, museum: 90, gallery: 60, nature: 90, sea: 90, culture: 75, market: 60, shop: 120, cafe: 45, activity: 90, kids: 120, stage: 100, resort: 180, trend: 60, expo: 90, walk: 60 };
export const DEFAULT_DWELL = 75;
const LUNCH = { from: 11 * 60 + 30, to: 13 * 60 + 30, len: 60 };
const DINNER = { from: 17 * 60 + 30, len: 60 };
const REST = { after: 180, len: 20 };
export const MAX_STOPS = 6;

export const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
export const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const dwellOf = (place) => DWELL[place.cat] ?? DEFAULT_DWELL;

/** 두 지점 사이 이동시간(분). mode: 'car' | 'transit'(추정) */
export function travelMin(a, b, mode = 'car') {
  const m = driveEstimate(a, b).min;
  return mode === 'transit' ? Math.round(m * 1.7 + 10) : m;
}

/**
 * 방문 순서(places 배열 순서)대로 시각표를 만든다. 끝 시각을 넘으면 null.
 * @returns {{items:Array, endMin:number}|null}
 */
export function schedule(origin, places, { startMin, endMin, mode }) {
  const items = [];
  let clock = startMin, pos = origin, sinceBreak = 0, lunch = false, dinner = false;
  const push = (it) => { items.push(it); clock = it.end; };
  const meal = (label, len, kind) => { push({ type: 'meal', kind, label, start: clock, end: clock + len }); sinceBreak = 0; };
  const maybeMeals = () => {
    if (!lunch && clock >= LUNCH.from && clock <= LUNCH.to) { meal('점심 식사', LUNCH.len, 'lunch'); lunch = true; }
    if (!dinner && clock >= DINNER.from) { meal('저녁 식사', DINNER.len, 'dinner'); dinner = true; }
  };
  for (const p of places) {
    const t = travelMin(pos, p, mode);
    let arrive = clock + t;
    // 이동 도중에 점심 시간이 지나가면 이 장소에 가기 전에 먼저 먹는다
    if (!lunch && arrive > LUNCH.to && clock <= LUNCH.to) { const at = Math.max(clock, LUNCH.from); clock = at; meal('점심 식사', LUNCH.len, 'lunch'); lunch = true; arrive = clock + t; }
    if (sinceBreak + t >= REST.after) { push({ type: 'rest', label: '휴식', start: clock, end: clock + REST.len }); sinceBreak = 0; arrive = clock + t; }
    const dwell = dwellOf(p);
    const start = arrive, end = arrive + dwell;
    const it = { type: 'visit', place: p, travel: t, start, end, dwell };
    // 점심 시간대에 걸쳐 오래(2시간 이상) 머무는 곳이면 점심은 그 안에서 먹는 것으로 본다(체류시간에 포함, 따로 식사 시간을 넣지 않음)
    if (!lunch && start < LUNCH.to && end > LUNCH.from && dwell >= 120) { it.lunchIn = true; lunch = true; }
    items.push(it);
    clock = end; pos = p; sinceBreak += t + dwell;
    maybeMeals();
  }
  const back = travelMin(pos, origin, mode);
  const home = clock + back;
  if (home > endMin) return null;
  items.push({ type: 'return', travel: back, start: clock, end: home });
  // 끝 시각 전에 저녁 시간대를 지나는데 식사가 없으면 안내만 한다(일정은 건드리지 않음)
  return { items, endMin: home };
}

/** 같은 장소 집합을 가까운 곳부터 잇고 2-opt 로 이동시간 합을 줄인다. */
export function orderByTravel(origin, places, mode) {
  if (places.length <= 2) return places.slice();
  const cost = (a, b) => travelMin(a, b, mode);
  const left = places.slice(), route = [];
  let cur = origin;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (cost(cur, left[i]) < cost(cur, left[bi])) bi = i;
    route.push(left.splice(bi, 1)[0]); cur = route.at(-1);
  }
  const total = (r) => { let t = cost(origin, r[0]); for (let i = 1; i < r.length; i++) t += cost(r[i - 1], r[i]); return t + cost(r.at(-1), origin); };
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) for (let j = i + 1; j < route.length; j++) {
      const cand = route.slice(0, i).concat(route.slice(i, j + 1).reverse(), route.slice(j + 1));
      if (total(cand) < total(route) - 1e-9) { route.splice(0, route.length, ...cand); improved = true; }
    }
  }
  return route;
}

/** 만들어진 코스가 규칙을 지키는지 다시 검사. 문제 목록을 돌려준다(없으면 []). */
export function validateCourse(course, { startMin, endMin }) {
  const bad = [];
  let prev = startMin;
  for (const it of course.items) {
    if (!(it.end >= it.start)) bad.push('끝나는 시각이 시작보다 빨라요');
    if (it.start < prev) bad.push(`${it.type} 일정이 앞 일정과 겹쳐요`);
    if (it.start < startMin || it.end > endMin) bad.push('일정이 시작·끝 시각 밖으로 나가요');
    prev = it.end;
  }
  const visits = course.items.filter((i) => i.type === 'visit');
  if (visits.length && course.items.at(-1).type !== 'return') bad.push('출발지로 돌아오는 시간이 없어요');
  return bad;
}

/**
 * 코스 만들기.
 * @param {object} o
 *   origin {lat,lng,name}, date 'YYYY-MM-DD', start 'HH:MM', end 'HH:MM', mode 'car'|'transit'
 *   candidates: [{ place, score, fav? }] 우선순위 순(찜 먼저). 최대 MAX_STOPS 곳을 고른다.
 */
export function buildCourse({ origin, date, start = '09:00', end = '18:00', mode = 'car', candidates }) {
  const startMin = toMin(start), endMin = toMin(end);
  const warnings = [];
  if (!(endMin - startMin >= 120)) return { ok: false, reason: '여행 시간이 너무 짧아요(최소 2시간).', items: [], warnings };
  const chosen = [];
  const dropped = [];
  for (const c of candidates) {
    if (chosen.length >= MAX_STOPS) { dropped.push({ place: c.place, why: '코스에 넣을 수 있는 최대 곳 수(6곳)를 넘어요' }); continue; }
    const trial = orderByTravel(origin, [...chosen.map((x) => x.place), c.place], mode);
    if (schedule(origin, trial, { startMin, endMin, mode })) chosen.push(c);
    else dropped.push({ place: c.place, why: '시간 안에 다녀올 수 없어요' });
  }
  if (!chosen.length) return { ok: false, reason: '이 시간 안에 다녀올 수 있는 후보가 없어요. 시간을 늘리거나 가까운 곳을 찜해 보세요.', items: [], dropped, warnings };
  const order = orderByTravel(origin, chosen.map((x) => x.place), mode);
  const sch = schedule(origin, order, { startMin, endMin, mode });
  const course = { ok: true, items: sch.items, endMin: sch.endMin, dropped, warnings, mode, startMin, date };
  const problems = validateCourse(course, { startMin, endMin });
  if (problems.length) return { ok: false, reason: `코스 검증에 실패했어요: ${problems.join(', ')}`, items: [], dropped, warnings };
  // 안내(지어내지 않고 일반 사실만)
  const [yy, mm, dd] = String(date || '').split('-').map(Number);
  const weekday = yy ? new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay() : -1; // 기기 시간대와 상관없이 날짜 글자만으로 요일을 구한다
  if (weekday === 1 && order.some((p) => ['museum', 'gallery'].includes(p.cat))) warnings.push('월요일은 쉬는 박물관·미술관이 많아요(이 장소들의 휴관일은 확인하지 못했어요).');
  if (mode === 'transit') warnings.push('대중교통 이동시간은 자동차 시간으로 어림한 추정이에요. 실제 환승·배차는 반영하지 못했어요.');
  warnings.push('영업시간·휴무일은 확인하지 못했어요. 가기 전에 꼭 확인해 주세요. 체류시간은 분류별 평균으로 어림한 추정이에요.');
  if (sch.items.at(-1).end > DINNER.from && !sch.items.some((i) => i.kind === 'dinner')) warnings.push('저녁 시간대에 돌아와요. 식사 시간은 넣지 않았어요.');
  return course;
}
