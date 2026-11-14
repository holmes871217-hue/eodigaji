// 장소 근처 맛집·카페 찾기.
// 1순위: 구글 Places(평점·리뷰 수가 있음). 가깝고 평점 높은 순으로 5곳을 고른다.
// 구글을 못 쓰면(키 없음·하루 한도 초과·인터넷 문제) 카카오 장소 검색으로 가까운 순 5곳(평점 없음).
// 구글 결과는 저장해 두면 안 되므로(이용 약관) 앱을 켜 둔 동안만 기억한다.
import { GOOGLE_PLACES_KEY } from '../config.js';
import { haversineKm } from './geo.js';
import { loadKakao } from './search.js';

export const SHOP_KINDS = {
  food: { label: '맛집', icon: '🍽️', google: 'restaurant', kakao: 'FD6' },
  cafe: { label: '카페', icon: '☕', google: 'cafe', kakao: 'CE7' },
};

// 카페로 분류돼 있지만 나들이 중에 들르는 카페가 아닌 곳
const NOT_CAFE = /스터디|독서실|PC방|피시방|만화|보드게임|코인노래|스크린/i;

const FIELDS = [
  'places.id', 'places.displayName', 'places.rating', 'places.userRatingCount',
  'places.location', 'places.shortFormattedAddress', 'places.primaryTypeDisplayName',
].join(',');

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
      name: r.displayName.text,
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
function pickBest(rows) {
  const score = (r) => (r.rating == null ? 0 : (r.rating * r.reviews + 4.0 * 20) / (r.reviews + 20)) - 0.15 * r.km;
  return rows.slice().sort((a, b) => score(b) - score(a)).slice(0, 5);
}

/** 구글로 찾기. key 를 따로 주는 것은 검수용(평소에는 config.js 의 키를 쓴다). */
export async function viaGoogle(place, kind, key = GOOGLE_PLACES_KEY) {
  let rows = await googleNearby(place, kind, 3000, key);
  // 근처에 가게가 거의 없는 곳(산·바다)은 10km까지 넓혀 한 번 더 찾는다.
  if (rows.filter((r) => r.rating != null).length < 5) {
    try { rows = await googleNearby(place, kind, 10000, key); } catch { /* 처음 결과를 쓴다 */ }
  }
  return pickBest(rows);
}

async function viaKakao(place, kind) {
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
  let rows = await search(3000);
  if (rows.length < 5) rows = await search(10000);
  return rows
    .filter((d) => kind !== 'cafe' || !NOT_CAFE.test(d.place_name))
    .slice(0, 5)
    .map((d) => ({
      id: `k-${d.id}`,
      name: d.place_name,
      lat: Number(d.y),
      lng: Number(d.x),
      type: (d.category_name || '').split(' > ').slice(-1)[0],
      addr: d.road_address_name || d.address_name || '',
      rating: null,
      reviews: 0,
      km: haversineKm(place, { lat: Number(d.y), lng: Number(d.x) }),
    }));
}

/**
 * @param {{lat:number,lng:number}} place 기준 장소
 * @param {'food'|'cafe'} kind
 * @returns {Promise<{items: Array<{name,type,addr,rating,reviews,km}>, source: 'google'|'kakao'}>}
 */
export async function findShops(place, kind) {
  if (!SHOP_KINDS[kind]) throw new Error('kind');
  if (GOOGLE_PLACES_KEY) {
    try {
      return { items: await viaGoogle(place, kind), source: 'google' };
    } catch {
      // 아래 카카오로 넘어간다
    }
  }
  return { items: await viaKakao(place, kind), source: 'kakao' };
}
