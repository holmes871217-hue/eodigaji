// 주요 검색 위치를 글자로 찾기.
// 1순위: 카카오 장소 검색(카카오 지도 JavaScript SDK의 services 라이브러리)
// 카카오를 못 쓰면(인터넷 끊김·키 문제) 앱 안의 도시·장소 이름에서 찾는다.
import { KAKAO_JS_KEY } from '../config.js';
import { CITIES } from './geo.js';
import { PLACES } from '../data/places.js';

let loading = null;

function loadKakao() {
  if (window.kakao?.maps?.services) return Promise.resolve(window.kakao);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_JS_KEY)}&libraries=services&autoload=false`;
    s.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
    s.onerror = () => { loading = null; reject(new Error('카카오 지도를 불러오지 못했어요')); };
    document.head.appendChild(s);
  });
  return loading;
}

function kakaoSearch(kakao, query) {
  const ps = new kakao.maps.services.Places();
  const geocoder = new kakao.maps.services.Geocoder();
  const OK = kakao.maps.services.Status.OK;
  const places = new Promise((res) => ps.keywordSearch(query, (data, status) => res(status === OK ? data : []), { size: 10 }));
  const addrs = new Promise((res) => geocoder.addressSearch(query, (data, status) => res(status === OK ? data : []), { size: 3 }));
  return Promise.all([addrs, places]).then(([a, p]) => [
    ...a.map((d) => ({ name: d.address_name, addr: '주소', lat: Number(d.y), lng: Number(d.x) })),
    ...p.map((d) => ({ name: d.place_name, addr: d.road_address_name || d.address_name, lat: Number(d.y), lng: Number(d.x) })),
  ]);
}

function localSearch(query) {
  const q = query.replace(/\s+/g, '');
  const hit = (s) => s.replace(/\s+/g, '').includes(q);
  return [
    ...CITIES.filter((c) => hit(c.name)).map((c) => ({ name: c.name, addr: '도시', lat: c.lat, lng: c.lng })),
    ...PLACES.filter((p) => hit(p.name) || hit(p.region)).map((p) => ({ name: p.name, addr: p.region, lat: p.lat, lng: p.lng })),
  ].slice(0, 10);
}

// 2순위: 오픈스트리트맵 장소 검색(Nominatim). 키가 필요 없고 무료지만 작은 가게까지는 잘 안 나온다.
async function osmSearch(query) {
  const u = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: 'jsonv2', countrycodes: 'kr', 'accept-language': 'ko', limit: '8' })}`;
  const res = await fetch(u);
  if (!res.ok) throw new Error(`osm ${res.status}`);
  const rows = await res.json();
  return rows.map((r) => {
    const parts = r.display_name.split(',').map((s) => s.trim()).filter((s) => s && s !== '대한민국' && !/^\d{5}$/.test(s));
    return { name: r.name || parts[0], addr: parts.slice(1).reverse().slice(0, 3).join(' '), lat: Number(r.lat), lng: Number(r.lon) };
  });
}

let kakaoDownUntil = 0; // 카카오가 실패하면 5분 동안은 바로 다음 방법으로

/** @returns {Promise<{results: Array<{name,addr,lat,lng}>, source: 'kakao'|'osm'|'local'}>} */
export async function searchLocation(query) {
  const q = query.trim();
  if (!q) return { results: [], source: 'local' };
  if (Date.now() > kakaoDownUntil) {
    try {
      const kakao = await loadKakao();
      return { results: (await kakaoSearch(kakao, q)).slice(0, 10), source: 'kakao' };
    } catch {
      kakaoDownUntil = Date.now() + 5 * 60000;
    }
  }
  const local = localSearch(q);
  try {
    const osm = await osmSearch(q);
    // 같은 이름이 1km 안에 여러 번 나오면(역 출입구 등) 하나만 남긴다.
    const seen = new Set();
    const merged = [...local.slice(0, 3), ...osm].filter((r) => {
      const key = `${r.name}|${r.lat.toFixed(2)}|${r.lng.toFixed(2)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { results: merged.slice(0, 10), source: 'osm' };
  } catch {
    return { results: local, source: 'local' };
  }
}
