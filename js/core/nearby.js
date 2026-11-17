// 장소 근처 맛집·카페·주차장 찾기. (주차장은 평점이 필요 없어서 카카오로만 찾는다)
// 1순위: 구글 Places(평점·리뷰 수가 있음). 가깝고 평점 높은 순으로 5곳을 고른다.
// 구글을 못 쓰면(키 없음·하루 한도 초과·인터넷 문제) 카카오 장소 검색으로 가까운 순 5곳(평점 없음).
// 구글 결과는 저장해 두면 안 되므로(이용 약관) 앱을 켜 둔 동안만 기억한다.
import { GOOGLE_PLACES_KEY } from '../config.js';
import { haversineKm } from './geo.js';
import { loadKakao } from './search.js';

export const SHOP_KINDS = {
  food: { label: '맛집', icon: '🍽️', google: 'restaurant', kakao: 'FD6' },
  cafe: { label: '카페', icon: '☕', google: 'cafe', kakao: 'CE7' },
  park: { label: '주차장', icon: '🅿️', google: null, kakao: 'PK6' },
};

// 주차장 가운데 일반 차량이 댈 수 없는 곳
const NOT_PARK = /전용|입주민|거주자|관계자|아파트|교회|학교|유치원|어린이집/;

// 카페로 분류돼 있지만 나들이 중에 들르는 카페가 아닌 곳
const NOT_CAFE = /스터디|독서실|PC방|피시방|만화|보드게임|코인노래|스크린/i;

const FIELDS = [
  'places.id', 'places.displayName', 'places.rating', 'places.userRatingCount',
  'places.location', 'places.shortFormattedAddress', 'places.primaryTypeDisplayName',
].join(',');

/**
 * 네이버·카카오에 등록된 이름과 맞도록 구글 이름을 다듬는다.
 * "베테랑 칼국수 / Veteran Kalguksu" → "베테랑 칼국수", "스위스램 Swiss Lamb" → "스위스램"
 */
export function cleanShopName(name) {
  let s = String(name || '').split(' / ')[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (/[가-힣]/.test(s)) s = s.replace(/\s+[A-Za-z][A-Za-z0-9 .&'-]*$/, '').trim();
  return s || String(name || '');
}


// ── 블루리본 선정 표시(이용 허락이 확인된 자료가 있을 때만 켜진다) ──────────────
// app/data/blueribbon.json 의 license.status 가 "permitted" 일 때만 쓴다. 허락 전에는 자료가 비어 있어 아무것도 달라지지 않는다.
// 로고·리본 그림은 쓰지 않고 글자("블루리본 선정")로만 표시한다. 자세한 사정은 docs/블루리본-연동.md
let brPromise = null;
function loadBlueRibbon() {
  if (!brPromise) {
    brPromise = fetch('data/blueribbon.json').then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && j.license?.status === 'permitted' && Array.isArray(j.items) ? j.items : []))
      .catch(() => []);
  }
  return brPromise;
}
const brKey = (s) => String(s || '').replace(/\s+|\([^)]*\)/g, '').toLowerCase();
export function tagBlueRibbon(rows, list) {
  if (!list.length) return rows;
  for (const r of rows) {
    const k = brKey(r.nq || r.name);
    const hit = list.find((b) => brKey(b.n) === k && haversineKm({ lat: b.lat, lng: b.lng }, r) < 0.3);
    if (hit) { r.br = hit.y || true; }
  }
  return rows;
}

async function googleNearby(place, kind, radius, key) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({
      includedTypes: [SHOP_KINDS[kind].google],
      maxResultCount: 20,
      rankPreference: 'POPULARITY',
      languageCode: 'ko',
      regionCode: 'KR',
      locationRestriction: { circle: { center: { latitude: place.lat, longitude: place.lng }, radius } },
    }),
  });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const rows = (await res.json()).places || [];
  return rows
    .filter((r) => r.id && r.displayName?.text && r.location)
    .filter((r) => kind !== 'cafe' || !NOT_CAFE.test(r.displayName.text))
    .map((r) => ({
      id: `g-${r.id}`,
      gid: r.id, // 구글 지도에서 같은 가게를 정확히 여는 번호
      name: r.displayName.text,
      nq: cleanShopName(r.displayName.text), // 네이버 지도에서 찾을 이름(아래에서 카카오로 한 번 더 맞춘다)
      lat: r.location.latitude,
      lng: r.location.longitude,
      type: r.primaryTypeDisplayName?.text || '',
      addr: (r.shortFormattedAddress || '').replace(/\s+KR(?=\s|$)/g, '').replace(/\s*Address:\s*$/, ''),
      rating: typeof r.rating === 'number' ? r.rating : null,
      reviews: r.userRatingCount || 0,
      km: haversineKm(place, { lat: r.location.latitude, lng: r.location.longitude }),
    }));
}

