// 사진이 없거나 한 장뿐인 장소에 구글 지도 사진을 실시간으로 붙인다.
// 구글 약관상 사진 주소·내용을 저장해 두면 안 되므로(장소 번호만 저장 가능) 파일에 적지 않고,
// 상세 창을 열 때마다 불러온다. 앱을 켜 둔 동안의 메모리에만 기억한다.
// 사진 주소에는 키가 들어가는데, 이 키는 웹사이트(HTTP 리퍼러)·API 제한이 걸려 있어 게시된 주소에서만 동작한다.
import { GOOGLE_PLACES_KEY } from '../config.js';
import { haversineKm } from './geo.js';

const MAX_PHOTOS = 6;
const norm = (s) => String(s || '').replace(/[\s·()\-_/]/g, '').toLowerCase();

/** 구글이 찾은 가게(후보) 가운데 이 장소와 같은 곳을 고른다: 이름이 서로 겹치거나 150m 안. */
function pickSame(place, rows) {
  const a = norm(place.name);
  const scored = rows
    .filter((r) => r.location && r.photos?.length)
    .map((r) => {
      const km = haversineKm(place, { lat: r.location.latitude, lng: r.location.longitude });
      const b = norm(r.displayName?.text);
      const nameHit = a && b && (a.includes(b) || b.includes(a));
      return { r, km, ok: km <= 1.5 && (nameHit || km <= 0.15) };
    })
    .filter((x) => x.ok)
    .sort((x, y) => x.km - y.km);
  return scored[0]?.r || null;
}

async function fetchPhotos(place) {
  if (!GOOGLE_PLACES_KEY) return [];
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.photos',
    },
    body: JSON.stringify({
      textQuery: place.name,
      languageCode: 'ko',
      regionCode: 'KR',
      maxResultCount: 5,
      locationBias: { circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 500 } },
    }),
  });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const hit = pickSame(place, (await res.json()).places || []);
  if (!hit) return [];
  return hit.photos.slice(0, MAX_PHOTOS).map((ph) => ({
    src: `https://places.googleapis.com/v1/${ph.name}/media?maxWidthPx=900&key=${GOOGLE_PLACES_KEY}`,
    by: ph.authorAttributions?.[0]?.displayName || '',
  }));
}

// 같은 장소를 카드와 상세 창이 따로 부르지 않도록 앱을 켜 둔 동안 결과(또는 진행 중인 요청)를 기억한다. 파일에는 저장하지 않는다.
const memo = new Map();
/** @returns {Promise<Array<{src:string, by:string}>>} 실패해도 빈 목록으로 끝난다 */
export function findGooglePhotos(place) {
  if (!memo.has(place.id)) memo.set(place.id, fetchPhotos(place).catch(() => []));
  return memo.get(place.id);
}
