// 같은 장소가 목록에 두 번 나오지 않게 하는 규칙. 앱(live.js)과 점검 스크립트(tools/check-dupes.mjs)가 같은 함수를 쓴다.
//
// 예전에는 "300m 안이면 같은 곳"이라는 거리 규칙만 있었다. 그런데 서울대공원처럼 넓은 곳은 정문·동물원·놀이공원이 1km 넘게 떨어져 있어
// 같은 곳이 여러 번 나왔다. 그래서 거리(3km 안) + 이름 관계를 함께 본다.
//  - 이름이 같다(공백·기호 무시): "서울대공원" = "서울 대공원"
//  - 한쪽 이름이 다른 쪽의 맨 앞에 붙는다: "서울대공원" ⊂ "서울대공원 서울동물원" (큰 곳의 세부 시설)
//  - 지역 이름만 앞에 붙었다: "송도해상케이블카" ≈ "부산 송도해상케이블카" (앞에 4글자 이하)
//  - "경주 황리단길·대릉원"처럼 · 로 묶은 이름은 각각으로도 본다
// "점핑고 거북섬점"처럼 이름 가운데·끝에 큰 곳 이름이 들어간 지점(가게)은 다른 장소라 겹침으로 보지 않는다.

import { haversineKm } from '../core/geo.js';

export const normName = (s) => String(s || '').replace(/[\s·()\-_/.,!'"]/g, '').toLowerCase();

/** 이름 하나를 비교용 조각들로: 전체 + (·, / 로 묶인 이름이면 각 조각). 3글자 미만은 너무 흔해서 뺀다. */
export function nameKeys(name) {
  const keys = new Set();
  const whole = normName(name);
  if (whole.length >= 3) keys.add(whole);
  if (/[·/]/.test(String(name))) for (const part of String(name).split(/[·/]/)) { const k = normName(part); if (k.length >= 3) keys.add(k); }
  return [...keys];
}

function relatedNames(a, b) {
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  if (a.endsWith(b) && a.length - b.length <= 4) return true;
  if (b.endsWith(a) && b.length - a.length <= 4) return true;
  return false;
}

export const DUP_KM = 3;

/** 두 장소({name, lat, lng})가 같은 곳(또는 한 곳의 세부 시설)인지 */
export function sameVenue(p, q, aKeys = nameKeys(p.name), bKeys = nameKeys(q.name)) {
  if (!aKeys.length || !bKeys.length) return false;
  if (Math.abs(p.lat - q.lat) > 0.03 || Math.abs(p.lng - q.lng) > 0.04) return false;
  if (haversineKm(p, q) > DUP_KM) return false;
  return aKeys.some((a) => bKeys.some((b) => relatedNames(a, b)));
}

/** 장소를 하나씩 넣으면서 겹치는지 물어보는 도구(격자로 가까운 것만 비교해서 빠르다) */
export function makeDupIndex(initial = []) {
  const cells = new Map();
  const cellOf = (p) => `${Math.floor(p.lat / 0.05)},${Math.floor(p.lng / 0.05)}`;
  const add = (p) => {
    const k = cellOf(p);
    let arr = cells.get(k);
    if (!arr) cells.set(k, (arr = []));
    arr.push({ p, keys: nameKeys(p.name) });
  };
  initial.forEach(add);
  return {
    add,
    /** 이미 들어 있는 장소 중 겹치는 것(없으면 null) */
    find(p) {
      const keys = nameKeys(p.name);
      if (!keys.length) return null;
      const la = Math.floor(p.lat / 0.05), lo = Math.floor(p.lng / 0.05);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        for (const e of cells.get(`${la + i},${lo + j}`) || []) if (sameVenue(p, e.p, keys, e.keys)) return e.p;
      }
      return null;
    },
  };
}
