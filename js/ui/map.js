// 지도. 1단계는 열쇠(API 키)가 필요 없는 공개 지도(Leaflet + OpenStreetMap)를 쓴다.
// 3단계에서 카카오맵으로 교체 예정.
//  - 추천 지도: 검색 위치를 가운데 두고, 화면 가로에 10km가 보이도록 연다.
//  - 위치 고르기 지도: 지도를 움직여 가운데 핀 위치를 고른다.

import { zoomForKm } from '../core/geo.js';

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4';
const TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const START_KM = 10; // 처음 열었을 때 화면 가로에 보이는 실제 거리

let loading = null;
let homeMap = null; // { map, origin, points }
let pickMap = null;
let favMap = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${LEAFLET}/leaflet.min.css`;
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = `${LEAFLET}/leaflet.min.js`;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('지도를 불러오지 못했어요.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

function failed(el) {
  el.innerHTML = '<div class="empty"><b>지도를 불러오지 못했어요.</b><span>인터넷 연결을 확인한 뒤 다시 눌러 주세요.</span></div>';
}

function baseMap(el) {
  const L = window.L;
  // zoomSnap: 0 → 확대 단계를 소수점까지 허용해야 "가로 정확히 10km"를 맞출 수 있다.
  const map = L.map(el, { zoomControl: true, attributionControl: true, zoomSnap: 0, zoomDelta: 1 });
  L.tileLayer(TILE, { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
  L.control.scale({ imperial: false, maxWidth: 120 }).addTo(map);
  return map;
}

// 지도가 확대·이동하는 도중에 화면이 바뀌어도 오류가 나지 않게, 움직임을 먼저 멈추고 지운다.
function destroy(map) {
  try {
    map.stop();
    map._animatingZoom = false; // 진행 중이던 확대 애니메이션의 뒷정리 호출을 무효로 만든다
    map.remove();
  } catch (e) {
    // 이미 지워진 지도는 무시
  }
}

export function unmountMaps() {
  if (homeMap) { destroy(homeMap.map); homeMap = null; }
  // 지도를 없앨 때 나오는 마지막 "움직임" 신호가 새로 정한 위치를 옛 핀 위치로 덮어쓰지 않게, 먼저 신호 연결을 끊는다.
  if (pickMap) { pickMap.off(); destroy(pickMap); pickMap = null; }
  if (favMap) { destroy(favMap); favMap = null; }
}

/** 추천 지도 */
export async function mountMap(el, { origin, rows, onPick }) {
  try {
    await loadLeaflet();
  } catch (e) {
    failed(el);
    return;
  }
  if (!el.isConnected) return; // 기다리는 사이 화면이 바뀐 경우

  const L = window.L;
  const map = baseMap(el);
  const points = [[origin.lat, origin.lng]];

  L.marker([origin.lat, origin.lng], {
    icon: L.divIcon({ className: '', html: '<span class="pin pin-me">검색 위치</span>', iconSize: [64, 28], iconAnchor: [32, 14] }),
    keyboard: false,
    zIndexOffset: 1000,
  }).addTo(map);

  rows.forEach((r) => {
    const p = r.place;
    points.push([p.lat, p.lng]);
    L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: '', html: `<span class="pin pin-${r.kind}">${r.rank}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
      title: `${r.rank}위 ${p.name}`,
    })
      .addTo(map)
      .on('click', () => onPick(p.id));
  });

  homeMap = { map, origin, points };
  resetMapView(false);
}

/** 검색 위치를 가운데 두고 가로 10km로 맞춘다. */
export function resetMapView(animate = true) {
  if (!homeMap) return;
  const { map, origin } = homeMap;
  const width = map.getSize().x;
  map.setView([origin.lat, origin.lng], zoomForKm(origin.lat, width, START_KM), { animate });
}

/** 추천 핀이 모두 보이도록 넓힌다. */
export function fitMapAll() {
  if (!homeMap) return;
  const { map, points } = homeMap;
  if (points.length > 1) map.fitBounds(points, { padding: [28, 28] });
}

/** 지금 지도 가로에 보이는 실제 거리(km). 검수용. */
export function mapWidthKm() {
  if (!homeMap) return null;
  const { map } = homeMap;
  const y = map.getSize().y / 2;
  const a = map.containerPointToLatLng([0, y]);
  const b = map.containerPointToLatLng([map.getSize().x, y]);
  return a.distanceTo(b) / 1000;
}

/** 위치 고르기 지도: 지도를 움직이면 가운데 좌표를 onMove로 알려준다. */
export async function mountPicker(el, { center, onMove }) {
  try {
    await loadLeaflet();
  } catch (e) {
    failed(el);
    return;
  }
  if (!el.isConnected) return;

  const map = baseMap(el);
  pickMap = map;
  map.setView([center.lat, center.lng], zoomForKm(center.lat, map.getSize().x, START_KM), { animate: false });
  map.on('moveend', () => {
    const c = map.getCenter();
    onMove({ lat: c.lat, lng: c.lng });
  });
}

/** 위치 고르기 지도를 다른 지역으로 옮긴다. */
export function panPicker(lat, lng) {
  if (!pickMap) return;
  pickMap.setView([lat, lng], zoomForKm(lat, pickMap.getSize().x, START_KM), { animate: false });
}

/** 찜 지도: 검색 위치 + 찜한 곳을 번호 핀으로 찍고, 가는 순서대로 선을 잇는다. */
export async function mountRoute(el, { origin, points }) {
  try {
    await loadLeaflet();
  } catch (e) {
    failed(el);
    return;
  }
  if (!el.isConnected) return;

  const L = window.L;
  const map = baseMap(el);
  favMap = map;

  L.marker([origin.lat, origin.lng], {
    icon: L.divIcon({ className: '', html: '<span class="pin pin-me">검색 위치</span>', iconSize: [64, 28], iconAnchor: [32, 14] }),
    keyboard: false,
  }).addTo(map);

  const line = points.map((p) => [p.lat, p.lng]);
  if (line.length > 1) L.polyline(line, { color: '#f0326b', weight: 4, opacity: 0.85, dashArray: '2 9', lineCap: 'round' }).addTo(map);
  points.forEach((p, i) => {
    const label = document.createElement('b');
    label.textContent = `${i + 1}. ${p.name}`; // 글자로만 넣는다(이름에 기호가 있어도 안전하게)
    L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: '', html: `<span class="pin pin-fav">${i + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
      title: `${i + 1}. ${p.name}`,
      zIndexOffset: 1000 - i,
    }).addTo(map).bindPopup(label);
  });

  if (line.length > 1) map.fitBounds(line, { padding: [34, 34], animate: false, maxZoom: 15 });
  else if (line.length === 1) map.setView(line[0], zoomForKm(line[0][0], map.getSize().x, START_KM), { animate: false });
  else map.setView([origin.lat, origin.lng], zoomForKm(origin.lat, map.getSize().x, START_KM), { animate: false });
}
