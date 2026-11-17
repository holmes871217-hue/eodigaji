// 장소 정보 신뢰도 메타(E 항목): 모든 동네 장소(app/data/spots.json)에 출처·최초 발견일·최근 확인일·확인 여부를 붙인다.
// 기존 필드는 건드리지 않고 "m" 필드 하나만 덧붙인다(앱이 장소 상세 창에서 "정보 신뢰도"로 보여 준다).
//   m = { s: 출처 글자들, f: 최초 발견일(YYYY-MM-DD), c: 최근 확인일, v: 확인 여부 비트(1 사진, 2 주차, 4 영업시간) }
//   출처 글자: k 카카오 지도 · g 공공데이터포털 · t 관광공사 · d 블로그 발굴 · p 팝업(블로그 화제) · m 직접 지정 · n 네이버 검색량 · w 위키백과 사진 · o 포토코리아 사진
// 최초 발견일은 spots.json 이 다시 만들어져도 잃지 않도록 app/data/first-seen.json({ id: 날짜 })에 따로 기록한다.
// 이 기능을 켠 날(BASELINE) 이전부터 있던 장소는 정확한 최초 발견일을 알 수 없어, 앱이 "기록 시작 이전부터"로 표시한다.
// 영업시간(비트 4)은 아직 어떤 출처에서도 받지 않으므로 전부 0(미확인)이다. 값이 생기는 출처가 연결되면 여기서 올린다.
//
// 사용: node tools/stamp-meta.mjs   (여러 번 돌려도 결과가 같다. 매일 수집·주간 발굴의 점검 단계 앞에서 실행)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SPOTS = `${ROOT}app/data/spots.json`;
const FIRST = `${ROOT}app/data/first-seen.json`;
export const BASELINE = '2026-11-17';

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
const day = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '');

export function metaOf(s, firstDate) {
  let src = '';
  if (s.url || String(s.id).startsWith('k-')) src += 'k';
  if (s.std) src += 'g';
  if (s.kto) src += 't';
  if (s.disc) src += 'd';
  if (s.popup) src += 'p';
  if (s.must) src += 'm';
  if (typeof s.yearly === 'number') src += 'n';
  if (s.wp) src += 'w';
  if (s.pk) src += 'o';
  // 최근 확인일: 이 장소에 대해 어떤 출처든 마지막으로 확인(검색·조회)한 날
  const stamps = [s.disc?.at, s.yAt, s.ktoAt, s.introAt, s.photosAt, s.pkAt, s.wpAt].map(day).filter(Boolean);
  const c = stamps.length ? stamps.sort().at(-1) : firstDate;
  const hasPhoto = Boolean(s.photo || s.pk || s.wp || (s.photos && s.photos.length));
  return { s: src, f: firstDate, c, v: (hasPhoto ? 1 : 0) | (s.parking || s.parkingFee ? 2 : 0) /* 영업시간(4)은 아직 받는 곳이 없어 항상 0 */ };
}

export function stamp(data, first) {
  let added = 0;
  for (const s of data.spots) {
    if (!first[s.id]) { first[s.id] = today > BASELINE ? today : BASELINE; added++; }
    s.m = metaOf(s, first[s.id]);
  }
  return added;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const data = JSON.parse(readFileSync(SPOTS, 'utf8'));
  const first = existsSync(FIRST) ? JSON.parse(readFileSync(FIRST, 'utf8')) : {};
  const had = Object.keys(first).length;
  // 처음 켜는 날에는 모두 기준일로 기록하고(정확한 최초 발견일 모름), 그 뒤 새로 생긴 장소는 그 날짜로 기록한다.
  const added = stamp(data, first);
  // 목록에서 사라진 지 오래된 id 는 정리한다(파일이 끝없이 커지지 않게): 지금 목록에 있는 id 만 남긴다.
  const live = new Set(data.spots.map((s) => s.id));
  for (const id of Object.keys(first)) if (!live.has(id)) delete first[id];
  writeFileSync(SPOTS, JSON.stringify(data));
  writeFileSync(FIRST, JSON.stringify(first));
  const stale = data.spots.filter((s) => (Date.parse(today) - Date.parse(s.m.c)) / 86400000 > 45).length;
  const noPhoto = data.spots.filter((s) => !(s.m.v & 1)).length;
  console.log(`장소 ${data.spots.length}곳에 신뢰도 메타 기록 (새로 기록 ${added}곳, 기존 ${had}곳) · 45일 넘게 확인 안 된 곳 ${stale}곳 · 사진 없음 ${noPhoto}곳`);
}
