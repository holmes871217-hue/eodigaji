// 찜(하트) 목록. state.favs 에 "담은 순서 = 동선 순서"로 들어 있고 폰 안(localStorage)에 저장된다.
// 한 줄: { key, type: 'place'|'event'|'shop', id, name, lat, lng, sub, kind?, start?, end? }
//  - 장소·행사 자료가 나중에 바뀌거나 사라져도 목록이 깨지지 않게, 담을 때 이름·좌표를 같이 적어 둔다.
//  - 가게(shop)는 이름·좌표·주소만 적는다(평점은 적어 두지 않는다).
import { haversineKm } from './geo.js';

export const FAV_MAX = 30;

export const favKey = (type, id) => `${type}:${id}`;

/** 화면을 그릴 때 "이미 찜했는지"를 빨리 보려고 만드는 묶음 */
export const favSet = (state) => new Set((state.favs || []).map((f) => f.key));

/** 찜을 넣거나 뺀다. @returns {'on'|'off'|'full'} */
export function toggleFav(state, item) {
  const i = state.favs.findIndex((f) => f.key === item.key);
  if (i >= 0) { state.favs.splice(i, 1); return 'off'; }
  if (state.favs.length >= FAV_MAX) return 'full';
  state.favs.push(item);
  return 'on';
}

/** from 번째 줄을 to 번째 자리로 옮긴다. */
export function moveFav(state, from, to) {
  const n = state.favs.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return false;
  const [it] = state.favs.splice(from, 1);
  state.favs.splice(to, 0, it);
  return true;
}

/** 순서대로 이었을 때 직선거리 합(km) */
export function routeKm(favs) {
  let km = 0;
  for (let i = 1; i < favs.length; i++) km += haversineKm(favs[i - 1], favs[i]);
  return km;
}

/** 검색 위치에서 출발해 "지금 있는 곳에서 가장 가까운 곳"을 차례로 고르는 간단한 동선 정리 */
export function autoRoute(state, origin) {
  const rest = state.favs.slice();
  const out = [];
  let cur = origin;
  while (rest.length) {
    let best = 0;
    for (let i = 1; i < rest.length; i++) {
      if (haversineKm(cur, rest[i]) < haversineKm(cur, rest[best])) best = i;
    }
    cur = rest.splice(best, 1)[0];
    out.push(cur);
  }
  state.favs = out;
}
