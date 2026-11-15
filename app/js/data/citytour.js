// 시티투어 안내: 수집기(tools/collect.mjs 의 collectCityTours)가 만든 data/citytour.json 을 시·군·구별로 찾아 준다.
// 전국시티투어정보에는 좌표가 없어서 장소가 아니라 "이 지역에 시티투어가 있어요" 안내로만 쓴다.
let TOURS = {};
export function setCityTours(t) {
  TOURS = t || {};
}

const strip = (n) => String(n || '').replace(/(시|군|구)$/, '');

/** 장소가 있는 시·군·구의 시티투어 코스 목록(없으면 빈 배열). 장소 지역은 "경기 용인시"처럼 시도·시군구 순서다. */
export function cityToursFor(place) {
  const t = String(place.region || '').split(' ');
  if (t.length < 2) return [];
  return TOURS[`${t[0].slice(0, 2)}|${strip(t[1])}`] || [];
}
