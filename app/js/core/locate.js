// 지도에서 고른 좌표에 사람이 읽을 이름을 붙인다.
// 지금은 앱 안에 있는 장소·도시 목록 중 가장 가까운 것으로 이름을 만든다(외부로 위치를 보내지 않음).
// 3단계에서 카카오 로컬(좌표 → 주소 변환)로 바꾸면 "○○동"처럼 정확한 주소가 나온다.

import { PLACES } from '../data/places.js';
import { CITIES, haversineKm } from './geo.js';

export function nearestLabel(p) {
  let place = null;
  let pd = Infinity;
  for (const x of PLACES) {
    const d = haversineKm(p, x);
    if (d < pd) { pd = d; place = x; }
  }
  let city = null;
  let cd = Infinity;
  for (const c of CITIES) {
    const d = haversineKm(p, c);
    if (d < cd) { cd = d; city = c; }
  }
  if (place && pd <= 8) return `${place.region} 부근`;
  if (city && cd <= 30) return `${city.name} 부근`;
  if (place) return `${place.region} 방면`;
  return '선택한 위치';
}
