// 추천(홈) 화면 — 디자인: 소프트 플레이
import { CATEGORIES } from '../data/places.js';
import { photoOf } from '../data/photos.js';
import { KIND_LABEL } from '../core/scoring.js';
import { tripLabel } from '../core/geo.js';

const SCOPES = [
  { v: 'near', label: '가까운 소소한 곳' },
  { v: 'all', label: '전체' },
  { v: 'big', label: '큰 나들이' },
];
const SCOPE_DESC = {
  near: `시장·소품샵·공연장·작은 전시처럼 잠깐 들르기 좋은 작은 곳만 보여줘요. 고른 이동시간(위)만큼 범위가 넓어져요.`,
  all: '큰 나들이 장소와 소소한 곳을 함께 보여줘요. 이동시간을 길게 고를수록 거리보다 우리 가족 또래의 인기를 더 많이 반영해요.',
  big: '테마파크·동물원·바다처럼 하루를 쓰는 큰 나들이 장소만 보여줘요.',
};
import { fmtLong } from '../core/dates.js';
import { NIGHT_OPTIONS } from '../core/store.js';
import { esc, icon, summaryBar, timeChips, timeLabel, modeToggle } from './util.js';
import { parkingInfo } from './sheet.js';
import { heartBtn } from './util.js';
import { favSet, favKey } from '../core/favs.js';

/** 핫플 분류 중 카드에 보여 줄 것만(신규 발견·급상승·숨은 명소). 인기 유지·관심 감소는 화면을 어지럽히지 않게 표시하지 않는다. */
const HOT_CHIP = { n: '🆕 신규 발견', r: '📈 급상승', h: '💎 숨은 명소' };

/** 옆에 사진이 붙는 추천 카드 */
function placeCard(r, i, favs) {
  const p = r.place;
  const cat = CATEGORIES[p.cat] || { label: '', icon: '📍' };
  const photo = photoOf(p.id);
  const park = parkingInfo(p);
  return `
    <li>
      <button type="button" class="pcard" data-action="open-place" data-id="${esc(p.id)}">
        <span class="pcard-media ph-${esc(p.cat)}" ${photo ? '' : `data-gphoto="${esc(p.id)}"`}>
          <span class="pcard-fallback" aria-hidden="true">${cat.icon}</span>
          ${photo ? `<img src="${esc(photo.src)}" alt="" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
          <span class="pcard-rank ${i === 0 ? 'is-top' : ''}" aria-label="${r.rank}위">${r.rank}</span>
        </span>
        <span class="pcard-body">
          <span class="pcard-title">${esc(p.name)}</span>
          <span class="pcard-meta"><span class="badge badge-${r.kind}">${KIND_LABEL[r.kind]}</span>${p.scale === 'small' ? `${esc(cat.label)} · ` : ''}${esc(p.region)} · ${tripLabel(r.km, r.min)}</span>
          <span class="pcard-chips">
            ${r.reasons.map((x) => `<span class="why why-${x.kind}">${esc(x.text)}</span>`).join('')}
            ${HOT_CHIP[p.hot] ? `<span class="why why-hot is-${p.hot}">${HOT_CHIP[p.hot]}${p.hotQ === 0 ? ' · 자료 적음' : ''}</span>` : ''}
            ${park.short ? `<span class="why why-park ${park.state === 'no' ? 'is-no' : ''}"><i aria-hidden="true">P</i>${esc(park.short)}</span>` : ''}
          </span>
        </span>
      </button>
      ${heartBtn('place', p.id, favs.has(favKey('place', p.id)), 'on-card')}
    </li>`;
}

const MAX_RESULTS = 100; // 추천 결과는 최대 100곳까지만 보여준다(2026-11-16 사용자 요청. 예전에는 최대 200곳)

export function renderHome(state, c) {
  const { profile, ui } = state;
  const results = c.ranked.slice(0, MAX_RESULTS);
  const shown = Math.min(ui.listMax || 20, MAX_RESULTS); // 처음엔 20곳, "더 보기"로 20곳씩 늘려 최대 100곳
  const rows = results.slice(0, shown);
  const favs = favSet(state);
  const nights = (NIGHT_OPTIONS.find((o) => o.v === profile.nights) || NIGHT_OPTIONS[0]).label;

  const list = rows.length
    ? `<ol class="plist">${rows.map((r, i) => placeCard(r, i, favs)).join('')}</ol>
       ${results.length > rows.length ? `<button type="button" class="btn-secondary more-btn" data-action="more">더 보기 · 다음 ${Math.min(20, results.length - rows.length)}곳 (남은 ${results.length - rows.length}곳)</button>` : ''}`
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
    <p class="mode-desc">${profile.mode === 'hot'
      ? '요즘 검색이 늘고 있는 곳을 먼저 추천해요.'
      : '많은 사람이 찾던 곳이지만 요즘 검색이 뜸해진 곳을 먼저 추천해요.'}</p>

    <button type="button" class="trend-open" data-action="open-trend">🔥 전국 지역 트렌드 지도 보기</button>
    <button type="button" class="trend-open" data-action="open-course">🗺 여행 코스 자동 만들기 (시간표)</button>

    <div class="row-between tight">
      <span class="label">어디까지 볼까요?</span>
    </div>
    <div class="chips" role="group" aria-label="장소 규모">
      ${SCOPES.map((s) => `<button type="button" class="chip ${ui.scope === s.v ? 'is-on' : ''}" data-action="scope" data-v="${s.v}" aria-pressed="${ui.scope === s.v}">${s.label}</button>`).join('')}
    </div>
    <p class="mode-desc">${SCOPE_DESC[ui.scope] || SCOPE_DESC.all}</p>

    <div class="row-between tight">
      <span class="label">이동시간</span>
    </div>
    ${timeChips(ui.maxMin)}

    <div class="row-between">
      <h2 class="h2">추천 <span class="count">${results.length}</span>곳</h2>
      <div class="toggle" role="group" aria-label="보기 방식">
        <button type="button" class="toggle-btn ${ui.view === 'list' ? 'is-on' : ''}" data-action="view" data-v="list" aria-pressed="${ui.view === 'list'}">목록</button>
        <button type="button" class="toggle-btn ${ui.view === 'map' ? 'is-on' : ''}" data-action="view" data-v="map" aria-pressed="${ui.view === 'map'}">지도</button>
      </div>
    </div>
    ${body}
  `;
}
