// 거리와 이동시간 계산.
// 지금은 직선거리에 "도심 혼잡 보정"을 더해 운전 시간을 추정한다.
// 3단계에서 카카오모빌리티 길찾기(실제 도로·교통 반영)로 교체 예정 — 그때 이 파일만 바꾸면 된다.

export function haversineKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 도심 혼잡 구역: 중심에서 r1(km) 안이면 p1분, r2 안이면 p2분을 더한다(출발·도착 각각).
const DENSE = [
  { lat: 37.5665, lng: 126.978, r1: 12, p1: 7, r2: 25, p2: 4 }, // 서울
  { lat: 35.1796, lng: 129.0756, r1: 10, p1: 6, r2: 18, p2: 3 }, // 부산
  { lat: 37.4563, lng: 126.7052, r1: 8, p1: 4, r2: 0, p2: 0 }, // 인천
  { lat: 35.8714, lng: 128.6014, r1: 8, p1: 4, r2: 0, p2: 0 }, // 대구
  { lat: 36.3504, lng: 127.3845, r1: 7, p1: 3, r2: 0, p2: 0 }, // 대전
  { lat: 35.1595, lng: 126.8526, r1: 7, p1: 3, r2: 0, p2: 0 }, // 광주
  { lat: 37.2636, lng: 127.0286, r1: 6, p1: 3, r2: 0, p2: 0 }, // 수원
];

function cityDelay(p) {
  let d = 0;
  for (const c of DENSE) {
    const km = haversineKm(p, c);
    if (km <= c.r1) d = Math.max(d, c.p1);
    else if (c.r2 && km <= c.r2) d = Math.max(d, c.p2);
  }
  return d;
}

/**
 * 두 지점 사이 예상 운전 시간.
 * 도로는 직선보다 약 35% 길다고 보고, 가까운 거리는 시내 주행(느림), 먼 거리는 고속도로(빠름)로 가정.
 * 도심 안에서 출발하거나 도착하면 혼잡 시간을 더한다.
 * @returns {{km:number, min:number}}
 */
export function driveEstimate(a, b) {
  const km = haversineKm(a, b);
  const road = km * 1.35;
  const speed = road < 20 ? 30 : road < 60 ? 52 : road < 150 ? 72 : 82;
  const scale = Math.min(1, road / 8); // 아주 가까운 곳은 혼잡 보정을 줄인다
  const min = Math.round((road / speed) * 60 + 4 + (cityDelay(a) + cityDelay(b)) * scale);
  return { km, min };
}

/** 예: 85 → '1시간 25분' */
export function formatMin(min) {
  const m = Math.max(5, Math.round(min / 5) * 5);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}시간 ${r}분` : `${h}시간`;
}

/** 1.5km 안이면 걸어서 걸리는 시간, 그보다 멀면 차로 걸리는 시간 */
export function tripLabel(km, min) {
  if (km <= 1.5) return `걸어서 약 ${formatMin((km * 1.3 * 60) / 4.2)}`;
  return `약 ${formatMin(min)}`;
}

/** 지도 가로 폭(픽셀)에 원하는 실제 거리(km)가 딱 들어오는 확대 단계(줌 레벨)를 계산한다. */
export function zoomForKm(lat, widthPx, km = 10) {
  const metersPerPixelAtZoom0 = 156543.03392 * Math.cos((lat * Math.PI) / 180);
  return Math.log2((metersPerPixelAtZoom0 * Math.max(widthPx, 1)) / (km * 1000));
}

// 지도를 빠르게 옮길 때 쓰는 주요 도시(검색 위치 "선택지"가 아니라 지도 이동용)
export const CITIES = [
  { name: '서울', lat: 37.5665, lng: 126.978 },
  { name: '인천', lat: 37.4563, lng: 126.7052 },
  { name: '수원', lat: 37.2696, lng: 126.9547 },
  { name: '성남', lat: 37.42, lng: 127.1267 },
  { name: '고양', lat: 37.6584, lng: 126.832 },
  { name: '용인', lat: 37.2411, lng: 127.1776 },
  { name: '안산', lat: 37.3204, lng: 126.8454 },
  { name: '오산', lat: 37.1307, lng: 127.0809 },
  { name: '평택', lat: 37.0009, lng: 127.1008 },
  { name: '춘천', lat: 37.8813, lng: 127.7298 },
  { name: '강릉', lat: 37.7519, lng: 128.8761 },
  { name: '청주', lat: 36.6424, lng: 127.489 },
  { name: '천안', lat: 36.8151, lng: 127.1139 },
  { name: '세종', lat: 36.48, lng: 127.289 },
  { name: '대전', lat: 36.3504, lng: 127.3845 },
  { name: '전주', lat: 35.8242, lng: 127.148 },
  { name: '광주', lat: 35.1595, lng: 126.8526 },
  { name: '김천', lat: 36.1398, lng: 128.1136 },
  { name: '대구', lat: 35.8714, lng: 128.6014 },
  { name: '포항', lat: 36.019, lng: 129.3435 },
  { name: '울산', lat: 35.5384, lng: 129.3114 },
  { name: '창원', lat: 35.228, lng: 128.6811 },
  { name: '부산', lat: 35.1796, lng: 129.0756 },
];
