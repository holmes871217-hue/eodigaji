// 화면 그리기에 공통으로 쓰는 작은 도우미.
import { fmtDate, addDays } from '../core/dates.js';
import { TIME_OPTIONS, NIGHT_OPTIONS } from '../core/store.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** 사용자가 입력한 글자를 화면에 안전하게 넣기 위한 처리(HTML 이스케이프) */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** 선으로 그린 작은 아이콘 */
export function icon(name, size = 18) {
  const paths = {
    pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.500 20c.8-3.600 3.400-5.500 6.500-5.500s5.700 1.900 6.500 5.500"/><path d="M16 4.800a3.500 3.500 0 0 1 0 6.400M18.500 14.800c1.700.8 2.700 2.500 3.100 5.200"/>',
    clock: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>',
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    flame: '<path d="M12 3c1 3.5 4.5 5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-1.5.5-2.5 1.5-3.5.2 1.5 1 2.300 2 2.500C10.500 8.500 11 5.500 12 3z"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14z"/><path d="M5 19c3-4 6-6.500 9-8"/>',
  };
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

export function tripRange(profile) {
  const nights = Math.max(0, Number(profile.nights) || 0);
  return { start: profile.date, end: addDays(profile.date, nights), nights };
}

export function tripText(profile) {
  const { start, end, nights } = tripRange(profile);
  const label = (NIGHT_OPTIONS.find((o) => o.v === nights) || NIGHT_OPTIONS[0]).label;
  return nights > 0 ? `${fmtDate(start)}~${fmtDate(end)} · ${label}` : `${fmtDate(start)} · ${label}`;
}

export function rangeText(start, end) {
  return start === end ? fmtDate(start) : `${fmtDate(start)}~${fmtDate(end)}`;
}

/** 이동시간 선택 칩 (추천·축제 화면 공용) */
export function timeChips(maxMin) {
  return `
    <div class="chips" role="group" aria-label="이동시간">
      ${TIME_OPTIONS.map(
        (o) => `<button type="button" class="chip ${o.v === maxMin ? 'is-on' : ''}" data-action="maxmin" data-v="${o.v}" aria-pressed="${o.v === maxMin}">${o.label}</button>`
      ).join('')}
    </div>`;
}

export function timeLabel(maxMin) {
  const o = TIME_OPTIONS.find((x) => x.v === maxMin);
  return o ? (o.v >= 9999 ? '전국' : `${o.label} 이내`) : '';
}

/** 핫플레이스 / 여유로운 곳 큰 선택 버튼 (추천·마이페이지 공용) */
export function modeToggle(mode) {
  const btn = (v, ic, title, sub) => `
    <button type="button" class="mode mode-${v} ${mode === v ? 'is-on' : ''}" data-action="mode" data-v="${v}" aria-pressed="${mode === v}">
      ${icon(ic, 26)}
      <span><b>${title}</b><small>${sub}</small></span>
    </button>`;
  return `
    <div class="modes" role="group" aria-label="추천 방식">
      ${btn('hot', 'flame', '핫플레이스', '요즘 뜨는 곳')}
      ${btn('calm', 'leaf', '여유로운 곳', '한산한 곳')}
    </div>`;
}

/** 상단 조건 띠: 검색 위치 · 날짜 · 인원. 누르면 마이페이지로 이동 */
export function summaryBar(state) {
  const p = state.profile;
  return `
    <div class="ctx" role="group" aria-label="지금 검색 조건">
      <button type="button" class="ctx-chip is-main" data-action="tab" data-v="my" aria-label="검색 위치 바꾸기">
        ${icon('pin')}<span>${esc(p.origin.name)}</span>
      </button>
      <button type="button" class="ctx-chip" data-action="tab" data-v="my" aria-label="날짜와 기간 바꾸기">
        ${icon('cal')}<span>${esc(tripText(p))}</span>
      </button>
      <button type="button" class="ctx-chip" data-action="tab" data-v="my" aria-label="함께 가는 사람 바꾸기">
        ${icon('users')}<span>${p.members.length}명</span>
      </button>
    </div>`;
}

/** 찜(하트) 버튼. 누르면 main.js 의 'fav' 동작이 처리한다. */
export function heartBtn(type, id, on, cls = '') {
  return `<button type="button" class="heart ${cls} ${on ? 'is-on' : ''}" data-action="fav" data-type="${type}" data-id="${esc(id)}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${on ? '찜에서 빼기' : '찜하기'}"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 2.8c0 5.700-7.500 10.300-7.500 10.300z"/></svg></button>`;
}

/** 네이버 지도에서 가게를 찾을 말. 같은 이름의 다른 지점이 나오지 않게 주소 맨 앞의 시·군·구를 붙인다. */
export function naverQuery(name, addr) {
  const first = (addr || '').split(' ')[0] || '';
  return /[시군구]$/.test(first) && !name.includes(first) ? `${first} ${name}` : name;
}
