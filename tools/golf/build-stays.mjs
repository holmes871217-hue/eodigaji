// 해외 골프 숙소 추천용 자료: 숙소 전체(부킹닷컴 조회 저장본)와 공항 좌표를 작게 줄여 앱에 내보낸다.
// 앱은 찜한 골프장 + 공항 좌표로 후보 숙소를 고르고, 길찾기(차 이동 시간)로 "모두 비슷한 시간에 닿는" 숙소를 고른다.
// 실행: node tools/golf/build-stays.mjs  (collect.mjs 끝에서도 부른다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIRPORTS } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function buildStays() {
  const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/golf/data/hotels.json'), 'utf8'));
  const r5 = (x) => Math.round(x * 1e5) / 1e5;
  // [id, 이름, 위도, 경도, 평점(10점), 후기 수, 성급, 1박 가격, 부킹 주소 뒷부분(나라/페이지) 또는 구글 지도 주소, 사진, 지역, 출처('g' = 구글)]
  const hotels = Object.entries(src.hotels || {})
    .filter(([, h]) => Number.isFinite(h.lat) && Number.isFinite(h.lng) && h.s && h.c >= 30)
    .map(([id, h]) => [id, h.n, r5(h.lat), r5(h.lng), h.s, h.c, h.st || 0, h.p || 0, `${h.cc}/${h.pg}`, h.ph || '', h.loc || '']);
  // 구글 장소 검색으로 보강한 공항~골프장 사이 숙소(stays-google.mjs). 부킹닷컴 숙소와 200m 안이면 같은 곳으로 보고 뺀다.
  // 구글 평점은 5점 만점이라 줄 세우기용 점수(s)는 ×2(10점 기준)로 맞추고, 화면에는 원래 값(5점)을 보여 준다.
  const gpath = path.join(ROOT, 'tools/golf/data/hotels-google.json');
  const goog = fs.existsSync(gpath) ? JSON.parse(fs.readFileSync(gpath, 'utf8')).hotels || {} : {};
  const near = (a, b) => Math.abs(a[2] - b.lat) < 0.002 && Math.abs(a[3] - b.lng) < 0.002;
  let gAdded = 0;
  for (const [id, h] of Object.entries(goog)) {
    if (!Number.isFinite(h.lat) || !h.r || h.c < 100) continue; // 구글은 후기 100개 이상(작은 게스트하우스 제외)
    if (/love\s*hotel|motel|hostel|guest\s*house|homestay|nhà\s*nghỉ|러브|모텔|ラブホ|民宿|모텔|여인숙/i.test(h.n)) continue; // 가족 골프 여행 숙소로 맞지 않는 곳
    if (hotels.some((x) => near(x, h))) continue;
    hotels.push([`g:${id}`, h.n, r5(h.lat), r5(h.lng), Math.round(h.r * 20) / 10, h.c, 0, 0, h.u, '', h.loc || '', 'g']);
    gAdded++;
  }
  const airports = Object.fromEntries(AIRPORTS.map((a) => [a.iata, [a.name, a.lat, a.lng]]));
  const out = { v: 1, at: src.collectedAt || null, checkin: src.checkin || null, airports, hotels };
  fs.writeFileSync(path.join(ROOT, 'app/data/golf-stays.json'), JSON.stringify(out));
  return hotels.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log(`숙소 ${buildStays()}곳 → app/data/golf-stays.json`);
}