/**
 * "가깝고 평점 높은" 순서.
 * 리뷰가 몇 개뿐인 5.0점이 맨 위로 오지 않게, 리뷰 20개 분량의 보통 점수(4.0)를 섞어 계산하고
 * 1km 멀어질 때마다 0.15점씩 깎는다.
 */
export function pickBest(rows) {
  // 평점(보통 점수) 2배 + 리뷰가 많을수록 가산(리뷰 1000개 ≈ +0.75) − 멀수록 감점(1km당 0.15) + 블루리본 선정 보너스(+4)
  const score = (r) => (r.rating == null ? 0 : 2 * ((r.rating * r.reviews + 4.0 * 20) / (r.reviews + 20)) + 0.25 * Math.log10(1 + r.reviews)) - 0.15 * r.km + (r.br ? 4 : 0);
  return rows.slice().sort((a, b) => score(b) - score(a)).slice(0, 5);
}

/** 구글로 찾기. key 를 따로 주는 것은 검수용(평소에는 config.js 의 키를 쓴다). */
export async function viaGoogle(place, kind, key = GOOGLE_PLACES_KEY) {
  const br = kind === 'food' ? await loadBlueRibbon() : [];
  let rows = tagBlueRibbon(await googleNearby(place, kind, 3000, key), br);
  // 근처에 가게가 거의 없는 곳(산·바다)은 10km까지 넓혀 한 번 더 찾는다.
  if (rows.filter((r) => r.rating != null).length < 5) {
    try { rows = tagBlueRibbon(await googleNearby(place, kind, 10000, key), br); } catch { /* 처음 결과를 쓴다 */ }
  }
  return pickBest(rows);
}

// ── 서울 주차장(서울 열린데이터광장) ─────────────────────────────
// 요금·운영 정보가 있는 서울시 관리 주차장 약 2,200곳. 수집기가 app/data/seoul-parking.json 에 담아 둔다.
// 서울 밖 장소에서는 내려받지 않는다(약 600KB). 한 번 받으면 앱을 켜 둔 동안 기억한다.
let seoulLotsPromise = null;
const inSeoul = (p) => p.lat > 37.41 && p.lat < 37.72 && p.lng > 126.76 && p.lng < 127.2;
function loadSeoulLots() {
  if (!seoulLotsPromise) {
    seoulLotsPromise = fetch('data/seoul-parking.json')
      .then((r) => (r.ok ? r.json() : { lots: [] }))
      .then((j) => j.lots || [])
      .catch(() => { seoulLotsPromise = null; return []; });
  }
  return seoulLotsPromise;
}

// ── 전국 주차장(공공데이터포털 전국주차장정보) ─────────────────────
// 수집기가 0.25도 격자별 파일(app/data/parking/<격자>.json)로 나눠 둔다. 장소 둘레 약 3km 가 걸치는 격자만 받는다.
const PARK_CELL = (lat, lng) => `${Math.floor(lat * 4)}_${Math.floor(lng * 4)}`;
let parkIndexPromise = null;
const parkCells = new Map();
function loadParkIndex() {
  if (!parkIndexPromise) {
    parkIndexPromise = fetch('data/parking/index.json').then((r) => (r.ok ? r.json() : { cells: {} })).then((j) => j.cells || {}).catch(() => { parkIndexPromise = null; return {}; });
  }
  return parkIndexPromise;
}
async function loadStdLots(place) {
  const index = await loadParkIndex();
  const keys = new Set();
  for (const dy of [-0.03, 0.03]) for (const dx of [-0.036, 0.036]) keys.add(PARK_CELL(place.lat + dy, place.lng + dx));
  const lots = await Promise.all([...keys].filter((k) => index[k]).map((k) => {
    if (!parkCells.has(k)) parkCells.set(k, fetch(`data/parking/${k}.json`).then((r) => (r.ok ? r.json() : { lots: [] })).then((j) => j.lots || []).catch(() => { parkCells.delete(k); return []; }));
    return parkCells.get(k);
  }));
  return lots.flat();
}

