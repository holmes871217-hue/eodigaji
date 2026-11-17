// 장소 정보 신뢰도 상자(E 항목): 출처·최초 발견일·최근 확인일·확인 여부를 보여 준다.
// 동네 장소는 수집기(tools/stamp-meta.mjs)가 붙인 메타(place.meta)를 쓰고, 직접 고른 장소는 아는 범위만 보여 준다.
// 확인되지 않은 것은 "미확인"으로 적는다(없는 정보를 지어내지 않는다).
import { esc } from './util.js';

const SRC = { k: '카카오 지도', g: '공공데이터포털', t: '한국관광공사', d: '블로그 발굴', p: '팝업(블로그 화제)', m: '직접 지정', n: '네이버 검색량', w: '위키백과 사진', o: '포토코리아 사진' };
const BASELINE = '2026-11-17'; // 신뢰도 기록을 시작한 날(tools/stamp-meta.mjs 의 BASELINE 과 같아야 한다)
const STALE_DAYS = 45;

const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const daysAgo = (iso) => Math.floor((Date.now() - Date.parse(`${iso}T00:00:00+09:00`)) / 86400000);

/** 확인 여부 한 칸 */
const flag = (label, ok, note = '') => `<li class="${ok ? 'is-ok' : 'is-unknown'}"><b>${ok ? '확인' : '미확인'}</b> ${esc(label)}${note ? ` <small>${esc(note)}</small>` : ''}</li>`;

export function trustBox(p) {
  const m = p.meta;
  const estimates = `<p class="trust-est"><b>추정 값</b> 아이 적합도(분류별 기본값)·혼잡 예측(예시)은 실제 측정이 아니에요.</p>`;
  if (!m) {
    // 직접 고른 장소(메타 없음): 아는 범위만
    return `
    <section class="trust" aria-label="정보 신뢰도">
      <div class="trust-head"><b>정보 신뢰도</b></div>
      <p class="trust-line"><b>출처</b> 직접 고른 장소 · 네이버 검색 데이터 · 한국관광공사(사진·소개)</p>
      <ul class="trust-flags">${flag('영업시간', false, '가기 전에 직접 확인해 주세요')}</ul>
      ${estimates}
    </section>`;
  }
  const names = [...new Set([...(m.s || '')].map((c) => SRC[c]).filter(Boolean))];
  const age = m.c ? daysAgo(m.c) : null;
  const stale = age != null && age > STALE_DAYS;
  const first = m.f && m.f > BASELINE ? `${md(m.f)}에 처음 발견` : '기록 시작(11/17) 이전부터 있던 곳(정확한 날짜는 몰라요)';
  return `
    <section class="trust ${stale ? 'is-stale' : ''}" aria-label="정보 신뢰도">
      <div class="trust-head"><b>정보 신뢰도</b>${stale ? '<span class="trust-warn">오래된 정보</span>' : ''}</div>
      <p class="trust-line"><b>출처</b> ${names.length ? esc(names.join(' · ')) : '<span class="trust-warn">출처 불분명</span>'}</p>
      <p class="trust-line"><b>최근 확인</b> ${m.c ? `${md(m.c)}${age != null && age >= 0 ? ` (${age === 0 ? '오늘' : `${age}일 전`})` : ''}` : '미확인'}${stale ? ` — ${STALE_DAYS}일 넘게 확인되지 않았어요` : ''}</p>
      <p class="trust-line"><b>최초 발견</b> ${esc(first)}</p>
      <ul class="trust-flags">
        ${flag('사진', m.v & 1)}${flag('주차 정보', m.v & 2)}${flag('영업시간', m.v & 4, m.v & 4 ? '' : '가기 전에 직접 확인해 주세요')}
      </ul>
      ${estimates}
    </section>`;
}
