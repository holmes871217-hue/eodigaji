// 아래에서 올라오는 상세 창(바텀 시트)
import { CATEGORIES } from '../data/places.js';
import { photoOf } from '../data/photos.js';
import { EVENT_TYPES } from '../data/events.js';
import { KIND_LABEL, crowdLabel, trendPct } from '../core/scoring.js';
import { formatMin, tripLabel } from '../core/geo.js';
import { memberLabel } from '../core/segments.js';
import { esc, rangeText } from './util.js';

function placeSheet(r) {
  const p = r.place;
  const cat = CATEGORIES[p.cat] || { label: '', icon: '📍' };
  const pct = trendPct(p.trend);
  const q = encodeURIComponent(p.name);
  const photo = photoOf(p.id);

  return `
    <div class="sheet-photo ph-${esc(p.cat)}">
      <span class="pcard-fallback" aria-hidden="true">${cat.icon}</span>
      ${photo ? `<img src="${esc(photo.src)}" alt="${esc(p.name)} 사진" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    </div>
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title" id="sheet-title">${esc(p.name)}<span class="badge badge-${r.kind}">${KIND_LABEL[r.kind]}</span></h2>
        <p class="card-meta">${esc(p.region)} · ${esc(cat.label)} · 검색 위치에서 ${tripLabel(r.km, r.min)} (${r.km < 10 ? r.km.toFixed(1) : Math.round(r.km)}km)</p>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><b>${Math.round(r.fam)}</b><span>우리 가족 관심도</span></div>
      <div class="stat"><b class="${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '+' : ''}${pct}%</b><span>최근 4주 추세</span></div>
      <div class="stat"><b>${crowdLabel(p.crowd)}</b><span>혼잡 예측</span></div>
    </div>

    <h3 class="h3">사람별 점수</h3>
    <ul class="bars">
      ${r.parts
        .map(
          (x) => `
        <li>
          <span class="bar-name">${esc(memberLabel(x.member, x.index))} <em>${x.member.age}세 · 가중치 ${x.weight}</em></span>
          <span class="bar"><i style="width:${x.score}%"></i></span>
          <span class="bar-num">${x.score}</span>
        </li>`
        )
        .join('')}
    </ul>

    ${r.eventNear ? `<p class="near">가는 날 근처 행사: <b>${esc(r.eventNear.title)}</b> (${esc(rangeText(r.eventNear.start, r.eventNear.end))})</p>` : ''}

    <p class="muted">한 달 블로그 언급 약 ${p.buzz.toLocaleString('ko-KR')}건 · 1년 누적 인기 ${p.yearly}점</p>
    <p class="sample-note">연습용 숫자예요. 실제 데이터 연결 전이라 참고만 해 주세요.${photo ? ` <a href="${esc(photo.page)}" target="_blank" rel="noopener noreferrer">사진 출처: 위키미디어 공용</a>` : ''}</p>

    <div class="sheet-actions">
      <a class="btn-primary" href="https://map.naver.com/p/search/${q}" target="_blank" rel="noopener noreferrer">네이버 지도에서 보기</a>
      <a class="btn-secondary" href="https://map.kakao.com/link/to/${q},${p.lat},${p.lng}" target="_blank" rel="noopener noreferrer">카카오맵 길찾기</a>
    </div>`;
}

function eventSheet(e) {
  const q = encodeURIComponent(e.title);
  return `
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title" id="sheet-title">${esc(e.title)}<span class="badge badge-type">${esc(EVENT_TYPES[e.type] || '행사')}</span></h2>
        <p class="card-meta">${esc(rangeText(e.start, e.end))} · ${esc(e.region)}</p>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><b>약 ${formatMin(e.min)}</b><span>검색 위치에서</span></div>
      <div class="stat"><b>${Math.round(e.km)}km</b><span>직선거리</span></div>
      <div class="stat"><b>${e.kid ? '좋음' : '보통'}</b><span>아이 동반</span></div>
    </div>
    <p class="desc">${esc(e.desc)}</p>
    <p class="sample-note">연습용 일정이에요. 실제 날짜와 다를 수 있으니 가기 전에 꼭 확인해 주세요.</p>
    <div class="sheet-actions">
      <a class="btn-primary" href="https://search.naver.com/search.naver?query=${q}" target="_blank" rel="noopener noreferrer">네이버에서 일정 확인</a>
      <a class="btn-secondary" href="https://map.kakao.com/link/to/${q},${e.lat},${e.lng}" target="_blank" rel="noopener noreferrer">카카오맵 길찾기</a>
    </div>`;
}

export function renderSheet(state, c) {
  const s = state.ui.sheet;
  if (!s) return '';
  let inner = '';
  if (s.type === 'place') {
    const row = c.rankedAll.find((r) => r.place.id === s.id);
    if (row) inner = placeSheet(row);
  } else if (s.type === 'event') {
    const ev = [...c.tripEvents, ...c.upcoming].find((e) => e.id === s.id);
    if (ev) inner = eventSheet(ev);
  }
  if (!inner) return '';
  return `
    <div class="scrim" data-action="close-sheet"></div>
    <section class="sheet ${s.type === 'place' ? 'has-photo' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <button type="button" class="sheet-close" data-action="close-sheet" aria-label="닫기">닫기</button>
      ${inner}
    </section>`;
}