const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
/** 주차장 한 곳의 요금·운영 안내 글(서울시·전국 표준데이터 공통) */
export function lotFee(l) {
  if (!l.paid) return { fee: '무료 주차장', feeSub: [l.wd && l.wd !== '00:00~24:00' ? `운영 ${l.wd}` : '', l.n ? `${l.n}면` : ''].filter(Boolean).join(' · ') };
  const fee = l.base
    ? [`기본 ${l.base[1]}분 ${won(l.base[0])}`, l.add ? `추가 ${l.add[1]}분당 ${won(l.add[0])}` : '', l.day ? `하루 최대 ${won(l.day)}` : ''].filter(Boolean).join(' · ')
    : '유료 (요금은 현장 확인)';
  const free = [l.satFree ? '토요일 무료' : '', l.holFree ? '공휴일 무료' : ''].filter(Boolean).join('·');
  const hours = l.wd === '00:00~24:00' ? '24시간' : l.wd ? `평일 ${l.wd}` : '';
  return { fee, feeSub: [free, hours, l.n ? `${l.n}면` : ''].filter(Boolean).join(' · ') };
}

/** 카카오 주차장 목록(kakaoRows)에 서울 주차장의 요금을 붙이고, 카카오에 없는 서울 주차장도 후보에 넣는다. */
async function mergeSeoulParking(place, kakaoRows) {
  const pool = [...(inSeoul(place) ? await loadSeoulLots() : []), ...(await loadStdLots(place))];
  const lots = pool
    .map((l) => ({ l, km: haversineKm(place, l) }))
    .filter((x) => x.km <= 2)
    .sort((a, b) => a.km - b.km)
    .slice(0, 25);
  if (!lots.length) return kakaoRows;
  const used = new Set();
  const merged = kakaoRows.map((k) => {
    // 같은 자리(100m 안, 이름 앞부분이 같으면 300m 안)에 서울 주차장이 있으면 요금을 붙인다.
    // 이름은 네이버에도 등록된 카카오 이름을 그대로 쓴다.
    const core = (n) => String(n).replace(/\(.*?\)|공영|주차장|노상|노외|평면|건물|지하|\s/g, '').slice(0, 4);
    const near = lots.find((x) => {
      if (used.has(x.l.id)) return false;
      const d = haversineKm(k, x.l);
      return d <= 0.1 || (d <= 0.3 && core(k.name).length >= 3 && core(k.name) === core(x.l.name));
    });
    if (!near) return k;
    used.add(near.l.id);
    return { ...k, ...lotFee(near.l), pub: near.l.pub !== false };
  });
  for (const { l, km } of lots) {
    if (used.has(l.id)) continue;
    merged.push({
      id: `s-${l.id}`, name: l.name, nq: l.name.replace(/\((구|신)\)$/, '').trim(),
      lat: l.lat, lng: l.lng, type: `${l.kind === '노상' ? '노상' : '노외'} ${l.pub === false ? '민영' : '공영'}주차장`, addr: /^(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)/.test(l.addr) ? l.addr : `서울 ${l.addr}`,
      rating: null, reviews: 0, km, ...lotFee(l), pub: l.pub !== false,
    });
  }
  return merged;
}

/** 근처 주차장: 카카오 주차장 + 서울 주차장(요금), 가까운 순(공영·장소 이름이 든 곳은 500m 앞) 5곳 */
async function viaParking(place) {
  let kakaoRows = [];
  try { kakaoRows = await viaKakao(place, 'park', 15); } catch (e) { /* 서울 자료만으로 보여 줄 수도 있다 */ }
  const rows = await mergeSeoulParking(place, kakaoRows);
  if (!rows.length) throw new Error('park');
  const key = place.name.replace(/\s*\(.*?\)\s*/g, ' ').trim().split(/[\s·]/)[0];
  const rank = (s) => s.km * 1000 - (s.pub || /공영/.test(s.type) || (key && s.name.includes(key)) ? 500 : 0);
  return rows.slice().sort((a, b) => rank(a) - rank(b)).slice(0, 5);
}

