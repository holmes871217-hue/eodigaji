// 해외 골프 숙소 추천: 공항과 골프장(여러 곳이면 모두)에 "비슷한 차 시간으로" 닿는 숙소 중 평점 높은 곳.
//  1) 후보 고르기: 숙소마다 공항·골프장까지 직선거리 중 가장 먼 값이 작은(= 가운데쯤인) 숙소 40곳 → 평점 높은 15곳
//  2) 길찾기: 후보 15곳 × (공항 + 골프장) 차 이동 시간을 한 번에 조회
//     - 구글 길찾기(서울 서버 /route-matrix, 구글 Routes API)를 먼저 쓰고,
//     - 서버가 아직 준비 안 됐거나 실패하면 오픈스트리트맵 길찾기(OSRM 공개 서버)로 대신 계산한다.
//  3) 고르기: "가장 오래 걸리는 곳까지의 시간"이 가장 짧은 숙소 기준 +15분 안쪽 숙소들 중 평점 높은 순 3곳
//     (어느 한 곳만 멀지 않게 = 넷 다 비슷한 시간)

const ROUTE_API = 'https://golfmon-collector-351935360699.asia-northeast3.run.app/route-matrix';
const OSRM = 'https://router.project-osrm.org/table/v1/driving/';

let data = null;
let loading = null;
const results = new Map(); // key → { state: 'loading'|'ok'|'fail', list, src }
let notify = () => {};
/** 계산이 끝나면 화면을 다시 그리게 main.js 가 알려 준다 */
export const onStaysChange = (fn) => { notify = fn; };

export function loadStays() {
  if (data) return Promise.resolve(data);
  if (!loading) {
    loading = fetch('data/golf-stays.json')
      .then((r) => r.json())
      .then((j) => {
        data = {
          ...j,
          hotels: j.hotels.map(([id, n, lat, lng, s, c, st, p, path, ph, loc]) => ({ id, n, lat, lng, s, c, st, p, url: `https://www.booking.com/hotel/${path}.ko.html`, ph, loc })),
        };
        return data;
      })
      .catch((e) => { loading = null; throw e; });
  }
  return loading;
}

export const airportPoint = (iata) => {
  const a = data?.airports?.[iata];
  return a ? { kind: 'air', label: `${a[0]} 공항`, short: '공항', iata, lat: a[1], lng: a[2] } : null;
};

function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function candidates(points, hotels) {
  const scored = [];
  for (const h of hotels) {
    let far = 0;
    for (const p of points) { const d = km(h, p); if (d > far) far = d; if (far > 250) break; }
    if (far <= 250) scored.push({ h, far });
  }
  scored.sort((a, b) => a.far - b.far);
  const near = scored.slice(0, 40);
  if (!near.length) return [];
  const lim = near[0].far * 1.3 + 10; // 가운데에서 너무 벗어난 숙소는 뺀다
  const ok = near.filter((x) => x.far <= lim);
  // 가운데에 가장 가까운 12곳 + 그 범위 안에서 평점 가장 높은 4곳(겹치면 하나로)
  const pick = new Map();
  for (const x of ok.slice(0, 12)) pick.set(x.h.id, x.h);
  for (const x of [...ok].sort((a, b) => b.h.s - a.h.s).slice(0, 4)) pick.set(x.h.id, x.h);
  return [...pick.values()];
}

const withTimeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };

async function matrixGoogle(origins, dests) {
  const r = await fetch(ROUTE_API, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, signal: withTimeout(15000),
    body: JSON.stringify({ origins: origins.map((p) => [p.lat, p.lng]), dests: dests.map((p) => [p.lat, p.lng]) }),
  });
  if (!r.ok) throw new Error(`route ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j.sec)) throw new Error('route empty');
  return { sec: j.sec, src: 'google' };
}

async function matrixOsrm(origins, dests) {
  const all = [...origins, ...dests];
  const coords = all.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const src = origins.map((_, i) => i).join(';');
  const dst = dests.map((_, i) => origins.length + i).join(';');
  const r = await fetch(`${OSRM}${coords}?sources=${src}&destinations=${dst}&annotations=duration`, { signal: withTimeout(20000) });
  const j = await r.json();
  if (j.code !== 'Ok') throw new Error(j.code || 'osrm');
  return { sec: j.durations, src: 'osrm' };
}

// 섬(코란 등) 숙소인데 골프장·공항이 모두 15km 넘게 떨어져 있으면 배를 타야 하는 곳으로 보고 뺀다
// (오픈스트리트맵 길찾기는 배 길을 차 길처럼 계산하는 경우가 있어서)
const ISLAND = /(^|[\s(])(ko|koh)\s?[a-z]|kohlarn|코란|꼬란|코사멧|꼬사멧/i;
function islandAway(h, pts) {
  return ISLAND.test(`${h.loc} ${h.n}`) && pts.every((p) => km(h, p) > 15);
}

async function needsFerry(a, b) {
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?steps=true&overview=false`, { signal: withTimeout(10000) });
    const j = await r.json();
    return (j.routes?.[0]?.legs || []).some((l) => l.steps.some((st) => st.mode === 'ferry'));
  } catch { return false; }
}

/** iata: 공항 코드, places: [{ lat, lng, label, short }] 골프장들. 처음이면 계산을 시작하고 끝나면 onChange() */
export function staysFor(iata, places, onChange) {
  const ps = places.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!iata || !ps.length) return { state: 'none' };
  const key = `${iata}|${ps.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).sort().join('|')}`;
  if (results.has(key)) return results.get(key);
  const res = { state: 'loading' };
  results.set(key, res);
  (async () => {
    const d = await loadStays();
    const air = airportPoint(iata);
    if (!air) { Object.assign(res, { state: 'empty' }); return; }
    const pts = [air, ...ps];
    const cand = candidates(pts, d.hotels);
    if (!cand.length) { Object.assign(res, { state: 'empty' }); return; }
    let m;
    try { m = await matrixGoogle(cand, pts); } catch { m = await matrixOsrm(cand, pts); }
    const rows = cand.map((h, i) => {
      const mins = pts.map((_, k) => { const s = m.sec?.[i]?.[k]; return Number.isFinite(s) ? Math.round(s / 60) : null; });
      if (mins.some((x) => x == null)) return null;
      const max = Math.max(...mins), min = Math.min(...mins);
      return { h, mins, max, spread: max - min };
    }).filter(Boolean);
    if (!rows.length) { Object.assign(res, { state: 'empty' }); return; }
    const best = Math.min(...rows.map((r) => r.max));
    const ordered = rows.filter((r) => r.max <= best + 15).sort((a, b) => b.h.s - a.h.s || a.max - b.max);
    // 배를 타야 닿는 섬 숙소는 뺀다(구글은 서버에서 배 없는 길로 계산, 오픈스트리트맵은 숙소→공항 길에 배가 있는지 확인)
    const pick = [];
    for (const r of ordered) {
      if (pick.length >= 3) break;
      if (m.src === 'osrm' && (islandAway(r.h, pts) || await needsFerry(r.h, air))) continue;
      pick.push(r);
    }
    if (!pick.length) { Object.assign(res, { state: 'empty' }); return; }
    Object.assign(res, { state: 'ok', list: pick, src: m.src, points: pts, at: d.at, checkin: d.checkin });
  })().catch(() => Object.assign(res, { state: 'fail' })).finally(() => (onChange || notify)());
  return res;
}

export const STAY_SRC = { google: '구글 지도 길찾기', osrm: '오픈스트리트맵 길찾기' };
