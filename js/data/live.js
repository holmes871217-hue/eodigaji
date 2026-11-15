// 실제 데이터 불러오기. tools/collect.mjs 가 만든 data/places.json, data/events.json 을 읽어
// 연습용 숫자를 실제 값으로 바꾼다. 파일이 없거나 못 읽으면 연습용 데이터 그대로 동작한다.

import { PLACES, LOCAL_BASE, spotToPlace } from './places.js';
import { setCityTours } from './citytour.js';
import { setLivePhotos, addLivePhotos, setLivePhotoLists, addLivePhotoLists, addLiveSources } from './photos.js';
import { haversineKm } from '../core/geo.js';

async function getJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

/** @returns {Promise<{updatedAt: string|null, events: Array|null}>} */
export async function loadLive() {
  const [placesRes, eventsRes] = await Promise.allSettled([getJson('data/places.json'), getJson('data/events.json')]);
  let updatedAt = null;

  if (placesRes.status === 'fulfilled') {
    const rows = placesRes.value.places || {};
    const photos = {};
    const lists = {};
    for (const p of PLACES) {
      const r = rows[p.id];
      if (!r) continue;
      if (r.interest) p.interest = { ...p.interest, ...r.interest };
      else if (p.local && typeof r.yearly === 'number') {
        // 전국 소소한 곳: 성별·연령대 모양은 분류 기본값, 크기는 네이버 1년 인기로 맞춘다.
        const k = r.yearly / LOCAL_BASE;
        for (const key of Object.keys(p.interest)) p.interest[key] = Math.min(100, Math.round(p.interest[key] * k));
      }
      if (typeof r.yearly === 'number') p.yearly = r.yearly;
      if (typeof r.trend === 'number') p.trend = r.trend;
      if (typeof r.buzz === 'number') p.buzz = r.buzz;
      if (r.overview) p.overview = r.overview;
      if (r.parking) p.parking = r.parking;
      if (r.parkingFee) p.parkingFee = r.parkingFee;
      if (r.photo) photos[p.id] = r.photo;
      if (Array.isArray(r.photos) && r.photos.length) lists[p.id] = r.photos;
      if (r.interest || (p.local && typeof r.yearly === 'number')) p.sample = false;
    }
    setLivePhotos(photos);
    setLivePhotoLists(lists);
    updatedAt = placesRes.value.updatedAt || null;
  }

  // 카카오로 모은 전국 동네 장소: 이미 있는 장소에서 300m 안이면 겹치는 곳으로 보고 뺀다.
  try {
    const { spots = [] } = await getJson('data/spots.json');
    const known = PLACES.slice();
    const photos = {};
    const lists = {};
    const sources = {};
    for (const s of spots) {
      if (PLACES.some((p) => p.id === s.id)) continue;
      if (/예정|폐업|휴업|임시휴관|공사중/.test(s.name)) continue;
      // 네이버 검색량이 거의 0인 곳(1년 인기 10점 미만)은 "남산케이블카 운전실"처럼 장소라기보다 건물 일부인 경우가 많아 뺀다.
      // 단, 사용자가 꼭 넣어 달라고 한 곳(must)·지자체 표준데이터 명소·팝업은 남긴다.
      if (typeof s.yearly === 'number' && s.yearly < 10 && !s.must && !s.std && !s.popup) continue;
      if (known.some((p) => Math.abs(p.lat - s.lat) < 0.004 && Math.abs(p.lng - s.lng) < 0.005 && haversineKm(p, s) < 0.3)) continue;
      PLACES.push(spotToPlace(s));
      if (s.photo) photos[s.id] = s.photo;
      else if ((s.pk || s.wp)?.src) { const e = s.pk || s.wp; photos[s.id] = e.src; sources[s.id] = { page: e.page, label: e.label || '위키백과' }; }
      if (Array.isArray(s.photos) && s.photos.length) lists[s.id] = s.photos;
    }
    addLivePhotos(photos);
    addLiveSources(sources);
    addLivePhotoLists(lists);
  } catch {
    // 파일이 없으면 기존 장소만 쓴다.
  }

  // 시·군·구별 시티투어 안내(없으면 안내만 안 나온다)
  try {
    setCityTours((await getJson('data/citytour.json')).tours);
  } catch {
    // 파일이 없으면 시티투어 안내만 빠진다.
  }

  let events = null;
  if (eventsRes.status === 'fulfilled' && Array.isArray(eventsRes.value.events)) {
    events = eventsRes.value.events.map((e) => ({ ...e, sample: false }));
    updatedAt = updatedAt || eventsRes.value.updatedAt || null;
  }
  return { updatedAt, events };
}