async function viaKakao(place, kind, limit = 5) {
  const kakao = await loadKakao();
  const ps = new kakao.maps.services.Places();
  const { Status, SortBy } = kakao.maps.services;
  const search = (radius) => new Promise((resolve, reject) => {
    ps.categorySearch(SHOP_KINDS[kind].kakao, (data, status) => {
      if (status === Status.OK) resolve(data);
      else if (status === Status.ZERO_RESULT) resolve([]);
      else reject(new Error('kakao'));
    }, { location: new kakao.maps.LatLng(place.lat, place.lng), radius, sort: SortBy.DISTANCE, size: 15 });
  });
  const isPark = kind === 'park';
  let rows = await search(isPark ? 2000 : 3000);
  if (rows.length < 5) rows = await search(10000);
  if (isPark) {
    // 같은 이름이 겹치면 가까운 하나만, 일반 차량이 못 대는 곳은 빼고,
    // 공영주차장이거나 이름에 그 장소 이름이 들어간 곳은 500m 가까운 것처럼 앞에 둔다.
    const key = place.name.replace(/\s*\(.*?\)\s*/g, ' ').trim().split(/[\s·]/)[0];
    const seen = new Set();
    const rank = (d) => Number(d.distance) - (/공영/.test(d.category_name) || (key && d.place_name.includes(key)) ? 500 : 0);
    rows = rows
      .filter((d) => d.place_name.trim() !== '주차장' && !NOT_PARK.test(d.place_name) && !seen.has(d.place_name) && seen.add(d.place_name))
      .sort((a, b) => rank(a) - rank(b));
  }
  const brList = kind === 'food' ? await loadBlueRibbon() : [];
  const out = rows
    .filter((d) => kind !== 'cafe' || !NOT_CAFE.test(d.place_name))
    .map((d) => ({
      id: `k-${d.id}`,
      name: d.place_name,
      nq: d.place_name,
      lat: Number(d.y),
      lng: Number(d.x),
      type: (d.category_name || '').split(' > ').slice(-1)[0],
      addr: d.road_address_name || d.address_name || '',
      rating: null,
      reviews: 0,
      km: haversineKm(place, { lat: Number(d.y), lng: Number(d.x) }),
    }));
  tagBlueRibbon(out, brList);
  if (brList.length) out.sort((a, b) => Number(Boolean(b.br)) - Number(Boolean(a.br))); // 블루리본 선정을 앞으로(나머지는 가까운 순 유지)
  return out.slice(0, limit);
}

/**
 * 구글이 준 가게를 같은 자리(200m 안)의 카카오 장소와 이어서, 네이버에도 등록돼 있는 이름(nq)으로 바꾼다.
 * 구글과 네이버는 이름 표기가 달라 구글 이름으로 네이버 지도를 찾으면 "없음"이 나오는 일이 있어서다.
 * 카카오를 못 쓰거나 못 찾은 가게는 다듬어 둔 구글 이름을 그대로 쓴다.
 */
async function matchNaverNames(items, kind) {
  const kakao = await loadKakao();
  const ps = new kakao.maps.services.Places();
  const { Status, SortBy } = kakao.maps.services;
  await Promise.all(items.map((s) => new Promise((resolve) => {
    try {
      ps.keywordSearch(s.name, (data, status) => {
        const hit = status === Status.OK ? data.find((d) => Number(d.distance) <= 200) : null;
        if (hit) s.nq = hit.place_name;
        resolve();
      }, { location: new kakao.maps.LatLng(s.lat, s.lng), radius: 200, sort: SortBy.ACCURACY, size: 3, category_group_code: SHOP_KINDS[kind].kakao });
    } catch (e) {
      resolve();
    }
  })));
}

/**
 * @param {{lat:number,lng:number}} place 기준 장소
 * @param {'food'|'cafe'} kind
 * @returns {Promise<{items: Array<{name,type,addr,rating,reviews,km}>, source: 'google'|'kakao'}>}
 */
export async function findShops(place, kind) {
  if (!SHOP_KINDS[kind]) throw new Error('kind');
  if (kind === 'park') {
    const items = await viaParking(place);
    return { items, source: 'kakao', fees: items.some((s) => s.fee) };
  }
  if (GOOGLE_PLACES_KEY && SHOP_KINDS[kind].google) {
    try {
      const items = await viaGoogle(place, kind);
      // 이름 맞추기는 덤이라, 오래 걸리거나 실패해도 결과는 그대로 보여 준다(4초까지만 기다림).
      await Promise.race([matchNaverNames(items, kind).catch(() => {}), new Promise((r) => setTimeout(r, 4000))]);
      return { items, source: 'google' };
    } catch {
      // 아래 카카오로 넘어간다
    }
  }
  return { items: await viaKakao(place, kind), source: 'kakao' };
}
