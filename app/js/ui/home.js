// 추천(홈) 화면 — 디자인: 소프트 플레이
import { CATEGORIES } from '../data/places.js';
import { photoOf } from '../data/photos.js';
import { KIND_LABEL } from '../core/scoring.js';
import { formatMin } from '../core/geo.js';
import { fmtLong } from '../core/dates.js';
import { NIGHT_OPTIONS } from '../core/store.js';
import { esc, icon, summaryBar, timeChips, timeLabel, modeToggle } from './util.js';

/** 옆에 사진이 붙는 추천 카드 */
function placeCard(r, i) {
  const p = r.place;
  const cat = CATEGORIES[p.cat] || { label: '', icon: '📍' };
  const photo = photoOf(p.id);
  return `
    <li>
      <button type="button" class="pcard" data-action="open-place" data-id="${esc(p.id)}">
        <span class="pcard-media ph-${esc(p.cat)}">
          <span class="pcard-fallback" aria-hidden="true">${cat.icon}</span>
          ${photo ? `<img src="${esc(photo.src)}" alt="" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
          <span class="pcard-rank ${i === 0 ? 'is-top' : ''}" aria-label="${r.rank}위">${r.rank}</span>
        </span>
        <span class="pcard-body">
          <span class="pcard-title">${esc(p.name)}</span>
          <span class="pcard-meta"><span class="badge badge-${r.kind}">${KIND_LABEL[r.kind]}</span>${esc(p.region)} · 약 ${formatMin(r.min)}</span>
          <span class="pcard-chips">
            ${r.reasons.map((x) => `<span class="why why-${x.kind}">${esc(x.text)}</span>`).join('')}
          </span>
        </span>
      </button>
    </li>`;
}

export function renderHome(state, c) {
  const { profile, ui } = state;
  const rows = c.ranked.slice(0, 20);
  const nights = (NIGHT_OPTIONS.find((o) => o.v === profile.nights) || NIGHT_OPTIONS[0]).label;

  const list = rows.length
    ? `<ol class="plist">${rows.map(placeCard).join('')}</ol>`
    : `<div class="empty">
         <b>${esc(timeLabel(ui.maxMin))} 거리에는 추천할 곳이 없어요.</b>
         <span>위에서 이동시간을 더 길게 고르거나, 검색 위치를 옮겨 보세요.</span>
       </div>`;

  const body =
    ui.view === 'map'
      ? `<div class="map-wrap">
           <div id="map" class="map" role="application" aria-label="추천 장소 지도"></div>
           <div class="map-tools">
             <button type="button" class="btn-secondary sm" data-action="map-reset">${icon('target', 16)}검색 위치로</button>
             <button type="button" class="btn-secondary sm" data-action="map-fit">추천 전체 보기</button>
           </div>
           <p class="note">처음에는 검색 위치를 가운데 두고 가로 10km 범위를 보여줘요. 번호는 추천 순위이고, 핀을 누르면 자세히 볼 수 있어요.</p>
         </div>`
      : list;

  return `
    ${summaryBar(state)}

    <div class="headline">
      <p class="headline-date">${esc(fmtLong(profile.date))} · ${esc(nights)}</p>
      <h1>이번 나들이,<br>어디로 갈까요?</h1>
    </div>

    ${ui.hint ? `
      <div class="hint">
        <span>지금은 예시 가족(나 38세 · 아이 7세)으로 계산했어요. 마이페이지에서 우리 가족으로 바꿔 보세요.</span>
        <button type="button" class="link" data-action="dismiss-hint">닫기</button>
      </div>` : ''}

    ${modeToggle(profile.mode)}

    <div class="row-between tight">
      <span class="label">이동시간 <em>검색 위치에서 차로(추정)</em></span>
    </div>
    ${timeChips(ui.maxMin)}

    <div class="row-between">
      <h2 class="h2">추천 <span class="count">${c.ranked.length}</span>곳</h2>
      <div class="toggle" role="group" aria-label="보기 방식">
        <button type="button" class="toggle-btn ${ui.view === 'list' ? 'is-on' : ''}" data-action="view" data-v="list" aria-pressed="${ui.view === 'list'}">목록</button>
        <button type="button" class="toggle-btn ${ui.view === 'map' ? 'is-on' : ''}" data-action="view" data-v="map" aria-pressed="${ui.view === 'map'}">지도</button>
      </div>
    </div>
    ${body}
  `;
}
