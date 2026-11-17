// 장소 정보 신뢰도 상자(E 항목): 출처·최초 발견일·최근 확인일·확인 여부를 보여 준다.
// 동네 장소는 수집기(tools/stamp-meta.mjs)가 붙인 메타(place.meta)를 쓰고, 직접 고른 장소는 아는 범위만 보여 준다.
// 확인되지 않은 것은 "미확인"으로 적는다(없는 정보를 지어내지 않는다).
const SRC = { k: '카카오 지도', g: '공공데이터포털', t: '한국관광공사', d: '블로그 발굴', p: '팝업(블로그 화제)', m: '직접 지정', n: '네이버 검색량', w: '위키백과 사진', o: '포토코리아 사진' };
const STALE_DAYS = 45;

const daysAgo = (iso) => Math.floor((Date.now() - Date.parse(`${iso}T00:00:00+09:00`)) / 86400000);

/**
 * 정보 신뢰도 표시(2026-11-17 사용자 요청으로 축소): 평소에는 아무것도 보여 주지 않고,
 * 주의가 필요할 때만(45일 넘게 확인 안 됨 · 출처 불분명) 한 줄 경고를 보여 준다.
 * 출처·최초 발견일·확인 여부 같은 자세한 정보는 데이터(place.meta)에는 계속 쌓아 두고 화면에는 내지 않는다.
 */
export function trustBox(p) {
  const m = p.meta;
  if (!m) return '';
  const names = [...new Set([...(m.s || '')].map((c) => SRC[c]).filter(Boolean))];
  const age = m.c ? daysAgo(m.c) : null;
  const stale = age != null && age > STALE_DAYS;
  if (!stale && names.length) return '';
  return `<p class="trust-note" role="note">${stale ? `⚠ ${STALE_DAYS}일 넘게 확인되지 않은 정보예요. 가기 전에 확인해 주세요.` : '⚠ 출처가 불분명한 정보예요. 가기 전에 확인해 주세요.'}</p>`;
}
