// 골프 탭 계산: 자료(data/golf.json)를 읽고, 출발지에서 차로 갈 수 있는 골프장을 1인 총비용 낮은 순으로 고른다.
// 자료는 GitHub Actions 가 매일 모은다(tools/golf/collect.mjs). 여기서는 계산만 한다.
import { driveEstimate } from './geo.js';

let golfPromise = null;
/** 골프 자료를 한 번만 받아 온다. 실패하면 null. */
export function loadGolf() {
  if (!golfPromise) {
    golfPromise = fetch('data/golf.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
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
  if (d) return { min: d[0], km: d[1], dep: d[2], kind: 'kakao' };
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
export function golfDomestic(data, { origin, day, maxMin }) {
  const out = [];
  for (const c of data?.domestic || []) {
    const cost = c.days?.[day];
    if (!cost) continue;
    const drive = golfDrive(c, origin);
    if (drive.min > maxMin) continue;
    out.push({ c, cost, drive });
  }
  out.sort((a, b) => a.cost.total - b.cost.total || a.drive.min - b.drive.min);
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

export const COUNTRY_CUR = { 태국: 'THB', 베트남: 'VND', 필리핀: 'PHP', 말레이시아: 'MYR', 일본: 'JPY', 중국: 'CNY', '괌(미국)': 'USD', '사이판(미국)': 'USD', 라오스: 'USD', 인도네시아: 'USD' };
