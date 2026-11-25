// 해외 골프 숙소 보강: 공항과 골프장 사이(가운데 지점) 숙소를 구글 장소 검색(Places API New, Nearby Search)으로 모은다.
// 부킹닷컴 저장본(hotels.json)은 도시별 30곳씩이라 공항~골프장 사이 지역이 비어 있어서 그 자리를 채운다.
//  - 골프장마다 "공항과 골프장 가운데 지점"을 구하고, 약 11km 칸(위도·경도 0.1도)으로 묶어 같은 칸은 한 번만 찾는다.
//  - 한 번 찾은 칸은 저장해 두고 다시 찾지 않는다(새 골프장이 생긴 칸만 찾음).
//  - 비용 보호: 한 번 실행에 최대 STAYS_MAX_CALLS(기본 300)번만 부른다.
//  - 평점 4.0 이상 · 후기 30개 이상 숙소만 남긴다.
// 실행: GOOGLE_PLACES_SERVER_KEY=… node tools/golf/stays-google.mjs   → tools/golf/data/hotels-google.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIRPORTS, haversineKm } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/golf/data/hotels-google.json');
const KEY = process.env.GOOGLE_PLACES_SERVER_KEY;
const MAX = Number(process.env.STAYS_MAX_CALLS || 300);
const log = (...a) => console.log(...a);
if (!KEY) { log('GOOGLE_PLACES_SERVER_KEY 없음 → 건너뜀'); process.exit(0); }

const golf = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/data/golf.json'), 'utf8'));
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { cells: {}, hotels: {} };
const airport = Object.fromEntries(AIRPORTS.map((a) => [a.iata, a]));

// 가운데 지점 칸 모으기
const cells = new Map();
for (const c of golf.courses || []) {
  const a = airport[c.air?.iata];
  if (!a || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
  const mid = { lat: (a.lat + c.lat) / 2, lng: (a.lng + c.lng) / 2 };
  const key = `${mid.lat.toFixed(1)},${mid.lng.toFixed(1)}`;
  const span = haversineKm(a, c);
  // 찾는 반경: 공항~골프장 거리의 1/4 (최소 8km, 최대 30km)
  const radius = Math.round(Math.min(30, Math.max(8, span / 4)) * 1000);
  const e = cells.get(key);
  if (!e || radius > e.radius) cells.set(key, { ...mid, radius });
}
const todo = [...cells.entries()].filter(([k]) => !prev.cells[k]);
log(`가운데 지점 칸 ${cells.size}개, 새로 찾을 칸 ${todo.length}개 (이번에 최대 ${MAX}개)`);

let calls = 0, added = 0, errors = 0;
for (const [k, m] of todo.slice(0, MAX)) {
  calls++;
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.shortFormattedAddress,places.primaryType',
      },
      body: JSON.stringify({
        includedTypes: ['hotel', 'resort_hotel'],
        maxResultCount: 20,
        rankPreference: 'POPULARITY',
        languageCode: 'ko',
        locationRestriction: { circle: { center: { latitude: m.lat, longitude: m.lng }, radius: m.radius } },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json();
    if (!r.ok) { errors++; log('구글 장소 실패', k, r.status, JSON.stringify(j).slice(0, 200)); if (r.status === 403 || r.status === 400) break; continue; }
    for (const p of j.places || []) {
      if (!(p.rating >= 4.0) || !(p.userRatingCount >= 30) || !p.location) continue;
      if (!prev.hotels[p.id]) added++;
      prev.hotels[p.id] = { n: p.displayName?.text || '', lat: p.location.latitude, lng: p.location.longitude, r: p.rating, c: p.userRatingCount, u: p.googleMapsUri || '', loc: p.shortFormattedAddress || '' };
    }
    prev.cells[k] = new Date().toISOString().slice(0, 10);
  } catch (e) { errors++; log('구글 장소 오류', k, e.message); }
  await new Promise((r) => setTimeout(r, 120));
}
prev.source = '구글 장소 검색(Places API New, Nearby Search: hotel·resort_hotel, 인기순 20곳, 평점 4.0↑·후기 30↑)';
prev.collectedAt = new Date().toISOString();
fs.writeFileSync(OUT, JSON.stringify(prev, null, 1));
log(`구글 숙소: 호출 ${calls}번, 오류 ${errors}, 새 숙소 ${added}곳, 전체 ${Object.keys(prev.hotels).length}곳, 남은 칸 ${Math.max(0, todo.length - calls)}개`);
