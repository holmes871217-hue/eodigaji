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
  // [id, 이름, 위도, 경도, 평점(10점), 후기 수, 성급, 1박 가격, 부킹 주소 뒷부분(나라/페이지), 사진, 지역]
  const hotels = Object.entries(src.hotels || {})
    .filter(([, h]) => Number.isFinite(h.lat) && Number.isFinite(h.lng) && h.s && h.c >= 30)
    .map(([id, h]) => [id, h.n, r5(h.lat), r5(h.lng), h.s, h.c, h.st || 0, h.p || 0, `${h.cc}/${h.pg}`, h.ph || '', h.loc || '']);
  const airports = Object.fromEntries(AIRPORTS.map((a) => [a.iata, [a.name, a.lat, a.lng]]));
  const out = { v: 1, at: src.collectedAt || null, checkin: src.checkin || null, airports, hotels };
  fs.writeFileSync(path.join(ROOT, 'app/data/golf-stays.json'), JSON.stringify(out));
  return hotels.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log(`숙소 ${buildStays()}곳 → app/data/golf-stays.json`);
}
