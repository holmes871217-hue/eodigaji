// 축제·행사 화면
import { EVENT_TYPES } from '../data/events.js';
import { formatMin } from '../core/geo.js';
import { diffDays, todayISO, parseISO } from '../core/dates.js';
import { esc, icon, summaryBar, timeChips, timeLabel, rangeText, tripText } from './util.js';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function dday(start, end) {
  const today = todayISO();
  if (start <= today && end >= today) return '진행 중';
  const d = diffDays(today, start);
  return d > 0 ? `D-${d}` : '';
}

function eventCard(e) {
  const d = parseISO(e.start);
  const tag = dday(e.start, e.end);
  return `
    <li>
      <button type="button" class="card event" data-action="open-event" data-id="${esc(e.id)}">
        <span class="datebox type-${esc(e.type)}" aria-hidden="true">
          <small>${d.getMonth() + 1}월</small>
          <b>${d.getDate()}</b>
          <small>${DOW[d.getDay()]}요일</small>
        </span>
        <span class="card-body">
          <span class="card-tags">
            <span class="badge badge-type">${esc(EVENT_TYPES[e.type] || '행사')}</span>
            ${tag ? `<span class="badge ${tag === '진행 중' ? 'badge-live' : 'badge-dday'}">${tag}</span>` : ''}
          </span>
          <span class="card-title">${esc(e.title)}</span>
          <span class="card-meta">${esc(rangeText(e.start, e.end))} · ${esc(e.region)}</span>
          <span class="card-meta">${icon('clock', 14)} 약 ${formatMin(e.min)}</span>
        </span>
      </button>
    </li>`;
}

export function renderEvents(state, c) {
  const { ui, profile } = state;
  const byType = (e) => ui.evType === 'all' || e.type === ui.evType;
  const within = (e) => e.min <= ui.maxMin;

  const during = c.tripEvents.filter(byType).filter(within);
  const later = c.upcoming.filter(byType).filter(within);

  const typeChips = `
    <div class="chips" role="group" aria-label="종류">
      <button type="button" class="chip ${ui.evType === 'all' ? 'is-on' : ''}" data-action="evtype" data-v="all" aria-pressed="${ui.evType === 'all'}">전체</button>
      ${Object.entries(EVENT_TYPES)
        .map(([k, label]) => `<button type="button" class="chip ${ui.evType === k ? 'is-on' : ''}" data-action="evtype" data-v="${k}" aria-pressed="${ui.evType === k}">${label}</button>`)
        .join('')}
    </div>`;

  return `
    ${summaryBar(state)}

    <div class="headline">
      <h1>가는 날 열리는 축제·행사</h1>
      <p>${esc(tripText(profile))} · ${esc(profile.origin.name)}에서 ${esc(timeLabel(ui.maxMin))}</p>
    </div>

    <div class="row-between tight">
      <span class="label">이동시간 <em>검색 위치에서 차로(추정)</em></span>
    </div>
    ${timeChips(ui.maxMin)}
    ${typeChips}

    <h2 class="h2 mt">가는 날 열리는 곳 <span class="count">${during.length}</span></h2>
    ${during.length
      ? `<ol class="list">${during.map(eventCard).join('')}</ol>`
      : `<div class="empty"><b>이 날짜·거리에는 열리는 행사가 없어요.</b><span>이동시간을 늘리거나 마이페이지에서 날짜를 바꿔 보세요.</span></div>`}

    ${later.length
      ? `<h2 class="h2 mt">그 뒤에 열리는 곳 <span class="count">${later.length}</span></h2>
         <p class="muted">다녀온 뒤 30일 안에 시작하는 행사예요.</p>
         <ol class="list">${later.map(eventCard).join('')}</ol>`
      : ''}
  `;
}
