// 여행 코스 창(D 항목): 시작·끝 시각과 이동수단을 고르면 시각표가 붙은 코스를 만든다.
// 출발지·날짜·동행인은 마이 탭 설정을, 취향은 마이 탭의 취향 선택을 그대로 쓴다. 영업시간은 모르면 "미확인"으로 적는다.
import { esc } from './util.js';
import { toHHMM } from '../core/course.js';
import { TASTES } from '../core/taste.js';
import { fmtLong } from '../core/dates.js';

const HOURS = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const kmin = (m) => (m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`);

function parkingNote(p) {
  const t = `${p.parking || ''} ${p.parkingFee || ''}`;
  if (!t.trim()) return '주차 미확인';
  return /불가|없음|불능/.test(p.parking || '') ? '주차 불가 안내가 있어요' : '주차 안내 있음';
}

export function courseSheet(state) {
  const cs = state.ui.course || {};
  const p = state.profile;
  const taste = [...new Set(p.members.flatMap((m) => (state.ui.taste?.mp?.[m.id] || [])))].map((v) => TASTES.find((t) => t.v === v)?.label).filter(Boolean);
  const r = cs.result;
  const form = `
    <div class="sheet-head"><div>
      <h2 class="sheet-title" id="sheet-title">여행 코스 만들기</h2>
      <p class="card-meta">${esc(p.origin.name)} 출발 · ${esc(fmtLong(p.date))} · 동행 ${p.members.length}명${taste.length ? ` · 취향 ${esc(taste.join('·'))}` : ''}</p>
    </div></div>
    <p class="muted">찜한 곳을 먼저 넣고, 시간이 남으면 추천 상위 장소를 이동시간이 짧은 순서로 이어요. 출발지·날짜·동행인·취향은 마이 탭에서 바꿀 수 있어요.</p>
    <div class="course-form">
      <label>시작 <select class="input sm" data-field="course-start">${HOURS(6, 13).map((h) => `<option value="${String(h).padStart(2, '0')}:00" ${cs.start === `${String(h).padStart(2, '0')}:00` ? 'selected' : ''}>${h}시</option>`).join('')}</select></label>
      <label>끝 <select class="input sm" data-field="course-end">${HOURS(14, 23).map((h) => `<option value="${String(h).padStart(2, '0')}:00" ${cs.end === `${String(h).padStart(2, '0')}:00` ? 'selected' : ''}>${h}시</option>`).join('')}</select></label>
      <div class="chips" role="group" aria-label="이동수단">
        <button type="button" class="chip ${cs.mode !== 'transit' ? 'is-on' : ''}" data-action="course-mode" data-v="car" aria-pressed="${cs.mode !== 'transit'}">자동차</button>
        <button type="button" class="chip ${cs.mode === 'transit' ? 'is-on' : ''}" data-action="course-mode" data-v="transit" aria-pressed="${cs.mode === 'transit'}">대중교통(추정)</button>
      </div>
    </div>
    <div class="sheet-actions"><button type="button" class="btn-primary" data-action="course-make" ${cs.busy ? 'disabled' : ''}>${cs.busy ? '맛집·카페 찾는 중…' : '코스 만들기'}</button></div>`;
  if (!r) return form;
  if (!r.ok) return `${form}<div class="empty"><b>${esc(r.reason)}</b></div>`;
  const visits = r.items.filter((i) => i.type === 'visit');
  return `${form}
    <div id="course-map" class="map course-map" role="application" aria-label="코스 지도. 번호는 가는 순서예요"></div>
    <ol class="course-list">
      ${r.items.map((it) => {
        if (it.type === 'visit') {
          const n = visits.indexOf(it) + 1, p = it.place;
          if (p.shop) {
            const tag = it.meal === 'cafe' ? '☕ 카페' : `🍽 ${it.meal === 'lunch' ? '점심 · ' : it.meal === 'dinner' ? '저녁 · ' : ''}맛집`;
            return `<li class="course-visit course-shop"><span class="course-time">${toHHMM(it.start)}</span><span class="course-body"><b>${n}. ${esc(p.name)}</b><span class="card-meta">${tag}${p.auto ? ' · 근처에서 자동으로 찾았어요' : ' · 찜한 곳'} · 이동 ${kmin(it.travel)} · 약 ${kmin(it.dwell)}(추정)${p.rating ? ` · ★${p.rating.toFixed(1)}` : ''} · 영업시간 미확인</span></span></li>`;
          }
          return `<li class="course-visit"><span class="course-time">${toHHMM(it.start)}</span><span class="course-body"><b>${n}. ${esc(p.name)}</b><span class="card-meta">이동 ${kmin(it.travel)} · 머무는 시간 약 ${kmin(it.dwell)}(추정) · 영업시간 미확인 · ${esc(parkingNote(p))}${it.lunchIn ? ' · 점심은 이 안에서' : ''}</span></span></li>`;
        }
        if (it.type === 'meal') return `<li class="course-meal"><span class="course-time">${toHHMM(it.start)}</span><span class="course-body"><b>${esc(it.label)} (${kmin(it.end - it.start)})</b><span class="card-meta">근처 맛집을 찾지 못해 식사 시간만 넣었어요. 장소 상세의 "근처 맛집"에서 찾아보세요.</span></span></li>`;
        if (it.type === 'rest') return `<li class="course-meal"><span class="course-time">${toHHMM(it.start)}</span><span class="course-body"><b>휴식 (${kmin(it.end - it.start)})</b></span></li>`;
        return `<li class="course-return"><span class="course-time">${toHHMM(it.start)}</span><span class="course-body"><b>${esc(state.profile.origin.name)}로 돌아가기</b><span class="card-meta">이동 ${kmin(it.travel)} · 도착 ${toHHMM(it.end)}</span></span></li>`;
      }).join('')}
    </ol>
    ${r.dropped?.length ? `<p class="muted">시간이 모자라 뺀 곳: ${esc(r.dropped.slice(0, 4).map((d) => d.place.name).join(', '))}${r.dropped.length > 4 ? ' 외' : ''}</p>` : ''}
    ${r.warnings.map((w) => `<p class="trust-note" role="note">⚠ ${esc(w)}</p>`).join('')}
    <div class="sheet-actions"><button type="button" class="btn-secondary" data-action="course-save">이 코스를 찜에 담기(순서대로)</button></div>`;
}
