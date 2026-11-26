// 골프 탭 계산: 자료(data/golf.json)를 읽고, 출발지에서 차로 갈 수 있는 골프장을 1인 총비용 낮은 순으로 고른다.
// 자료는 GitHub Actions 가 매일 모은다(tools/golf/collect.mjs). 여기서는 계산만 한다.
import { driveEstimate } from './geo.js';

let golfPromise = null;
/** 골프 자료를 한 번만 받아 온다. 실패하면 null. */
export function loadGolf() {
  if (!golfPromise) {
    golfPromise = Promise.all([
      fetch('data/golf.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('data/fuel.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([g, f]) => { if (g) g.fuel = f; return g; })
      .then((j) => { if (!j) golfPromise = null; return j; });
  }
  return golfPromise;
}

/**
 * 출발지 → 골프장 차 시간.
 * 출발지가 거점 도시이고 카카오 미래 길찾기 결과가 있으면 그 값(kind 'kakao'), 아니면 직선거리 추정(kind 'est').
 */
export function golfDrive(course, origin) {
  const d = origin?.type === 'city' ? course.drive?.[origin.name] : null;
  if (d) return { min: d[0], km: d[1], dep: d[2], toll: Number.isFinite(d[3]) ? d[3] : null, kind: 'kakao' };
  const e = driveEstimate(origin, course);
  return { min: e.min, km: Math.round(e.km * 1.35 * 10) / 10, kind: 'est' };
}

/** 자료에 있는 날짜 중 오늘 이후만 */
export function golfDays(data, today) {
  return (data?.dates || []).filter((d) => d >= today);
}

/**
 * 국내 목록: 고른 날짜에 가격이 있고, 차 시간이 maxMin 이하인 골프장.
 * 1인 총비용 낮은 순(같으면 가까운 순). 개수 제한 없이 전부 돌려준다(화면이 20개씩 나눠 보여 준다).
 */
/** 18홀이 안 되는 골프장: 홀 수가 18 미만이거나 이름에 "퍼9"·"(P9)"·"9홀"·"6홀"·"3홀" */
export const isShortCourse = (c) => (c.holes && c.holes < 18) || /파크\s*골프|퍼\s*9|\(\s*P\s*9\s*\)|\bP9\b|퍼블릭\s*9|(^|[^0-9])[369]\s*홀/i.test(c.name || '');

/**
 * 주유비(1인): 왕복 거리(차 거리 × 2) ÷ 연비 × 연료 가격. 한 사람이 차 한 대로 가므로 나누지 않는다.
 * 연료·연비·가격 중 하나라도 없으면 null(계산 안 함).
 */
export const FUEL_LABEL = { gasoline: '휘발유', diesel: '경유', ev: '전기' };
/**
 * 교통비(1인) = 주유비 + 왕복 통행료. 연료·연비를 안 적으면 계산하지 않는다(null).
 * 통행료는 카카오 길찾기(거점 도시 출발)가 알려 준 편도 값 × 2. 모르면(지도·GPS 출발, 아직 안 받은 곳) 0으로 두고 tollKnown=false.
 */
/**
 * 전기·수소차 고속도로 통행료 감면율(고속도로 들어가는 날 기준).
 * 국토교통부·한국도로공사 발표(2024-12): 2025년 40% → 2026년 30% → 2027년 20%, 2027년 말 종료. 2028년부터는 발표된 감면이 없어 0.
 * 근거: https://www.korea.kr/news/policyNewsView.do?newsId=148936173
 */
export function evTollDiscount(day) {
  const y = Number(String(day || '').slice(0, 4)) || new Date().getFullYear();
  return { 2025: 0.4, 2026: 0.3, 2027: 0.2 }[y] || 0;
}

export function transportCost(drive, car, fuel, day) {
  const f = fuelCost(drive.km, car, fuel);
  if (!f) return null;
  const tollKnown = Number.isFinite(drive.toll);
  const full = tollKnown ? drive.toll * 2 : 0;
  // 전기차는 통행료 감면(카카오 길찾기 통행료는 일반 승용차 요금이라 여기서 깎는다). 10원 단위로 반올림
  const evRate = car?.fuel === 'ev' ? evTollDiscount(day) : 0;
  const toll = evRate ? Math.round((full * (1 - evRate)) / 10) * 10 : full;
  return { ...f, fuel: f.total, toll, tollFull: full, evRate, tollKnown, total: f.total + toll, perPerson: f.total + toll };
}

export function fuelCost(km, car, fuel) {
  const price = fuel?.[car?.fuel];
  if (!car?.fuel || !(car.eff > 0) || !(price > 0) || !(km > 0)) return null;
  const roundKm = km * 2;
  const total = Math.round((roundKm / car.eff) * price / 10) * 10;
  return { roundKm: Math.round(roundKm), total, perPerson: total, price, unit: car.fuel === 'ev' ? 'kWh' : 'L' }; // 한 사람이 차 한 대를 몰고 가므로 차 1대 왕복 주유비 전부가 1인 몫(2026-11-24 운영자 지시)
}

// 티업 시간별 가격(app/data/golf-hours.json): 티업 시간을 고를 때만 받는다
let hoursData = null;
let hoursPromise = null;
export const golfHoursReady = () => Boolean(hoursData);
export function loadGolfHours() {
  if (!hoursPromise) {
    hoursPromise = fetch('data/golf-hours.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((j) => { hoursData = j || { courses: {} }; return hoursData; });
  }
  return hoursPromise;
}
const ap = (h) => (h < 12 ? '오전' : '오후');
const h12 = (h) => (h % 12) || 12;
/** 고른 티업 시간대(24시 기준 시작 시 목록, 칸 하나 = 1시간) → '무관' / '오전 6~7시' / '오전 6~9시' / '오전 11시~오후 1시' / '오전 6~7시 외 2' */
export function teeLabel(hours) {
  const hs = [...(hours || [])].sort((a, b) => a - b);
  if (!hs.length) return '무관';
  const run = hs.every((h, i) => !i || h === hs[i - 1] + 1);
  const a = hs[0], b = run ? hs[hs.length - 1] + 1 : a + 1; // 끝 시각 = 마지막 칸 + 1시간
  const txt = ap(a) === ap(b) || b === 12 ? `${ap(a)} ${h12(a)}~${h12(b)}시` : `${ap(a)} ${h12(a)}시~${ap(b)} ${h12(b)}시`;
  return run ? txt : `${txt} 외 ${hs.length - 1}`;
}
/** 그 골프장·날짜에서 고른 티업 시간대(1시간 단위 여러 개) 중 가장 싼 1인 비용. 없으면 null */
export function hourCost(c, day, hours) {
  const byH = hoursData?.courses?.[c.id]?.[day];
  if (!byH) return null;
  let a = null;
  for (const h of hours) { const x = byH[String(h).padStart(2, '0')]; if (x && (!a || x[1] < a[1])) a = x; }
  if (!a) return null;
  const [src, total, green, cart, caddie, time, flags] = a;
  const base = c.days?.[day] || {};
  const estimated = [(flags & 4) && '카트비', (flags & 8) && '캐디피'].filter(Boolean);
  return { ...base, src, total, green, cart: cart || null, caddie: caddie || null, noCaddie: flags & 1 ? true : undefined, cartIncluded: flags & 2 ? true : undefined, estimated: estimated.length ? estimated : undefined, time: time || null, deal: src === base.src && time === base.time ? base.deal : null, byHour: true };
}

export function golfDomestic(data, { origin, day, maxMin, car, tee = [] }) {
  const out = [];
  for (const c of data?.domestic || []) {
    if (isShortCourse(c)) continue; // 18홀이 안 되는 곳(9홀×2, 6홀×3 등)은 뺀다
    const cost = !tee.length ? c.days?.[day] : hourCost(c, day, tee);
    if (!cost) continue;
    const drive = golfDrive(c, origin);
    if (drive.min > maxMin) continue;
    const fuel = transportCost(drive, car, data.fuel, day);
    out.push({ c, cost, drive, fuel, sum: cost.total + (fuel?.perPerson || 0) });
  }
  out.sort((a, b) => a.sum - b.sum || a.drive.min - b.drive.min);
  return out;
}

/** 해외 목록에 나오는 나라·도시(상품 수가 많은 순) */
export function golfCountries(data) {
  const m = new Map();
  for (const t of data?.abroad || []) {
    if (!t.country) continue;
    const e = m.get(t.country) || { name: t.country, n: 0, cities: new Map() };
    e.n++;
    if (t.city) e.cities.set(t.city, (e.cities.get(t.city) || 0) + 1);
    m.set(t.country, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n).map((e) => ({ name: e.name, n: e.n, cities: [...e.cities].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })) }));
}

/** 해외 목록: 나라·도시로 거르고 가격 낮은 순 */
export function golfAbroad(data, { country, city }) {
  return (data?.abroad || [])
    .filter((t) => (!country || t.country === country) && (!city || t.city === city))
    .sort((a, b) => a.price - b.price);
}

/** 1,234,000 → '1,234,000원' */
export const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

/** 원화 → 현지 통화 대략값(환율 자료가 있을 때만) */
export function localPrice(fx, krw, cur) {
  const per = fx?.perUnit?.[cur];
  if (!per || !krw) return null;
  const v = krw / per;
  return v >= 100 ? Math.round(v).toLocaleString('ko-KR') : (Math.round(v * 10) / 10).toLocaleString('ko-KR');
}

export const COUNTRY_CUR = { 대만: 'TWD', 괌: 'USD', 태국: 'THB', 베트남: 'VND', 필리핀: 'PHP', 말레이시아: 'MYR', 일본: 'JPY', 중국: 'CNY', '괌(미국)': 'USD', '사이판(미국)': 'USD', 라오스: 'USD', 인도네시아: 'USD' };

// ── 해외 골프장(몽키트래블) ───────────────────────────────
export const CONTINENT_OF = { 태국: '동남아시아', 베트남: '동남아시아', 필리핀: '동남아시아', 말레이시아: '동남아시아', 인도네시아: '동남아시아', 라오스: '동남아시아', 일본: '동북아시아', 대만: '동북아시아', 중국: '동북아시아', 괌: '괌·사이판', '괌(미국)': '괌·사이판', '사이판(미국)': '괌·사이판' };
export const CONTINENTS = ['동남아시아', '동북아시아', '괌·사이판'];

/** 대륙 → 나라 → 도시 목록(골프장 수 많은 순) */
export function courseTree(list) {
  const t = new Map();
  for (const c of list || []) {
    const cont = CONTINENT_OF[c.country] || '기타';
    if (!t.has(cont)) t.set(cont, new Map());
    const cm = t.get(cont);
    if (!cm.has(c.country)) cm.set(c.country, new Map());
    const cities = cm.get(c.country);
    cities.set(c.city, (cities.get(c.city) || 0) + 1);
  }
  return t;
}

/** 대륙·나라·도시로 거르고 1인당 낮은 순(가격 없는 곳은 맨 뒤) */
/** 홀 수 필터: '18' = 18홀 이상(기본), '9' = 18홀 미만, 'all' = 전체 */
export const holesOk = (c, f) => (f === 'all' ? true : f === '9' ? c.holes > 0 && c.holes < 18 : c.holes >= 18);

/**
 * 해외 골프장 목록: 추천순 = 1인 골프 비용 + 왕복 항공권(라운딩 일정 기준 실시간 조회값, 아직 없으면 모아 둔 예상값).
 * costOf(c) → { total } 를 넘겨받는다. 가격 없는 곳은 뒤로.
 */
export function courseList(list, { cont, country, city, holes = '18', costOf = (c) => ({ total: c.price || 0 }) }) {
  return (list || [])
    .filter((c) => (!cont || (CONTINENT_OF[c.country] || '기타') === cont) && (!country || c.country === country) && (!city || c.city === city) && holesOk(c, holes))
    .map((c) => ({ c, cost: costOf(c) }))
    .sort((a, b) => (a.c.price ? 0 : 1) - (b.c.price ? 0 : 1) || a.cost.total - b.cost.total || (b.c.rating || 0) - (a.c.rating || 0));
}

// ── 라운딩 일정 기준 항공권: 서울 서버(/fare)가 네이버 항공권으로 조회. 같은 질문은 이 화면에서 한 번만 ─────────
export const FARE_API = 'https://golfmon-collector-351935360699.asia-northeast3.run.app/fare';
const fares = new Map();
const fareQueue = [];
let fareRunning = 0;
const fareKey = (iata, t) => `${iata}|${t.dep}|${t.ret}`;
export const fareOf = (iata, t) => (iata ? fares.get(fareKey(iata, t)) : null);
export function requestFares(iatas, t, onChange) {
  for (const i of new Set(iatas.filter(Boolean))) {
    const k = fareKey(i, t);
    if (fares.has(k)) continue;
    fares.set(k, { state: 'loading' });
    fareQueue.push([i, k]);
  }
  const pump = () => {
    while (fareRunning < 3 && fareQueue.length) {
      const [i, k] = fareQueue.shift();
      fareRunning++;
      fetch(`${FARE_API}?to=${encodeURIComponent(i)}&dep=${t.dep}&ret=${t.ret}&after=17`)
        .then((r) => r.json())
        .then((j) => fares.set(k, j.pick ? { state: 'ok', ...j } : { state: 'fail' }))
        .catch(() => fares.set(k, { state: 'fail' }))
        .finally(() => { fareRunning--; onChange(); pump(); });
    }
  };
  pump();
}
